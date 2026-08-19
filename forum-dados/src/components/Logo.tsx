export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="dh-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#dh-grad)" />
      <rect x="7" y="16" width="4" height="9" rx="1.6" fill="#a5b4fc" />
      <rect x="14" y="11" width="4" height="14" rx="1.6" fill="#c7d2fe" />
      <rect x="21" y="7" width="4" height="18" rx="1.6" fill="#ffffff" />
    </svg>
  )
}
