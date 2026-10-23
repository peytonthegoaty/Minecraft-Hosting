import { Coffee, Download, Link2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatBytes } from '@shared/versions'
import { api } from '../api'
import { Badge, Button, Card, PageHeader, Progress, SectionTitle, Spinner } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { attempt, useStore } from '../store'

const JAVA_VERSIONS = [
  { major: 8, note: 'Minecraft 1.16 and older' },
  { major: 17, note: 'Minecraft 1.17 – 1.20.4' },
  { major: 21, note: 'Minecraft 1.20.5 – 1.21.x' },
  { major: 25, note: 'Minecraft 26.1 and newer' }
]

export function DownloadsView() {
  const downloads = useStore((s) => s.downloads)
  const javas = useAsync(() => api.listJava(), [])
  const tools = useAsync(() => api.listTools(), [])
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(key)
    await attempt(fn, msg)
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-6 px-7 pb-8 pt-6">
      <PageHeader title="Downloads &amp; Java" subtitle="Everything Blockhost downloads lives here: Java runtimes, tools and cached server files." />

      {downloads.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle>In progress</SectionTitle>
          <Card className="flex flex-col gap-3 p-4">
            {downloads.map((d) => (
              <div key={d.id} className="flex flex-col gap-1.5">
                <div className="flex text-[13px]">
                  <span className="font-medium">{d.label}</span>
                  <span className="ml-auto text-muted">{d.status === 'error' ? d.error : d.total ? `${formatBytes(d.received)} / ${formatBytes(d.total)}` : formatBytes(d.received)}</span>
                </div>
                {d.status === 'active' && <Progress value={d.total ? (d.received / d.total) * 100 : 30} />}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionTitle
          action={
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={async () => {
                const [f] = await api.pickFiles()
                if (f) await run('add', () => api.addJavaManually(f), 'Java added.')
                await javas.reload()
              }}
            >
              Add a Java I have
            </Button>
          }
        >
          Java on this PC
        </SectionTitle>
        <Card>
          {javas.loading && !javas.data && (
            <div className="p-4">
              <Spinner />
            </div>
          )}
          {javas.data?.length === 0 && <p className="p-4 text-[13px] text-muted">No Java found. Blockhost installs the right one automatically when a server needs it.</p>}
          {javas.data?.map((j) => (
            <div key={j.path} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <Coffee size={18} className="text-warn" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  Java {j.major} <span className="text-xs font-normal text-muted">{j.vendor} {j.version}</span>
                  {j.managed ? <Badge tone="accent">Managed by Blockhost</Badge> : <Badge>System</Badge>}
                </span>
                <span className="selectable truncate font-mono text-xs text-muted" title={j.path}>
                  {j.path}
                </span>
              </div>
              {j.managed && (
                <button
                  type="button"
                  aria-label={`Remove Java ${j.major}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-danger"
                  onClick={async () => {
                    await run(j.path, () => api.removeJava(j.path), `Java ${j.major} removed.`)
                    await javas.reload()
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </Card>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {JAVA_VERSIONS.map((v) => {
            const has = javas.data?.some((j) => j.managed && j.major === v.major)
            return (
              <Card key={v.major} className="flex flex-col gap-2 p-4">
                <span className="text-sm font-semibold">Java {v.major}</span>
                <span className="text-xs text-muted">{v.note}</span>
                <Button
                  size="sm"
                  variant={has ? 'secondary' : 'soft'}
                  icon={<Download size={14} />}
                  disabled={has}
                  loading={busy === `java${v.major}`}
                  onClick={async () => {
                    await run(`java${v.major}`, () => api.installJava(v.major), `Java ${v.major} installed.`)
                    await javas.reload()
                  }}
                >
                  {has ? 'Installed' : 'Install'}
                </Button>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Tools</SectionTitle>
        <Card>
          {tools.data?.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link2 size={18} className="text-accent" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{t.name}</span>
                <span className="text-xs text-muted">{t.installed ? `Installed${t.version ? ` · ${t.version}` : ''}` : 'Downloaded automatically when you turn on the tunnel'}</span>
              </div>
              {t.installed ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    await run(t.id, () => api.removeTool(t.id), `${t.name} removed.`)
                    await tools.reload()
                  }}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="soft"
                  loading={busy === t.id}
                  onClick={async () => {
                    await run(t.id, () => api.installTool(t.id), `${t.name} installed.`)
                    await tools.reload()
                  }}
                >
                  Install
                </Button>
              )}
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Download cache</SectionTitle>
        <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex-1 text-[13px] text-muted">Server jars and installers are cached so creating another server is instant. Clearing is safe.</span>
          <Button
            size="sm"
            loading={busy === 'cache'}
            onClick={async () => {
              setBusy('cache')
              const r = await attempt(() => api.clearCache())
              setBusy(null)
              if (r) useStore.getState().toast('success', `Freed ${formatBytes(r.freedBytes)}.`)
            }}
          >
            Clear cache
          </Button>
        </Card>
      </section>
    </div>
  )
}
