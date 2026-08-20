import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Lock,
  MessageSquare,
  Pin,
  Reply as ReplyIcon,
  SearchX,
  Send,
  Trash2,
  Unlock,
} from 'lucide-react'
import { createReply, fetchReplies, fetchThread, incrementViews } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Reply, Thread } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { CategoryIcon } from '../components/CategoryIcon'
import { RichText } from '../components/RichText'
import { VoteButtons } from '../components/VoteButtons'
import { Alert, EmptyState, PageLoader, Spinner } from '../components/ui'
import { compact, fullDate, timeAgo } from '../lib/format'

export function ThreadDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const [thread, setThread] = useState<Thread | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const viewCounted = useRef(false)

  const isAuthor = profile?.id === thread?.author_id
  const isAdmin = profile?.is_admin ?? false

  const reload = useCallback(async () => {
    if (!id) return
    const [t, r] = await Promise.all([fetchThread(id, user?.id), fetchReplies(id, user?.id)])
    setThread(t)
    setReplies(r)
  }, [id, user?.id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o tópico.'))
      .finally(() => setLoading(false))

    if (!viewCounted.current) {
      viewCounted.current = true
      incrementViews(id).catch(() => undefined)
    }
  }, [id, reload])

  // Novas respostas em tempo real
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`thread:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'replies', filter: `thread_id=eq.${id}` },
        () => {
          fetchReplies(id, user?.id).then(setReplies).catch(() => undefined)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, user?.id])

  const { roots, childrenOf } = useMemo(() => {
    const children = new Map<string, Reply[]>()
    const top: Reply[] = []
    for (const reply of replies) {
      if (reply.parent_id) {
        children.set(reply.parent_id, [...(children.get(reply.parent_id) ?? []), reply])
      } else {
        top.push(reply)
      }
    }
    return { roots: top, childrenOf: children }
  }, [replies])

  async function toggleFlag(field: 'is_pinned' | 'is_locked') {
    if (!thread) return
    const { error: err } = await supabase
      .from('threads')
      .update({ [field]: !thread[field] })
      .eq('id', thread.id)
    if (!err) setThread({ ...thread, [field]: !thread[field] })
  }

  async function removeThread() {
    if (!thread || !window.confirm('Excluir este tópico e todas as respostas?')) return
    const { error: err } = await supabase.from('threads').delete().eq('id', thread.id)
    if (err) setError(err.message)
    else navigate('/', { replace: true })
  }

  async function markSolution(reply: Reply) {
    const next = !reply.is_solution
    await supabase.from('replies').update({ is_solution: false }).eq('thread_id', reply.thread_id)
    if (next) await supabase.from('replies').update({ is_solution: true }).eq('id', reply.id)
    await reload()
  }

  if (loading) return <PageLoader />

  if (!thread) {
    return (
      <EmptyState
        icon={SearchX}
        title="Tópico não encontrado"
        description="Ele pode ter sido removido pelo autor ou o link está incorreto."
        action={
          <Link to="/" className="btn btn-outline mt-2">
            <ArrowLeft size={16} /> Voltar ao feed
          </Link>
        }
      />
    )
  }

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/" className="link-muted inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> Feed
        </Link>
        {thread.category && (
          <>
            <span className="text-muted">/</span>
            <Link
              to={`/c/${thread.category.slug}`}
              className="inline-flex items-center gap-1.5 font-medium text-muted transition hover:text-brand-500"
            >
              <CategoryIcon icon={thread.category.icon} color={thread.category.color} size="sm" />
              {thread.category.name}
            </Link>
          </>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Post principal */}
      <article className="card p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {thread.is_pinned && (
            <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-500">
              <Pin size={11} /> Fixado
            </span>
          )}
          {thread.is_locked && (
            <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-500">
              <Lock size={11} /> Fechado para respostas
            </span>
          )}
        </div>

        <h1 className="text-2xl font-extrabold leading-snug">{thread.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-b pb-4">
          {thread.author && (
            <Link to={`/u/${thread.author.username}`} className="flex items-center gap-2.5">
              <Avatar
                name={thread.author.full_name}
                seed={thread.author.id}
                url={thread.author.avatar_url}
                size="md"
              />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-strong hover:text-brand-500">
                  {thread.author.full_name}
                </p>
                <p className="text-xs text-muted">{ROLE_LABELS[thread.author.role]}</p>
              </div>
            </Link>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span title={fullDate(thread.created_at)}>{timeAgo(thread.created_at)}</span>
            <span className="flex items-center gap-1">
              <Eye size={13} /> {compact(thread.view_count)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={13} /> {compact(thread.reply_count)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-4">
          <VoteButtons
            target="thread"
            targetId={thread.id}
            score={thread.score}
            myVote={thread.my_vote ?? 0}
          />
          <div className="min-w-0 flex-1">
            <RichText content={thread.content} />

            {thread.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {thread.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/busca?tag=${encodeURIComponent(tag)}`}
                    className="chip hover:border-brand-500/40 hover:text-brand-500"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {(isAuthor || isAdmin) && (
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            {isAdmin && (
              <button onClick={() => toggleFlag('is_pinned')} className="btn btn-outline text-xs">
                <Pin size={14} /> {thread.is_pinned ? 'Desafixar' : 'Fixar'}
              </button>
            )}
            <button onClick={() => toggleFlag('is_locked')} className="btn btn-outline text-xs">
              {thread.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
              {thread.is_locked ? 'Reabrir' : 'Fechar'}
            </button>
            <button
              onClick={removeThread}
              className="btn btn-outline text-xs text-rose-500 hover:border-rose-500/50"
            >
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        )}
      </article>

      {/* Respostas */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-strong">
          {thread.reply_count} {thread.reply_count === 1 ? 'resposta' : 'respostas'}
        </h2>
      </div>

      <div className="space-y-3">
        {roots.map((reply) => (
          <ReplyItem
            key={reply.id}
            reply={reply}
            replies={childrenOf.get(reply.id) ?? []}
            threadId={thread.id}
            locked={thread.is_locked}
            canMarkSolution={isAuthor}
            onSolution={markSolution}
            onChanged={reload}
          />
        ))}

        {roots.length === 0 && (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted">
            Este tópico ainda não recebeu respostas.
          </p>
        )}
      </div>

      {/* Composer */}
      {thread.is_locked ? (
        <div className="card flex items-center gap-2.5 p-4 text-sm text-muted">
          <Lock size={16} className="text-rose-500" />
          Este tópico está fechado para novas respostas.
        </div>
      ) : (
        <ReplyComposer threadId={thread.id} onSent={reload} />
      )}
    </div>
  )
}

function ReplyItem({
  reply,
  replies,
  threadId,
  locked,
  canMarkSolution,
  onSolution,
  onChanged,
}: {
  reply: Reply
  replies: Reply[]
  threadId: string
  locked: boolean
  canMarkSolution: boolean
  onSolution: (reply: Reply) => void
  onChanged: () => Promise<void>
}) {
  const { profile } = useAuth()
  const [replying, setReplying] = useState(false)
  const isOwner = profile?.id === reply.author_id

  async function remove() {
    if (!window.confirm('Excluir esta resposta?')) return
    await supabase.from('replies').delete().eq('id', reply.id)
    await onChanged()
  }

  return (
    <div>
      <article
        className={`card p-4 ${reply.is_solution ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : ''}`}
      >
        {reply.is_solution && (
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-emerald-500">
            <CheckCircle2 size={14} /> Resposta marcada como solução
          </p>
        )}

        <div className="flex gap-3.5">
          <VoteButtons target="reply" targetId={reply.id} score={reply.score} myVote={reply.my_vote ?? 0} />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {reply.author && (
                <Link to={`/u/${reply.author.username}`} className="flex items-center gap-2">
                  <Avatar
                    name={reply.author.full_name}
                    seed={reply.author.id}
                    url={reply.author.avatar_url}
                    size="xs"
                  />
                  <span className="text-sm font-semibold text-strong hover:text-brand-500">
                    {reply.author.full_name}
                  </span>
                </Link>
              )}
              <span className="text-xs text-muted" title={fullDate(reply.created_at)}>
                {timeAgo(reply.created_at)}
              </span>
            </div>

            <RichText content={reply.content} />

            <div className="mt-3 flex flex-wrap items-center gap-1">
              {!locked && (
                <button
                  onClick={() => setReplying((v) => !v)}
                  className="btn btn-ghost px-2 py-1 text-xs"
                >
                  <ReplyIcon size={13} /> Responder
                </button>
              )}
              {canMarkSolution && (
                <button
                  onClick={() => onSolution(reply)}
                  className={`btn btn-ghost px-2 py-1 text-xs ${reply.is_solution ? 'text-emerald-500' : ''}`}
                >
                  <CheckCircle2 size={13} /> {reply.is_solution ? 'Remover solução' : 'Marcar solução'}
                </button>
              )}
              {isOwner && (
                <button onClick={remove} className="btn btn-ghost px-2 py-1 text-xs text-rose-500">
                  <Trash2 size={13} /> Excluir
                </button>
              )}
            </div>

            {replying && (
              <div className="mt-3">
                <ReplyComposer
                  threadId={threadId}
                  parentId={reply.id}
                  compact
                  autoFocus
                  onSent={async () => {
                    setReplying(false)
                    await onChanged()
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </article>

      {replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 border-brand-500/20 pl-4 sm:pl-6">
          {replies.map((child) => (
            <article key={child.id} className="card p-3.5">
              <div className="flex gap-3">
                <VoteButtons
                  target="reply"
                  targetId={child.id}
                  score={child.score}
                  myVote={child.my_vote ?? 0}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {child.author && (
                      <Link to={`/u/${child.author.username}`} className="flex items-center gap-2">
                        <Avatar
                          name={child.author.full_name}
                          seed={child.author.id}
                          url={child.author.avatar_url}
                          size="xs"
                        />
                        <span className="text-sm font-semibold text-strong hover:text-brand-500">
                          {child.author.full_name}
                        </span>
                      </Link>
                    )}
                    <span className="text-xs text-muted">{timeAgo(child.created_at)}</span>
                  </div>
                  <RichText content={child.content} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function ReplyComposer({
  threadId,
  parentId,
  onSent,
  compact: isCompact = false,
  autoFocus = false,
}: {
  threadId: string
  parentId?: string
  onSent: () => void | Promise<void>
  compact?: boolean
  autoFocus?: boolean
}) {
  const { profile } = useAuth()
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!profile || !content.trim()) return

    setBusy(true)
    setError('')
    try {
      await createReply({ threadId, authorId: profile.id, content, parentId })
      setContent('')
      await onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar a resposta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={isCompact ? '' : 'card p-4 sm:p-5'}>
      {!isCompact && <h3 className="mb-3 text-sm font-bold text-strong">Sua resposta</h3>}
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="flex gap-3">
        {!isCompact && profile && (
          <Avatar name={profile.full_name} seed={profile.id} url={profile.avatar_url} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={isCompact ? 3 : 5}
            autoFocus={autoFocus}
            placeholder="Escreva sua resposta. Use ``` para blocos de código."
            className="input resize-y text-[14px]"
          />
          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-xs text-muted">Formatação com markdown básico</p>
            <button type="submit" disabled={busy || !content.trim()} className="btn btn-primary">
              {busy ? <Spinner size={15} /> : <Send size={15} />}
              {busy ? 'Enviando…' : 'Responder'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
