import { create } from 'zustand'
import type { AppSettings, DownloadTask, JavaRequirement, LogLine, Metrics, ServerSummary, SystemInfo, ThemePref } from '@shared/types'
import { api, errorText, isJavaRequired, on } from './api'

export type View = 'home' | 'new' | 'dashboard' | 'console' | 'files' | 'addons' | 'config' | 'network' | 'backups' | 'downloads' | 'settings'

export const SERVER_VIEWS: View[] = ['dashboard', 'console', 'files', 'addons', 'config', 'network', 'backups']

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

interface State {
  ready: boolean
  servers: ServerSummary[]
  selectedId: string | null
  view: View
  settings: AppSettings | null
  sys: SystemInfo | null
  downloads: DownloadTask[]
  javaPrompt: JavaRequirement | null
  toasts: Toast[]
  logs: Record<string, LogLine[]>
  metrics: Record<string, Metrics[]>
  dark: boolean
  /** Opens a file in the Files view (used by links elsewhere). */
  openFile: string | null
  init: () => Promise<void>
  go: (view: View, serverId?: string | null) => void
  setTheme: (t: ThemePref) => Promise<void>
  toast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void
  closeJavaPrompt: () => void
  loadLog: (id: string) => Promise<void>
  setOpenFile: (p: string | null) => void
}

let toastSeq = 1
/** Stable empty arrays so selectors don't return a new [] every render (that loops forever). */
export const NO_LOGS: LogLine[] = []
export const NO_METRICS: Metrics[] = []
const MAX_LOG = 3000
const media = window.matchMedia('(prefers-color-scheme: dark)')

function resolveDark(pref: ThemePref | undefined): boolean {
  return pref === 'dark' || ((pref ?? 'system') === 'system' && media.matches)
}

function applyDark(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  servers: [],
  selectedId: null,
  view: 'home',
  settings: null,
  sys: null,
  downloads: [],
  javaPrompt: null,
  toasts: [],
  logs: {},
  metrics: {},
  dark: resolveDark('system'),
  openFile: null,

  init: async () => {
    const [settings, sys, servers, downloads] = await Promise.all([api.getSettings(), api.getSystemInfo(), api.listServers(), api.listDownloads()])
    const dark = resolveDark(settings.theme)
    applyDark(dark)
    set({ settings, sys, servers, downloads, dark, ready: true, selectedId: servers[0]?.id ?? null, view: servers.length ? 'dashboard' : 'home' })
    if (servers[0]) void get().loadLog(servers[0].id)

    media.addEventListener('change', () => {
      const d = resolveDark(get().settings?.theme)
      applyDark(d)
      set({ dark: d })
    })
    on('servers', (servers) => set({ servers }))
    on('downloads', (downloads) => set({ downloads }))
    on('toast', (t) => get().toast(t.kind, t.message))
    on('javaRequired', (javaPrompt) => set({ javaPrompt }))
    on('log', ({ id, lines }) =>
      set((s) => {
        const prev = s.logs[id]
        if (!prev) return s
        const next = prev.concat(lines)
        return { logs: { ...s.logs, [id]: next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next } }
      })
    )
    on('metrics', ({ id, metrics }) =>
      set((s) => {
        const prev = s.metrics[id] ?? []
        const next = prev.concat(metrics)
        return { metrics: { ...s.metrics, [id]: next.length > 300 ? next.slice(next.length - 300) : next } }
      })
    )
  },

  go: (view, serverId) => {
    const id = serverId === undefined ? get().selectedId : serverId
    set({ view, selectedId: id })
    if (id && !get().logs[id]) void get().loadLog(id)
  },

  setTheme: async (theme) => {
    const settings = await api.updateSettings({ theme })
    const dark = resolveDark(theme)
    applyDark(dark)
    set({ settings, dark })
  },

  toast: (kind, message) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 5000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  closeJavaPrompt: () => set({ javaPrompt: null }),

  loadLog: async (id) => {
    const [log, metrics] = await Promise.all([api.getLog(id), api.getMetricsHistory(id)])
    set((s) => ({ logs: { ...s.logs, [id]: log }, metrics: { ...s.metrics, [id]: metrics } }))
  },
  setOpenFile: (openFile) => set({ openFile })
}))

export function useSelected(): ServerSummary | null {
  return useStore((s) => s.servers.find((x) => x.id === s.selectedId) ?? null)
}

/** Runs an action, showing errors as toasts (the Java popup handles missing Java on its own). */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn()
    if (success) useStore.getState().toast('success', success)
    return r
  } catch (e) {
    if (!isJavaRequired(e)) useStore.getState().toast('error', errorText(e))
    return undefined
  }
}
