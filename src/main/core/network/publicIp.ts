import { getJson, getText } from '../../util/http'

export async function fetchPublicIp(): Promise<string | null> {
  try {
    const r = await getJson<{ ip: string }>('https://api.ipify.org?format=json', { retries: 1, timeoutMs: 6000 })
    if (r.ip) return r.ip
  } catch {
    // try the fallback
  }
  try {
    const t = (await getText('https://icanhazip.com', { retries: 1, timeoutMs: 6000 })).trim()
    return /^[\d.]+$|^[0-9a-f:]+$/i.test(t) ? t : null
  } catch {
    return null
  }
}

/** Asks an outside service to connect back to this port. */
export async function checkReachable(port: number): Promise<boolean | null> {
  try {
    const r = await getJson<{ reachable?: boolean }>(`https://ifconfig.co/port/${port}`, { retries: 1, timeoutMs: 12000 })
    return typeof r.reachable === 'boolean' ? r.reachable : null
  } catch {
    return null
  }
}
