import { Check, Copy, Loader2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { ServerStatus } from '@shared/types'

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 border border-transparent',
  secondary: 'bg-raised text-fg border border-line hover:bg-hover',
  danger: 'bg-danger/10 text-danger border border-danger hover:bg-danger/20',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-hover',
  soft: 'bg-accent/10 text-accent border border-accent hover:bg-accent/20'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }) {
  const h = size === 'sm' ? 'h-9 px-3 text-[13px] rounded-lg' : size === 'lg' ? 'h-11 px-5 text-sm rounded-[10px]' : 'h-10 px-4 text-[13px] rounded-[9px]'
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        h,
        VARIANTS[variant],
        className
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-fg transition-colors hover:bg-hover disabled:opacity-50', className)}
    >
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-card border border-line bg-surface', className)}>
      {children}
    </div>
  )
}

type Tone = 'accent' | 'warn' | 'danger' | 'info' | 'muted'
const TONES: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  muted: 'bg-hover text-muted'
}

export function Badge({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>{children}</span>
}

export function Dot({ tone = 'accent', pulse }: { tone?: Tone; pulse?: boolean }) {
  const bg = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info', muted: 'bg-muted' }[tone]
  return <span aria-hidden className={cx('inline-block h-2 w-2 shrink-0 rounded-full', bg, pulse && 'animate-soft-pulse')} />
}

export const STATUS_META: Record<ServerStatus, { label: string; tone: Tone; pulse?: boolean }> = {
  stopped: { label: 'Stopped', tone: 'muted' },
  installing: { label: 'Installing', tone: 'info', pulse: true },
  starting: { label: 'Starting', tone: 'warn', pulse: true },
  running: { label: 'Running', tone: 'accent' },
  stopping: { label: 'Stopping', tone: 'warn', pulse: true },
  crashed: { label: 'Crashed', tone: 'danger' }
}

export function StatusPill({ status, extra }: { status: ServerStatus; extra?: string }) {
  const m = STATUS_META[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', TONES[m.tone])}>
      <Dot tone={m.tone} pulse={m.pulse} />
      {m.label}
      {extra ? ` · ${extra}` : ''}
    </span>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={cx('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[19px]' : 'left-[3px]')} />
    </button>
  )
}

export function ToggleRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium">{title}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

export const inputCls =
  'h-10 w-full rounded-[9px] border border-line bg-bg px-3 text-[13px] text-fg outline-none placeholder:text-muted focus:border-accent disabled:opacity-60'

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md'
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex gap-1 rounded-[10px] border border-line bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 font-medium transition-colors',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            o.value === value ? 'bg-hover font-semibold text-fg' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 520, labelledBy }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: number; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Close"])')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 dark:bg-black/70" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? id : undefined)}
        style={{ maxWidth: width }}
        className="animate-in flex max-h-full w-full flex-col gap-4 overflow-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        {title && (
          <div className="flex items-start gap-3">
            <h2 id={id} className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" aria-label="Close" onClick={onClose} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function CopyField({ value, label, large }: { value: string; label: string; large?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <div className="flex items-center gap-2">
      <code className={cx('selectable min-w-0 flex-1 truncate rounded-lg border border-line bg-code px-3 py-2.5 font-mono font-medium', large ? 'text-base' : 'text-[15px]')}>{value}</code>
      <IconButton label={copied ? 'Copied' : `Copy ${label}`} onClick={copy} className="h-11 w-11">
        {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
      </IconButton>
    </div>
  )
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'info' | 'warn' | 'danger' }) {
  const bg = { accent: 'bg-accent', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger' }[tone]
  return (
    <div className="h-2 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-2 rounded-full transition-[width] duration-500', bg)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hover text-muted">{icon}</span>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-md text-[13px] text-muted">{children}</p>}
      {action}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-muted" aria-label="Loading" />
}

export function ServerTile({ name, type, size = 40 }: { name: string; type: string; size?: number }) {
  const colors: Record<string, string> = { paper: '#86EFAC', purpur: '#C4B5FD', vanilla: '#D6D3D1', fabric: '#FCD34D', forge: '#93C5FD', neoforge: '#FDBA74' }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-bold text-[#0D1013]"
      style={{ width: size, height: size, background: colors[type] ?? '#86EFAC', fontSize: size * 0.4 }}
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

/** Minecraft player face from mc-heads.net, falling back to an initial when offline. */
export function PlayerHead({ name, size = 28 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-bold text-accent" style={{ width: size, height: size }}>
        {name[0]?.toUpperCase()}
      </span>
    )
  }
  return <img src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size * 2}`} alt="" width={size} height={size} className="shrink-0 rounded-md bg-hover" style={{ imageRendering: 'pixelated' }} onError={() => setFailed(true)} />
}

/** Drops the "[14:02:11 INFO]: " style prefix the console already shows in its own columns. */
export function stripLogPrefix(text: string): string {
  return text.replace(/^\[[^\]]*\](?:\s*\[[^\]]*\])*:\s?/, '')
}
