import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LogOut, Save } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_LABELS, type UserRole } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { Alert, PageLoader, Spinner } from '../components/ui'

export function SettingsPage() {
  const { profile, updateProfile, signOut } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [team, setTeam] = useState(profile?.team ?? '')
  const [role, setRole] = useState<UserRole>(profile?.role ?? 'analista_dados')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!profile) return <PageLoader />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      return setError('Usuário deve ter 3–30 caracteres (letras minúsculas, números, _ e .).')
    }

    setBusy(true)
    try {
      await updateProfile({
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        team: team.trim() || null,
        role,
        avatar_url: avatarUrl.trim() || null,
      })
      setNotice('Perfil atualizado com sucesso.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar.'
      setError(message.includes('duplicate') ? 'Este nome de usuário já está em uso.' : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-in mx-auto max-w-2xl">
      <Link to={`/u/${profile.username}`} className="link-muted mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft size={15} /> Voltar ao perfil
      </Link>

      <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6">
        <div>
          <h1 className="text-xl font-extrabold">Configurações da conta</h1>
          <p className="mt-1 text-sm text-muted">Como o time te enxerga no fórum e no chat.</p>
        </div>

        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <div className="flex items-center gap-4 rounded-xl border p-4">
          <Avatar name={fullName || profile.full_name} seed={profile.id} url={avatarUrl || null} size="lg" />
          <div className="min-w-0 flex-1">
            <label htmlFor="avatar" className="mb-1.5 block text-sm font-medium text-strong">
              URL do avatar <span className="text-muted">(opcional)</span>
            </label>
            <input
              id="avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…/foto.png"
              className="input"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-strong">
              Nome completo
            </label>
            <input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="user" className="mb-1.5 block text-sm font-medium text-strong">
              Usuário
            </label>
            <input
              id="user"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              className="input"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="role-settings" className="mb-1.5 block text-sm font-medium text-strong">
              Função
            </label>
            <select
              id="role-settings"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="input"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="team-settings" className="mb-1.5 block text-sm font-medium text-strong">
              Squad / Time
            </label>
            <input
              id="team-settings"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="Growth Analytics"
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-strong">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Trabalho com modelagem dimensional e experimentação. Pergunte-me sobre dbt."
            className="input resize-y"
          />
          <p className="mt-1 text-right text-xs text-muted">{bio.length}/280</p>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <button type="button" onClick={() => signOut()} className="btn btn-ghost text-rose-500">
            <LogOut size={15} /> Sair da conta
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? <Spinner size={15} /> : <Save size={15} />}
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
