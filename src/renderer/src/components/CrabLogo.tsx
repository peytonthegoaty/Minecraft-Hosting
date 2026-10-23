/** The Crab Host mark. Uses currentColor so it works on any background. */
export function CrabLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g fill="currentColor">
        <path d="M4.6 6.2 5.27 3.69A2.6 2.6 0 1 0 6.96 5.1Z" />
        <path d="M19.4 6.2 18.73 3.69A2.6 2.6 0 1 1 17.04 5.1Z" />
        <ellipse cx="12" cy="14.2" rx="6.3" ry="4.3" />
        <circle cx="9.7" cy="8.4" r="1.3" />
        <circle cx="14.3" cy="8.4" r="1.3" />
      </g>
      <path
        d="M5.9 8.4 7.9 11.3M18.1 8.4 16.1 11.3M10.1 9.6 10.6 10.4M13.9 9.6 13.4 10.4M6.2 13.6 3 12.6M6.4 16.2 3.4 17.8M7.9 17.7 6.2 20.2M17.8 13.6 21 12.6M17.6 16.2 20.6 17.8M16.1 17.7 17.8 20.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
