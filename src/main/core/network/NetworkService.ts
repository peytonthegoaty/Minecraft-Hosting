import type { NetworkStatus, ServerStatus, UpnpState } from '@shared/types'
import type { ServerManager } from '../servers/ServerManager'
import type { PlayitService, PlayitStatus } from '../tunnels/playit'
import { errorMessage } from '../../util/errors'
import { allowPort, firewallStatus } from './firewall'
import { localAddresses } from './localIp'
import { checkReachable, fetchPublicIp } from './publicIp'
import { UpnpClient } from './upnp'

interface PerServer {
  upnp: { state: UpnpState; error?: string; externalIp?: string }
  mappedPort?: number
  reachable: NetworkStatus['reachable']
  firewall: NetworkStatus['firewall']
}

/** Everything about how friends reach a server: LAN address, UPnP port opening, reachability, playit tunnel. */
export class NetworkService {
  private per = new Map<string, PerServer>()
  private publicIp: { value: string | null; at: number } = { value: null, at: 0 }
  private upnp = new UpnpClient()
  private renewTimer: NodeJS.Timeout

  constructor(
    private servers: ServerManager,
    private playit: PlayitService,
    private emit: (s: NetworkStatus) => void
  ) {
    servers.onStatus((id, status) => this.onServerStatus(id, status).catch(() => undefined))
    // Leases are an hour; renew every 30 minutes.
    this.renewTimer = setInterval(() => this.renew().catch(() => undefined), 30 * 60 * 1000)
  }

  private state(id: string): PerServer {
    let s = this.per.get(id)
    if (!s) {
      s = { upnp: { state: 'off' }, reachable: 'unknown', firewall: 'unknown' }
      this.per.set(id, s)
    }
    return s
  }

  status(id: string): NetworkStatus {
    const cfg = this.servers.configOf(id)
    const s = this.state(id)
    const { primary, others } = localAddresses()
    const p: PlayitStatus = this.playit.current
    const playitOn = cfg.network.playit
    return {
      serverId: id,
      localIp: primary,
      otherIps: others,
      port: cfg.port,
      publicIp: s.upnp.externalIp ?? this.publicIp.value,
      upnp: cfg.network.upnp ? s.upnp : { state: 'off' },
      reachable: s.reachable,
      playit: playitOn
        ? { state: p.state, address: cfg.network.playitAddress || p.address, claimUrl: p.claimUrl, error: p.error, log: p.log.slice(-15) }
        : { state: 'off', address: cfg.network.playitAddress },
      firewall: s.firewall
    }
  }

  private push(id: string): void {
    this.emit(this.status(id))
  }

  pushAll(): void {
    for (const s of this.servers.list()) this.push(s.id)
  }

  async refresh(id: string): Promise<NetworkStatus> {
    const cfg = this.servers.configOf(id)
    const s = this.state(id)
    if (Date.now() - this.publicIp.at > 5 * 60 * 1000 || !this.publicIp.value) {
      this.publicIp = { value: await fetchPublicIp(), at: Date.now() }
    }
    s.firewall = await firewallStatus(cfg.port)
    return this.status(id)
  }

  async setUpnp(id: string, enabled: boolean): Promise<NetworkStatus> {
    const cfg = this.servers.configOf(id)
    await this.servers.update(id, { network: { ...cfg.network, upnp: enabled } })
    if (enabled && this.servers.isRunning(id)) await this.openPort(id)
    if (!enabled) await this.closePort(id)
    return this.status(id)
  }

  async checkReachable(id: string): Promise<NetworkStatus> {
    const s = this.state(id)
    s.reachable = 'checking'
    this.push(id)
    const r = await checkReachable(this.servers.configOf(id).port)
    s.reachable = r === null ? 'unknown' : r ? 'yes' : 'no'
    return this.status(id)
  }

  async allowFirewall(id: string): Promise<NetworkStatus> {
    const port = this.servers.configOf(id).port
    await allowPort(port)
    this.state(id).firewall = await firewallStatus(port)
    return this.status(id)
  }

  async setPlayit(id: string, enabled: boolean): Promise<NetworkStatus> {
    const cfg = this.servers.configOf(id)
    await this.servers.update(id, { network: { ...cfg.network, playit: enabled } })
    if (enabled) {
      // Start the agent right away so the account can be linked before the server runs.
      await this.playit.start(cfg.port)
    } else if (!this.servers.list().some((s) => s.network.playit && s.status === 'running')) {
      this.playit.stop()
    }
    return this.status(id)
  }

  async setPlayitAddress(id: string, address: string): Promise<NetworkStatus> {
    const cfg = this.servers.configOf(id)
    await this.servers.update(id, { network: { ...cfg.network, playitAddress: address.trim() || undefined } })
    return this.status(id)
  }

  async claimPlayit(): Promise<{ url: string }> {
    if (!this.playit.running) {
      const port = this.servers.list().find((s) => s.network.playit)?.port ?? 25565
      await this.playit.start(port)
    }
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      const url = this.playit.current.claimUrl
      if (url) return { url }
      if (this.playit.current.state === 'online') return { url: 'https://playit.gg/account/tunnels' }
      await new Promise((r) => setTimeout(r, 300))
    }
    return { url: 'https://playit.gg/account/agents' }
  }

  onPlayitChange(): void {
    for (const s of this.servers.list()) if (s.network.playit) this.push(s.id)
  }

  private async openPort(id: string): Promise<void> {
    const cfg = this.servers.configOf(id)
    const s = this.state(id)
    const { primary } = localAddresses()
    if (!primary) {
      s.upnp = { state: 'failed', error: 'No network connection found.' }
      return this.push(id)
    }
    s.upnp = { state: 'working' }
    this.push(id)
    try {
      await this.upnp.map(cfg.port, primary, `Blockhost ${cfg.name}`)
      s.mappedPort = cfg.port
      const ext = await this.upnp.externalIp().catch(() => null)
      s.upnp = { state: 'open', externalIp: ext ?? undefined }
      this.servers.logTo(id, `Opened port ${cfg.port} on your router with UPnP.`)
    } catch (e) {
      this.upnp.reset()
      s.upnp = { state: 'failed', error: errorMessage(e) }
      this.servers.logTo(id, `UPnP couldn't open port ${cfg.port}: ${errorMessage(e)}`, 'WARN')
    }
    this.push(id)
  }

  private async closePort(id: string): Promise<void> {
    const s = this.state(id)
    if (s.mappedPort) {
      await this.upnp.unmap(s.mappedPort).catch(() => undefined)
      s.mappedPort = undefined
    }
    s.upnp = { state: 'off' }
    s.reachable = 'unknown'
    this.push(id)
  }

  private async renew(): Promise<void> {
    for (const [id, s] of this.per) {
      if (s.mappedPort && this.servers.isRunning(id)) await this.openPort(id)
    }
  }

  private async onServerStatus(id: string, status: ServerStatus): Promise<void> {
    let cfg
    try {
      cfg = this.servers.configOf(id)
    } catch {
      return
    }
    if (status === 'starting') {
      if (cfg.network.upnp) await this.openPort(id)
      if (cfg.network.playit) await this.playit.start(cfg.port).catch((e) => this.servers.logTo(id, `playit.gg: ${errorMessage(e)}`, 'WARN'))
    }
    if (status === 'stopped' || status === 'crashed') {
      if (cfg.network.upnp) await this.closePort(id)
      if (cfg.network.playit && !this.servers.list().some((s) => s.id !== id && s.network.playit && (s.status === 'running' || s.status === 'starting'))) {
        this.playit.stop()
      }
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.renewTimer)
    for (const [id] of this.per) await this.closePort(id).catch(() => undefined)
    this.playit.stop()
  }
}
