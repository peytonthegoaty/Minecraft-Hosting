import { Check, ExternalLink, Globe, Link2, Loader2, Network as NetIcon, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NetworkStatus, ServerSummary } from '@shared/types'
import { api } from '../api'
import { Badge, Button, Card, CopyField, cx, Dot, inputCls, PageHeader, Switch } from '../components/ui'
import { useNetwork } from '../lib/useNetwork'
import { attempt } from '../store'

function Step({ ok, label, detail, pending }: { ok: boolean | null; label: string; detail?: string; pending?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span className={cx('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full', ok === null ? 'bg-hover text-muted' : ok ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger')}>
        {pending ? <Loader2 size={12} className="animate-spin" /> : ok === false ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </span>
      <span className={ok === null ? 'text-muted' : ''}>{label}</span>
      {detail && <span className="ml-auto text-xs text-muted">{detail}</span>}
    </li>
  )
}

export function Network({ server }: { server: ServerSummary }) {
  const [net, setNet] = useNetwork(server.id)
  const [addr, setAddr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => setAddr(server.network.playitAddress ?? ''), [server.network.playitAddress])
  const running = server.status === 'running' || server.status === 'starting'

  const act = async (key: string, fn: () => Promise<NetworkStatus>) => {
    setBusy(key)
    const r = await attempt(fn)
    setBusy(null)
    if (r) setNet(r)
  }

  const p = net?.playit
  const u = net?.upnp

  return (
    <div className="flex flex-col gap-4 px-7 pb-8 pt-6">
      <PageHeader title="Network" subtitle="Three ways for friends to join — pick whichever works for them" />

      <Card className={cx('flex flex-col gap-3.5 p-[18px]', server.network.playit && '!border-accent')}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-accent/10 text-accent">
            <Link2 size={18} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              playit.gg tunnel <Badge tone="accent">Recommended</Badge>
            </h2>
            <span className="text-[13px] text-muted">Works from anywhere with no router setup. Friends just paste the address.</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {p && p.state !== 'off' && (
              <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', p.state === 'online' ? 'bg-accent/10 text-accent' : p.state === 'error' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn')}>
                <Dot tone={p.state === 'online' ? 'accent' : p.state === 'error' ? 'danger' : 'warn'} pulse={p.state === 'starting'} />
                {{ online: 'Online', error: 'Error', needsClaim: 'Needs linking', claiming: 'Linking…', starting: 'Starting…', notInstalled: 'Downloading…', off: 'Off' }[p.state]}
              </span>
            )}
            <Switch label="Use playit.gg" checked={server.network.playit} onChange={(v) => act('playit', () => api.setPlayit(server.id, v))} />
          </div>
        </div>

        {server.network.playit && (
          <>
            {p?.address ? (
              <CopyField value={p.address} label="tunnel address" large />
            ) : (
              <ol className="flex flex-col gap-2 rounded-[10px] border border-line bg-bg p-3.5 text-[13px]">
                <li className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">1.</span> Link Blockhost to a free playit.gg account.
                  <Button
                    size="sm"
                    variant="primary"
                    className="ml-auto"
                    loading={busy === 'claim'}
                    onClick={async () => {
                      setBusy('claim')
                      const r = await attempt(() => api.claimPlayit())
                      setBusy(null)
                      if (r) await api.openExternal(r.url)
                    }}
                  >
                    {p?.claimUrl ? 'Open link page' : 'Link account'}
                  </Button>
                </li>
                <li>
                  <span className="font-semibold">2.</span> On playit.gg, add a <b>Minecraft Java</b> tunnel pointing to local port <b className="font-mono">{server.port}</b>.{' '}
                  <button type="button" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline" onClick={() => api.openExternal('https://playit.gg/account/tunnels')}>
                    Open tunnels <ExternalLink size={12} />
                  </button>
                </li>
                <li>
                  <span className="font-semibold">3.</span> The address appears here automatically once the tunnel is up.
                </li>
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="playit-addr" className="text-[13px] font-medium">
                Address shown to friends
              </label>
              <input id="playit-addr" className={cx(inputCls, 'h-9 max-w-xs flex-1 font-mono')} placeholder="name.joinmc.link (auto)" value={addr} onChange={(e) => setAddr(e.target.value)} />
              <Button size="sm" disabled={addr === (server.network.playitAddress ?? '')} onClick={() => act('addr', () => api.setPlayitAddress(server.id, addr))}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => attempt(() => api.unlinkPlayit(), 'playit.gg unlinked.')}>
                Unlink account
              </Button>
            </div>
            {p?.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{p.error}</p>}
            {p?.log && p.log.length > 0 && (
              <details className="text-[13px]">
                <summary className="cursor-pointer text-muted">Agent output</summary>
                <pre className="selectable mt-2 max-h-40 overflow-auto rounded-lg bg-code p-3 font-mono text-xs leading-relaxed text-muted">{p.log.join('\n')}</pre>
              </details>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-3.5">
        <Card className="flex flex-col gap-3.5 p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-info/10 text-info">
              <Globe size={18} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-base font-semibold">Public internet (UPnP)</h2>
              <span className="text-[13px] text-muted">Opens the port on your router automatically</span>
            </div>
            <span className="ml-auto">
              <Switch label="Open port with UPnP" checked={server.network.upnp} onChange={(v) => act('upnp', () => api.setUpnp(server.id, v))} />
            </span>
          </div>
          {u?.state === 'open' && net?.publicIp ? <CopyField value={`${net.publicIp}:${server.port}`} label="public address" /> : <code className="rounded-lg border border-line bg-code px-3 py-2.5 font-mono text-[15px] text-muted">{net?.publicIp ? `${net.publicIp}:${server.port}` : 'Public IP unknown'}</code>}
          <ol className="flex flex-col gap-2">
            <Step ok={net?.publicIp ? true : null} label="Public IP found" detail={net?.publicIp ?? undefined} />
            <Step ok={!server.network.upnp ? null : u?.state === 'open' ? true : u?.state === 'failed' ? false : null} pending={u?.state === 'working'} label={`Port ${server.port} (TCP) opened on router`} detail={!server.network.upnp ? 'UPnP off' : !running && u?.state !== 'failed' ? 'when the server starts' : undefined} />
            <Step ok={net?.reachable === 'yes' ? true : net?.reachable === 'no' ? false : null} pending={net?.reachable === 'checking'} label="Reachable from the internet" detail={net?.reachable === 'unknown' ? 'not tested' : undefined} />
            {net?.firewall !== 'n/a' && <Step ok={net?.firewall === 'allowed' ? true : net?.firewall === 'missing' ? false : null} label="Allowed through Windows Firewall" />}
          </ol>
          {u?.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{u.error}</p>}
          {net?.reachable === 'no' && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-[13px]">
              Friends outside your network can&apos;t connect yet. Your internet provider may block incoming connections (CGNAT) — the playit.gg tunnel above avoids this.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!running} loading={busy === 'reach'} onClick={() => act('reach', () => api.checkReachable(server.id))}>
              Test reachability
            </Button>
            {net?.firewall === 'missing' && (
              <Button size="sm" icon={<ShieldCheck size={14} />} loading={busy === 'fw'} onClick={() => act('fw', () => api.allowFirewall(server.id))}>
                Allow through firewall
              </Button>
            )}
            <button type="button" className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline" onClick={() => api.openExternal('https://portforward.com/router.htm')}>
              Manual port forwarding guide <ExternalLink size={12} />
            </button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3.5 p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-hover">
              <NetIcon size={18} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-base font-semibold">Local network</h2>
              <span className="text-[13px] text-muted">For people on the same Wi-Fi or LAN</span>
            </div>
          </div>
          {net?.localIp ? <CopyField value={`${net.localIp}:${server.port}`} label="local address" /> : <p className="text-[13px] text-muted">No network connection found.</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">Port</dt>
              <dd className="font-mono">{server.port}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">On this PC</dt>
              <dd className="font-mono">localhost:{server.port}</dd>
            </div>
            {(net?.otherIps ?? []).slice(0, 4).map((o) => (
              <div key={o.address} className="flex flex-col gap-0.5">
                <dt className="truncate text-xs text-muted">{o.name}</dt>
                <dd className="font-mono text-xs">{o.address}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Change the port in Server settings if 25565 is taken.</p>
        </Card>
      </div>
    </div>
  )
}
