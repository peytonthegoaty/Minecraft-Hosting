import type { CSSProperties, ReactNode } from 'react'

// Minecraft formatting codes (§ or &) rendered as styled spans, for the MOTD preview.
const COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA', '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF', c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF'
}

export function McText({ text, base = '#AAAAAA' }: { text: string; base?: string }) {
  const out: ReactNode[] = []
  let style: CSSProperties = { color: base }
  let buf = ''
  const flush = () => {
    if (buf) out.push(<span key={out.length} style={style}>{buf}</span>)
    buf = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text[i + 1]?.toLowerCase()
    if ((ch === '§' || ch === '&') && code && /[0-9a-fk-or]/.test(code)) {
      flush()
      if (COLORS[code]) style = { color: COLORS[code] }
      else if (code === 'l') style = { ...style, fontWeight: 700 }
      else if (code === 'o') style = { ...style, fontStyle: 'italic' }
      else if (code === 'n') style = { ...style, textDecoration: 'underline' }
      else if (code === 'm') style = { ...style, textDecoration: 'line-through' }
      else if (code === 'r') style = { color: base }
      i++
      continue
    }
    if (ch === '\n') {
      flush()
      out.push(<br key={out.length} />)
      continue
    }
    buf += ch
  }
  flush()
  return <>{out}</>
}
