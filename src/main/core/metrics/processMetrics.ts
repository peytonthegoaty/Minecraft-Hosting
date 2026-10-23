import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'

export interface ProcSample {
  cpu: number
  memBytes: number
}

/**
 * Samples CPU % (of the whole machine) and resident memory for a process id.
 * Linux reads /proc, macOS uses `ps`, Windows keeps one PowerShell process open (spawning one per sample is slow).
 */
export class ProcessSampler {
  private last = new Map<number, { cpuMs: number; at: number }>()
  private ps: ChildProcessWithoutNullStreams | null = null
  private psQueue: ((out: string) => void)[] = []
  private psBuf = ''

  async sample(pid: number): Promise<ProcSample | null> {
    try {
      if (process.platform === 'linux') return await this.linux(pid)
      if (process.platform === 'win32') return await this.windows(pid)
      return await this.mac(pid)
    } catch {
      return null
    }
  }

  forget(pid: number): void {
    this.last.delete(pid)
  }

  dispose(): void {
    this.ps?.kill()
    this.ps = null
  }

  private cpuPercent(pid: number, cpuMs: number): number {
    const now = Date.now()
    const prev = this.last.get(pid)
    this.last.set(pid, { cpuMs, at: now })
    if (!prev || now <= prev.at) return 0
    const pct = ((cpuMs - prev.cpuMs) / (now - prev.at) / os.cpus().length) * 100
    return Math.max(0, Math.min(100, pct))
  }

  private async linux(pid: number): Promise<ProcSample | null> {
    const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    // fields[11] = utime, fields[12] = stime (after the comm field), in clock ticks (100/s).
    const cpuMs = ((parseInt(fields[11], 10) + parseInt(fields[12], 10)) * 1000) / 100
    const statm = await fs.readFile(`/proc/${pid}/statm`, 'utf8')
    const rssPages = parseInt(statm.split(' ')[1], 10)
    return { cpu: this.cpuPercent(pid, cpuMs), memBytes: rssPages * 4096 }
  }

  private mac(pid: number): Promise<ProcSample | null> {
    return new Promise((resolve) => {
      execFile('ps', ['-o', 'rss=,time=', '-p', String(pid)], (err, out) => {
        if (err) return resolve(null)
        const [rss, time] = out.trim().split(/\s+/)
        const parts = (time ?? '0').split(/[:.]/).map(Number)
        // time is [[dd-]hh:]mm:ss.cc
        let ms = 0
        if (parts.length >= 3) ms = (parts[parts.length - 3] * 60 + parts[parts.length - 2]) * 1000 + parts[parts.length - 1] * 10
        if (parts.length >= 4) ms += parts[parts.length - 4] * 3600000
        resolve({ cpu: this.cpuPercent(pid, ms), memBytes: parseInt(rss, 10) * 1024 })
      })
    })
  }

  private windows(pid: number): Promise<ProcSample | null> {
    if (!this.ps || this.ps.killed) {
      this.ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], { windowsHide: true })
      this.ps.stdout.setEncoding('utf8')
      this.ps.stdout.on('data', (d: string) => {
        this.psBuf += d
        let idx: number
        while ((idx = this.psBuf.indexOf('@@END')) !== -1) {
          const chunk = this.psBuf.slice(0, idx)
          this.psBuf = this.psBuf.slice(idx + 5)
          this.psQueue.shift()?.(chunk)
        }
      })
      this.ps.on('exit', () => {
        this.ps = null
        for (const cb of this.psQueue.splice(0)) cb('')
      })
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000)
      this.psQueue.push((out) => {
        clearTimeout(timer)
        const m = out.match(/(\d+)\s+([\d.,]+)/)
        if (!m) return resolve(null)
        const cpuMs = parseFloat(m[2].replace(',', '.'))
        resolve({ cpu: this.cpuPercent(pid, cpuMs), memBytes: parseInt(m[1], 10) })
      })
      this.ps!.stdin.write(
        `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){[Console]::Out.WriteLine(\"$($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)\")}; [Console]::Out.WriteLine('@@END')\n`
      )
    })
  }
}
