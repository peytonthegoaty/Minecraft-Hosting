import { ArrowDown, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LogLine, ServerSummary } from '@shared/types'
import { api } from '../api'
import { Button, cx, PageHeader, Segmented, StatusPill, stripLogPrefix } from '../components/ui'
import { attempt, NO_LOGS, useStore } from '../store'

// Common commands offered as you type (without the leading slash).
const COMMANDS = [
  'say <message>', 'list', 'op <player>', 'deop <player>', 'kick <player> [reason]', 'ban <player> [reason]', 'pardon <player>',
  'whitelist add <player>', 'whitelist remove <player>', 'whitelist on', 'whitelist off', 'whitelist list',
  'gamemode survival <player>', 'gamemode creative <player>', 'gamemode adventure <player>', 'gamemode spectator <player>',
  'difficulty peaceful', 'difficulty easy', 'difficulty normal', 'difficulty hard',
  'time set day', 'time set night', 'weather clear', 'weather rain', 'weather thunder',
  'gamerule keepInventory true', 'gamerule doDaylightCycle false', 'gamerule playersSleepingPercentage 50',
  'tp <player> <target>', 'give <player> <item> [count]', 'xp add <player> <amount> levels',
  'save-all', 'save-off', 'save-on', 'seed', 'tps', 'mspt', 'plugins', 'version', 'reload confirm', 'stop'
]

type Filter = 'all' | 'chat' | 'warn' | 'error'

const levelClass: Record<LogLine['level'], string> = {
  INFO: 'text-info',
  WARN: 'text-warn',
  ERROR: 'text-danger',
  CHAT: 'text-accent',
  APP: 'text-accent'
}

function time(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function Console({ server }: { server: ServerSummary }) {
  const log = useStore((s) => s.logs[server.id] ?? NO_LOGS)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [sel, setSel] = useState(0)
  const [stick, setStick] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const running = server.status === 'running' || server.status === 'starting'

  const counts = useMemo(() => ({ warn: log.filter((l) => l.level === 'WARN').length, error: log.filter((l) => l.level === 'ERROR').length }), [log])
  const visible = useMemo(() => {
    const q = search.toLowerCase()
    const out = log.filter((l) => {
      if (filter === 'chat' && l.level !== 'CHAT') return false
      if (filter === 'warn' && l.level !== 'WARN') return false
      if (filter === 'error' && l.level !== 'ERROR') return false
      return !q || l.text.toLowerCase().includes(q)
    })
    return out.slice(-1500)
  }, [log, filter, search])

  const suggestions = useMemo(() => {
    const q = cmd.replace(/^\//, '').toLowerCase()
    if (!q || q.includes('  ')) return []
    return COMMANDS.filter((c) => c.startsWith(q) && c !== q).slice(0, 6)
  }, [cmd])

  useEffect(() => setSel(0), [suggestions.length])

  useLayoutEffect(() => {
    if (stick && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [visible, stick])

  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  const send = async () => {
    const c = cmd.trim()
    if (!c) return
    setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 50))
    setHistIdx(-1)
    setCmd('')
    setStick(true)
    await attempt(() => api.sendCommand(server.id, c))
  }

  const complete = (s: string) => {
    // Keep only the fixed words; placeholders like <player> are left for the user to type.
    const fixed = s.split(' ').filter((w) => !/^[<[]/.test(w)).join(' ')
    setCmd(fixed + (fixed === s ? '' : ' '))
    inputRef.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // While suggestions are open (and not browsing history), Tab and arrows work on the suggestion list.
    if (suggestions.length && histIdx === -1) {
      if (e.key === 'Tab') {
        e.preventDefault()
        complete(suggestions[sel])
        return
      }
      if (e.key === 'ArrowDown' || (e.key === 'ArrowUp' && sel > 0)) {
        e.preventDefault()
        setSel((s) => (e.key === 'ArrowDown' ? Math.min(suggestions.length - 1, s + 1) : s - 1))
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void send()
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(history.length - 1, histIdx + 1)
      setHistIdx(i)
      setCmd(history[i])
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault()
      const i = histIdx - 1
      setHistIdx(i)
      setCmd(i >= 0 ? history[i] : '')
    } else if (e.key === 'Escape') {
      setCmd('')
    }
  }

  return (
    <div className="flex h-full min-h-[600px] flex-col gap-4 px-7 pb-6 pt-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Console <StatusPill status={server.status} />
          </span>
        }
      >
        <Button disabled={!running} onClick={() => attempt(() => api.sendCommand(server.id, 'save-all'), 'World saved.')}>
          Save world
        </Button>
        <Button onClick={() => attempt(() => api.createBackup(server.id), 'Backup created.')}>Back up now</Button>
        <Button onClick={() => api.openPath(server.id, 'logs')}>Open logs folder</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          label="Filter log"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'chat', label: 'Chat' },
            { value: 'warn', label: <span className="text-warn">Warnings · {counts.warn}</span> },
            { value: 'error', label: <span className="text-danger">Errors · {counts.error}</span> }
          ]}
        />
        <label className="ml-auto flex h-10 min-w-[180px] flex-[0_1_280px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-muted">
          <Search size={15} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search log" aria-label="Search log" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
        </label>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-code">
        <div ref={boxRef} onScroll={onScroll} className="selectable min-h-0 flex-1 overflow-auto px-4 py-3.5 font-mono text-[13px] leading-[1.55]" role="log" aria-label="Server console">
          {visible.length === 0 && <p className="text-muted">{log.length ? 'No lines match.' : running ? 'Waiting for output…' : 'The server is stopped. Start it to see its console here.'}</p>}
          {visible.map((l) => (
            <div key={l.id} className="flex gap-3 whitespace-pre-wrap break-words">
              <span className="shrink-0 text-muted">{time(l.t)}</span>
              <span className={cx('w-11 shrink-0', levelClass[l.level])}>{l.level === 'APP' ? 'APP' : l.level}</span>
              <span className={cx('min-w-0', l.level === 'ERROR' ? 'text-danger' : l.level === 'WARN' ? 'text-warn' : 'text-fg')}>{stripLogPrefix(l.text)}</span>
            </div>
          ))}
        </div>
        {!stick && (
          <button
            type="button"
            onClick={() => setStick(true)}
            className="absolute bottom-[86px] right-5 inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-raised px-3 text-xs font-semibold shadow-lg"
          >
            <ArrowDown size={14} /> Jump to latest
          </button>
        )}

        <div className="relative border-t border-line bg-surface p-3">
          {suggestions.length > 0 && (
            <div role="listbox" aria-label="Command suggestions" className="absolute bottom-[64px] left-3 flex w-[360px] max-w-[calc(100%-24px)] flex-col gap-0.5 rounded-[10px] border border-line bg-raised p-1.5 font-mono text-[13px] shadow-2xl">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onMouseDown={(e) => (e.preventDefault(), complete(s))}
                  className={cx('rounded-[7px] px-2.5 py-2 text-left', i === sel ? 'bg-accent/10' : 'hover:bg-hover')}
                >
                  {s.split(' ').map((w, j) => (
                    <span key={j} className={/^[<[]/.test(w) ? 'text-muted' : j === 0 ? 'text-fg' : 'text-accent'}>
                      {j ? ' ' : ''}
                      {w}
                    </span>
                  ))}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="cmd" className="pl-1 font-mono text-sm font-semibold text-accent">
              &gt;
            </label>
            <input
              id="cmd"
              ref={inputRef}
              value={cmd}
              disabled={!running}
              onChange={(e) => {
                setCmd(e.target.value)
                setHistIdx(-1)
              }}
              onKeyDown={onKey}
              autoComplete="off"
              spellCheck={false}
              placeholder={running ? 'Type a command, e.g. say Hello' : 'Start the server to send commands'}
              aria-label="Server command"
              className="h-11 min-w-0 flex-1 rounded-[9px] border border-line bg-code px-3 font-mono text-sm outline-none focus:border-accent disabled:opacity-60"
            />
            <Button size="lg" variant="primary" disabled={!running || !cmd.trim()} onClick={send}>
              Send
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 pl-7 pt-2 text-xs text-muted">
            <span>Tab to complete</span>
            <span>↑ ↓ history</span>
            <span>Commands run without the leading /</span>
          </div>
        </div>
      </div>
    </div>
  )
}
