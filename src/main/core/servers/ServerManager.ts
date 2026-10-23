import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ApiEvents } from '@shared/api'
import type { LogLevel, LogLine, Metrics, NewServerInput, ServerConfig, ServerStatus, ServerSummary, ServerType, VersionOption } from '@shared/types'
import type { JavaService } from '../java/JavaService'
import type { DownloadManager } from '../downloads/DownloadManager'
import { ProcessSampler } from '../metrics/processMetrics'
import { UserError, errorMessage } from '../../util/errors'
import { exists, readJson, slugify, writeFileAtomic, writeJson } from '../../util/fsx'
import { lineSplitter } from '../../util/lines'
import { findFreePort } from '../../util/ports'
import { readZipEntries } from '../../util/zip'
import { buildJavaArgs } from './launch'
import { isStartupDone, parseLine, parseList, parseTps, playerJoined, playerLeft, stripAnsi, tpsCommand } from './logParse'
import { Properties } from './properties'
import { getProvider, javaForMinecraft } from './providers'
import { RconClient } from './rcon'

const CONFIG_FILE = 'blockhost.json'
const MAX_LOG = 3000
const MAX_METRICS = 300

type Emit = <K extends keyof ApiEvents>(event: K, payload: ApiEvents[K]) => void

/** Thrown when a server can't start because a suitable Java is missing; the UI shows the install popup. */
export class JavaRequiredError extends UserError {
  constructor(public major: number) {
    super(`JAVA_REQUIRED:${major}`)
  }
}

interface Runtime {
  cfg: ServerConfig
  dir: string
  status: ServerStatus
  proc: ChildProcess | null
  startedAt?: number
  log: LogLine[]
  pendingLog: LogLine[]
  metrics: Metrics[]
  players: Set<string>
  maxPlayers: number
  rcon: RconClient
  timers: NodeJS.Timeout[]
  stopRequested: boolean
  restartAfterStop: boolean
  crashes: number[]
  lastTps?: { tps?: number; mspt?: number }
  installed: boolean
  installError?: string
  eulaAccepted: boolean
  stopTimer?: NodeJS.Timeout
}

export interface ServerManagerDeps {
  dataDir: string
  serversDir: () => string
  java: JavaService
  downloads: DownloadManager
  emit: Emit
}

export class ServerManager {
  private servers = new Map<string, Runtime>()
  private registryFile: string
  private sampler = new ProcessSampler()
  private logSeq = 1
  private flushTimer: NodeJS.Timeout
  private statusListeners: ((id: string, status: ServerStatus) => void)[] = []

  constructor(private deps: ServerManagerDeps) {
    this.registryFile = path.join(deps.dataDir, 'servers.json')
    this.flushTimer = setInterval(() => this.flushLogs(), 120)
  }

  onStatus(cb: (id: string, status: ServerStatus) => void): void {
    this.statusListeners.push(cb)
  }

  // ---------- loading & persistence ----------

  async load(): Promise<void> {
    const dirs = await readJson<string[]>(this.registryFile, [])
    for (const dir of dirs) {
      const cfg = await readJson<ServerConfig | null>(path.join(dir, CONFIG_FILE), null)
      if (!cfg) continue
      const rt = this.makeRuntime(cfg, dir)
      rt.eulaAccepted = await this.readEula(dir)
      this.servers.set(cfg.id, rt)
    }
  }

  private makeRuntime(cfg: ServerConfig, dir: string): Runtime {
    return {
      cfg,
      dir,
      status: 'stopped',
      proc: null,
      log: [],
      pendingLog: [],
      metrics: [],
      players: new Set(),
      maxPlayers: 20,
      rcon: new RconClient(),
      timers: [],
      stopRequested: false,
      restartAfterStop: false,
      crashes: [],
      installed: !!cfg.launch,
      eulaAccepted: false
    }
  }

  private async saveRegistry(): Promise<void> {
    await writeJson(this.registryFile, [...this.servers.values()].map((r) => r.dir))
  }

  private async saveConfig(rt: Runtime): Promise<void> {
    await writeJson(path.join(rt.dir, CONFIG_FILE), rt.cfg)
  }

  private async readEula(dir: string): Promise<boolean> {
    try {
      return /^\s*eula\s*=\s*true\s*$/im.test(await fs.readFile(path.join(dir, 'eula.txt'), 'utf8'))
    } catch {
      return false
    }
  }

  get(id: string): Runtime {
    const rt = this.servers.get(id)
    if (!rt) throw new UserError('That server no longer exists.')
    return rt
  }

  dirOf(id: string): string {
    return this.get(id).dir
  }

  configOf(id: string): ServerConfig {
    return this.get(id).cfg
  }

  summary(rt: Runtime): ServerSummary {
    return {
      ...rt.cfg,
      dir: rt.dir,
      status: rt.status,
      startedAt: rt.startedAt,
      players: [...rt.players],
      maxPlayers: rt.maxPlayers,
      installed: rt.installed,
      eulaAccepted: rt.eulaAccepted,
      installError: rt.installError
    }
  }

  list(): ServerSummary[] {
    return [...this.servers.values()].sort((a, b) => a.cfg.createdAt - b.cfg.createdAt).map((r) => this.summary(r))
  }

  anyRunning(): boolean {
    return [...this.servers.values()].some((r) => r.proc)
  }

  private broadcast(): void {
    this.deps.emit('servers', this.list())
  }

  private setStatus(rt: Runtime, status: ServerStatus): void {
    rt.status = status
    this.deps.emit('status', { id: rt.cfg.id, status })
    this.broadcast()
    for (const l of this.statusListeners) l(rt.cfg.id, status)
  }

  // ---------- versions ----------

  listVersions(type: ServerType, includeSnapshots: boolean): Promise<VersionOption[]> {
    return getProvider(type).listVersions(includeSnapshots)
  }

  listLoaderVersions(type: ServerType, mc: string): Promise<VersionOption[]> {
    return getProvider(type).listLoaderVersions(mc)
  }

  // ---------- create / import / delete ----------

  async create(input: NewServerInput): Promise<ServerSummary> {
    const name = input.name.trim() || 'My server'
    const base = this.deps.serversDir()
    await fs.mkdir(base, { recursive: true })
    let slug = slugify(name)
    let dir = path.join(base, slug)
    for (let i = 2; await exists(dir); i++) dir = path.join(base, `${slug}-${i}`)
    slug = path.basename(dir)
    await fs.mkdir(dir, { recursive: true })

    const usedPorts = [...this.servers.values()].flatMap((r) => [r.cfg.port, r.cfg.rcon.port])
    const port = input.port ?? (await findFreePort(25565, usedPorts))
    const rconPort = await findFreePort(25575, [...usedPorts, port])
    const javaMajor = await javaForMinecraft(input.mcVersion)
    const cfg: ServerConfig = {
      id: `${slug}-${randomBytes(3).toString('hex')}`,
      name,
      type: input.type,
      mcVersion: input.mcVersion,
      loaderVersion: input.loaderVersion,
      memoryMb: input.memoryMb,
      port,
      javaMajor,
      javaPath: null,
      optimizedFlags: true,
      extraJvmArgs: '',
      autoRestart: true,
      createdAt: Date.now(),
      backup: { enabled: true, intervalHours: 6, keep: 10 },
      restartSchedule: { enabled: false, time: '05:00' },
      network: { upnp: false, playit: false },
      rcon: { port: rconPort, password: randomBytes(18).toString('base64url') }
    }
    if (input.acceptEula) await this.writeEula(dir)
    const props = new Properties()
    props.set('motd', name)
    props.set('server-port', String(port))
    await writeFileAtomic(path.join(dir, 'server.properties'), props.toString())

    const rt = this.makeRuntime(cfg, dir)
    rt.eulaAccepted = input.acceptEula
    this.servers.set(cfg.id, rt)
    await this.saveConfig(rt)
    await this.saveRegistry()
    this.broadcast()
    // Install in the background; progress shows in the console and downloads panel.
    this.install(rt).catch(() => undefined)
    return this.summary(rt)
  }

  private async writeEula(dir: string): Promise<void> {
    await writeFileAtomic(
      path.join(dir, 'eula.txt'),
      `#By changing the setting below to TRUE you are indicating your agreement to the EULA (https://aka.ms/MinecraftEULA).\n#Accepted in Blockhost on ${new Date().toString()}\neula=true\n`
    )
  }

  async acceptEula(id: string): Promise<void> {
    const rt = this.get(id)
    await this.writeEula(rt.dir)
    rt.eulaAccepted = true
    this.broadcast()
  }

  async importFolder(dir: string, name: string): Promise<ServerSummary> {
    if ([...this.servers.values()].some((r) => path.resolve(r.dir) === path.resolve(dir))) throw new UserError('That folder is already in Blockhost.')
    const existing = await readJson<ServerConfig | null>(path.join(dir, CONFIG_FILE), null)
    if (existing) {
      const rt = this.makeRuntime(existing, dir)
      rt.eulaAccepted = await this.readEula(dir)
      this.servers.set(existing.id, rt)
      await this.saveRegistry()
      this.broadcast()
      return this.summary(rt)
    }
    const detected = await detectServer(dir)
    const props = Properties.parse(await fs.readFile(path.join(dir, 'server.properties'), 'utf8').catch(() => ''))
    const usedPorts = [...this.servers.values()].flatMap((r) => [r.cfg.port, r.cfg.rcon.port])
    const port = parseInt(props.get('server-port') ?? '', 10) || (await findFreePort(25565, usedPorts))
    const rconPort = await findFreePort(25575, [...usedPorts, port])
    const cfg: ServerConfig = {
      id: `${slugify(name || path.basename(dir))}-${randomBytes(3).toString('hex')}`,
      name: name || path.basename(dir),
      type: detected.type,
      mcVersion: detected.mcVersion ?? 'unknown',
      memoryMb: 4096,
      port,
      javaMajor: detected.mcVersion ? await javaForMinecraft(detected.mcVersion) : 21,
      javaPath: null,
      optimizedFlags: true,
      extraJvmArgs: '',
      autoRestart: true,
      createdAt: Date.now(),
      launch: detected.launch,
      backup: { enabled: true, intervalHours: 6, keep: 10 },
      restartSchedule: { enabled: false, time: '05:00' },
      network: { upnp: false, playit: false },
      rcon: { port: rconPort, password: randomBytes(18).toString('base64url') }
    }
    if (!cfg.launch) throw new UserError("Couldn't find a server jar in that folder.")
    const rt = this.makeRuntime(cfg, dir)
    rt.eulaAccepted = await this.readEula(dir)
    this.servers.set(cfg.id, rt)
    await this.saveConfig(rt)
    await this.saveRegistry()
    this.broadcast()
    return this.summary(rt)
  }

  async update(id: string, patch: Partial<ServerConfig>): Promise<ServerSummary> {
    const rt = this.get(id)
    const { id: _id, createdAt: _c, ...rest } = patch
    const next: ServerConfig = { ...rt.cfg, ...rest, rcon: rt.cfg.rcon }
    if (patch.port && patch.port !== rt.cfg.port) {
      const props = await this.readProps(rt)
      props.set('server-port', String(patch.port))
      await writeFileAtomic(path.join(rt.dir, 'server.properties'), props.toString())
    }
    if (patch.mcVersion && patch.mcVersion !== rt.cfg.mcVersion) next.javaMajor = await javaForMinecraft(patch.mcVersion)
    rt.cfg = next
    await this.saveConfig(rt)
    this.broadcast()
    return this.summary(rt)
  }

  async remove(id: string, deleteFiles: boolean): Promise<void> {
    const rt = this.get(id)
    if (rt.proc) throw new UserError('Stop the server before deleting it.')
    this.servers.delete(id)
    await this.saveRegistry()
    if (deleteFiles) await fs.rm(rt.dir, { recursive: true, force: true })
    this.broadcast()
  }

  // ---------- install ----------

  private async install(rt: Runtime): Promise<void> {
    if (rt.status === 'installing') return
    rt.installError = undefined
    this.setStatus(rt, 'installing')
    const { cfg } = rt
    this.appLog(rt, `Installing ${cfg.type} ${cfg.mcVersion}${cfg.loaderVersion ? ` (${cfg.loaderVersion})` : ''}…`)
    try {
      const result = await getProvider(cfg.type).install(cfg.mcVersion, cfg.loaderVersion, {
        dir: rt.dir,
        downloads: this.deps.downloads,
        log: (l) => this.appLog(rt, stripAnsi(l)),
        javaPath: async () => {
          const j = await this.deps.java.findFor(cfg.javaMajor, cfg.javaPath)
          if (!j) {
            this.requestJava(rt)
            throw new JavaRequiredError(cfg.javaMajor)
          }
          return j.path
        },
        runJava: (java, args, cwd, onLine) => runProcess(java, args, cwd, onLine)
      })
      rt.cfg.launch = result.launch
      if (result.loaderVersion) rt.cfg.loaderVersion = result.loaderVersion
      rt.installed = true
      await this.saveConfig(rt)
      this.appLog(rt, 'Install finished. Press Start to run your server.')
      this.deps.emit('toast', { kind: 'success', message: `${cfg.name} is installed and ready.` })
      this.setStatus(rt, 'stopped')
    } catch (e) {
      const msg = errorMessage(e)
      if (!(e instanceof JavaRequiredError)) {
        rt.installError = msg
        this.appLog(rt, `Install failed: ${msg}`, 'ERROR')
        this.deps.emit('toast', { kind: 'error', message: `${cfg.name}: install failed — ${msg}` })
      } else {
        this.appLog(rt, `Java ${cfg.javaMajor} is needed to finish installing. Install it, then press Start.`, 'WARN')
      }
      this.setStatus(rt, 'stopped')
      throw e
    }
  }

  private async requestJava(rt: Runtime): Promise<void> {
    this.deps.emit('javaRequired', {
      serverId: rt.cfg.id,
      major: rt.cfg.javaMajor,
      reason: `${rt.cfg.name} runs ${rt.cfg.type === 'vanilla' ? 'Minecraft' : rt.cfg.type} ${rt.cfg.mcVersion}, which needs ${this.deps.java.describeRequirement(rt.cfg.javaMajor)}.`,
      found: await this.deps.java.list()
    })
  }

  // ---------- start / stop ----------

  private async readProps(rt: Runtime): Promise<Properties> {
    return Properties.parse(await fs.readFile(path.join(rt.dir, 'server.properties'), 'utf8').catch(() => ''))
  }

  async start(id: string): Promise<void> {
    const rt = this.get(id)
    if (rt.proc || rt.status === 'installing') return
    if (!rt.installed) {
      await this.install(rt)
    }
    if (!rt.eulaAccepted) rt.eulaAccepted = await this.readEula(rt.dir)
    if (!rt.eulaAccepted) throw new UserError('Accept the Minecraft EULA before starting this server.')
    const java = await this.deps.java.findFor(rt.cfg.javaMajor, rt.cfg.javaPath)
    if (!java) {
      await this.requestJava(rt)
      throw new JavaRequiredError(rt.cfg.javaMajor)
    }

    // Make sure the port and RCON (used for player lists and TPS) are configured.
    const props = await this.readProps(rt)
    props.set('server-port', String(rt.cfg.port))
    props.set('enable-rcon', 'true')
    props.set('rcon.port', String(rt.cfg.rcon.port))
    props.set('rcon.password', rt.cfg.rcon.password)
    props.set('broadcast-rcon-to-ops', 'false')
    await writeFileAtomic(path.join(rt.dir, 'server.properties'), props.toString())
    rt.maxPlayers = parseInt(props.get('max-players') ?? '20', 10) || 20

    const args = buildJavaArgs(rt.cfg)
    this.appLog(rt, `Starting with Java ${java.major} (${java.vendor}) and ${Math.round(rt.cfg.memoryMb / 1024 * 10) / 10} GB RAM…`)
    rt.stopRequested = false
    rt.players.clear()
    rt.metrics = []
    rt.lastTps = undefined
    const proc = spawn(java.path, args, { cwd: rt.dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    rt.proc = proc
    rt.startedAt = Date.now()
    this.setStatus(rt, 'starting')

    const onOutput = lineSplitter((line) => this.onServerLine(rt, line))
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', onOutput)
    proc.stderr?.on('data', onOutput)
    proc.stdin?.on('error', () => undefined)
    proc.on('error', (e) => {
      this.appLog(rt, `Couldn't start Java: ${e.message}`, 'ERROR')
    })
    proc.on('exit', (code, signal) => this.onExit(rt, code, signal))

    rt.timers.push(setInterval(() => this.sampleMetrics(rt), 2000))
  }

  private onServerLine(rt: Runtime, raw: string): void {
    const { level, message } = parseLine(raw)
    this.pushLog(rt, level, stripAnsi(raw))
    if (rt.status === 'starting' && isStartupDone(message)) {
      this.setStatus(rt, 'running')
      setTimeout(() => this.connectRcon(rt), 1500)
      rt.timers.push(setInterval(() => this.pollRcon(rt), 10000))
    }
    const joined = playerJoined(message)
    if (joined) {
      rt.players.add(joined)
      this.broadcast()
    }
    const left = playerLeft(message)
    if (left) {
      rt.players.delete(left)
      this.broadcast()
    }
    // Replies to commands typed in the console.
    const list = parseList(message)
    if (list) {
      rt.players = new Set(list.names)
      rt.maxPlayers = list.max
      this.broadcast()
    }
    const tps = parseTps(message)
    if (tps) rt.lastTps = tps
  }

  private async connectRcon(rt: Runtime): Promise<void> {
    if (!rt.proc || rt.rcon.connected) return
    try {
      await rt.rcon.connect('127.0.0.1', rt.cfg.rcon.port, rt.cfg.rcon.password)
      await this.pollRcon(rt)
    } catch {
      // RCON is optional; stats fall back to log parsing.
    }
  }

  private async pollRcon(rt: Runtime): Promise<void> {
    if (!rt.proc || rt.status !== 'running') return
    if (!rt.rcon.connected) return this.connectRcon(rt)
    try {
      const list = parseList(await rt.rcon.command('list'))
      if (list) {
        rt.players = new Set(list.names)
        rt.maxPlayers = list.max
        this.broadcast()
      }
      const tps = parseTps(await rt.rcon.command(tpsCommand(rt.cfg.type)))
      if (tps) rt.lastTps = tps
    } catch {
      // ignore; next poll retries
    }
  }

  private async sampleMetrics(rt: Runtime): Promise<void> {
    const pid = rt.proc?.pid
    if (!pid) return
    const s = await this.sampler.sample(pid)
    if (!s || !rt.proc) return
    const m: Metrics = {
      ts: Date.now(),
      cpu: s.cpu,
      memBytes: s.memBytes,
      tps: rt.lastTps?.tps,
      mspt: rt.lastTps?.mspt,
      players: rt.players.size,
      maxPlayers: rt.maxPlayers
    }
    rt.metrics.push(m)
    if (rt.metrics.length > MAX_METRICS) rt.metrics.splice(0, rt.metrics.length - MAX_METRICS)
    this.deps.emit('metrics', { id: rt.cfg.id, metrics: m })
  }

  private onExit(rt: Runtime, code: number | null, signal: NodeJS.Signals | null): void {
    for (const t of rt.timers) clearInterval(t)
    rt.timers = []
    if (rt.stopTimer) clearTimeout(rt.stopTimer)
    rt.rcon.close()
    if (rt.proc?.pid) this.sampler.forget(rt.proc.pid)
    rt.proc = null
    rt.players.clear()
    const expected = rt.stopRequested
    const ok = expected || code === 0
    this.appLog(rt, ok ? 'Server stopped.' : `Server stopped unexpectedly (${signal ?? `exit code ${code}`}).`, ok ? 'APP' : 'ERROR')
    rt.startedAt = undefined
    this.setStatus(rt, ok ? 'stopped' : 'crashed')
    if (rt.restartAfterStop) {
      rt.restartAfterStop = false
      this.start(rt.cfg.id).catch((e) => this.appLog(rt, `Restart failed: ${errorMessage(e)}`, 'ERROR'))
      return
    }
    if (!ok && rt.cfg.autoRestart) {
      const now = Date.now()
      rt.crashes = rt.crashes.filter((t) => now - t < 10 * 60 * 1000)
      rt.crashes.push(now)
      if (rt.crashes.length <= 3) {
        this.appLog(rt, `Restarting automatically in 5 seconds (attempt ${rt.crashes.length} of 3)…`, 'WARN')
        setTimeout(() => {
          if (!rt.proc && rt.status === 'crashed') this.start(rt.cfg.id).catch((e) => this.appLog(rt, `Restart failed: ${errorMessage(e)}`, 'ERROR'))
        }, 5000)
      } else {
        this.appLog(rt, 'It crashed 3 times in 10 minutes, so automatic restarts are paused. Check the log above for the cause.', 'ERROR')
      }
    }
  }

  stop(id: string): void {
    const rt = this.get(id)
    if (!rt.proc) return
    rt.stopRequested = true
    if (rt.status !== 'stopping') this.setStatus(rt, 'stopping')
    this.write(rt, 'stop')
    rt.stopTimer = setTimeout(() => {
      if (rt.proc) {
        this.appLog(rt, "The server didn't stop within 60 seconds, so it was forced to close.", 'WARN')
        rt.proc.kill('SIGKILL')
      }
    }, 60000)
  }

  restart(id: string): void {
    const rt = this.get(id)
    if (!rt.proc) {
      this.start(id).catch(() => undefined)
      return
    }
    rt.restartAfterStop = true
    this.stop(id)
  }

  kill(id: string): void {
    const rt = this.get(id)
    rt.stopRequested = true
    rt.proc?.kill('SIGKILL')
  }

  async stopAll(timeoutMs = 60000): Promise<void> {
    const running = [...this.servers.values()].filter((r) => r.proc)
    for (const r of running) this.stop(r.cfg.id)
    const deadline = Date.now() + timeoutMs
    while (running.some((r) => r.proc) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 250))
    for (const r of running) r.proc?.kill('SIGKILL')
  }

  // ---------- console ----------

  sendCommand(id: string, command: string): void {
    const rt = this.get(id)
    const cmd = command.replace(/^\//, '').trim()
    if (!cmd) return
    if (!rt.proc) throw new UserError('The server is not running.')
    this.pushLog(rt, 'APP', `> ${cmd}`)
    if (/^stop$/i.test(cmd)) {
      this.stop(id)
      return
    }
    this.write(rt, cmd)
  }

  /** Runs a command over RCON when possible (to read the reply), otherwise via the console. */
  async runCommand(id: string, command: string): Promise<string | null> {
    const rt = this.get(id)
    if (!rt.proc) return null
    if (rt.rcon.connected) {
      try {
        return await rt.rcon.command(command)
      } catch {
        // fall through
      }
    }
    this.write(rt, command)
    return null
  }

  /** Waits until a console line matches `re` (used to know when a world save finished). */
  waitForLine(id: string, re: RegExp, timeoutMs: number): Promise<boolean> {
    const rt = this.get(id)
    const startId = this.logSeq
    return new Promise((resolve) => {
      const started = Date.now()
      const iv = setInterval(() => {
        const hit = rt.log.some((l) => l.id >= startId && re.test(l.text)) || rt.pendingLog.some((l) => l.id >= startId && re.test(l.text))
        if (hit || Date.now() - started > timeoutMs || !rt.proc) {
          clearInterval(iv)
          resolve(hit)
        }
      }, 200)
    })
  }

  isRunning(id: string): boolean {
    return !!this.get(id).proc
  }

  private write(rt: Runtime, cmd: string): void {
    rt.proc?.stdin?.write(`${cmd}\n`)
  }

  getLog(id: string): LogLine[] {
    const rt = this.get(id)
    return [...rt.log, ...rt.pendingLog]
  }

  getMetrics(id: string): Metrics[] {
    return this.get(id).metrics
  }

  appLog(rt: Runtime, text: string, level: LogLevel = 'APP'): void {
    this.pushLog(rt, level, text)
  }

  logTo(id: string, text: string, level: LogLevel = 'APP'): void {
    const rt = this.servers.get(id)
    if (rt) this.pushLog(rt, level, text)
  }

  private pushLog(rt: Runtime, level: LogLevel, text: string): void {
    rt.pendingLog.push({ id: this.logSeq++, t: Date.now(), level, text })
  }

  private flushLogs(): void {
    for (const rt of this.servers.values()) {
      if (!rt.pendingLog.length) continue
      const lines = rt.pendingLog
      rt.pendingLog = []
      rt.log.push(...lines)
      if (rt.log.length > MAX_LOG) rt.log.splice(0, rt.log.length - MAX_LOG)
      this.deps.emit('log', { id: rt.cfg.id, lines })
    }
  }

  dispose(): void {
    clearInterval(this.flushTimer)
    this.sampler.dispose()
  }
}

function runProcess(cmd: string, args: string[], cwd: string, onLine: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true })
    const split = lineSplitter(onLine)
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', split)
    p.stderr.on('data', split)
    p.on('error', (e) => {
      onLine(e.message)
      resolve(1)
    })
    p.on('exit', (code) => resolve(code ?? 1))
  })
}

/** Works out what kind of server an existing folder holds. */
export async function detectServer(dir: string): Promise<{ type: ServerType; mcVersion?: string; launch?: ServerConfig['launch'] }> {
  const has = (p: string) => exists(path.join(dir, p))
  const files = await fs.readdir(dir).catch(() => [] as string[])
  const argsLaunch = async (base: string): Promise<{ launch?: ServerConfig['launch']; version?: string }> => {
    const versions = await fs.readdir(path.join(dir, base)).catch(() => [] as string[])
    const v = versions.sort().pop()
    if (!v) return {}
    const rel = `${base}/${v}`
    if (await has(`${rel}/unix_args.txt`)) return { launch: { kind: 'argsfile', winArgs: `${rel}/win_args.txt`, unixArgs: `${rel}/unix_args.txt` }, version: v }
    return { version: v }
  }
  if (await has('libraries/net/neoforged/neoforge')) {
    const r = await argsLaunch('libraries/net/neoforged/neoforge')
    const { neoforgeToMc } = await import('./providers/forge')
    return { type: 'neoforge', mcVersion: r.version ? (neoforgeToMc(r.version) ?? undefined) : undefined, launch: r.launch }
  }
  if (await has('libraries/net/minecraftforge/forge')) {
    const r = await argsLaunch('libraries/net/minecraftforge/forge')
    if (r.launch) return { type: 'forge', mcVersion: r.version?.split('-')[0], launch: r.launch }
  }
  const jars = files.filter((f) => f.endsWith('.jar'))
  const forgeJar = jars.find((f) => /^forge-.*\.jar$/.test(f) && !f.includes('installer'))
  if (forgeJar) return { type: 'forge', mcVersion: forgeJar.split('-')[1], launch: { kind: 'jar', jar: forgeJar } }
  if (jars.includes('fabric-server-launch.jar')) {
    return { type: 'fabric', mcVersion: await jarMcVersion(path.join(dir, 'server.jar')), launch: { kind: 'jar', jar: 'fabric-server-launch.jar' } }
  }
  const sized = await Promise.all(jars.map(async (j) => ({ j, size: (await fs.stat(path.join(dir, j))).size })))
  sized.sort((a, b) => b.size - a.size)
  const main = sized.find((s) => /server|paper|purpur|spigot|minecraft/i.test(s.j))?.j ?? sized[0]?.j
  const type: ServerType = (await has('purpur.yml')) || /purpur/i.test(main ?? '') ? 'purpur' : (await has('config/paper-global.yml')) || (await has('paper.yml')) || /paper/i.test(main ?? '') ? 'paper' : 'vanilla'
  return { type, mcVersion: main ? await jarMcVersion(path.join(dir, main)) : undefined, launch: main ? { kind: 'jar', jar: main } : undefined }
}

async function jarMcVersion(jar: string): Promise<string | undefined> {
  try {
    const e = await readZipEntries(jar, ['version.json', 'META-INF/versions.list'])
    const vj = e.get('version.json')
    if (vj) return (JSON.parse(vj.toString('utf8')) as { id?: string }).id
    const vl = e.get('META-INF/versions.list')
    if (vl) return vl.toString('utf8').split(/\s+/)[1]
  } catch {
    // not a zip or unreadable
  }
  return undefined
}
