import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout } from './AuthLayout'
import { Alert, Spinner } from '../components/ui'
import { ROLE_LABELS, type UserRole } from '../lib/types'

export function Register() {
  const { signUp, session, loading } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState('')
  const [role, setRole] = useState<UserRole>('analista_dados')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  const strength = passwordStrength(password)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (password !== confirm) return setError('As senhas não conferem.')
    if (password.length < 8) return setError('Use uma senha com pelo menos 8 caracteres.')
    if (!/^[a-z0-9_]{3,30}$/.test(username.toLowerCase()))
      return setError('Usuário deve ter 3–30 caracteres (letras, números e _).')

    setBusy(true)
    try {
      const { needsConfirmation } = await signUp({ email, password, fullName, username, role, team })
      if (needsConfirmation) {
        setNotice('Conta criada! Confirme o e-mail que enviamos para ativar seu acesso.')
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Cadastre-se para participar das discussões do time de dados.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-strong">
              Nome completo
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome completo"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-strong">
              Usuário
            </label>
            <input
              id="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="nome.sobrenome"
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email-signup" className="mb-1.5 block text-sm font-medium text-strong">
            E-mail corporativo
          </label>
          <input
            id="email-signup"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            className="input"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-strong">
              Função
            </label>
            <select
              id="role"
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
            <label htmlFor="team" className="mb-1.5 block text-sm font-medium text-strong">
              Squad / Time <span className="text-muted">(opcional)</span>
            </label>
            <input
              id="team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="Nome do seu time"
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password-signup" className="mb-1.5 block text-sm font-medium text-strong">
            Senha
          </label>
          <div className="relative">
            <input
              id="password-signup"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition hover:text-brand-500"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                <div
                  className={`h-full rounded-full transition-all ${strength.color}`}
                  style={{ width: `${strength.percent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted">{strength.label}</span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-strong">
            Confirmar senha
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a senha"
            className="input"
          />
        </div>

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? <Spinner size={16} /> : <UserPlus size={16} />}
          {busy ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-semibold text-brand-500 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}

function passwordStrength(password: string) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { percent: 33, label: 'Fraca', color: 'bg-rose-500' }
  if (score <= 3) return { percent: 66, label: 'Média', color: 'bg-amber-500' }
  return { percent: 100, label: 'Forte', color: 'bg-emerald-500' }
}
