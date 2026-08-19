import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MessageSquare, Settings, SearchX, Users } from 'lucide-react'
import { fetchProfileByUsername, fetchThreads } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, Thread } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { ThreadCard } from '../components/ThreadCard'
import { EmptyState, PageLoader } from '../components/ui'
import { fullDate } from '../lib/format'

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { profile: me, user } = useAuth()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    fetchProfileByUsername(username)
      .then(async (found) => {
        setProfile(found)
        if (found) setThreads(await fetchThreads({ authorId: found.id, limit: 20 }, user?.id))
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [username, user?.id])

  if (loading) return <PageLoader />

  if (!profile) {
    return (
      <EmptyState
        icon={SearchX}
        title="Perfil não encontrado"
        description="Este usuário não existe ou mudou de nome."
        action={
          <Link to="/membros" className="btn btn-outline mt-2">
            <ArrowLeft size={16} /> Ver membros
          </Link>
        }
      />
    )
  }

  const isMe = me?.id === profile.id

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-5">
      <div className="card overflow-hidden">
        <div
          className="h-24"
          style={{
            background:
              'linear-gradient(120deg, rgba(99,102,241,.35), rgba(6,182,212,.25) 60%, transparent)',
          }}
        />
        <div className="-mt-12 px-5 pb-5 sm:px-6">
          <Avatar name={profile.full_name} seed={profile.id} url={profile.avatar_url} size="xl" ring />

          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold">{profile.full_name}</h1>
              <p className="text-sm text-muted">@{profile.username}</p>
            </div>
            {isMe && (
              <Link to="/configuracoes" className="btn btn-outline">
                <Settings size={15} /> Editar perfil
              </Link>
            )}
          </div>

          {profile.bio && <p className="mt-3 text-sm leading-relaxed text-body">{profile.bio}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-500">
              {ROLE_LABELS[profile.role]}
            </span>
            {profile.team && (
              <span className="chip">
                <Users size={11} /> {profile.team}
              </span>
            )}
            {profile.is_admin && (
              <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-500">Moderação</span>
            )}
            <span className="chip">
              <CalendarDays size={11} /> Desde {fullDate(profile.created_at).split(' às')[0]}
            </span>
          </div>
        </div>
      </div>

      <h2 className="px-1 text-sm font-bold text-strong">Tópicos criados</h2>

      {threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhum tópico ainda"
          description={isMe ? 'Compartilhe sua primeira ideia com o time.' : 'Esta pessoa ainda não publicou nada.'}
          action={isMe ? <Link to="/novo" className="btn btn-primary mt-2">Criar tópico</Link> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} />
          ))}
        </div>
      )}
    </div>
  )
}
