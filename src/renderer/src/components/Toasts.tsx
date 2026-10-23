import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useStore } from '../store'
import { cx } from './ui'

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="pointer-events-none fixed left-1/2 top-12 z-[60] flex w-[min(460px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="animate-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-xl">
          {t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" /> : t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0 text-danger" /> : <Info size={18} className="mt-0.5 shrink-0 text-info" />}
          <p className={cx('selectable min-w-0 flex-1 text-[13px] leading-snug')}>{t.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-m-1 rounded p-1 text-muted hover:text-fg">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
