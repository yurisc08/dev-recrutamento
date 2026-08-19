import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { EmptyState, PageLoader } from '../components/ui'

const FILTERS: ('todos' | UserRole)[] = [
  'todos',
  'analista_dados',
  'cientista_dados',
  'engenheiro_dados',
  'analista_bi',
  'produto',
  'gestor',
]

export function Members() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todos' | UserRole>('todos')

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => {
        setProfiles((data as Profile[]) ?? [])
        setLoading(false)
      })
  }, [])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return profiles.filter((profile) => {
      const matchesRole = filter === 'todos' || profile.role === filter
      const matchesTerm =
        !term ||
        profile.full_name.toLowerCase().includes(term) ||
        profile.username.toLowerCase().includes(term) ||
        (profile.team ?? '').toLowerCase().includes(term)
      return matchesRole && matchesTerm
    })
  }, [profiles, query, filter])

  if (loading) return <PageLoader />

  return (
    <div className="animate-in space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Membros</h1>
        <p className="mt-1 text-sm text-muted">
          {profiles.length} {profiles.length === 1 ? 'pessoa' : 'pessoas'} na comunidade de dados.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, usuário ou squad…"
            className="input pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`chip transition ${
              filter === item ? 'border-brand-500/40 bg-brand-500/10 text-brand-500' : 'hover:text-strong'
            }`}
          >
            {item === 'todos' ? 'Todos' : ROLE_LABELS[item]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum membro encontrado" description="Ajuste a busca ou o filtro de função." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((profile) => (
            <Link
              key={profile.id}
              to={`/u/${profile.username}`}
              className="card flex items-center gap-3 p-4 transition hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-900/5"
            >
              <Avatar name={profile.full_name} seed={profile.id} url={profile.avatar_url} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-strong">{profile.full_name}</p>
                <p className="truncate text-xs text-muted">{ROLE_LABELS[profile.role]}</p>
                {profile.team && <p className="truncate text-[11px] text-muted">{profile.team}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
