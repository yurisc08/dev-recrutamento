import { avatarGradient, initials } from '../lib/format'

interface AvatarProps {
  name: string
  seed?: string
  url?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  ring?: boolean
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-3xl',
}

export function Avatar({ name, seed, url, size = 'md', ring = false }: AvatarProps) {
  const cls = `${SIZES[size]} shrink-0 rounded-full ${ring ? 'ring-2 ring-brand-500/40' : ''}`

  if (url) {
    return <img src={url} alt={name} className={`${cls} object-cover`} loading="lazy" />
  }

  return (
    <div
      className={`${cls} bg-gradient-to-br ${avatarGradient(seed ?? name)} flex items-center justify-center font-bold text-white select-none`}
      aria-hidden="true"
      title={name}
    >
      {initials(name)}
    </div>
  )
}
