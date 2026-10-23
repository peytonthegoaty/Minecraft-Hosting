import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { BackupInfo, ServerSummary } from '@shared/types'
import { formatBytes } from '@shared/versions'
import { api } from '../api'
import { Button, Card, Empty, inputCls, Modal, PageHeader, Spinner, ToggleRow } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { attempt } from '../store'

export function Backups({ server }: { server: ServerSummary }) {
  const list = useAsync(() => api.listBackups(server.id), [server.id])
  const [creating, setCreating] = useState(false)
  const [restore, setRestore] = useState<BackupInfo | null>(null)
  const stopped = server.status === 'stopped' || server.status === 'crashed'

  const create = async () => {
    setCreating(true)
    await attempt(() => api.createBackup(server.id), 'Backup created.')
    setCreating(false)
    await list.reload()
  }

  const setBackup = (patch: Partial<ServerSummary['backup']>) => attempt(() => api.updateServer(server.id, { backup: { ...server.backup, ...patch } }))

  return (
    <div className="flex flex-col gap-4 px-7 pb-8 pt-6">
      <PageHeader title="Backups" subtitle="Zips of your worlds and configs, saved in the server's backups folder">
        <Button onClick={() => api.openPath(server.id, 'backups')}>Open folder</Button>
        <Button variant="primary" icon={<Archive size={15} />} loading={creating} onClick={create}>
          Back up now
        </Button>
      </PageHeader>

      <Card className="flex flex-col gap-1 p-[18px]">
        <ToggleRow title="Automatic backups" hint="Only while the server is running — the world is saved first so nothing is half-written." checked={server.backup.enabled} onChange={(v) => setBackup({ enabled: v })} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-[13px]">
            Every
            <select className={`${inputCls} h-9 w-24`} value={server.backup.intervalHours} disabled={!server.backup.enabled} onChange={(e) => setBackup({ intervalHours: parseInt(e.target.value, 10) })}>
              {[1, 2, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} hour{h > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            Keep the newest
            <select className={`${inputCls} h-9 w-20`} value={server.backup.keep} onChange={(e) => setBackup({ keep: parseInt(e.target.value, 10) })}>
              {[3, 5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Empty icon={<Archive size={22} />} title="No backups yet">
          Make one now, or turn on automatic backups above.
        </Empty>
      ) : (
        <Card>
          {list.data.map((b, i) => (
            <div key={b.file} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <Archive size={18} className="text-muted" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">
                  {new Date(b.createdAt).toLocaleString()} {i === 0 && <span className="ml-1 text-xs font-semibold text-accent">Latest</span>}
                </span>
                <span className="font-mono text-xs text-muted">
                  {b.file} · {formatBytes(b.size)}
                </span>
              </div>
              <Button size="sm" icon={<RotateCcw size={14} />} disabled={!stopped} title={stopped ? undefined : 'Stop the server first'} onClick={() => setRestore(b)}>
                Restore
              </Button>
              <button
                type="button"
                aria-label={`Delete ${b.file}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-danger"
                onClick={async () => {
                  await attempt(() => api.deleteBackup(server.id, b.file))
                  await list.reload()
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </Card>
      )}
      {!stopped && list.data?.length ? <p className="text-xs text-muted">Stop the server to restore a backup.</p> : null}

      <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore this backup?" width={460}>
        <p className="text-[13px] text-muted">
          Worlds and configs are replaced with the copy from {restore && new Date(restore.createdAt).toLocaleString()}. Anything newer is lost — consider backing up first.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setRestore(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const b = restore!
              setRestore(null)
              await attempt(() => api.restoreBackup(server.id, b.file), 'Backup restored.')
            }}
          >
            Restore
          </Button>
        </div>
      </Modal>
    </div>
  )
}
