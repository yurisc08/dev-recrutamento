import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";

/**
 * Cliente com a service_role key: ignora RLS.
 * Todo filtro por usuario e feito explicitamente no codigo (owner_id),
 * nunca confiando em dados vindos do cliente.
 */
export function serviceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "atlas-ia-worker" } },
  });
}

/** Cliente com a anon key, usado apenas para validar o token do usuario. */
export function anonClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
