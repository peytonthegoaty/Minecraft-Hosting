import net from 'node:net'

// Minimal Source RCON client (the protocol Minecraft uses), enough for `list` and `tps`.

const AUTH = 3
const EXEC = 2

export function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8')
  const buf = Buffer.alloc(14 + payload.length)
  buf.writeInt32LE(10 + payload.length, 0)
  buf.writeInt32LE(id, 4)
  buf.writeInt32LE(type, 8)
  payload.copy(buf, 12)
  return buf
}

export class RconClient {
  private socket: net.Socket | null = null
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

  get connected(): boolean {
    return !!this.socket && !this.socket.destroyed
  }

  async connect(host: string, port: number, password: string, timeoutMs = 5000): Promise<void> {
    this.close()
    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection({ host, port })
      const timer = setTimeout(() => {
        sock.destroy()
        reject(new Error('RCON connect timeout'))
      }, timeoutMs)
      sock.once('connect', () => {
        clearTimeout(timer)
        this.socket = sock
        resolve()
      })
      sock.once('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
    })
    this.socket!.on('data', (d) => this.onData(d as Buffer))
    this.socket!.on('close', () => this.failAll(new Error('RCON connection closed')))
    this.socket!.on('error', () => undefined)
    const ok = await this.send(AUTH, password).then(
      () => true,
      () => false
    )
    if (!ok) {
      this.close()
      throw new Error('RCON authentication failed')
    }
  }

  command(cmd: string): Promise<string> {
    return this.send(EXEC, cmd)
  }

  close(): void {
    this.socket?.destroy()
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.failAll(new Error('RCON closed'))
  }

  private send(type: number, body: string, timeoutMs = 5000): Promise<string> {
    if (!this.socket) return Promise.reject(new Error('RCON not connected'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('RCON timeout'))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket!.write(encodePacket(id, type, body))
    })
  }

  private onData(d: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, d])
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0)
      if (this.buffer.length < 4 + len) return
      const id = this.buffer.readInt32LE(4)
      const body = this.buffer.subarray(12, 4 + len - 2).toString('utf8')
      this.buffer = this.buffer.subarray(4 + len)
      if (id === -1) {
        // Failed auth: the server answers with id -1.
        for (const [pid, p] of this.pending) {
          clearTimeout(p.timer)
          p.reject(new Error('RCON authentication failed'))
          this.pending.delete(pid)
        }
        continue
      }
      const p = this.pending.get(id)
      if (p) {
        clearTimeout(p.timer)
        this.pending.delete(id)
        p.resolve(body)
      }
    }
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
      this.pending.delete(id)
    }
  }
}
