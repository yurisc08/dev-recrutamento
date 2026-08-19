import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout } from './AuthLayout'
import { Alert, Spinner } from '../components/ui'

export function Login() {
  const { signIn, session, loading, resetPassword, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await signIn(email, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de recuperação.')
      return
    }
    setError('')
    try {
      await resetPassword(email)
      setNotice('Enviamos um link de recuperação para o seu e-mail.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar o e-mail.')
    }
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre com sua conta corporativa para acessar o fórum.">
      {!configured && (
        <div className="mb-5">
          <Alert kind="info">
            Configure <code className="font-mono">VITE_SUPABASE_URL</code> e{' '}
            <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> em <code className="font-mono">.env.local</code>{' '}
            para habilitar o login.
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-strong">
            E-mail
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              className="input pl-9"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-strong">
              Senha
            </label>
            <button type="button" onClick={forgot} className="text-xs font-medium text-brand-500 hover:underline">
              Esqueci minha senha
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
        </div>

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? <Spinner size={16} /> : <LogIn size={16} />}
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="font-semibold text-brand-500 hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
