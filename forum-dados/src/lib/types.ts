export type UserRole =
  | 'analista_dados'
  | 'cientista_dados'
  | 'engenheiro_dados'
  | 'analista_bi'
  | 'produto'
  | 'gestor'

export const ROLE_LABELS: Record<UserRole, string> = {
  analista_dados: 'Analista de Dados',
  cientista_dados: 'Cientista de Dados',
  engenheiro_dados: 'Engenheiro de Dados',
  analista_bi: 'Analista de BI',
  produto: 'Produto',
  gestor: 'Gestão',
}

export interface Profile {
  id: string
  username: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  team: string | null
  bio: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string
  color: string
  position: number
  created_at: string
}

export interface Thread {
  id: string
  category_id: string
  author_id: string
  title: string
  content: string
  tags: string[]
  is_pinned: boolean
  is_locked: boolean
  view_count: number
  reply_count: number
  score: number
  last_activity_at: string
  created_at: string
  updated_at: string
  author?: Profile
  category?: Category
  my_vote?: number
}

export interface Reply {
  id: string
  thread_id: string
  author_id: string
  parent_id: string | null
  content: string
  is_solution: boolean
  score: number
  created_at: string
  updated_at: string
  author?: Profile
  my_vote?: number
}

export interface ChatChannel {
  id: string
  slug: string
  name: string
  description: string | null
  position: number
  created_at: string
}

export interface ChatMessage {
  id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

export interface Notification {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  thread_id: string | null
  message: string
  is_read: boolean
  created_at: string
}

export interface ForumStats {
  total_threads: number
  total_replies: number
  total_members: number
  threads_today: number
}
