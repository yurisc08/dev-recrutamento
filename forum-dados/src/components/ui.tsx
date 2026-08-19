import { Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function PageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
      <Spinner size={26} className="text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
        <Icon size={22} />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {action}
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-rose-500/10 text-rose-500 border-rose-500/25',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    info: 'bg-brand-500/10 text-brand-500 border-brand-500/25',
  }[kind]
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium ${styles}`} role="alert">
      {children}
    </div>
  )
}

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'brand',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  tone?: 'brand' | 'emerald' | 'amber' | 'cyan'
}) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    amber: 'bg-amber-500/10 text-amber-500',
    cyan: 'bg-cyan-500/10 text-cyan-500',
  }[tone]

  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold text-strong leading-tight">{value}</p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
