// Parsing of `java -XshowSettings:properties -version` output. Kept free of Node APIs for tests.

export interface JavaProbe {
  version: string
  vendor: string
  arch: string
  home: string
}

export function majorFromVersion(version: string): number {
  const m = version.match(/^(\d+)(?:\.(\d+))?/)
  if (!m) return 0
  const first = parseInt(m[1], 10)
  // Java 8 and older report "1.8.0_421".
  if (first === 1 && m[2]) return parseInt(m[2], 10)
  return first
}

export function parseJavaProperties(output: string): JavaProbe | null {
  const props = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s+([\w.]+) = (.*)$/)
    if (m) props.set(m[1], m[2].trim())
  }
  const version = props.get('java.version')
  if (!version) {
    // Fallback: plain `java -version` banner, e.g. `openjdk version "21.0.5" 2024-10-15`.
    const m = output.match(/version "([^"]+)"/)
    if (!m) return null
    return { version: m[1], vendor: /OpenJDK/i.test(output) ? 'OpenJDK' : 'Unknown', arch: /64-Bit/.test(output) ? 'x64' : 'unknown', home: '' }
  }
  return {
    version,
    vendor: props.get('java.vendor') ?? 'Unknown',
    arch: props.get('os.arch') ?? 'unknown',
    home: props.get('java.home') ?? ''
  }
}

/** Parses `reg query ... /s /v <name>` output into the REG_SZ values. */
export function parseRegValues(output: string): string[] {
  const out: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s+\S+\s+REG_(?:EXPAND_)?SZ\s+(.+)$/)
    if (m) out.push(m[1].trim())
  }
  return out
}

export function adoptiumOs(platform: string): string {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'mac'
  return 'linux'
}

export function adoptiumArch(arch: string): string {
  if (arch === 'arm64') return 'aarch64'
  if (arch === 'ia32') return 'x32'
  return 'x64'
}
