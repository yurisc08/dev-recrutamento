/*
 * server/auth.js
 * -----------------------------------------------------------------------------
 * Sessões.
 *
 * Não há usuário nem senha em lugar nenhum: a credencial é sempre um código de
 * acesso. Quem valida o código é o servidor (server.js), e o que sobra aqui é
 * guardar a sessão aberta a partir dele.
 */

const crypto = require('node:crypto');

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

/* Derruba as sessões abertas com um código — usado ao revogar ou trocar. */
function closeSessionsOf(code) {
  const wanted = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [token, entry] of sessions) {
    const current = String(entry.data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (wanted && current === wanted) sessions.delete(token);
  }
}

module.exports = { openSession, readSession, closeSession, closeSessionsOf };
