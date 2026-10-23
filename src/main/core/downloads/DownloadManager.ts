import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { DownloadTask } from '@shared/types'
import { exists } from '../../util/fsx'
import { hashFile, type HashAlgo } from '../../util/hash'
import { request } from '../../util/http'

export interface DownloadOptions {
  label: string
  /** Expected checksum; the file is rejected if it doesn't match. */
  hash?: { algo: HashAlgo; value: string }
  headers?: Record<string, string>
}

/**
 * Downloads files with progress reporting and checksum verification.
 * Files with a known checksum are kept in a cache so re-creating a server doesn't re-download.
 */
export class DownloadManager {
  private tasks = new Map<string, DownloadTask>()
  private lastEmit = 0

  constructor(
    private cacheDir: string,
    private onChange: (tasks: DownloadTask[]) => void
  ) {}

  list(): DownloadTask[] {
    return [...this.tasks.values()]
  }

  async download(url: string, dest: string, opts: DownloadOptions): Promise<string> {
    const cached = opts.hash ? path.join(this.cacheDir, `${opts.hash.algo}-${opts.hash.value.toLowerCase()}`) : null
    await fs.mkdir(path.dirname(dest), { recursive: true })
    if (cached && (await exists(cached))) {
      if ((await hashFile(cached, opts.hash!.algo)) === opts.hash!.value.toLowerCase()) {
        await fs.copyFile(cached, dest)
        return dest
      }
      await fs.rm(cached, { force: true })
    }

    const task: DownloadTask = { id: randomUUID(), label: opts.label, received: 0, total: 0, status: 'active' }
    this.tasks.set(task.id, task)
    this.emit(true)
    const part = `${dest}.part`
    try {
      const res = await request(url, { headers: opts.headers, timeoutMs: 60000, retries: 2 })
      task.total = Number(res.headers.get('content-length') ?? 0)
      if (!res.body) throw new Error('Empty response')
      const hasher = opts.hash ? createHash(opts.hash.algo) : null
      const started = Date.now()
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
      const out = createWriteStream(part)
      for await (const chunk of body) {
        const buf = chunk as Buffer
        hasher?.update(buf)
        task.received += buf.length
        task.bytesPerSec = task.received / Math.max(0.001, (Date.now() - started) / 1000)
        if (!out.write(buf)) await new Promise((r) => out.once('drain', r))
        this.emit()
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
      if (hasher && opts.hash) {
        const got = hasher.digest('hex')
        if (got !== opts.hash.value.toLowerCase()) {
          throw new Error(`${opts.label}: the downloaded file is damaged (checksum mismatch). Please try again.`)
        }
      }
      await fs.rename(part, dest)
      if (cached) await fs.mkdir(this.cacheDir, { recursive: true }).then(() => fs.copyFile(dest, cached)).catch(() => undefined)
      task.status = 'done'
      if (!task.total) task.total = task.received
      return dest
    } catch (e) {
      task.status = 'error'
      task.error = e instanceof Error ? e.message : String(e)
      await fs.rm(part, { force: true }).catch(() => undefined)
      throw e
    } finally {
      this.emit(true)
      // Finished tasks disappear from the panel after a while.
      setTimeout(() => {
        this.tasks.delete(task.id)
        this.emit(true)
      }, task.status === 'error' ? 30000 : 8000).unref?.()
    }
  }

  private emit(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < 150) return
    this.lastEmit = now
    this.onChange(this.list())
  }

  async clearCache(): Promise<number> {
    let freed = 0
    if (!(await exists(this.cacheDir))) return 0
    for (const f of await fs.readdir(this.cacheDir)) {
      const p = path.join(this.cacheDir, f)
      freed += (await fs.stat(p)).size
      await fs.rm(p, { recursive: true, force: true })
    }
    return freed
  }
}
