import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BackupInfo } from '@shared/types'
import { UserError } from '../../util/errors'
import { resolveInside } from '../../util/fsx'
import { createZip, extractZip, listZipTopLevel } from '../../util/zip'
import type { ServerManager } from './ServerManager'

const BACKUP_DIR = 'backups'
// Folders that are re-downloadable or not worth keeping.
const EXCLUDE_TOP = new Set([BACKUP_DIR, 'cache', 'libraries', 'logs', 'crash-reports', 'versions', '.fabric', 'debug'])

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

export class BackupService {
  private busy = new Set<string>()
  private lastBackup = new Map<string, number>()

  constructor(private servers: ServerManager) {}

  private dir(id: string): string {
    return path.join(this.servers.dirOf(id), BACKUP_DIR)
  }

  async list(id: string): Promise<BackupInfo[]> {
    const dir = this.dir(id)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const out: BackupInfo[] = []
    for (const f of files.filter((f) => f.endsWith('.zip'))) {
      const st = await fs.stat(path.join(dir, f))
      out.push({ file: f, size: st.size, createdAt: st.mtimeMs })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  async lastBackupTime(id: string): Promise<number> {
    const cached = this.lastBackup.get(id)
    if (cached) return cached
    const list = await this.list(id)
    const t = list[0]?.createdAt ?? 0
    this.lastBackup.set(id, t)
    return t
  }

  async create(id: string): Promise<BackupInfo> {
    if (this.busy.has(id)) throw new UserError('A backup is already running for this server.')
    this.busy.add(id)
    const root = this.servers.dirOf(id)
    const running = this.servers.isRunning(id)
    try {
      this.servers.logTo(id, 'Backing up…')
      if (running) {
        // Flush the world to disk and pause autosave so files don't change mid-zip.
        await this.servers.runCommand(id, 'save-off')
        const wait = this.servers.waitForLine(id, /Saved the game|Saved the world/i, 20000)
        await this.servers.runCommand(id, 'save-all flush')
        await wait
      }
      const name = `backup-${stamp()}.zip`
      const target = path.join(root, BACKUP_DIR, name)
      const entries = (await fs.readdir(root)).filter((e) => !EXCLUDE_TOP.has(e)).map((e) => path.join(root, e))
      await createZip(root, entries, target, (rel) => rel.endsWith('.lock') || rel.endsWith('.part'))
      const st = await fs.stat(target)
      this.lastBackup.set(id, Date.now())
      await this.prune(id)
      this.servers.logTo(id, `Backup saved: ${name}`)
      return { file: name, size: st.size, createdAt: st.mtimeMs }
    } finally {
      if (running && this.servers.isRunning(id)) await this.servers.runCommand(id, 'save-on').catch(() => undefined)
      this.busy.delete(id)
    }
  }

  private async prune(id: string): Promise<void> {
    const keep = Math.max(1, this.servers.configOf(id).backup.keep)
    const list = await this.list(id)
    for (const b of list.slice(keep)) await fs.rm(path.join(this.dir(id), b.file), { force: true })
  }

  async restore(id: string, file: string): Promise<void> {
    if (this.servers.isRunning(id)) throw new UserError('Stop the server before restoring a backup.')
    const root = this.servers.dirOf(id)
    const zip = resolveInside(this.dir(id), file)
    // Replace only what the backup contains; everything else (jars, libraries) stays.
    for (const top of await listZipTopLevel(zip)) {
      if (EXCLUDE_TOP.has(top)) continue
      await fs.rm(resolveInside(root, top), { recursive: true, force: true })
    }
    await extractZip(zip, root)
    this.servers.logTo(id, `Restored backup ${file}.`)
  }

  async remove(id: string, file: string): Promise<void> {
    await fs.rm(resolveInside(this.dir(id), file), { force: true })
    this.lastBackup.delete(id)
  }
}
