import {
  BarChart3,
  Brain,
  Database,
  GitBranch,
  HelpCircle,
  Megaphone,
  MessageSquare,
  PieChart,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  Brain,
  Database,
  GitBranch,
  HelpCircle,
  Megaphone,
  MessageSquare,
  PieChart,
  ShieldCheck,
}

/** Classes estáticas — Tailwind precisa vê-las no código para gerar o CSS. */
const COLORS: Record<string, string> = {
  amber: 'bg-amber-500/12 text-amber-500 ring-amber-500/20',
  blue: 'bg-blue-500/12 text-blue-500 ring-blue-500/20',
  violet: 'bg-violet-500/12 text-violet-500 ring-violet-500/20',
  emerald: 'bg-emerald-500/12 text-emerald-500 ring-emerald-500/20',
  rose: 'bg-rose-500/12 text-rose-500 ring-rose-500/20',
  cyan: 'bg-cyan-500/12 text-cyan-500 ring-cyan-500/20',
  slate: 'bg-slate-500/12 text-slate-500 ring-slate-500/20',
  orange: 'bg-orange-500/12 text-orange-500 ring-orange-500/20',
}

const BOX: Record<string, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
}

const GLYPH: Record<string, number> = { sm: 16, md: 18, lg: 22 }

export function CategoryIcon({
  icon,
  color,
  size = 'md',
}: {
  icon: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = ICONS[icon] ?? MessageSquare
  return (
    <span
      className={`${BOX[size]} ${COLORS[color] ?? COLORS.blue} inline-flex items-center justify-center ring-1`}
    >
      <Icon size={GLYPH[size]} strokeWidth={2.2} />
    </span>
  )
}

export function categoryTextColor(color: string): string {
  return (COLORS[color] ?? COLORS.blue).split(' ').find((c) => c.startsWith('text-')) ?? 'text-blue-500'
}
