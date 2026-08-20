import { Link } from 'react-router-dom'
import { Eye, Lock, MessageSquare, Pin } from 'lucide-react'
import type { Thread } from '../lib/types'
import { Avatar } from './Avatar'
import { CategoryIcon } from './CategoryIcon'
import { compact, plainExcerpt, timeAgo } from '../lib/format'
import { VoteButtons } from './VoteButtons'

export function ThreadCard({ thread, showCategory = true }: { thread: Thread; showCategory?: boolean }) {
  const author = thread.author

  return (
    <article className="card group p-4 transition hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-900/5">
      <div className="flex gap-4">
        <div className="hidden sm:block">
          <VoteButtons
            target="thread"
            targetId={thread.id}
            score={thread.score}
            myVote={thread.my_vote ?? 0}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {thread.is_pinned && (
              <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-500">
                <Pin size={11} /> Fixado
              </span>
            )}
            {thread.is_locked && (
              <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-500">
                <Lock size={11} /> Fechado
              </span>
            )}
            {showCategory && thread.category && (
              <Link
                to={`/c/${thread.category.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-brand-500"
              >
                <CategoryIcon icon={thread.category.icon} color={thread.category.color} size="sm" />
                {thread.category.name}
              </Link>
            )}
          </div>

          <h3 className="text-[15px] font-semibold leading-snug text-strong transition group-hover:text-brand-500">
            <Link to={`/t/${thread.id}`} className="line-clamp-2">
              {thread.title}
            </Link>
          </h3>

          <p className="mt-1 line-clamp-2 text-sm text-muted">{plainExcerpt(thread.content)}</p>

          {thread.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {thread.tags.slice(0, 5).map((tag) => (
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

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            {author && (
              <Link to={`/u/${author.username}`} className="flex items-center gap-1.5 hover:text-brand-500">
                <Avatar name={author.full_name} seed={author.id} url={author.avatar_url} size="xs" />
                <span className="font-medium">{author.full_name}</span>
              </Link>
            )}
            <span>{timeAgo(thread.last_activity_at)}</span>
            <span className="flex items-center gap-1">
              <MessageSquare size={13} /> {compact(thread.reply_count)}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={13} /> {compact(thread.view_count)}
            </span>
            <span className="sm:hidden font-semibold text-strong">{thread.score} pts</span>
          </div>
        </div>
      </div>
    </article>
  )
}
