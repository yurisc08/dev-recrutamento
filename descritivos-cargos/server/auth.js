/*
 * server/auth.js
 * -----------------------------------------------------------------------------
 * Senhas e sessões.
 *
 * As senhas são guardadas como hash scrypt (`scrypt$salt$hash`), nunca em texto.
 * Bancos criados na versão anterior, que guardavam a senha em texto, continuam
 * funcionando: o hash é gravado no primeiro login bem-sucedido.
 */

const crypto = require('node:crypto');

const KEY_LENGTH = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(user, plain) {
  if (!user || plain == null) return false;

  if (user.passwordHash) {
    const [algo, salt, hash] = String(user.passwordHash).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const attempt = crypto.scryptSync(String(plain), salt, KEY_LENGTH);
    const stored = Buffer.from(hash, 'hex');
    return stored.length === attempt.length && crypto.timingSafeEqual(stored, attempt);
  }

  // Formato antigo, em texto puro.
  return typeof user.password === 'string' && user.password === String(plain);
}

/* Regras mínimas para uma senha nova. */
function validatePassword(plain) {
  const value = String(plain || '');
  if (value.length < 8) return { ok: false, error: 'A senha precisa ter ao menos 8 caracteres' };
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return { ok: false, error: 'A senha precisa misturar letras e números' };
  return { ok: true };
}

/* -------------------------------- Sessões -------------------------------- */
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 horas
const sessions = new Map();

function openSession(data) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { data, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function readSession(token) {
  const found = token ? sessions.get(token) : null;
  if (!found) return null;
  if (found.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  found.expiresAt = Date.now() + SESSION_TTL; // renova a cada uso
  return found.data;
}

function closeSession(token) {
  sessions.delete(token);
}

/* Encerra as sessões abertas de um usuário (troca de senha, exclusão). */
function closeSessionsOf(email) {
  for (const [token, entry] of sessions) {
    if (entry.data.email && entry.data.email === email) sessions.delete(token);
  }
}

module.exports = {
  hashPassword, verifyPassword, validatePassword,
  openSession, readSession, closeSession, closeSessionsOf
};
