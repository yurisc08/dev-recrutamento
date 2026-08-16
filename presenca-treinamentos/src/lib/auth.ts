import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AuthUser, Env, Variables } from '../types';
import { base64UrlDecodeToString, base64UrlEncode, hmacSign, timingSafeEqual } from './crypto';

const COOKIE_NAME = 'presenca_sess';
const SESSION_TTL_HOURS = 12;

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export async function issueSession(c: AppContext, user: AuthUser): Promise<void> {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
  });
  const body = base64UrlEncode(payload);
  const token = `${body}.${await hmacSign(c.env.SESSION_SECRET, body)}`;

  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export function clearSession(c: AppContext): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export async function readSession(c: AppContext): Promise<AuthUser | null> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  if (!timingSafeEqual(await hmacSign(c.env.SESSION_SECRET, body), signature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeToString(body));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

/** Exige sessao valida no painel. */
export async function requireAuth(c: AppContext, next: Next) {
  const user = await readSession(c);
  if (!user) return c.json({ error: 'nao_autenticado' }, 401);
  c.set('user', user);
  await next();
}

/** Bloqueia escrita para usuarios com perfil somente leitura. */
export async function requireWrite(c: AppContext, next: Next) {
  const user = c.get('user');
  const method = c.req.method;
  if (user?.role === 'leitura' && method !== 'GET' && method !== 'HEAD') {
    return c.json({ error: 'sem_permissao', message: 'Perfil somente leitura.' }, 403);
  }
  await next();
}
