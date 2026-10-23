import net from 'node:net'

export function isPortFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, host)
  })
}

/** First free port at or after `start`, skipping any in `avoid`. */
export async function findFreePort(start: number, avoid: number[] = []): Promise<number> {
  for (let p = start; p < start + 200; p++) {
    if (avoid.includes(p)) continue
    if (await isPortFree(p)) return p
  }
  throw new Error(`No free port found near ${start}`)
}
