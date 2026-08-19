import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function timeAgo(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: ptBR })
}

export function fullDate(iso: string): string {
  return format(new Date(iso), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
}

export function chatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

export function chatDayLabel(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return 'Hoje'
  if (isYesterday(date)) return 'Ontem'
  return format(date, "d 'de' MMMM", { locale: ptBR })
}

export function dayKey(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd')
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Cor determinística para o avatar a partir do id/nome do usuário. */
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
  'from-blue-500 to-indigo-500',
  'from-lime-500 to-emerald-500',
]

export function avatarGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

export function compact(n: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(n)
}
