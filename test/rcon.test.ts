import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { encodePacket, RconClient } from '../src/main/core/servers/rcon'

function fakeRconServer(password: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0)
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d])
        while (buf.length >= 4) {
          const len = buf.readInt32LE(0)
          if (buf.length < 4 + len) return
          const id = buf.readInt32LE(4)
          const type = buf.readInt32LE(8)
          const body = buf.subarray(12, 4 + len - 2).toString()
          buf = buf.subarray(4 + len)
          if (type === 3) sock.write(encodePacket(body === password ? id : -1, 2, ''))
          else if (body === 'list') {
            // Split the reply across two writes to exercise reassembly.
            const pkt = encodePacket(id, 0, 'There are 1 of a max of 20 players online: Steve')
            sock.write(pkt.subarray(0, 7))
            setTimeout(() => sock.write(pkt.subarray(7)), 20)
          } else sock.write(encodePacket(id, 0, `ran ${body}`))
        }
      })
    })
    srv.listen(0, '127.0.0.1', () => resolve({ port: (srv.address() as net.AddressInfo).port, close: () => srv.close() }))
  })
}

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((c) => c())
  cleanup = []
})

describe('RCON client', () => {
  it('authenticates and runs commands', async () => {
    const srv = await fakeRconServer('secret')
    cleanup.push(srv.close)
    const c = new RconClient()
    cleanup.push(() => c.close())
    await c.connect('127.0.0.1', srv.port, 'secret')
    expect(await c.command('list')).toBe('There are 1 of a max of 20 players online: Steve')
    expect(await c.command('tps')).toBe('ran tps')
  })
  it('rejects a wrong password', async () => {
    const srv = await fakeRconServer('secret')
    cleanup.push(srv.close)
    const c = new RconClient()
    await expect(c.connect('127.0.0.1', srv.port, 'nope')).rejects.toThrow(/authentication/)
  })
})
