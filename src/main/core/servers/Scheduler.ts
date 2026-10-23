import type { ServerManager } from './ServerManager'
import type { BackupService } from './BackupService'

/** Runs scheduled backups and daily restarts. Checks once a minute. */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private lastRestartDay = new Map<string, string>()

  constructor(
    private servers: ServerManager,
    private backups: BackupService
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick().catch(() => undefined), 60000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(now = new Date()): Promise<void> {
    for (const s of this.servers.list()) {
      if (!s.installed) continue
      if (s.backup.enabled && s.status === 'running') {
        const last = await this.backups.lastBackupTime(s.id)
        if (now.getTime() - last >= s.backup.intervalHours * 3600 * 1000) {
          await this.backups.create(s.id).catch((e) => this.servers.logTo(s.id, `Scheduled backup failed: ${e.message}`, 'ERROR'))
        }
      }
      if (s.restartSchedule.enabled && s.status === 'running') {
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const day = now.toDateString()
        if (hhmm === s.restartSchedule.time && this.lastRestartDay.get(s.id) !== day) {
          this.lastRestartDay.set(s.id, day)
          await this.servers.runCommand(s.id, 'say Scheduled restart in 60 seconds.')
          setTimeout(() => this.servers.restart(s.id), 60000)
        }
      }
    }
  }
}
