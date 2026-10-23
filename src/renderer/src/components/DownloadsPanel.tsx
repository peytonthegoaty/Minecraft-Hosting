import { CheckCircle2, XCircle } from 'lucide-react'
import { formatBytes } from '@shared/versions'
import { useStore } from '../store'
import { Progress } from './ui'

/** Floating card listing active downloads (Java, server jars, plugins, tools). */
export function DownloadsPanel() {
  const downloads = useStore((s) => s.downloads)
  if (!downloads.length) return null
  const done = downloads.filter((d) => d.status === 'done').length
  return (
    <div role="status" aria-label="Downloads" className="animate-in fixed bottom-5 right-5 z-40 flex w-[360px] max-w-[calc(100%-40px)] flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-2xl">
      <div className="flex items-center">
        <span className="text-sm font-semibold">Downloads</span>
        <span className="ml-auto text-xs text-muted">
          {done} of {downloads.length} done
        </span>
      </div>
      {downloads.map((d) => (
        <div key={d.id} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[13px]">
            {d.status === 'done' && <CheckCircle2 size={15} className="shrink-0 text-success" />}
            {d.status === 'error' && <XCircle size={15} className="shrink-0 text-danger" />}
            <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
            <span className="shrink-0 text-muted">
              {d.status === 'active'
                ? d.total
                  ? `${formatBytes(d.received)} / ${formatBytes(d.total)}${d.bytesPerSec ? ` · ${formatBytes(d.bytesPerSec)}/s` : ''}`
                  : formatBytes(d.received)
                : d.status === 'done'
                  ? `Checked · ${formatBytes(d.total || d.received)}`
                  : 'Failed'}
            </span>
          </div>
          {d.status === 'active' && <Progress value={d.total ? (d.received / d.total) * 100 : 30} />}
          {d.status === 'error' && <p className="text-xs text-danger">{d.error}</p>}
        </div>
      ))}
    </div>
  )
}
