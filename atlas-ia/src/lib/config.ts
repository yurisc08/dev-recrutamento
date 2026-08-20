import type { Env } from "../env";

export interface ConfigIssue {
  variable: string;
  hint: string;
}

/**
 * Confere se as variaveis obrigatorias foram preenchidas.
 *
 * Sem isso o primeiro erro que aparece e um "internal error" generico do
 * Supabase, que nao diz o que esta faltando.
 */
export function configIssues(env: Env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (!env.SUPABASE_URL || env.SUPABASE_URL.includes("SEU-PROJETO")) {
    issues.push({
      variable: "SUPABASE_URL",
      hint: 'Preencha em wrangler.toml -> [vars] com a URL do seu projeto (Supabase > Settings > API).',
    });
  }

  if (!env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY === "SUA_ANON_KEY") {
    issues.push({
      variable: "SUPABASE_ANON_KEY",
      hint: "Preencha em wrangler.toml -> [vars] com a chave anon/public do projeto.",
    });
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    issues.push({
      variable: "SUPABASE_SERVICE_ROLE_KEY",
      hint: "Rode: wrangler secret put SUPABASE_SERVICE_ROLE_KEY (ou defina em .dev.vars).",
    });
  }

  if (!env.ANTHROPIC_API_KEY) {
    issues.push({
      variable: "ANTHROPIC_API_KEY",
      hint: "Rode: wrangler secret put ANTHROPIC_API_KEY (ou defina em .dev.vars).",
    });
  }

  return issues;
}
