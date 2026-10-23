import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PlayitState, ToolInfo } from '@shared/types'
import type { DownloadManager } from '../downloads/DownloadManager'
import { UserError } from '../../util/errors'
import { exists, readJson, writeJson } from '../../util/fsx'
import { getJson } from '../../util/http'
import { stripAnsi } from '../servers/logParse'
import { lineSplitter } from '../../util/lines'

interface GhRelease {
  tag_name: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

/** Picks the playit agent build for this OS/CPU from a GitHub release. */
export function pickPlayitAsset(assets: GhRelease['assets'], platform: string, arch: string): GhRelease['assets'][number] | undefined {
  const byName = (re: RegExp) => assets.filter((a) => re.test(a.name))
  let list: GhRelease['assets'] = []
  if (platform === 'win32') list = byName(/windows/i).filter((a) => /\.exe$/i.test(a.name) && (arch === 'arm64' ? /arm|aarch/i.test(a.name) : /x86_64|amd64|x64/i.test(a.name)))
  else if (platform === 'darwin') list = byName(/darwin|mac|apple/i).filter((a) => !/\.(sha256|sig)$/i.test(a.name))
  else list = byName(/linux/i).filter((a) => (arch === 'arm64' ? /aarch64|arm64/i : /amd64|x86_64/i).test(a.name) && !/\.(deb|rpm|sha256|sig)$/i.test(a.name))
  return list.find((a) => /signed/i.test(a.name)) ?? list[0]
}

const CLAIM_RE = /https:\/\/playit\.gg\/(?:claim|mc)\/[A-Za-z0-9_-]+/
const TUNNEL_HOST_RE = /\b((?:[a-z0-9-]+\.)+(?:joinmc\.link|ply\.gg|playit\.plus))(?::(\d{2,5}))?\b/i
const MAPPING_RE = /(\S+:\d{2,5})\s*(?:=>|->)\s*(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):(\d{2,5})/

/** Pulls a claim link or a public tunnel address out of a line of agent output. */
export function parsePlayitLine(line: string, localPort?: number): { claimUrl?: string; address?: string } {
  const clean = stripAnsi(line)
  const claim = clean.match(CLAIM_RE)
  if (claim) return { claimUrl: claim[0] }
  const mapping = clean.match(MAPPING_RE)
  if (mapping && (!localPort || parseInt(mapping[2], 10) === localPort)) {
    const host = mapping[1].match(TUNNEL_HOST_RE)
    return { address: host ? `${host[1]}${host[2] ? `:${host[2]}` : ''}` : mapping[1] }
  }
  const host = clean.match(TUNNEL_HOST_RE)
  if (host && !/api\.|www\./i.test(host[1])) return { address: `${host[1]}${host[2] ? `:${host[2]}` : ''}` }
  return {}
}

export interface PlayitStatus {
  state: PlayitState
  address?: string
  claimUrl?: string
  error?: string
  log: string[]
}

/**
 * Runs the playit.gg agent. It gives friends an address like `name.joinmc.link` without router setup.
 * The agent is downloaded on demand; its secret is kept in the app's tools folder.
 */
export class PlayitService {
  private proc: ChildProcess | null = null
  private status: PlayitStatus = { state: 'off', log: [] }
  private localPort?: number
  private metaFile: string

  constructor(
    private toolsDir: string,
    private downloads: DownloadManager,
    private onChange: (s: PlayitStatus) => void
  ) {
    this.metaFile = path.join(toolsDir, 'playit.json')
  }

  private get bin(): string {
    return path.join(this.toolsDir, process.platform === 'win32' ? 'playit.exe' : 'playit')
  }

  private get secretPath(): string {
    return path.join(this.toolsDir, 'playit-secret.toml')
  }

  get current(): PlayitStatus {
    return this.status
  }

  async info(): Promise<ToolInfo> {
    const meta = await readJson<{ version?: string }>(this.metaFile, {})
    const installed = await exists(this.bin)
    return { id: 'playit', name: 'playit.gg agent', installed, version: installed ? meta.version : undefined, path: installed ? this.bin : undefined }
  }

  async install(): Promise<ToolInfo> {
    const rel = await getJson<GhRelease>('https://api.github.com/repos/playit-cloud/playit-agent/releases/latest')
    const asset = pickPlayitAsset(rel.assets, process.platform, process.arch)
    if (!asset) throw new UserError(`playit.gg doesn't publish an agent for this computer (${process.platform}/${process.arch}).`)
    await fs.mkdir(this.toolsDir, { recursive: true })
    await this.downloads.download(asset.browser_download_url, this.bin, { label: `playit.gg agent ${rel.tag_name}` })
    if (process.platform !== 'win32') await fs.chmod(this.bin, 0o755)
    await writeJson(this.metaFile, { version: rel.tag_name })
    return this.info()
  }

  async uninstall(): Promise<void> {
    this.stop()
    await fs.rm(this.bin, { force: true })
    await fs.rm(this.metaFile, { force: true })
  }

  async unlink(): Promise<void> {
    this.stop()
    await fs.rm(this.secretPath, { force: true })
  }

  /** Starts the agent (installing it first if needed). Resolves once it is launched. */
  async start(localPort: number): Promise<void> {
    this.localPort = localPort
    if (this.proc) return
    if (!(await exists(this.bin))) {
      this.set({ state: 'notInstalled' })
      await this.install()
    }
    this.set({ state: 'starting', error: undefined })
    this.launch(0)
  }

  private launch(variant: number): void {
    // Agent CLI flags have shifted between releases; try the richest form first.
    const variants = [
      ['--stdout', '--secret_path', this.secretPath, 'start'],
      ['--secret_path', this.secretPath, 'start'],
      ['start']
    ]
    const args = variants[variant]
    const started = Date.now()
    const p = spawn(this.bin, args, { cwd: this.toolsDir, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } })
    this.proc = p
    const onLine = (line: string) => {
      const clean = stripAnsi(line).trim()
      if (!clean) return
      this.status.log = [...this.status.log, clean].slice(-40)
      const parsed = parsePlayitLine(clean, this.localPort)
      if (parsed.claimUrl) this.set({ state: 'needsClaim', claimUrl: parsed.claimUrl })
      else if (parsed.address) this.set({ state: 'online', address: parsed.address, claimUrl: undefined })
      else this.onChange(this.status)
    }
    const split = lineSplitter(onLine)
    p.stdout?.setEncoding('utf8')
    p.stderr?.setEncoding('utf8')
    p.stdout?.on('data', split)
    p.stderr?.on('data', split)
    p.on('error', (e) => this.set({ state: 'error', error: e.message }))
    p.on('exit', (code) => {
      if (this.proc !== p) return
      this.proc = null
      const quick = Date.now() - started < 4000
      if (quick && code !== 0 && variant < variants.length - 1) {
        this.launch(variant + 1)
        return
      }
      if (this.status.state !== 'off') this.set({ state: code === 0 ? 'off' : 'error', error: code === 0 ? undefined : `The playit agent stopped (exit code ${code}).` })
    })
  }

  stop(): void {
    const p = this.proc
    this.proc = null
    p?.kill()
    this.set({ state: 'off', claimUrl: undefined })
  }

  get running(): boolean {
    return !!this.proc
  }

  private set(patch: Partial<PlayitStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange(this.status)
  }
}
