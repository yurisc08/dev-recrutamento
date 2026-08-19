import { supabase } from './supabase'
import type { Category, Profile, Reply, Thread } from './types'

const THREAD_SELECT = '*, author:profiles(*), category:categories(*)'
const REPLY_SELECT = '*, author:profiles(*)'

export type ThreadSort = 'recentes' | 'populares' | 'sem_resposta'

interface ThreadQuery {
  categoryId?: string
  authorId?: string
  sort?: ThreadSort
  limit?: number
  offset?: number
}

/** Anexa o voto do usuário logado a uma lista de tópicos/respostas. */
async function attachVotes<T extends { id: string; my_vote?: number }>(
  rows: T[],
  table: 'thread_votes' | 'reply_votes',
  column: 'thread_id' | 'reply_id',
  userId?: string,
): Promise<T[]> {
  if (!userId || rows.length === 0) return rows

  const { data } = await supabase
    .from(table)
    .select(`${column}, value`)
    .eq('user_id', userId)
    .in(column, rows.map((r) => r.id))

  const map = new Map<string, number>()
  for (const vote of (data ?? []) as Record<string, string | number>[]) {
    map.set(String(vote[column]), Number(vote.value))
  }

  return rows.map((row) => ({ ...row, my_vote: map.get(row.id) ?? 0 }))
}

export async function fetchThreads(
  { categoryId, authorId, sort = 'recentes', limit = 20, offset = 0 }: ThreadQuery,
  userId?: string,
): Promise<Thread[]> {
  let query = supabase.from('threads').select(THREAD_SELECT)

  if (categoryId) query = query.eq('category_id', categoryId)
  if (authorId) query = query.eq('author_id', authorId)
  if (sort === 'sem_resposta') query = query.eq('reply_count', 0)

  query =
    sort === 'populares'
      ? query.order('is_pinned', { ascending: false }).order('score', { ascending: false }).order('view_count', { ascending: false })
      : query.order('is_pinned', { ascending: false }).order('last_activity_at', { ascending: false })

  const { data, error } = await query.range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)

  return attachVotes((data ?? []) as Thread[], 'thread_votes', 'thread_id', userId)
}

export async function fetchThread(id: string, userId?: string): Promise<Thread | null> {
  const { data, error } = await supabase.from('threads').select(THREAD_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const [thread] = await attachVotes([data as Thread], 'thread_votes', 'thread_id', userId)
  return thread
}

export async function fetchReplies(threadId: string, userId?: string): Promise<Reply[]> {
  const { data, error } = await supabase
    .from('replies')
    .select(REPLY_SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return attachVotes((data ?? []) as Reply[], 'reply_votes', 'reply_id', userId)
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('position')
  if (error) throw new Error(error.message)
  return (data ?? []) as Category[]
}

export async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase.from('categories').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Category | null) ?? null
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Profile | null) ?? null
}

export async function searchThreads(term: string, tag: string | null, userId?: string): Promise<Thread[]> {
  let query = supabase.from('threads').select(THREAD_SELECT)

  if (tag) query = query.contains('tags', [tag])
  if (term) query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`)

  const { data, error } = await query.order('last_activity_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)

  return attachVotes((data ?? []) as Thread[], 'thread_votes', 'thread_id', userId)
}

export async function createThread(input: {
  categoryId: string
  authorId: string
  title: string
  content: string
  tags: string[]
}): Promise<string> {
  const { data, error } = await supabase
    .from('threads')
    .insert({
      category_id: input.categoryId,
      author_id: input.authorId,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function createReply(input: {
  threadId: string
  authorId: string
  content: string
  parentId?: string | null
}): Promise<void> {
  const { error } = await supabase.from('replies').insert({
    thread_id: input.threadId,
    author_id: input.authorId,
    content: input.content.trim(),
    parent_id: input.parentId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function incrementViews(threadId: string): Promise<void> {
  await supabase.rpc('increment_thread_views', { thread_uuid: threadId })
}

export async function fetchStats() {
  const { data, error } = await supabase.rpc('forum_stats')
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return (row ?? { total_threads: 0, total_replies: 0, total_members: 0, threads_today: 0 }) as {
    total_threads: number
    total_replies: number
    total_members: number
    threads_today: number
  }
}

export async function fetchTopContributors(limit = 5): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

export async function fetchTrendingTags(limit = 12): Promise<{ tag: string; count: number }[]> {
  const { data, error } = await supabase
    .from('threads')
    .select('tags')
    .order('last_activity_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { tags: string[] }[]) {
    for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
