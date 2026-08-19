import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Profile, UserRole } from '../lib/types'

interface SignUpPayload {
  email: string
  password: string
  fullName: string
  username: string
  role: UserRole
  team?: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (payload: SignUpPayload) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[DataHub] falha ao carregar perfil:', error.message)
      return null
    }
    return (data as Profile | null) ?? null
  }, [])

  useEffect(() => {
    mounted.current = true

    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted.current) return
      setSession(data.session)
      if (data.session?.user) setProfile(await loadProfile(data.session.user.id))
      if (mounted.current) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted.current) return
      setSession(nextSession)
      if (nextSession?.user) {
        setProfile(await loadProfile(nextSession.user.id))
      } else {
        setProfile(null)
      }
      if (mounted.current) setLoading(false)
    })

    return () => {
      mounted.current = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new Error(translateAuthError(error.message))
  }, [])

  const signUp = useCallback(async (payload: SignUpPayload) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      options: {
        data: {
          full_name: payload.fullName.trim(),
          username: payload.username.trim().toLowerCase(),
          role: payload.role,
          team: payload.team?.trim() ?? '',
        },
      },
    })
    if (error) throw new Error(translateAuthError(error.message))
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/entrar`,
    })
    if (error) throw new Error(translateAuthError(error.message))
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    setProfile(await loadProfile(session.user.id))
  }, [session, loadProfile])

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!session?.user) throw new Error('Você precisa estar autenticado.')
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', session.user.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      setProfile(data as Profile)
    },
    [session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updateProfile,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signUp, signOut, resetPassword, updateProfile, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou senha inválidos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    'User already registered': 'Este e-mail já possui cadastro.',
    'Password should be at least 6 characters': 'A senha precisa ter no mínimo 6 caracteres.',
    'Signup requires a valid password': 'Informe uma senha válida.',
    'Unable to validate email address: invalid format': 'Formato de e-mail inválido.',
    'For security purposes, you can only request this after 60 seconds':
      'Aguarde 60 segundos antes de tentar novamente.',
  }
  return map[message] ?? message
}
