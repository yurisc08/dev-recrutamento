import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hash, MessageSquare, PenSquare, TrendingUp, Users } from 'lucide-react'
import { ThreadFeed } from '../components/ThreadFeed'
import { CategoryIcon } from '../components/CategoryIcon'
import { StatTile } from '../components/ui'
import { fetchCategories, fetchStats, fetchTrendingTags } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { Category, ForumStats } from '../lib/types'
import { compact } from '../lib/format'

export function Home() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<ForumStats | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([])

  useEffect(() => {
    fetchStats().then(setStats).catch(() => undefined)
    fetchCategories().then(setCategories).catch(() => undefined)
    fetchTrendingTags().then(setTags).catch(() => undefined)
  }, [])

  const firstName = profile?.full_name.split(' ')[0] ?? 'time'

  return (
    <div className="animate-in space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 120% at 0% 0%, rgba(99,102,241,.16), transparent 60%), radial-gradient(60% 100% at 100% 100%, rgba(6,182,212,.12), transparent 60%)',
          }}
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-500">Fórum da equipe de dados</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Olá, {firstName}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Acompanhe as discussões em andamento, registre decisões técnicas e publique atualizações
            dos projetos da área.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/novo" className="btn btn-primary">
              <PenSquare size={16} /> Abrir um tópico
            </Link>
            <Link to="/chat" className="btn btn-outline">
              <MessageSquare size={16} /> Ir para o chat
            </Link>
          </div>
        </div>
      </section>

      {/* Estatísticas */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={MessageSquare} label="Tópicos" value={compact(stats?.total_threads ?? 0)} />
        <StatTile icon={TrendingUp} label="Respostas" value={compact(stats?.total_replies ?? 0)} tone="emerald" />
        <StatTile icon={Users} label="Membros" value={compact(stats?.total_members ?? 0)} tone="cyan" />
        <StatTile icon={Hash} label="Novos hoje" value={compact(stats?.threads_today ?? 0)} tone="amber" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ThreadFeed />

        <aside className="order-first space-y-4 xl:order-none">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-strong">Categorias</h2>
            <div className="space-y-1">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/c/${cat.slug}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-body transition hover:bg-[var(--surface-muted)] hover:text-strong"
                >
                  <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  <span className="truncate">{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-bold text-strong">Tags em alta</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(({ tag, count }) => (
                  <Link
                    key={tag}
                    to={`/busca?tag=${encodeURIComponent(tag)}`}
                    className="chip hover:border-brand-500/40 hover:text-brand-500"
                  >
                    #{tag}
                    <span className="text-[10px] opacity-60">{count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
