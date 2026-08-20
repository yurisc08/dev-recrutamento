import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Clock, MessageSquarePlus, Inbox } from 'lucide-react'
import type { Thread } from '../lib/types'
import { fetchThreads, type ThreadSort } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { ThreadCard } from './ThreadCard'
import { EmptyState, PageLoader, Spinner, Alert } from './ui'

const PAGE_SIZE = 15

const TABS: { id: ThreadSort; label: string; icon: typeof Clock }[] = [
  { id: 'recentes', label: 'Recentes', icon: Clock },
  { id: 'populares', label: 'Populares', icon: Flame },
  { id: 'sem_resposta', label: 'Sem resposta', icon: Inbox },
]

export function ThreadFeed({
  categoryId,
  showCategory = true,
}: {
  categoryId?: string
  showCategory?: boolean
}) {
  const { user } = useAuth()
  const [sort, setSort] = useState<ThreadSort>('recentes')
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      try {
        setError('')
        const rows = await fetchThreads({ categoryId, sort, limit: PAGE_SIZE, offset }, user?.id)
        setHasMore(rows.length === PAGE_SIZE)
        setThreads((prev) => (replace ? rows : [...prev, ...rows]))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar tópicos.')
      }
    },
    [categoryId, sort, user?.id],
  )

  useEffect(() => {
    setLoading(true)
    load(0, true).finally(() => setLoading(false))
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    await load(threads.length, false)
    setLoadingMore(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSort(id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${
              sort === id
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-muted hover:text-strong'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {loading ? (
        <PageLoader label="Carregando tópicos…" />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="Nenhum tópico publicado"
          description="Ainda não há discussões nesta seção. Crie o primeiro tópico para iniciar o registro."
          action={
            <Link to="/novo" className="btn btn-primary mt-2">
              <MessageSquarePlus size={16} /> Criar tópico
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} showCategory={showCategory} />
          ))}

          {hasMore && (
            <button onClick={loadMore} disabled={loadingMore} className="btn btn-outline w-full">
              {loadingMore ? <Spinner size={16} /> : null}
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
