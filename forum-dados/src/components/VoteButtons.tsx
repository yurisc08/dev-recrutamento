import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface VoteButtonsProps {
  target: 'thread' | 'reply'
  targetId: string
  score: number
  myVote: number
  layout?: 'vertical' | 'horizontal'
}

export function VoteButtons({ target, targetId, score, myVote, layout = 'vertical' }: VoteButtonsProps) {
  const { user } = useAuth()
  const [current, setCurrent] = useState(myVote)
  const [total, setTotal] = useState(score)
  const [busy, setBusy] = useState(false)

  const table = target === 'thread' ? 'thread_votes' : 'reply_votes'
  const column = target === 'thread' ? 'thread_id' : 'reply_id'

  async function vote(value: number) {
    if (!user || busy) return
    const next = current === value ? 0 : value
    const prevVote = current
    const prevTotal = total

    setBusy(true)
    setCurrent(next)
    setTotal(prevTotal - prevVote + next)

    const query =
      next === 0
        ? supabase.from(table).delete().eq(column, targetId).eq('user_id', user.id)
        : supabase.from(table).upsert(
            { [column]: targetId, user_id: user.id, value: next },
            { onConflict: `${column},user_id` },
          )

    const { error } = await query
    if (error) {
      setCurrent(prevVote)
      setTotal(prevTotal)
      console.error('[DataHub] voto não registrado:', error.message)
    }
    setBusy(false)
  }

  const wrapper =
    layout === 'vertical'
      ? 'flex flex-col items-center gap-0.5'
      : 'flex items-center gap-0.5 rounded-lg border px-1 py-0.5'

  const btn = 'rounded-md p-1 transition disabled:opacity-40'

  return (
    <div className={wrapper}>
      <button
        type="button"
        onClick={() => vote(1)}
        disabled={!user || busy}
        aria-label="Votar positivo"
        aria-pressed={current === 1}
        className={`${btn} ${current === 1 ? 'bg-emerald-500/15 text-emerald-500' : 'text-muted hover:bg-brand-500/10 hover:text-brand-500'}`}
      >
        <ChevronUp size={18} strokeWidth={2.5} />
      </button>
      <span
        className={`min-w-[1.5rem] text-center text-sm font-bold tabular-nums ${
          current === 1 ? 'text-emerald-500' : current === -1 ? 'text-rose-500' : 'text-strong'
        }`}
      >
        {total}
      </span>
      <button
        type="button"
        onClick={() => vote(-1)}
        disabled={!user || busy}
        aria-label="Votar negativo"
        aria-pressed={current === -1}
        className={`${btn} ${current === -1 ? 'bg-rose-500/15 text-rose-500' : 'text-muted hover:bg-rose-500/10 hover:text-rose-500'}`}
      >
        <ChevronDown size={18} strokeWidth={2.5} />
      </button>
    </div>
  )
}
