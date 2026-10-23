import http from 'node:http'
import { describe, expect, it } from 'vitest'
import { localAddresses } from '../src/main/core/network/localIp'
import { parseDeviceDescription, parseSoapFault, parseSsdpLocation, soapEnvelope, UpnpClient } from '../src/main/core/network/upnp'
import { parsePlayitLine, pickPlayitAsset } from '../src/main/core/tunnels/playit'

const DESC = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
<device><deviceList><device><deviceList><device>
<serviceList>
<service><serviceType>urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1</serviceType><controlURL>/ctl/CmnIfCfg</controlURL></service>
<service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service>
</serviceList></device></deviceList></device></deviceList></device></root>`

describe('UPnP', () => {
  it('parses SSDP and the device description', () => {
    expect(parseSsdpLocation('HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nLOCATION: http://192.168.1.1:5000/rootDesc.xml\r\n\r\n')).toBe('http://192.168.1.1:5000/rootDesc.xml')
    expect(parseDeviceDescription(DESC, 'http://192.168.1.1:5000/rootDesc.xml')).toEqual({
      controlUrl: 'http://192.168.1.1:5000/ctl/IPConn',
      serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1'
    })
  })
  it('builds SOAP and reads faults', () => {
    const env = soapEnvelope('urn:x:WANIPConnection:1', 'AddPortMapping', { NewExternalPort: 25565, NewPortMappingDescription: 'A & B' })
    expect(env).toContain('<u:AddPortMapping xmlns:u="urn:x:WANIPConnection:1"><NewExternalPort>25565</NewExternalPort>')
    expect(env).toContain('A &amp; B')
    expect(parseSoapFault('<s:Fault><detail><UPnPError><errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription></UPnPError></detail></s:Fault>')).toEqual({
      code: '725',
      description: 'OnlyPermanentLeasesSupported'
    })
  })
  it('maps a port, retrying with a permanent lease when the router insists', async () => {
    const calls: string[] = []
    const srv = http.createServer((req, res) => {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        const action = String(req.headers.soapaction).split('#')[1].replace('"', '')
        calls.push(`${action}:${body.match(/<NewLeaseDuration>(\d+)/)?.[1] ?? ''}`)
        if (action === 'AddPortMapping' && body.includes('<NewLeaseDuration>3600')) {
          res.writeHead(500)
          return res.end('<s:Fault><UPnPError><errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription></UPnPError></s:Fault>')
        }
        if (action === 'GetExternalIPAddress') return res.end('<NewExternalIPAddress>203.0.113.24</NewExternalIPAddress>')
        res.end('<ok/>')
      })
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const port = (srv.address() as { port: number }).port
    const c = new UpnpClient()
    ;(c as unknown as { gateway: unknown }).gateway = { controlUrl: `http://127.0.0.1:${port}/ctl`, serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1' }
    await c.map(25565, '192.168.1.42', 'Blockhost test')
    expect(await c.externalIp()).toBe('203.0.113.24')
    await c.unmap(25565)
    expect(calls).toEqual(['AddPortMapping:3600', 'AddPortMapping:0', 'GetExternalIPAddress:', 'DeletePortMapping:'])
    srv.close()
  })
})

describe('local IP', () => {
  it('prefers a real LAN adapter over virtual ones', () => {
    const r = localAddresses({
      'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.10.1', internal: false } as never],
      'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.42', internal: false } as never],
      Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true } as never]
    })
    expect(r.primary).toBe('192.168.1.42')
    expect(r.others).toEqual([{ name: 'vEthernet (WSL)', address: '172.20.10.1' }])
  })
})

describe('playit', () => {
  const assets = ['playit-linux-amd64', 'playit-linux-aarch64', 'playit-windows-x86_64-signed.exe', 'playit-windows-x86_64.exe', 'playit-linux-amd64.deb', 'playit-darwin-arm64'].map((name) => ({ name, browser_download_url: `https://x/${name}`, size: 1 }))
  it('picks the right agent build', () => {
    expect(pickPlayitAsset(assets, 'win32', 'x64')?.name).toBe('playit-windows-x86_64-signed.exe')
    expect(pickPlayitAsset(assets, 'linux', 'x64')?.name).toBe('playit-linux-amd64')
    expect(pickPlayitAsset(assets, 'linux', 'arm64')?.name).toBe('playit-linux-aarch64')
    expect(pickPlayitAsset(assets, 'darwin', 'arm64')?.name).toBe('playit-darwin-arm64')
  })
  it('finds claim links and tunnel addresses in agent output', () => {
    expect(parsePlayitLine('Visit link to setup https://playit.gg/claim/ab12cd34ef')).toEqual({ claimUrl: 'https://playit.gg/claim/ab12cd34ef' })
    expect(parsePlayitLine('survival-smp.joinmc.link => 127.0.0.1:25565 (minecraft-java)', 25565)).toEqual({ address: 'survival-smp.joinmc.link' })
    expect(parsePlayitLine('147.185.221.18:41592 => 127.0.0.1:25565', 25565)).toEqual({ address: '147.185.221.18:41592' })
    expect(parsePlayitLine('other.joinmc.link => 127.0.0.1:25570', 25565)).toEqual({ address: 'other.joinmc.link' })
    expect(parsePlayitLine('connecting to api.playit.gg')).toEqual({})
  })
})
