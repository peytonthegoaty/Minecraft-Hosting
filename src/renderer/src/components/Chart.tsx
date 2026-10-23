import { useId } from 'react'

export interface Series {
  values: (number | undefined)[]
  max: number
  color: string
  area?: boolean
  label: string
}

/** A lightweight line chart. Each series is scaled against its own max so RAM and CPU share one box. */
export function LineChart({ series, height = 160, label }: { series: Series[]; height?: number; label: string }) {
  const gid = useId().replace(/:/g, '')
  const W = 600
  const n = Math.max(2, ...series.map((s) => s.values.length))
  const path = (s: Series) => {
    const pts: string[] = []
    s.values.forEach((v, i) => {
      if (v === undefined || !Number.isFinite(v)) return
      const x = (i / (n - 1)) * W
      const y = height - 6 - (Math.min(v, s.max) / (s.max || 1)) * (height - 16)
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    })
    return pts
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={label}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${gid}-${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="rgb(var(--border))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {series.map((s, i) => {
        const pts = path(s)
        if (pts.length < 2) return null
        const first = pts[0].split(',')[0]
        const last = pts[pts.length - 1].split(',')[0]
        return (
          <g key={i}>
            {s.area && <path d={`M${pts.join(' L')} L${last},${height} L${first},${height} Z`} fill={`url(#${gid}-${i})`} />}
            <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={i === 0 ? 2.5 : 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        )
      })}
    </svg>
  )
}
