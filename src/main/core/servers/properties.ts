// Reads and writes Java .properties files (server.properties) while keeping comments and order.

type Line = { kind: 'raw'; raw: string } | { kind: 'entry'; key: string; value: string }

function unescape(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, hex: string | undefined, ch: string | undefined) => {
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    if (ch === 'n') return '\n'
    if (ch === 't') return '\t'
    if (ch === 'r') return '\r'
    return ch ?? ''
  })
}

function escape(s: string, isKey: boolean): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (isKey && (ch === '=' || ch === ':' || ch === ' ')) out += '\\' + ch
    else if (code > 0x7e || code < 0x20) out += '\\u' + code.toString(16).toUpperCase().padStart(4, '0')
    else out += ch
  }
  return out
}

export class Properties {
  private lines: Line[] = []

  static parse(text: string): Properties {
    const p = new Properties()
    for (const raw of text.split(/\r?\n/)) {
      const trimmed = raw.trimStart()
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) {
        p.lines.push({ kind: 'raw', raw })
        continue
      }
      const m = trimmed.match(/^((?:\\.|[^=:\s\\])*)\s*[=:\s]\s*(.*)$/)
      if (!m) {
        p.lines.push({ kind: 'entry', key: unescape(trimmed), value: '' })
        continue
      }
      p.lines.push({ kind: 'entry', key: unescape(m[1]), value: unescape(m[2]) })
    }
    while (p.lines.length && p.lines[p.lines.length - 1].kind === 'raw' && (p.lines[p.lines.length - 1] as { raw: string }).raw === '') p.lines.pop()
    return p
  }

  get(key: string): string | undefined {
    for (const l of this.lines) if (l.kind === 'entry' && l.key === key) return l.value
    return undefined
  }

  set(key: string, value: string): void {
    for (const l of this.lines) {
      if (l.kind === 'entry' && l.key === key) {
        l.value = value
        return
      }
    }
    this.lines.push({ kind: 'entry', key, value })
  }

  toObject(): Record<string, string> {
    const o: Record<string, string> = {}
    for (const l of this.lines) if (l.kind === 'entry') o[l.key] = l.value
    return o
  }

  toString(): string {
    return this.lines.map((l) => (l.kind === 'raw' ? l.raw : `${escape(l.key, true)}=${escape(l.value, false)}`)).join('\n') + '\n'
  }
}
