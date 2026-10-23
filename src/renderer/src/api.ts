import { ERROR_PREFIX, type Api, type ApiEvents, type Bridge } from '@shared/api'
import { createMockBridge } from './mock'

// In Electron the preload provides window.blockhost; in a plain browser (npm run web) a mock backend is used.
const bridge: Bridge = window.blockhost ?? createMockBridge()
export const isMock = !window.blockhost
export const platform = window.platform ?? (navigator.userAgent.includes('Windows') ? 'win32' : navigator.userAgent.includes('Mac') ? 'darwin' : 'linux')

type Promised<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never }

export const api = new Proxy({} as Promised<Api>, {
  get: (_t, method: string) => (...args: unknown[]) => (bridge.invoke as (m: string, ...a: unknown[]) => Promise<unknown>)(method, ...args)
})

export function on<K extends keyof ApiEvents>(event: K, cb: (payload: ApiEvents[K]) => void): () => void {
  return bridge.on(event, cb)
}

/** Turns an IPC error into the plain message the main process meant to show. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const i = raw.indexOf(ERROR_PREFIX)
  return i >= 0 ? raw.slice(i + ERROR_PREFIX.length) : raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function isJavaRequired(e: unknown): boolean {
  return errorText(e).startsWith('JAVA_REQUIRED')
}
