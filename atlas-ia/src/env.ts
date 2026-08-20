export interface Env {
  /** Workers AI — usado para gerar embeddings. */
  AI: Ai;
  /** Arquivos estaticos de ./public. */
  ASSETS: Fetcher;
  /** Rate limiting nativo da Cloudflare (opcional). */
  RATE_LIMITER?: RateLimit;

  // Segredos (wrangler secret put)
  ANTHROPIC_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Variaveis (wrangler.toml -> [vars])
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CLAUDE_MODEL?: string;
  CLAUDE_EFFORT?: string;
  EMBEDDING_MODEL?: string;
  ASSISTANT_NAME?: string;
  ASSISTANT_PERSONA?: string;
  REQUIRE_AUTH?: string;
  RAG_TOP_K?: string;
  RAG_MIN_SIMILARITY?: string;
  HISTORY_TURNS?: string;
  ALLOWED_ORIGINS?: string;
}

/** Usuario autenticado, quando existe. Em modo anonimo, `null`. */
export interface AuthUser {
  id: string;
  email: string | null;
}

export type Variables = {
  user: AuthUser | null;
};

export function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}
