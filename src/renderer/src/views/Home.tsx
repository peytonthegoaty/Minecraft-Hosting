import { FolderInput, Plus, Server } from 'lucide-react'
import { useState } from 'react'
import type { ServerSummary } from '@shared/types'
import { SERVER_TYPES } from '@shared/types'
import { formatBytes } from '@shared/versions'
import { api } from '../api'
import { Button, Card, Empty, Field, inputCls, Modal, PageHeader, Progress, ServerTile, StatusPill } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { attempt, useStore } from '../store'

function ServerCard({ s }: { s: ServerSummary }) {
  const go = useStore((st) => st.go)
  const running = s.status === 'running' || s.status === 'starting'
  const busy = s.status === 'installing' || s.status === 'stopping'
  const typeName = SERVER_TYPES.find((t) => t.id === s.type)?.name ?? s.type
  return (
    <article className={`flex flex-col gap-3.5 rounded-[14px] border bg-surface p-[18px] ${running ? 'border-accent' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <ServerTile name={s.name} type={s.type} size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-base font-semibold">{s.name}</h2>
          <span className="text-xs text-muted">
            {typeName} {s.mcVersion}
          </span>
        </div>
        <span className="ml-auto">
          <StatusPill status={s.status} />
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[11px] text-muted">Players</dt>
          <dd className="text-sm font-semibold">
            {s.players.length} / {s.maxPlayers}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[11px] text-muted">RAM</dt>
          <dd className="text-sm font-semibold">{(s.memoryMb / 1024).toFixed(s.memoryMb % 1024 ? 1 : 0)} GB</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[11px] text-muted">Port</dt>
          <dd className="text-sm font-semibold">{s.port}</dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => go('dashboard', s.id)}>
          Open
        </Button>
        {running || busy ? (
          <Button className="flex-1" disabled={busy} onClick={() => attempt(() => api.stopServer(s.id))}>
            Stop
          </Button>
        ) : (
          <Button className="flex-1" variant="primary" onClick={() => attempt(() => api.startServer(s.id))}>
            Start
          </Button>
        )}
      </div>
    </article>
  )
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dir, setDir] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const go = useStore((s) => s.go)
  const pick = async () => {
    const d = await api.pickFolder()
    if (d) {
      setDir(d)
      if (!name) setName(d.split(/[\\/]/).pop() ?? '')
    }
  }
  const submit = async () => {
    setBusy(true)
    const s = await attempt(() => api.importServer(dir, name), 'Server imported.')
    setBusy(false)
    if (s) {
      onClose()
      go('dashboard', s.id)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import a server folder">
      <p className="text-[13px] text-muted">Already have a server? Point Blockhost at its folder. Nothing is moved or changed until you start it.</p>
      <Field label="Folder">
        <div className="flex gap-2">
          <input className={inputCls} readOnly value={dir} placeholder="Choose a folder…" aria-label="Folder" />
          <Button onClick={pick}>Browse</Button>
        </div>
      </Field>
      <Field label="Name" htmlFor="import-name">
        <input id="import-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!dir} loading={busy} onClick={submit}>
          Import
        </Button>
      </div>
    </Modal>
  )
}

export function Home() {
  const { servers, sys, go } = useStore()
  const [importOpen, setImportOpen] = useState(false)
  const java = useAsync(() => api.listJava(), [])
  const running = servers.filter((s) => s.status === 'running' || s.status === 'starting')
  const used = sys ? sys.totalMemBytes - sys.freeMemBytes : 0
  const serverMem = running.reduce((a, s) => a + s.memoryMb * 1024 * 1024, 0)
  const players = running.reduce((a, s) => a + s.players.length, 0)

  return (
    <div className="flex flex-col gap-6 px-7 py-6">
      <PageHeader title="Your servers" subtitle={`${running.length} running · ${servers.length - running.length} stopped`}>
        <Button size="lg" icon={<FolderInput size={16} />} onClick={() => setImportOpen(true)}>
          Import folder
        </Button>
        <Button size="lg" variant="primary" icon={<Plus size={16} />} onClick={() => go('new', null)}>
          New server
        </Button>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Card className="flex flex-col gap-2 px-4 py-3.5">
          <span className="text-[13px] font-medium text-muted">PC memory</span>
          <span className="text-xl font-bold">
            {formatBytes(used)} <span className="text-sm font-medium text-muted">/ {formatBytes(sys?.totalMemBytes ?? 0)} used</span>
          </span>
          <div className="flex h-2 overflow-hidden rounded-full bg-hover">
            <div className="bg-accent" style={{ width: `${sys ? (Math.min(serverMem, used) / sys.totalMemBytes) * 100 : 0}%` }} />
            <div className="bg-info" style={{ width: `${sys ? (Math.max(0, used - serverMem) / sys.totalMemBytes) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-muted">
            Servers {formatBytes(serverMem)} · other apps {formatBytes(Math.max(0, used - serverMem))}
          </span>
        </Card>
        <Card className="flex flex-col gap-2 px-4 py-3.5">
          <span className="text-[13px] font-medium text-muted">Java runtimes</span>
          <span className="text-xl font-bold">{java.data ? `${java.data.length} found` : '…'}</span>
          <span className="text-xs text-muted">{java.data?.length ? java.data.map((j) => `Java ${j.major}`).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'Installed automatically when needed'}</span>
        </Card>
        <Card className="flex flex-col gap-2 px-4 py-3.5">
          <span className="text-[13px] font-medium text-muted">Players online</span>
          <span className="text-xl font-bold">{players}</span>
          <span className="text-xs text-muted">Across {running.length} running server{running.length === 1 ? '' : 's'}</span>
        </Card>
      </div>

      {servers.length === 0 ? (
        <Empty
          icon={<Server size={22} />}
          title="Create your first server"
          action={
            <Button size="lg" variant="primary" icon={<Plus size={16} />} onClick={() => go('new', null)}>
              New server
            </Button>
          }
        >
          Pick Paper, Fabric, Forge or another type. Blockhost downloads the server, the right Java and everything else it needs.
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {servers.map((s) => (
            <ServerCard key={s.id} s={s} />
          ))}
          <button
            type="button"
            onClick={() => go('new', null)}
            className="flex min-h-[230px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-line text-sm font-medium text-muted hover:border-accent hover:text-fg"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-hover text-fg">
              <Plus size={20} />
            </span>
            Create a new server
            <span className="text-xs">Paper, Purpur, Vanilla, Fabric, Forge or NeoForge</span>
          </button>
        </div>
      )}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      {sys && serverMem > sys.totalMemBytes * 0.85 && (
        <div className="rounded-card border border-warn bg-warn/10 px-4 py-3 text-[13px]">
          Your running servers use most of this PC&apos;s memory. Lower their RAM in Settings if the PC feels slow.
          <div className="mt-2 max-w-xs">
            <Progress value={(serverMem / sys.totalMemBytes) * 100} tone="warn" />
          </div>
        </div>
      )}
    </div>
  )
}
