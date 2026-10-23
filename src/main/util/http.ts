// Small fetch helpers with a descriptive User-Agent (PaperMC's API requires one), timeouts and retries.

export const USER_AGENT = 'CrabHost/0.1 (+https://github.com/peytonthegoaty/Minecraft-Hosting)'

export interface RequestOptions {
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  method?: string
  body?: string
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string
  ) {
    super(`Request to ${new URL(url).host} failed (HTTP ${status})`)
  }
}

export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 2
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000)
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { 'User-Agent': USER_AGENT, ...opts.headers },
        signal: ctrl.signal,
        redirect: 'follow'
      })
      if (!res.ok) {
        // Retry server errors and rate limits; client errors are final.
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          lastErr = new HttpError(res.status, url)
          await sleep(500 * 2 ** attempt)
          continue
        }
        throw new HttpError(res.status, url)
      }
      return res
    } catch (e) {
      lastErr = e
      if (e instanceof HttpError) throw e
      if (attempt < retries) await sleep(500 * 2 ** attempt)
    } finally {
      clearTimeout(timer)
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`Couldn't reach ${new URL(url).host}: ${msg}. Check your internet connection.`)
}

export async function getJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } })
  return (await res.json()) as T
}

export async function getText(url: string, opts?: RequestOptions): Promise<string> {
  return (await request(url, opts)).text()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Caches results of `fn` for `ttlMs` per key. Failed calls are not cached. */
export function memo<T>(ttlMs: number) {
  const cache = new Map<string, { at: number; value: Promise<T> }>()
  return (key: string, fn: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    const value = fn().catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, { at: Date.now(), value })
    return value
  }
}
