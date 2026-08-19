import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, SearchX, X } from 'lucide-react'
import { searchThreads, fetchTrendingTags } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { Thread } from '../lib/types'
import { ThreadCard } from '../components/ThreadCard'
import { EmptyState, PageLoader } from '../components/ui'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()

  const term = params.get('q') ?? ''
  const tag = params.get('tag')

  const [input, setInput] = useState(term)
  const [results, setResults] = useState<Thread[]>([])
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTrendingTags(16).then(setTags).catch(() => undefined)
  }, [])

  const run = useCallback(async () => {
    if (!term && !tag) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      setResults(await searchThreads(term, tag, user?.id))
    } finally {
      setLoading(false)
    }
  }, [term, tag, user?.id])

  useEffect(() => {
    setInput(term)
    run()
  }, [term, run])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams()
    if (input.trim()) next.set('q', input.trim())
    if (tag) next.set('tag', tag)
    setParams(next)
  }

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Buscar no fórum</h1>
        <p className="mt-1 text-sm text-muted">
          Procure por título, conteúdo ou filtre por tag do stack.
        </p>
      </div>

      <form onSubmit={submit} className="relative">
        <SearchIcon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex.: receita recorrente, incremental dbt, retenção…"
          className="input py-3 pl-11 pr-24 text-[15px]"
          autoFocus
        />
        <button type="submit" className="btn btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 py-1.5">
          Buscar
        </button>
      </form>

      {tag && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Filtrando por</span>
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-500">
            #{tag}
            <button
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('tag')
                setParams(next)
              }}
              aria-label="Remover filtro"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}

      {!term && !tag && tags.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-strong">Explorar por tag</h2>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((item) => (
              <Link
                key={item.tag}
                to={`/busca?tag=${encodeURIComponent(item.tag)}`}
                className="chip hover:border-brand-500/40 hover:text-brand-500"
              >
                #{item.tag}
                <span className="text-[10px] opacity-60">{item.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader label="Procurando…" />
      ) : (term || tag) && results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum resultado"
          description="Tente outras palavras-chave ou remova o filtro de tag."
        />
      ) : results.length > 0 ? (
        <>
          <p className="px-1 text-sm text-muted">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </p>
          <div className="space-y-3">
            {results.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
