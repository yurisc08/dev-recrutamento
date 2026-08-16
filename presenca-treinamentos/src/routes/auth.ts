import { Hono } from 'hono';
import type { AuthUser, Env, Variables } from '../types';
import { clearSession, issueSession, readSession } from '../lib/auth';
import { hashPassword, randomId, verifyPassword } from '../lib/crypto';
import { readJson, requireString } from '../lib/http';
import { nowIso } from '../lib/time';

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Informa se o sistema ainda nao tem nenhum usuario (primeiro acesso). */
authRoutes.get('/status', async (c) => {
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM users`).first<{ total: number }>();
  const user = await readSession(c);
  return c.json({ needs_setup: (row?.total ?? 0) === 0, user });
});

/** Cria o primeiro administrador. So funciona enquanto nao existir nenhum usuario. */
authRoutes.post('/setup', async (c) => {
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM users`).first<{ total: number }>();
  if ((row?.total ?? 0) > 0) return c.json({ error: 'setup_ja_realizado' }, 409);

  const body = await readJson(c);
  const email = requireString(body, 'email').toLowerCase();
  const name = requireString(body, 'name');
  const password = requireString(body, 'password');
  if (password.length < 8) {
    return c.json({ error: 'senha_curta', message: 'Use ao menos 8 caracteres.' }, 400);
  }

  const user: AuthUser = { id: randomId('usr_'), email, name, role: 'admin' };
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, active, created_at)
     VALUES (?1, ?2, ?3, ?4, 'admin', 1, ?5)`,
  )
    .bind(user.id, email, name, await hashPassword(password), nowIso())
    .run();

  await issueSession(c, user);
  return c.json({ user }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await readJson(c);
  const email = requireString(body, 'email').toLowerCase();
  const password = requireString(body, 'password');

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash FROM users WHERE email = ?1 AND active = 1`,
  )
    .bind(email)
    .first<{ id: string; email: string; name: string; role: AuthUser['role']; password_hash: string }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'credenciais_invalidas', message: 'E-mail ou senha incorretos.' }, 401);
  }

  const user: AuthUser = { id: row.id, email: row.email, name: row.name, role: row.role };
  await issueSession(c, user);
  return c.json({ user });
});

authRoutes.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const user = await readSession(c);
  if (!user) return c.json({ error: 'nao_autenticado' }, 401);
  return c.json({ user });
});
