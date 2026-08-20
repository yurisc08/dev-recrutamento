import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  PenSquare,
  Search,
  Settings,
  Sun,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import type { Category, Notification } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'
import { Avatar } from './Avatar'
import { CategoryIcon } from './CategoryIcon'
import { timeAgo } from '../lib/format'
import { Logo } from './Logo'

export function Layout() {
  const { profile, signOut, user } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [categories, setCategories] = useState<Category[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .order('position')
      .then(({ data }) => setCategories((data as Category[]) ?? []))
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true

    const load = () =>
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15)
        .then(({ data }) => active && setNotifications((data as Notification[]) ?? []))

    load()

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 15)),
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    setSidebarOpen(false)
    setNotifOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unread = notifications.filter((n) => !n.is_read).length

  async function openNotifications() {
    setNotifOpen((v) => !v)
    if (!notifOpen && unread > 0 && user) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (term) navigate(`/busca?q=${encodeURIComponent(term)}`)
  }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-brand-500/12 text-brand-500'
        : 'text-body hover:bg-[var(--surface-muted)] hover:text-strong'
    }`

  return (
    <div className="min-h-screen">
      {/* ---------- TOPBAR ---------- */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)' }}>
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <button
            className="btn btn-ghost -ml-2 px-2 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo />
            <span className="hidden text-base font-extrabold tracking-tight text-strong sm:block">
              Data<span className="text-brand-500">Hub</span>
            </span>
          </Link>

          <form onSubmit={submitSearch} className="relative ml-2 hidden max-w-md flex-1 md:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no fórum"
              className="input pl-9"
              aria-label="Buscar no fórum"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            <Link to="/busca" className="btn btn-ghost px-2 md:hidden" aria-label="Buscar">
              <Search size={18} />
            </Link>

            <button onClick={toggle} className="btn btn-ghost px-2" aria-label="Alternar tema">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative" ref={notifRef}>
              <button onClick={openNotifications} className="btn btn-ghost relative px-2" aria-label="Notificações">
                <Bell size={18} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="animate-in absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border shadow-2xl" style={{ backgroundColor: 'var(--surface-raised)' }}>
                  <div className="border-b px-4 py-2.5 text-sm font-semibold text-strong">Notificações</div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted">Nada por aqui ainda.</p>
                    ) : (
                      notifications.map((n) => (
                        <Link
                          key={n.id}
                          to={n.thread_id ? `/t/${n.thread_id}` : '/'}
                          className="block border-b px-4 py-3 text-sm transition last:border-0 hover:bg-[var(--surface-muted)]"
                        >
                          <p className="text-body">{n.message}</p>
                          <p className="mt-0.5 text-xs text-muted">{timeAgo(n.created_at)}</p>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link to="/novo" className="btn btn-primary ml-1 hidden sm:inline-flex">
              <PenSquare size={16} /> Novo tópico
            </Link>

            <div className="relative ml-1" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} aria-label="Menu do usuário">
                <Avatar
                  name={profile?.full_name ?? 'Usuário'}
                  seed={profile?.id ?? 'anon'}
                  url={profile?.avatar_url}
                  size="sm"
                  ring
                />
              </button>

              {menuOpen && profile && (
                <div className="animate-in absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border shadow-2xl" style={{ backgroundColor: 'var(--surface-raised)' }}>
                  <div className="border-b px-4 py-3">
                    <p className="truncate text-sm font-semibold text-strong">{profile.full_name}</p>
                    <p className="truncate text-xs text-muted">{ROLE_LABELS[profile.role]}</p>
                  </div>
                  <Link to={`/u/${profile.username}`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-body transition hover:bg-[var(--surface-muted)]">
                    <Users size={15} /> Meu perfil
                  </Link>
                  <Link to="/configuracoes" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-body transition hover:bg-[var(--surface-muted)]">
                    <Settings size={15} /> Configurações
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
                  >
                    <LogOut size={15} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] px-4 sm:px-6">
        {/* ---------- SIDEBAR ---------- */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r px-4 py-5 transition-transform lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:border-r-0 lg:px-0 lg:py-6 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ backgroundColor: sidebarOpen ? 'var(--surface)' : 'transparent' }}
        >
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <span className="font-extrabold text-strong">Menu</span>
            <button onClick={() => setSidebarOpen(false)} className="btn btn-ghost px-2">
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1 lg:pr-4">
            <NavLink to="/" end className={navLink}>
              <TrendingUp size={17} /> Feed
            </NavLink>
            <NavLink to="/chat" className={navLink}>
              <MessagesSquare size={17} /> Chat da equipe
            </NavLink>
            <NavLink to="/membros" className={navLink}>
              <Users size={17} /> Membros
            </NavLink>
          </nav>

          <p className="mb-2 mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
            Categorias
          </p>
          <nav className="space-y-0.5 lg:pr-4">
            {categories.map((cat) => (
              <NavLink key={cat.id} to={`/c/${cat.slug}`} className={navLink}>
                <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                <span className="truncate">{cat.name}</span>
              </NavLink>
            ))}
          </nav>

          <Link to="/novo" className="btn btn-primary mt-6 w-full sm:hidden">
            <PenSquare size={16} /> Novo tópico
          </Link>
        </aside>

        {/* ---------- CONTEÚDO ---------- */}
        <main className="min-w-0 flex-1 py-6 lg:pl-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
