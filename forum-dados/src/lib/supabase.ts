import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * `true` quando as variáveis de ambiente do Supabase foram configuradas.
 * A UI usa esta flag para mostrar um aviso amigável em vez de quebrar.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[DataHub] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não definidos. ' +
      'Copie .env.example para .env.local e preencha com as chaves do seu projeto.',
  )
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'datahub-auth',
    },
  },
)
