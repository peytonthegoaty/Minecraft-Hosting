import { Blocks, Box, Download, FolderOpen, Gauge, Globe, Moon, Archive, Plus, Server, SlidersHorizontal, Sun, Monitor, Terminal, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { addonKind } from '@shared/types'
import { useStore, type View } from '../store'
import { cx, Dot, STATUS_META } from './ui'

function NavItem({ active, onClick, icon, children, badge, small }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; badge?: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left font-medium transition-colors',
        small ? 'min-h-[34px] text-[13px]' : 'min-h-[38px] text-sm',
        active ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-hover'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </button>
  )
}

const TYPE_LABEL: Record<string, string> = { paper: 'Paper', purpur: 'Purpur', vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }

export function Sidebar() {
  const { servers, selectedId, view, go, settings, setTheme } = useStore()
  const isServerView = !['home', 'new', 'downloads', 'settings'].includes(view)
  const serverNav: { v: View; label: string; icon: ReactNode }[] = [
    { v: 'dashboard', label: 'Dashboard', icon: <Gauge size={16} /> },
    { v: 'console', label: 'Console', icon: <Terminal size={16} /> },
    { v: 'files', label: 'Files', icon: <FolderOpen size={16} /> },
    { v: 'addons', label: 'Plugins', icon: <Blocks size={16} /> },
    { v: 'config', label: 'Settings', icon: <SlidersHorizontal size={16} /> },
    { v: 'network', label: 'Network', icon: <Globe size={16} /> },
    { v: 'backups', label: 'Backups', icon: <Archive size={16} /> }
  ]
  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col gap-1 overflow-y-auto px-3 pb-4 pt-1">
      <NavItem active={view === 'home'} onClick={() => go('home', null)} icon={<Server size={17} />}>
        All servers
      </NavItem>

      <div className="flex items-center px-2.5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Servers
        <button type="button" aria-label="New server" title="New server" onClick={() => go('new', null)} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised text-fg hover:bg-hover">
          <Plus size={14} />
        </button>
      </div>

      {servers.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">No servers yet.</p>}

      {servers.map((s) => {
        const selected = s.id === selectedId && isServerView
        const meta = STATUS_META[s.status]
        if (!selected) {
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go('dashboard', s.id)}
              className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-hover"
            >
              {s.status === 'stopped' ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-muted" /> : <Dot tone={meta.tone} pulse={meta.pulse} />}
              <span className="sr-only">{meta.label}:</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="text-[11px] text-muted">{TYPE_LABEL[s.type]}</span>
            </button>
          )
        }
        return (
          <div key={s.id} className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-raised px-2 py-2">
            <div className="flex min-h-[30px] items-center gap-2 px-1">
              <Dot tone={meta.tone} pulse={meta.pulse} />
              <span className="sr-only">{meta.label}:</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
              <span className="text-[11px] text-muted">{TYPE_LABEL[s.type]}</span>
            </div>
            {serverNav.map((n) => {
              if (n.v === 'addons') {
                const kind = addonKind(s.type)
                if (kind === 'none') return null
                return (
                  <NavItem key={n.v} small active={view === n.v} onClick={() => go(n.v)} icon={n.icon}>
                    {kind === 'mods' ? 'Mods' : 'Plugins'}
                  </NavItem>
                )
              }
              return (
                <NavItem key={n.v} small active={view === n.v} onClick={() => go(n.v)} icon={n.icon}>
                  {n.label}
                </NavItem>
              )
            })}
          </div>
        )
      })}

      <div className="mx-1 my-3 h-px bg-line" />
      <NavItem active={view === 'downloads'} onClick={() => go('downloads', null)} icon={<Download size={17} />}>
        Downloads &amp; Java
      </NavItem>
      <NavItem active={view === 'settings'} onClick={() => go('settings', null)} icon={<Settings2 size={17} />}>
        App settings
      </NavItem>

      <div className="mt-auto pt-4">
        <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-bg p-1">
          {(
            [
              ['system', 'System', <Monitor key="m" size={13} />],
              ['light', 'Light', <Sun key="s" size={13} />],
              ['dark', 'Dark', <Moon key="d" size={13} />]
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={settings?.theme === value}
              onClick={() => setTheme(value)}
              className={cx(
                'inline-flex h-8 items-center justify-center gap-1 rounded-[7px] text-xs font-medium',
                settings?.theme === value ? 'bg-surface text-fg shadow-sm dark:bg-hover' : 'text-muted hover:text-fg'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Box size={16} strokeWidth={2.4} />
      </span>
      <span className="text-[15px] font-bold tracking-tight">Blockhost</span>
    </div>
  )
}
