import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from './ui'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Verificando sua sessão…" />
  if (!session) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />

  return <>{children}</>
}
