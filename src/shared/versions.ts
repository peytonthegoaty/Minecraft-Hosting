// Minecraft version helpers shared by main and renderer.

/** Splits "1.21.4" or "26.1" into numbers. Non-numeric parts (snapshots like "24w14a") return []. */
export function parseMcVersion(v: string): number[] {
  if (!/^\d+(\.\d+)*$/.test(v)) return []
  return v.split('.').map((n) => parseInt(n, 10))
}

export function compareMcVersions(a: string, b: string): number {
  const pa = parseMcVersion(a)
  const pb = parseMcVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Java version a Minecraft version needs, used when Mojang's version manifest is unavailable.
 * Mojang's own `javaVersion.majorVersion` is preferred when we can fetch it.
 */
export function fallbackJavaFor(mcVersion: string): number {
  const p = parseMcVersion(mcVersion)
  if (p.length === 0) return 21
  // Year-based versions (26.1 and later) need Java 25.
  if (p[0] >= 26) return 25
  const minor = p[1] ?? 0
  const patch = p[2] ?? 0
  if (minor <= 16) return 8
  if (minor === 17) return 16
  if (minor < 20 || (minor === 20 && patch <= 4)) return 17
  return 21
}

/** Java 16 isn't shipped by Temurin; 17 runs everything that needed 16. */
export function installableJava(required: number): number {
  return required === 16 ? 17 : required
}

/** Range of Java majors that can run a server needing `required`. */
export function acceptableJava(required: number): [number, number] {
  if (required <= 8) return [8, 8]
  if (required <= 17) return [17, 21]
  return [required, 99]
}

export function isJavaAcceptable(required: number, major: number): boolean {
  const [min, max] = acceptableJava(required)
  return major >= min && major <= max
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Memory to suggest for a new server, in MB, given total system RAM. */
export function suggestMemoryMb(totalBytes: number, type: string): number {
  const totalGb = totalBytes / 1024 ** 3
  const modded = type === 'forge' || type === 'neoforge' || type === 'fabric'
  let gb = modded ? 6 : 4
  if (totalGb <= 6) gb = 2
  else if (totalGb <= 10) gb = modded ? 4 : 3
  else if (totalGb >= 24 && modded) gb = 8
  return gb * 1024
}
