import { Coffee, Download, X } from 'lucide-react'
import { useState } from 'react'
import { installableJava, isJavaAcceptable } from '@shared/versions'
import { api, errorText } from '../api'
import { attempt, useStore } from '../store'
import { Badge, Button } from './ui'

/** Shown when a server needs a Java version this PC doesn't have. Installs Temurin with one click. */
export function JavaModal() {
  const { javaPrompt, closeJavaPrompt, toast } = useStore()
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!javaPrompt) return null
  const major = installableJava(javaPrompt.major)

  const install = async () => {
    setInstalling(true)
    setError(null)
    try {
      await api.installJava(javaPrompt.major)
      toast('success', `Java ${major} installed.`)
      closeJavaPrompt()
      if (javaPrompt.serverId) await attempt(() => api.startServer(javaPrompt.serverId!))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setInstalling(false)
    }
  }

  const chooseExisting = async () => {
    const [file] = await api.pickFiles([{ name: 'Java', extensions: ['exe', ''] }])
    if (!file) return
    const rt = await attempt(() => api.addJavaManually(file))
    if (!rt) return
    if (!isJavaAcceptable(javaPrompt.major, rt.major)) {
      setError(`That is Java ${rt.major}, but this server needs Java ${major}.`)
      return
    }
    if (javaPrompt.serverId) await api.updateServer(javaPrompt.serverId, { javaPath: rt.path })
    closeJavaPrompt()
    if (javaPrompt.serverId) await attempt(() => api.startServer(javaPrompt.serverId!))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 dark:bg-black/70">
      <div role="dialog" aria-modal="true" aria-labelledby="java-title" className="animate-in flex w-full max-w-[520px] flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn">
            <Coffee size={22} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="java-title" className="text-[19px] font-bold">
              Java {major} is needed
            </h2>
            <p className="text-sm leading-relaxed text-muted">{javaPrompt.reason} We couldn&apos;t find a matching version on this PC.</p>
          </div>
          <button type="button" aria-label="Close" onClick={closeJavaPrompt} className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-bg px-3.5 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Found on this PC</span>
          {javaPrompt.found.length === 0 && <span className="text-[13px] text-muted">No Java installs found.</span>}
          {javaPrompt.found.slice(0, 4).map((j) => (
            <div key={j.path} className="flex items-center gap-2.5 text-[13px]">
              <span className="shrink-0 whitespace-nowrap font-semibold">Java {j.major}</span>
              <span className="selectable min-w-0 truncate font-mono text-xs text-muted" title={j.path}>
                {j.path}
              </span>
              <Badge tone={isJavaAcceptable(javaPrompt.major, j.major) ? 'success' : 'danger'} className="ml-auto shrink-0">
                {isJavaAcceptable(javaPrompt.major, j.major) ? 'Works' : j.major < javaPrompt.major ? 'Too old' : 'Too new'}
              </Badge>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1 rounded-xl border-2 border-accent bg-accent/10 px-4 py-3.5">
          <span className="text-sm font-semibold">Install automatically</span>
          <span className="text-[13px] text-muted">Eclipse Temurin {major} · about 50 MB · no admin rights needed. Stored inside Crab Host and won&apos;t change other apps.</span>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={chooseExisting} className="h-11 rounded-[10px] px-3 text-sm font-medium underline hover:bg-hover">
            Use a Java I already have…
          </button>
          <div className="ml-auto flex gap-2.5">
            <Button size="lg" onClick={closeJavaPrompt}>
              Cancel
            </Button>
            <Button size="lg" variant="primary" icon={<Download size={16} />} loading={installing} onClick={install}>
              {installing ? 'Installing…' : `Install Java ${major}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
