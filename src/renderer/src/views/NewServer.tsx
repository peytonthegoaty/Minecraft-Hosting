import { Check, ChevronLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ServerType, VersionOption } from '@shared/types'
import { SERVER_TYPES } from '@shared/types'
import { installableJava, isJavaAcceptable, suggestMemoryMb } from '@shared/versions'
import { api } from '../api'
import { Badge, Button, Card, cx, Field, inputCls, PageHeader, ServerTile, Spinner } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { attempt, useStore } from '../store'

const STEPS = ['Name & type', 'Version', 'Memory', 'Finish']

const TAG: Record<string, { text: string; tone: string }> = {
  plugins: { text: 'Plugins', tone: 'text-accent' },
  mods: { text: 'Mods', tone: 'text-info' },
  none: { text: 'No add-ons', tone: 'text-muted' }
}

export function NewServer() {
  const { go, sys } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('My server')
  const [type, setType] = useState<ServerType>('paper')
  const [snapshots, setSnapshots] = useState(false)
  const [query, setQuery] = useState('')
  const [mc, setMc] = useState<string | null>(null)
  const [loader, setLoader] = useState<string | undefined>()
  const [memoryMb, setMemoryMb] = useState(4096)
  const [eula, setEula] = useState(false)
  const [creating, setCreating] = useState(false)

  const versions = useAsync(() => api.listVersions(type, snapshots), [type, snapshots])
  const loaders = useAsync<VersionOption[]>(() => (mc && ['fabric', 'forge', 'neoforge'].includes(type) ? api.listLoaderVersions(type, mc) : Promise.resolve([])), [type, mc])
  const required = useAsync(() => (mc ? api.requiredJava(type, mc) : Promise.resolve(0)), [type, mc])
  const javas = useAsync(() => api.listJava(), [])

  useEffect(() => {
    const first = versions.data?.find((v) => v.latest) ?? versions.data?.[0]
    setMc((cur) => (cur && versions.data?.some((v) => v.id === cur) ? cur : (first?.id ?? null)))
  }, [versions.data])
  useEffect(() => {
    setLoader((loaders.data?.find((l) => l.latest) ?? loaders.data?.[0])?.id)
  }, [loaders.data])
  useEffect(() => {
    if (sys) setMemoryMb(suggestMemoryMb(sys.totalMemBytes, type))
  }, [sys, type])

  const filtered = useMemo(() => (versions.data ?? []).filter((v) => v.id.toLowerCase().includes(query.toLowerCase())).slice(0, 80), [versions.data, query])
  const totalGb = sys ? Math.floor(sys.totalMemBytes / 1024 ** 3) : 16
  const maxGb = Math.max(2, Math.min(64, totalGb - 1))
  const javaMajor = required.data ? installableJava(required.data) : 0
  const javaReady = !!required.data && !!javas.data?.some((j) => isJavaAcceptable(required.data!, j.major))
  const typeInfo = SERVER_TYPES.find((t) => t.id === type)!

  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? !!mc : true

  const create = async () => {
    if (!mc) return
    setCreating(true)
    const s = await attempt(() => api.createServer({ name: name.trim(), type, mcVersion: mc, loaderVersion: loader, memoryMb, acceptEula: eula }))
    setCreating(false)
    if (s) go('console', s.id)
  }

  return (
    <div className="flex min-h-full flex-col gap-5 px-7 py-6">
      <PageHeader title="New server" subtitle="Blockhost downloads everything it needs — server files, Java and tools." />

      <ol aria-label="Steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={cx('flex items-center gap-2 rounded-full border py-2 pl-2 pr-3 text-[13px] font-medium', i === step ? 'border-accent bg-accent/10' : 'border-line bg-surface', i > step && 'text-muted')}
          >
            <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', i <= step ? 'bg-accent text-on-accent' : 'bg-hover text-muted')}>{i < step ? <Check size={13} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <Field label="Server name" htmlFor="srv-name">
            <input id="srv-name" className={cx(inputCls, 'max-w-md')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-semibold">Server type</h2>
            <div role="radiogroup" aria-label="Server type" className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
              {SERVER_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={type === t.id}
                  onClick={() => setType(t.id)}
                  className={cx('flex items-start gap-3 rounded-xl border-2 p-3.5 text-left', type === t.id ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-muted')}
                >
                  <ServerTile name={t.name} type={t.id} size={38} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {t.name}
                      {t.id === 'paper' && <span className="rounded bg-accent px-1.5 py-px text-[10px] font-bold text-on-accent">Recommended</span>}
                    </span>
                    <span className="text-xs leading-snug text-muted">{t.description}</span>
                    <span className={cx('text-[11px] font-semibold', TAG[t.addons].tone)}>{TAG[t.addons].text}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-wrap items-start gap-3.5">
          <section className="flex min-w-0 flex-[2_1_380px] flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[15px] font-semibold">{typeInfo.name} — Minecraft version</h2>
              <label className="ml-auto flex min-h-[32px] items-center gap-1.5 text-[13px] text-muted">
                <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                Show snapshots &amp; betas
              </label>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-muted">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search versions" aria-label="Search versions" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
            </label>
            <div role="radiogroup" aria-label="Minecraft version" className="max-h-[380px] overflow-y-auto rounded-xl border border-line bg-surface">
              {versions.loading && (
                <div className="flex items-center gap-2 p-4 text-[13px] text-muted">
                  <Spinner /> Loading versions…
                </div>
              )}
              {versions.error && (
                <div className="flex flex-col gap-2 p-4 text-[13px]">
                  <span className="text-danger">{versions.error}</span>
                  <Button size="sm" className="self-start" onClick={versions.reload}>
                    Try again
                  </Button>
                </div>
              )}
              {filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={mc === v.id}
                  onClick={() => setMc(v.id)}
                  className={cx('flex min-h-[44px] w-full items-center gap-3 border-b border-line px-3.5 text-left last:border-b-0', mc === v.id ? 'bg-accent/10' : 'hover:bg-hover')}
                >
                  <span className={cx('flex h-4 w-4 items-center justify-center rounded-full border-2', mc === v.id ? 'border-accent' : 'border-muted')}>{mc === v.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</span>
                  <span className="font-mono text-sm font-medium">{v.id}</span>
                  {v.latest && <span className="text-xs font-semibold text-accent">Latest</span>}
                  {v.label && <Badge tone="warn">{v.label}</Badge>}
                </button>
              ))}
            </div>
            {loaders.data && loaders.data.length > 0 && (
              <Field label={type === 'fabric' ? 'Fabric loader' : type === 'forge' ? 'Forge version' : 'NeoForge version'} htmlFor="loader">
                <select id="loader" className={cx(inputCls, 'max-w-sm')} value={loader} onChange={(e) => setLoader(e.target.value)}>
                  {loaders.data.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id}
                      {l.label ? ` (${l.label})` : l.latest ? ' (Latest)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </section>
          <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-[15px] font-semibold">What gets downloaded</h2>
            <div className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex gap-2">
                <span className="font-medium">
                  {typeInfo.name} {mc ?? '…'}
                </span>
                <span className="ml-auto text-muted">Server files</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">Java {javaMajor || '…'}</span>
                <span className={cx('ml-auto font-semibold', javaReady ? 'text-accent' : 'text-muted')}>{required.loading ? '…' : javaReady ? 'Already installed' : 'Installed on first start'}</span>
              </div>
              {(type === 'forge' || type === 'neoforge') && <p className="text-xs text-muted">The {typeInfo.name} installer runs once after download and fetches its libraries.</p>}
            </div>
            <div className="h-px bg-line" />
            <span className="text-xs leading-relaxed text-muted">Every file with a published checksum is verified before it&apos;s used.</span>
          </aside>
        </div>
      )}

      {step === 2 && (
        <Card className="flex max-w-xl flex-col gap-3 p-5">
          <div className="flex items-baseline">
            <label htmlFor="ram" className="text-[15px] font-semibold">
              RAM for this server
            </label>
            <span className="ml-auto text-xl font-bold">{(memoryMb / 1024).toFixed(memoryMb % 1024 ? 1 : 0)} GB</span>
          </div>
          <input id="ram" type="range" min={1} max={maxGb} step={0.5} value={memoryMb / 1024} onChange={(e) => setMemoryMb(Math.round(parseFloat(e.target.value) * 1024))} className="h-6 w-full" />
          <div className="flex text-xs text-muted">
            <span>1 GB</span>
            <span className="ml-auto">
              Your PC has {totalGb} GB · suggested {(suggestMemoryMb(sys?.totalMemBytes ?? 16 * 1024 ** 3, type) / 1024).toFixed(0)} GB
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {type === 'forge' || type === 'neoforge' || type === 'fabric'
              ? 'Modpacks need more memory: 6–8 GB for big packs. '
              : 'Most plugin servers run well with 3–6 GB. '}
            Leave at least 2–3 GB for Windows and other apps. You can change this later.
          </p>
        </Card>
      )}

      {step === 3 && (
        <div className="flex max-w-xl flex-col gap-4">
          <Card className="flex flex-col gap-2.5 p-5 text-[13px]">
            <h2 className="text-[15px] font-semibold">Summary</h2>
            {[
              ['Name', name],
              ['Type', `${typeInfo.name}${loader ? ` (${loader})` : ''}`],
              ['Minecraft', mc ?? ''],
              ['Memory', `${(memoryMb / 1024).toFixed(1)} GB`],
              ['Java', `Java ${javaMajor}${javaReady ? ' — already installed' : ' — installed automatically'}`]
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="w-24 text-muted">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </Card>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed">
            <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--accent))]" />
            <span>
              I agree to the{' '}
              <a
                href="https://aka.ms/MinecraftEULA"
                onClick={(e) => {
                  e.preventDefault()
                  void api.openExternal('https://aka.ms/MinecraftEULA')
                }}
                className="font-semibold text-accent underline"
              >
                Minecraft End User License Agreement
              </a>
              . Every Minecraft server needs this before it can start.
            </span>
          </label>
        </div>
      )}

      <div className="mt-auto flex justify-end gap-2.5 pt-2">
        {step > 0 ? (
          <Button size="lg" icon={<ChevronLeft size={16} />} onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <Button size="lg" onClick={() => go('home', null)}>
            Cancel
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue to {STEPS[step + 1].toLowerCase()}
          </Button>
        ) : (
          <Button size="lg" variant="primary" disabled={!eula || !mc} loading={creating} onClick={create}>
            Create server
          </Button>
        )}
      </div>
    </div>
  )
}
