import type { Context, Next } from "hono";
import type { AuthUser, Env, Variables } from "../env";
import { bool } from "../env";
import { anonClient } from "./supabase";
import { unauthorized } from "./http";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * Le o header Authorization e resolve o usuario no Supabase Auth.
 *
 * Se REQUIRE_AUTH=false, requisicoes sem token seguem como anonimas
 * (user = null) e so enxergam documentos publicos.
 */
export async function authMiddleware(c: Ctx, next: Next): Promise<void> {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  let user: AuthUser | null = null;

  if (token) {
    const { data, error } = await anonClient(c.env).auth.getUser(token);
    if (error || !data.user) {
      throw unauthorized("Token invalido ou expirado.");
    }
    user = { id: data.user.id, email: data.user.email ?? null };
  }

  if (!user && bool(c.env.REQUIRE_AUTH, false)) {
    throw unauthorized();
  }

  c.set("user", user);
  await next();
}

/** Para rotas que nunca podem ser anonimas (ex.: escrever na base de conhecimento). */
export function requireUser(c: Ctx): AuthUser {
  const user = c.get("user");
  if (!user) {
    throw unauthorized("Esta operacao exige um usuario autenticado.");
  }
  return user;
}
