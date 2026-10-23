// A small UPnP Internet Gateway Device client: discovers the router and opens/closes TCP ports.
import dgram from 'node:dgram'
import { request } from '../../util/http'

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1'
]

export interface Gateway {
  controlUrl: string
  serviceType: string
}

export function parseSsdpLocation(msg: string): string | null {
  const m = msg.match(/^location:\s*(.+)$/im)
  return m ? m[1].trim() : null
}

/** Finds the WAN connection service in a device description XML. */
export function parseDeviceDescription(xml: string, location: string): Gateway | null {
  const services = [...xml.matchAll(/<service>([\s\S]*?)<\/service>/gi)].map((m) => m[1])
  const base = xml.match(/<URLBase>\s*([^<]+?)\s*<\/URLBase>/i)?.[1] ?? location
  for (const s of services) {
    const type = s.match(/<serviceType>\s*([^<]+?)\s*<\/serviceType>/i)?.[1]
    const control = s.match(/<controlURL>\s*([^<]+?)\s*<\/controlURL>/i)?.[1]
    if (type && control && /WAN(IP|PPP)Connection/.test(type)) {
      return { controlUrl: new URL(control, base).toString(), serviceType: type }
    }
  }
  return null
}

export function soapEnvelope(serviceType: string, action: string, args: Record<string, string | number>): string {
  const body = Object.entries(args)
    .map(([k, v]) => `<${k}>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${k}>`)
    .join('')
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body></s:Envelope>`
}

export function parseSoapFault(xml: string): { code?: string; description?: string } | null {
  if (!/Fault/i.test(xml)) return null
  return {
    code: xml.match(/<errorCode>\s*(\d+)\s*<\/errorCode>/i)?.[1],
    description: xml.match(/<errorDescription>\s*([^<]+)\s*<\/errorDescription>/i)?.[1]
  }
}

export function discoverGateway(timeoutMs = 3000): Promise<string[]> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const found = new Set<string>()
    const done = () => {
      try {
        sock.close()
      } catch {
        // already closed
      }
      resolve([...found])
    }
    sock.on('message', (msg) => {
      const loc = parseSsdpLocation(msg.toString())
      if (loc) found.add(loc)
    })
    sock.on('error', done)
    sock.bind(0, () => {
      for (const st of SEARCH_TARGETS) {
        const m = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`)
        sock.send(m, SSDP_PORT, SSDP_ADDR)
      }
    })
    setTimeout(done, timeoutMs)
  })
}

export class UpnpClient {
  private gateway: Gateway | null = null

  async findGateway(): Promise<Gateway> {
    if (this.gateway) return this.gateway
    const locations = await discoverGateway()
    for (const loc of locations) {
      try {
        const xml = await (await request(loc, { timeoutMs: 4000, retries: 0 })).text()
        const gw = parseDeviceDescription(xml, loc)
        if (gw) {
          this.gateway = gw
          return gw
        }
      } catch {
        // try the next device
      }
    }
    throw new Error("No UPnP router found. UPnP may be turned off in your router's settings.")
  }

  private async call(action: string, args: Record<string, string | number>): Promise<string> {
    const gw = await this.findGateway()
    const res = await fetch(gw.controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${gw.serviceType}#${action}"` },
      body: soapEnvelope(gw.serviceType, action, args),
      signal: AbortSignal.timeout(6000)
    })
    const text = await res.text()
    const fault = parseSoapFault(text)
    if (!res.ok || fault) {
      const err = new Error(fault?.description ? `Router refused: ${fault.description}` : `Router error (HTTP ${res.status})`) as Error & { upnpCode?: string }
      err.upnpCode = fault?.code
      throw err
    }
    return text
  }

  async externalIp(): Promise<string | null> {
    const xml = await this.call('GetExternalIPAddress', {})
    return xml.match(/<NewExternalIPAddress>\s*([^<]+?)\s*<\/NewExternalIPAddress>/i)?.[1] ?? null
  }

  async map(port: number, internalIp: string, description: string): Promise<void> {
    const args = (lease: number) => ({
      NewRemoteHost: '',
      NewExternalPort: port,
      NewProtocol: 'TCP',
      NewInternalPort: port,
      NewInternalClient: internalIp,
      NewEnabled: 1,
      NewPortMappingDescription: description,
      NewLeaseDuration: lease
    })
    try {
      await this.call('AddPortMapping', args(3600))
    } catch (e) {
      // 725 = OnlyPermanentLeasesSupported
      if ((e as { upnpCode?: string }).upnpCode === '725') await this.call('AddPortMapping', args(0))
      else throw e
    }
  }

  async unmap(port: number): Promise<void> {
    await this.call('DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' })
  }

  reset(): void {
    this.gateway = null
  }
}
