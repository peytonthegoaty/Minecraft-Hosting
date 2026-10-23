import { Check, ExternalLink, FilePlus, FolderOpen, Puzzle, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AddonInfo, AddonSearchResult, AddonSource, ServerSummary } from '@shared/types'
import { addonKind } from '@shared/types'
import { formatBytes } from '@shared/versions'
import { api, errorText, on } from '../api'
import { Badge, Button, Card, cx, Empty, Modal, PageHeader, Segmented, Spinner, Switch } from '../components/ui'
import { attempt, useStore } from '../store'

type Tab = 'installed' | 'browse' | 'updates'

const TILE = ['#86EFAC', '#93C5FD', '#FCD34D', '#F9A8D4', '#C4B5FD', '#FDBA74', '#5EEAD4']
function tile(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TILE[h % TILE.length]
}

function compact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function AddonIcon({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (url && !broken) return <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-[9px] bg-hover object-cover" style={{ width: size, height: size }} />
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-[9px] font-bold text-[#0D1013]" style={{ width: size, height: size, background: tile(name), fontSize: size * 0.42 }}>
      {name[0]?.toUpperCase()}
    </span>
  )
}

export function Addons({ server }: { server: ServerSummary }) {
  const kind = addonKind(server.type)
  const noun = kind === 'mods' ? 'mods' : 'plugins'
  const Noun = kind === 'mods' ? 'Mods' : 'Plugins'
  const [tab, setTab] = useState<Tab>('installed')
  const [list, setList] = useState<AddonInfo[] | null>(null)
  const [updates, setUpdates] = useState<AddonInfo[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AddonInfo | null>(null)

  const load = async () => {
    const l = await attempt(() => api.listAddons(server.id))
    if (l) setList(l)
  }
  useEffect(() => {
    setList(null)
    setUpdates(null)
    void load()
    return on('addons', ({ id }) => id === server.id && void load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  const checkUpdates = async () => {
    setChecking(true)
    const l = await attempt(() => api.checkAddonUpdates(server.id))
    setChecking(false)
    if (l) {
      setUpdates(l.filter((a) => a.update))
      setList(l)
    }
  }

  const updateOne = async (file: string) => {
    setBusy(file)
    await attempt(() => api.updateAddon(server.id, file))
    setBusy(null)
    setUpdates((u) => u?.filter((a) => a.file !== file) ?? null)
  }

  const updateAll = async () => {
    for (const a of updates ?? []) await updateOne(a.file)
  }

  if (kind === 'none') {
    return (
      <div className="px-7 py-6">
        <Empty icon={<Puzzle size={22} />} title="Vanilla servers don't use plugins or mods">
          Create a Paper or Purpur server for plugins, or Fabric, Forge or NeoForge for mods.
        </Empty>
      </div>
    )
  }

  const updateCount = updates?.length ?? list?.filter((a) => a.update).length ?? 0
  return (
    <div className="flex flex-col gap-4 px-7 pb-8 pt-6">
      <PageHeader title={Noun} subtitle={`${server.type === 'paper' ? 'Paper' : server.type[0].toUpperCase() + server.type.slice(1)} ${server.mcVersion} · changes apply when the server restarts`}>
        <Button icon={<FolderOpen size={15} />} onClick={() => api.openPath(server.id, kind === 'mods' ? 'mods' : 'plugins')}>
          Open folder
        </Button>
        <Button
          icon={<FilePlus size={15} />}
          onClick={async () => {
            const files = await api.pickFiles([{ name: `${Noun} (.jar)`, extensions: ['jar'] }])
            if (files.length) await attempt(() => api.addAddonFiles(server.id, files), `Added ${files.length} file${files.length > 1 ? 's' : ''}.`)
          }}
        >
          Add .jar file
        </Button>
        {updateCount > 0 && (
          <Button variant="primary" onClick={updateAll} loading={!!busy}>
            Update all ({updateCount})
          </Button>
        )}
      </PageHeader>

      <div role="tablist" aria-label={`${Noun} views`} className="flex gap-1 border-b border-line">
        {(
          [
            ['installed', `Installed · ${list?.length ?? '…'}`],
            ['browse', 'Browse'],
            ['updates', `Updates${updates ? ` · ${updates.length}` : ''}`]
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t)
              if (t === 'updates' && !updates) void checkUpdates()
            }}
            className={cx('h-10 border-b-2 px-3.5 text-sm', tab === t ? 'border-accent font-semibold text-fg' : 'border-transparent font-medium text-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'installed' &&
        (!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Empty
            icon={<Puzzle size={22} />}
            title={`No ${noun} yet`}
            action={
              <Button variant="primary" onClick={() => setTab('browse')}>
                Browse {noun}
              </Button>
            }
          >
            Find {noun} on Modrinth{kind === 'plugins' ? ', Hangar and SpigotMC' : ''} and install them with one click.
          </Empty>
        ) : (
          <Card className="overflow-x-auto">
            <div className="min-w-[640px]">
              {list.map((a) => (
                <div key={a.file} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
                  <AddonIcon name={a.name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx('text-sm font-semibold', !a.enabled && 'text-muted')}>{a.name}</span>
                      {a.version && <span className="font-mono text-xs text-muted">{a.version}</span>}
                      {a.update && <Badge tone="warn">Update → {a.update.version}</Badge>}
                    </div>
                    <span className="truncate text-xs text-muted" title={a.description}>
                      {a.description || a.file}
                      {a.depends.length > 0 && ` · needs ${a.depends.join(', ')}`}
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-xs text-muted">{formatBytes(a.size)}</span>
                  <label className="flex min-h-[44px] w-[74px] shrink-0 items-center gap-2 text-xs text-muted">
                    <Switch checked={a.enabled} label={`Enable ${a.name}`} onChange={(v) => attempt(() => api.setAddonEnabled(server.id, a.file, v))} />
                    {a.enabled ? 'On' : 'Off'}
                  </label>
                  <span className="flex w-[84px] shrink-0 justify-end">
                    {a.update && (
                      <Button size="sm" loading={busy === a.file} onClick={() => updateOne(a.file)}>
                        Update
                      </Button>
                    )}
                  </span>
                  <button type="button" aria-label={`Delete ${a.name}`} onClick={() => setConfirmDelete(a)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-danger">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))}

      {tab === 'browse' && <Browse server={server} installed={list ?? []} />}

      {tab === 'updates' &&
        (checking ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner /> Checking Modrinth for newer versions…
          </div>
        ) : updates && updates.length === 0 ? (
          <Empty
            icon={<Check size={22} />}
            title="Everything is up to date"
            action={
              <Button icon={<RefreshCw size={15} />} onClick={checkUpdates}>
                Check again
              </Button>
            }
          >
            Updates are found for {noun} that came from Modrinth (matched by file fingerprint).
          </Empty>
        ) : (
          <Card>
            {(updates ?? []).map((a) => (
              <div key={a.file} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
                <AddonIcon name={a.name} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{a.name}</span>
                  <span className="text-xs text-muted">
                    {a.version} → <span className="font-semibold text-accent">{a.update?.version}</span>
                  </span>
                </div>
                <Button size="sm" variant="soft" loading={busy === a.file} onClick={() => updateOne(a.file)}>
                  Update
                </Button>
              </div>
            ))}
          </Card>
        ))}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={`Delete ${confirmDelete?.name}?`} width={440}>
        <p className="text-[13px] text-muted">The .jar file is removed. Its config folder stays, so you can reinstall later without losing settings.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const a = confirmDelete!
              setConfirmDelete(null)
              await attempt(() => api.deleteAddon(server.id, a.file), `${a.name} deleted.`)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function Browse({ server, installed }: { server: ServerSummary; installed: AddonInfo[] }) {
  const kind = addonKind(server.type)
  const [source, setSource] = useState<AddonSource | 'all'>(kind === 'plugins' ? 'all' : 'modrinth')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<AddonSearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let alive = true
    setResults(null)
    setError(null)
    api
      .searchAddons(server.id, source, debounced)
      .then((r) => alive && setResults(r))
      .catch((e) => alive && setError(errorText(e)))
    return () => {
      alive = false
    }
  }, [server.id, source, debounced])

  const installedNames = useMemo(() => new Set(installed.map((a) => a.name.toLowerCase())), [installed])

  const install = async (r: AddonSearchResult) => {
    const key = `${r.source}:${r.id}`
    setInstalling(key)
    const res = await attempt(() => api.installAddon(server.id, r.source, r.id))
    setInstalling(null)
    if (res) {
      setDone((d) => new Set(d).add(key))
      useStore.getState().toast('success', `Installed ${res.installed.join(', ')}. Restart the server to load ${res.installed.length > 1 ? 'them' : 'it'}.`)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {kind === 'plugins' && (
          <Segmented<AddonSource | 'all'>
            size="sm"
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: 'all', label: 'All' },
              { value: 'modrinth', label: 'Modrinth' },
              { value: 'hangar', label: 'Hangar' },
              { value: 'spigot', label: 'Spigot' }
            ]}
          />
        )}
        <label className="ml-auto flex h-10 min-w-[220px] flex-[0_1_340px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-muted">
          <Search size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${kind} for ${server.mcVersion}`} aria-label={`Search ${kind}`} className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
        </label>
      </div>
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
      {!results && !error && (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Searching…
        </div>
      )}
      {results && results.length === 0 && <p className="text-[13px] text-muted">Nothing found for {server.mcVersion}. Try another word or source.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {results?.map((r) => {
          const key = `${r.source}:${r.id}`
          const has = done.has(key) || installedNames.has(r.name.toLowerCase())
          return (
            <Card key={key} className="flex flex-col gap-2.5 p-3.5">
              <div className="flex items-center gap-2.5">
                <AddonIcon name={r.name} url={r.iconUrl} size={40} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold" title={r.name}>
                    {r.name}
                  </span>
                  <span className="text-xs text-muted">
                    {{ modrinth: 'Modrinth', hangar: 'Hangar', spigot: 'SpigotMC' }[r.source]} · {compact(r.downloads)} downloads
                  </span>
                </div>
              </div>
              <p className="line-clamp-2 text-[13px] leading-snug text-muted">{r.description}</p>
              <div className="mt-auto flex items-center gap-2">
                <button type="button" onClick={() => api.openExternal(r.pageUrl)} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                  Details <ExternalLink size={12} />
                </button>
                {has ? (
                  <span className="ml-auto inline-flex h-9 items-center gap-1.5 px-2 text-[13px] font-semibold text-accent">
                    <Check size={15} /> Installed
                  </span>
                ) : (
                  <Button size="sm" variant="soft" className="ml-auto" loading={installing === key} onClick={() => install(r)}>
                    Install
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
