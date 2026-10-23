import { AlertTriangle, Globe, Link2, Network as NetIcon, Play, RotateCw, Square, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NetworkStatus, ServerSummary } from '@shared/types'
import { SERVER_TYPES } from '@shared/types'
import { formatBytes, formatDuration } from '@shared/versions'
import { api } from '../api'
import { LineChart } from '../components/Chart'
import { Badge, Button, Card, CopyField, cx, Dot, PlayerHead, Progress, SectionTitle, StatusPill, stripLogPrefix } from '../components/ui'
import { useNetwork } from '../lib/useNetwork'
import { attempt, NO_LOGS, NO_METRICS, useStore } from '../store'

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ServerControls({ server }: { server: ServerSummary }) {
  const s = server.status
  if (s === 'running' || s === 'starting') {
    return (
      <>
        <Button size="lg" icon={<RotateCw size={16} />} onClick={() => attempt(() => api.restartServer(server.id))}>
          Restart
        </Button>
        <Button size="lg" variant="danger" icon={<Square size={16} />} onClick={() => attempt(() => api.stopServer(server.id))}>
          Stop server
        </Button>
      </>
    )
  }
  if (s === 'stopping') {
    return (
      <Button size="lg" variant="danger" icon={<Zap size={16} />} onClick={() => attempt(() => api.killServer(server.id))}>
        Force stop
      </Button>
    )
  }
  return (
    <Button size="lg" variant="primary" icon={<Play size={16} />} disabled={s === 'installing'} loading={s === 'installing'} onClick={() => attempt(() => api.startServer(server.id))}>
      {s === 'installing' ? 'Installing…' : server.installed ? 'Start server' : 'Install & start'}
    </Button>
  )
}

function AddressCard({ title, icon, address, status, highlight, action }: { title: string; icon: React.ReactNode; address: string | null; status: React.ReactNode; highlight?: boolean; action?: React.ReactNode }) {
  return (
    <Card className={cx('flex flex-col gap-2.5 p-4', highlight && '!border-success')}>
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-medium">{status}</span>
      </div>
      {address ? <CopyField value={address} label={`${title} address`} /> : <div className="flex min-h-[44px] items-center text-[13px] text-muted">{action}</div>}
    </Card>
  )
}

export function JoinCards({ net, server }: { net: NetworkStatus | null; server: ServerSummary }) {
  const go = useStore((s) => s.go)
  const port = server.port
  const upnp = net?.upnp
  const playit = net?.playit
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
      <AddressCard title="Local network" icon={<NetIcon size={16} />} address={net?.localIp ? `${net.localIp}:${port}` : null} status={<span className="text-muted">Same Wi-Fi</span>} action="No network connection found." />
      <AddressCard
        title="Public (UPnP)"
        icon={<Globe size={16} />}
        address={upnp?.state === 'open' && net?.publicIp ? `${net.publicIp}:${port}` : null}
        status={
          upnp?.state === 'open' ? (
            <span className="flex items-center gap-1.5 text-success">
              <Dot tone="success" /> Port open
            </span>
          ) : upnp?.state === 'failed' ? (
            <span className="flex items-center gap-1.5 text-danger">
              <Dot tone="danger" /> Failed
            </span>
          ) : upnp?.state === 'working' ? (
            <span className="text-muted">Opening…</span>
          ) : (
            <span className="text-muted">Off</span>
          )
        }
        action={
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => go('network')}>
            {upnp?.state === 'failed' ? 'See what went wrong →' : server.network.upnp ? 'Opens when the server starts' : 'Turn on in Network →'}
          </button>
        }
      />
      <AddressCard
        title="playit.gg tunnel"
        highlight={playit?.state === 'online' || !!playit?.address}
        icon={<Link2 size={16} />}
        address={playit?.address ?? null}
        status={
          playit?.state === 'online' ? (
            <span className="flex items-center gap-1.5 text-success">
              <Dot tone="success" /> Online
            </span>
          ) : playit?.state === 'needsClaim' ? (
            <span className="text-warn">Needs linking</span>
          ) : playit?.state === 'starting' ? (
            <span className="text-muted">Starting…</span>
          ) : (
            <Badge tone="accent">Easiest</Badge>
          )
        }
        action={
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => go('network')}>
            {server.network.playit ? 'Finish setup in Network →' : 'Set up — no router changes →'}
          </button>
        }
      />
    </div>
  )
}

export function Dashboard({ server }: { server: ServerSummary }) {
  const metrics = useStore((s) => s.metrics[server.id] ?? NO_METRICS)
  const log = useStore((s) => s.logs[server.id] ?? NO_LOGS)
  const go = useStore((s) => s.go)
  const [net] = useNetwork(server.id)
  const now = useNow(15000)
  const last = metrics[metrics.length - 1]
  const running = server.status === 'running'
  const memMax = server.memoryMb * 1024 * 1024
  const typeName = SERVER_TYPES.find((t) => t.id === server.type)?.name
  const recent = log.slice(-6)
  const memPct = last ? (last.memBytes / memMax) * 100 : 0

  return (
    <div className="flex flex-col gap-5 px-7 pb-8 pt-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
            <StatusPill status={server.status} extra={running && server.startedAt ? formatDuration(Math.max(0, Math.max(now, Date.now()) - server.startedAt)) : undefined} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-md border border-line bg-raised px-2 py-0.5">
              {typeName} {server.mcVersion}
              {server.loaderVersion ? ` · ${server.type === 'paper' || server.type === 'purpur' ? 'build ' : ''}${server.loaderVersion}` : ''}
            </span>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5">Java {server.javaMajor}</span>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5">{(server.memoryMb / 1024).toFixed(server.memoryMb % 1024 ? 1 : 0)} GB allocated</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ServerControls server={server} />
        </div>
      </div>

      {!server.eulaAccepted && server.installed && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warn bg-warn/10 px-4 py-3 text-[13px]">
          <AlertTriangle size={18} className="text-warn" />
          <span className="flex-1">
            This server can&apos;t start until you accept the{' '}
            <a className="font-semibold underline" href="https://aka.ms/MinecraftEULA" onClick={(e) => (e.preventDefault(), void api.openExternal('https://aka.ms/MinecraftEULA'))}>
              Minecraft EULA
            </a>
            .
          </span>
          <Button size="sm" variant="primary" onClick={() => attempt(() => api.acceptEula(server.id), 'EULA accepted.')}>
            I accept
          </Button>
        </div>
      )}
      {server.installError && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-danger bg-danger/10 px-4 py-3 text-[13px]">
          <AlertTriangle size={18} className="text-danger" />
          <span className="selectable flex-1">Install failed: {server.installError}</span>
          <Button size="sm" onClick={() => attempt(() => api.startServer(server.id))}>
            Try again
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionTitle>How friends join</SectionTitle>
        <JoinCards net={net} server={server} />
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Card className="flex flex-col gap-2.5 p-4">
          <span className="text-[13px] font-medium text-muted">Memory</span>
          <span className="text-[26px] font-bold tracking-tight">
            {last ? formatBytes(last.memBytes).replace(' GB', '') : '—'} <span className="text-[15px] font-medium text-muted">/ {formatBytes(memMax)}</span>
          </span>
          <Progress value={memPct} tone={memPct > 90 ? 'danger' : 'accent'} />
        </Card>
        <Card className="flex flex-col gap-2.5 p-4">
          <span className="text-[13px] font-medium text-muted">CPU</span>
          <span className="text-[26px] font-bold tracking-tight">
            {last ? Math.round(last.cpu) : '—'}
            <span className="text-[15px] font-medium text-muted">%</span>
          </span>
          <Progress value={last?.cpu ?? 0} tone="info" />
        </Card>
        <Card className="flex flex-col gap-2.5 p-4">
          <span className="text-[13px] font-medium text-muted">TPS</span>
          <span className="text-[26px] font-bold tracking-tight">
            {last?.tps !== undefined ? last.tps.toFixed(1) : '—'} {last?.mspt !== undefined && <span className="text-[15px] font-medium text-muted">· {last.mspt.toFixed(0)} ms</span>}
          </span>
          <span className={cx('text-xs font-semibold', last?.tps === undefined ? 'text-muted' : last.tps >= 18 ? 'text-success' : last.tps >= 15 ? 'text-warn' : 'text-danger')}>
            {last?.tps === undefined ? (running ? 'Measuring…' : 'Not running') : last.tps >= 18 ? 'Running smoothly' : last.tps >= 15 ? 'A little laggy' : 'Lagging'}
          </span>
        </Card>
        <Card className="flex flex-col gap-2.5 p-4">
          <span className="text-[13px] font-medium text-muted">Players</span>
          <span className="text-[26px] font-bold tracking-tight">
            {server.players.length} <span className="text-[15px] font-medium text-muted">/ {server.maxPlayers}</span>
          </span>
          <span className="text-xs text-muted">Port {server.port}</span>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Card className="flex min-w-0 flex-[2_1_420px] flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">Memory &amp; CPU</h2>
            <span className="text-xs text-muted">last 10 minutes</span>
            <span className="ml-auto flex gap-3.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-2.5 rounded bg-accent" />
                RAM
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-2.5 rounded bg-info" />
                CPU
              </span>
            </span>
          </div>
          {metrics.length > 1 ? (
            <LineChart
              label={`Memory ${last ? formatBytes(last.memBytes) : ''} of ${formatBytes(memMax)}; CPU ${last ? Math.round(last.cpu) : 0} percent`}
              series={[
                { label: 'RAM', values: metrics.map((m) => m.memBytes), max: memMax, color: 'rgb(var(--accent))', area: true },
                { label: 'CPU', values: metrics.map((m) => m.cpu), max: 100, color: 'rgb(var(--info))' }
              ]}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-[13px] text-muted">{running || server.status === 'starting' ? 'Collecting data…' : 'Start the server to see live graphs.'}</div>
          )}
        </Card>
        <Card className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 p-4">
          <div className="flex items-center">
            <h2 className="text-[15px] font-semibold">Online now</h2>
          </div>
          {server.players.length === 0 && <p className="text-[13px] text-muted">{running ? 'Nobody online yet. Share an address above!' : 'The server is offline.'}</p>}
          {server.players.map((p) => (
            <div key={p} className="flex items-center gap-2.5 text-sm">
              <PlayerHead name={p} />
              <span className="min-w-0 flex-1 truncate font-medium">{p}</span>
              <button type="button" className="rounded px-1.5 py-1 text-xs text-muted hover:bg-hover hover:text-fg" onClick={() => attempt(() => api.sendCommand(server.id, `op ${p}`), `${p} is now an operator.`)}>
                Op
              </button>
              <button type="button" className="rounded px-1.5 py-1 text-xs text-muted hover:bg-hover hover:text-danger" onClick={() => attempt(() => api.sendCommand(server.id, `kick ${p}`))}>
                Kick
              </button>
            </div>
          ))}
        </Card>
      </div>

      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center">
          <h2 className="text-[15px] font-semibold">Recent console</h2>
          <button type="button" className="ml-auto text-[13px] font-semibold text-accent hover:underline" onClick={() => go('console')}>
            Open console →
          </button>
        </div>
        <div className="selectable flex flex-col gap-0.5 rounded-lg bg-code p-3 font-mono text-xs leading-relaxed">
          {recent.length === 0 && <span className="text-muted">Nothing yet.</span>}
          {recent.map((l) => (
            <span key={l.id} className={cx('truncate', l.level === 'ERROR' ? 'text-danger' : l.level === 'WARN' ? 'text-warn' : l.level === 'APP' ? 'text-accent' : 'text-fg')}>
              {stripLogPrefix(l.text)}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}
