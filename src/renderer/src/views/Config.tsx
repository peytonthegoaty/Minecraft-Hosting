import { FileCode2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ServerConfig, ServerSummary } from '@shared/types'
import { isJavaAcceptable } from '@shared/versions'
import { api } from '../api'
import { Button, Card, cx, Field, inputCls, Modal, PageHeader, Segmented, Spinner, ToggleRow } from '../components/ui'
import { McText } from '../lib/mcText'
import { useAsync } from '../lib/useAsync'
import { attempt, useStore } from '../store'

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const

const PLAYER_TOGGLES: [string, string, string, string][] = [
  ['white-list', 'Whitelist', 'Only approved players can join', 'false'],
  ['online-mode', 'Online mode', 'Check accounts with Mojang (recommended)', 'true'],
  ['pvp', 'PvP', 'Players can hurt each other', 'true'],
  ['allow-flight', 'Allow flight', 'Stops kicks for mods like jetpacks', 'false'],
  ['hardcore', 'Hardcore', 'One life — death means spectator mode', 'false'],
  ['allow-nether', 'Nether', 'Allow travel to the Nether', 'true'],
  ['spawn-monsters', 'Monsters', 'Hostile mobs spawn', 'true'],
  ['enable-command-block', 'Command blocks', 'Allow command blocks to run', 'false']
]

export function Config({ server }: { server: ServerSummary }) {
  const { go, setOpenFile, sys } = useStore()
  const props = useAsync(() => api.readProperties(server.id), [server.id])
  const javas = useAsync(() => api.listJava(), [])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [cfg, setCfg] = useState<Partial<ServerConfig>>({})
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => setDraft({}), [props.data])

  const val = (k: string, d = '') => draft[k] ?? props.data?.[k] ?? d
  const setVal = (k: string, v: string) => setDraft((x) => ({ ...x, [k]: v }))
  const c = <K extends keyof ServerConfig>(k: K): ServerConfig[K] => (cfg[k] ?? server[k]) as ServerConfig[K]
  const setC = <K extends keyof ServerConfig>(k: K, v: ServerConfig[K]) => setCfg((x) => ({ ...x, [k]: v }))

  const dirty = Object.keys(draft).some((k) => draft[k] !== props.data?.[k]) || Object.keys(cfg).length > 0
  const totalGb = sys ? Math.floor(sys.totalMemBytes / 1024 ** 3) : 16
  const compatible = useMemo(() => (javas.data ?? []).filter((j) => isJavaAcceptable(server.javaMajor, j.major)), [javas.data, server.javaMajor])

  const save = async () => {
    setSaving(true)
    const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== props.data?.[k]))
    const ok = await attempt(async () => {
      if (Object.keys(changed).length) await api.writeProperties(server.id, changed)
      if (Object.keys(cfg).length) await api.updateServer(server.id, cfg)
      return true
    })
    setSaving(false)
    if (ok) {
      setCfg({})
      await props.reload()
      useStore.getState().toast('success', server.status === 'running' ? 'Saved. Restart the server to apply.' : 'Saved.')
    }
  }

  if (props.loading && !props.data) return <div className="p-7"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4 px-7 pb-8 pt-6">
      <PageHeader title="Server settings" subtitle={<>Edits <code className="font-mono">server.properties</code> and how the server starts</>}>
        <Button
          icon={<FileCode2 size={15} />}
          onClick={() => {
            setOpenFile('server.properties')
            go('files')
          }}
        >
          Raw file
        </Button>
        <Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>
          {server.status === 'running' ? 'Save' : 'Save changes'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-3.5">
        <Card className="flex flex-col gap-3.5 p-[18px]">
          <h2 className="text-[15px] font-semibold">General</h2>
          <Field label="Server name (in Blockhost)" htmlFor="name">
            <input id="name" className={inputCls} value={c('name')} onChange={(e) => setC('name', e.target.value)} />
          </Field>
          <Field label="Message of the day" htmlFor="motd" hint="Use & or § color codes — the preview shows the multiplayer list.">
            <input id="motd" className={cx(inputCls, 'font-mono')} value={val('motd', 'A Minecraft Server')} onChange={(e) => setVal('motd', e.target.value)} />
            <div aria-label="Server list preview" className="mt-1 flex items-center gap-3 rounded-lg border border-[#3A3A3A] bg-[#1E1E1E] px-3 py-2.5">
              <span className="h-10 w-10 shrink-0 rounded bg-[#4ADE80]" />
              <div className="flex min-w-0 flex-col gap-0.5 font-mono text-[13px]">
                <span className="text-white">
                  {c('name')} <span className="text-[#AAAAAA]">· {server.players.length}/{val('max-players', '20')}</span>
                </span>
                <span className="truncate">
                  <McText text={val('motd', 'A Minecraft Server').replace(/\\n/g, '\n')} />
                </span>
              </div>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max players" htmlFor="maxp">
              <input id="maxp" type="number" min={1} max={1000} className={inputCls} value={val('max-players', '20')} onChange={(e) => setVal('max-players', e.target.value)} />
            </Field>
            <Field label="Game mode" htmlFor="gm">
              <select id="gm" className={inputCls} value={val('gamemode', 'survival')} onChange={(e) => setVal('gamemode', e.target.value)}>
                {['survival', 'creative', 'adventure', 'spectator'].map((g) => (
                  <option key={g} value={g}>
                    {g[0].toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="diff" className="text-[13px] font-medium">
              Difficulty
            </span>
            <Segmented
              label="Difficulty"
              value={val('difficulty', 'easy')}
              onChange={(v) => setVal('difficulty', v)}
              options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3.5 p-[18px]">
          <h2 className="text-[15px] font-semibold">Memory &amp; startup</h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline">
              <label htmlFor="ram" className="text-[13px] font-medium">
                RAM for this server
              </label>
              <span className="ml-auto text-lg font-bold">{(c('memoryMb') / 1024).toFixed(c('memoryMb') % 1024 ? 1 : 0)} GB</span>
            </div>
            <input id="ram" type="range" min={1} max={Math.max(2, totalGb - 1)} step={0.5} value={c('memoryMb') / 1024} onChange={(e) => setC('memoryMb', Math.round(parseFloat(e.target.value) * 1024))} className="h-6 w-full" />
            <div className="flex text-xs text-muted">
              <span>1 GB</span>
              <span className="ml-auto">Your PC has {totalGb} GB</span>
            </div>
          </div>
          <Field label="Java runtime" htmlFor="java" hint={`This server needs Java ${server.javaMajor}.`}>
            <select id="java" className={inputCls} value={c('javaPath') ?? ''} onChange={(e) => setC('javaPath', e.target.value || null)}>
              <option value="">Automatic (best match for Java {server.javaMajor})</option>
              {compatible.map((j) => (
                <option key={j.path} value={j.path}>
                  Java {j.major} · {j.vendor} {j.version}
                  {j.managed ? ' (managed by Blockhost)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Server port" htmlFor="port">
              <input id="port" type="number" min={1024} max={65535} className={cx(inputCls, 'font-mono')} value={c('port')} onChange={(e) => setC('port', parseInt(e.target.value, 10) || 25565)} />
            </Field>
            <Field label="Daily restart" htmlFor="restart-time">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Restart every day"
                  checked={c('restartSchedule').enabled}
                  onChange={(e) => setC('restartSchedule', { ...c('restartSchedule'), enabled: e.target.checked })}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <input
                  id="restart-time"
                  type="time"
                  disabled={!c('restartSchedule').enabled}
                  className={inputCls}
                  value={c('restartSchedule').time}
                  onChange={(e) => setC('restartSchedule', { ...c('restartSchedule'), time: e.target.value })}
                />
              </div>
            </Field>
          </div>
          <ToggleRow title="Optimized JVM flags" hint="Aikar's flags — smoother garbage collection" checked={c('optimizedFlags')} onChange={(v) => setC('optimizedFlags', v)} />
          <ToggleRow title="Restart automatically if it crashes" hint="Up to 3 times in 10 minutes" checked={c('autoRestart')} onChange={(v) => setC('autoRestart', v)} />
          <Field label="Extra Java arguments" htmlFor="jvm" hint="Advanced. Leave empty unless a mod asks for it.">
            <input id="jvm" className={cx(inputCls, 'font-mono')} value={c('extraJvmArgs')} placeholder="-Dfile.encoding=UTF-8" onChange={(e) => setC('extraJvmArgs', e.target.value)} />
          </Field>
        </Card>

        <Card className="flex flex-col gap-3.5 p-[18px]">
          <h2 className="text-[15px] font-semibold">World</h2>
          <Field label="World seed" htmlFor="seed" hint="Only used when a new world is created.">
            <input id="seed" className={cx(inputCls, 'font-mono')} placeholder="Random" value={val('level-seed')} onChange={(e) => setVal('level-seed', e.target.value)} />
          </Field>
          <Field label="World folder name" htmlFor="level">
            <input id="level" className={cx(inputCls, 'font-mono')} value={val('level-name', 'world')} onChange={(e) => setVal('level-name', e.target.value)} />
          </Field>
          {(
            [
              ['view-distance', 'View distance', 10, 3, 32],
              ['simulation-distance', 'Simulation distance', 10, 3, 32],
              ['spawn-protection', 'Spawn protection', 16, 0, 64]
            ] as const
          ).map(([key, label, def, min, max]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline">
                <label htmlFor={key} className="text-[13px] font-medium">
                  {label}
                </label>
                <span className="ml-auto text-sm font-semibold">
                  {val(key, String(def))} {key === 'spawn-protection' ? 'blocks' : 'chunks'}
                </span>
              </div>
              <input id={key} type="range" min={min} max={max} value={val(key, String(def))} onChange={(e) => setVal(key, e.target.value)} className="h-6 w-full" />
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-0 p-[18px]">
          <h2 className="mb-2 text-[15px] font-semibold">Players &amp; gameplay</h2>
          {PLAYER_TOGGLES.map(([key, title, hint, def]) => (
            <div key={key} className="border-t border-line">
              <ToggleRow title={title} hint={hint} checked={val(key, def) === 'true'} onChange={(v) => setVal(key, String(v))} />
            </div>
          ))}
          <button
            type="button"
            className="mt-2 self-start text-[13px] font-semibold text-accent hover:underline"
            onClick={() => {
              setOpenFile('whitelist.json')
              go('files')
            }}
          >
            Edit whitelist, operators &amp; bans →
          </button>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 !border-danger/40 p-[18px]">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Remove this server</h2>
          <span className="text-[13px] text-muted">Removes it from Blockhost. You choose whether its files are deleted too.</span>
        </div>
        <Button variant="danger" icon={<Trash2 size={15} />} disabled={server.status !== 'stopped' && server.status !== 'crashed'} onClick={() => setDeleteOpen(true)}>
          Remove server…
        </Button>
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Remove ${server.name}?`} width={460}>
        <p className="text-[13px] text-muted">Keep the files if you might want to import this server again later. Deleting files also deletes its worlds and backups.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              setDeleteOpen(false)
              await attempt(() => api.deleteServer(server.id, false), 'Server removed. Its files were kept.')
              go('home', null)
            }}
          >
            Remove, keep files
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setDeleteOpen(false)
              await attempt(() => api.deleteServer(server.id, true), 'Server and its files deleted.')
              go('home', null)
            }}
          >
            Delete everything
          </Button>
        </div>
      </Modal>
    </div>
  )
}
