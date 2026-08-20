import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hash, Send, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { ChatChannel, ChatMessage, Profile } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { Alert, PageLoader, Spinner } from '../components/ui'
import { chatDayLabel, chatTime, dayKey } from '../lib/format'
import { RichText } from '../components/RichText'

const MESSAGE_SELECT = '*, author:profiles(*)'
const PAGE = 60

export function Chat() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [online, setOnline] = useState<{ id: string; name: string }[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const profileCache = useRef(new Map<string, Profile>())

  const active = useMemo(
    () => channels.find((c) => c.slug === slug) ?? channels[0],
    [channels, slug],
  )

  useEffect(() => {
    supabase
      .from('chat_channels')
      .select('*')
      .order('position')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setChannels((data as ChatChannel[]) ?? [])
        setLoading(false)
      })
  }, [])

  // Histórico do canal
  useEffect(() => {
    if (!active) return
    let alive = true

    supabase
      .from('chat_messages')
      .select(MESSAGE_SELECT)
      .eq('channel_id', active.id)
      .order('created_at', { ascending: false })
      .limit(PAGE)
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message)
        const rows = ((data as ChatMessage[]) ?? []).reverse()
        for (const msg of rows) if (msg.author) profileCache.current.set(msg.author.id, msg.author)
        setMessages(rows)
      })

    return () => {
      alive = false
    }
  }, [active])

  // Tempo real + presença
  useEffect(() => {
    if (!active || !user || !profile) return

    const channel = supabase
      .channel(`chat:${active.id}`, { config: { presence: { key: user.id } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${active.id}` },
        async (payload) => {
          const incoming = payload.new as ChatMessage
          let author = profileCache.current.get(incoming.author_id)
          if (!author) {
            const { data } = await supabase.from('profiles').select('*').eq('id', incoming.author_id).maybeSingle()
            if (data) {
              author = data as Profile
              profileCache.current.set(author.id, author)
            }
          }
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, { ...incoming, author }],
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessage).id)),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string }>()
        setOnline(
          Object.entries(state).map(([id, metas]) => ({
            id,
            name: metas[0]?.name ?? 'Membro',
          })),
        )
      })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: profile.full_name })
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [active, user, profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const content = draft.trim()
      if (!content || !profile || !active || sending) return

      setSending(true)
      setDraft('')
      const { error: err } = await supabase.from('chat_messages').insert({
        channel_id: active.id,
        author_id: profile.id,
        content,
      })
      if (err) {
        setError(err.message)
        setDraft(content)
      }
      setSending(false)
    },
    [draft, profile, active, sending],
  )

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(event as unknown as React.FormEvent)
    }
  }

  if (loading) return <PageLoader label="Abrindo o chat…" />

  const grouped = groupByDay(messages)

  return (
    <div className="animate-in flex h-[calc(100vh-8rem)] gap-4">
      {/* Canais */}
      <aside className="hidden w-56 shrink-0 flex-col md:flex">
        <div className="card flex min-h-0 flex-1 flex-col p-3">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">Canais</p>
          <div className="space-y-0.5 overflow-y-auto">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => navigate(`/chat/${channel.slug}`)}
                className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${
                  active?.id === channel.id
                    ? 'bg-brand-500/12 text-brand-500'
                    : 'text-body hover:bg-[var(--surface-muted)] hover:text-strong'
                }`}
              >
                <Hash size={14} className="opacity-60" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 border-t pt-3">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
              <Users size={12} /> Online — {online.length}
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {online.map((member) => (
                <div key={member.id} className="flex items-center gap-2 px-1 py-0.5">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="truncate text-xs text-body">{member.name}</span>
                </div>
              ))}
              {online.length === 0 && <p className="px-1 text-xs text-muted">Nenhum membro conectado.</p>}
            </div>
          </div>
        </div>
      </aside>

      {/* Conversa */}
      <section className="card flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <Hash size={16} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold">{active?.name ?? 'chat'}</h1>
            {active?.description && <p className="truncate text-xs text-muted">{active.description}</p>}
          </div>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {online.length} online
          </span>
        </header>

        {/* Seletor de canal no mobile */}
        <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 md:hidden no-scrollbar">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => navigate(`/chat/${channel.slug}`)}
              className={`chip whitespace-nowrap ${
                active?.id === channel.id ? 'border-brand-500/40 bg-brand-500/10 text-brand-500' : ''
              }`}
            >
              #{channel.name}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
                <Hash size={22} />
              </span>
              <p className="text-sm font-semibold text-strong">Início de #{active?.name}</p>
              <p className="max-w-xs text-xs text-muted">
                Nenhuma mensagem neste canal até o momento.
              </p>
            </div>
          )}

          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span className="chip">{chatDayLabel(items[0].created_at)}</span>
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>

              {items.map((message, index) => {
                const previous = items[index - 1]
                const grouped2 =
                  previous &&
                  previous.author_id === message.author_id &&
                  new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60_000

                return (
                  <div
                    key={message.id}
                    className={`group flex gap-3 rounded-lg px-2 py-1 transition hover:bg-[var(--surface-muted)] ${
                      grouped2 ? '' : 'mt-3'
                    }`}
                  >
                    <div className="w-9 shrink-0">
                      {!grouped2 && message.author && (
                        <Avatar
                          name={message.author.full_name}
                          seed={message.author.id}
                          url={message.author.avatar_url}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped2 && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-strong">
                            {message.author?.full_name ?? 'Membro'}
                          </span>
                          <span className="text-[11px] text-muted">{chatTime(message.created_at)}</span>
                        </div>
                      )}
                      <RichText content={message.content} className="text-sm" />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              placeholder={`Mensagem em #${active?.name ?? 'geral'} — Enter envia, Shift+Enter quebra linha`}
              className="input max-h-40 resize-none"
            />
            <button type="submit" disabled={!draft.trim() || sending} className="btn btn-primary h-[42px]">
              {sending ? <Spinner size={16} /> : <Send size={16} />}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function groupByDay(messages: ChatMessage[]): [string, ChatMessage[]][] {
  const map = new Map<string, ChatMessage[]>()
  for (const message of messages) {
    const key = dayKey(message.created_at)
    map.set(key, [...(map.get(key) ?? []), message])
  }
  return [...map.entries()]
}
