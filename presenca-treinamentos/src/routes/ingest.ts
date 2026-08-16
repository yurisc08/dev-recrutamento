import { Hono } from 'hono';
import type { DeviceRow, Env, Variables } from '../types';
import { randomId, sha256Hex } from '../lib/crypto';
import { nowIso, parseTimestamp } from '../lib/time';
import { normalizeBadge, normalizeEvents, type NormalizedEvent } from '../services/ingest';
import { findSessionForScan, matchWindow, recomputePerson } from '../services/presence';

const MAX_EVENTS_PER_REQUEST = 500;

export const ingestRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Endpoint que a maquininha de cracha chama. Autenticacao por chave do
 * dispositivo (cabecalho `X-Device-Key`, `Authorization: Bearer` ou `?key=`).
 *
 * Aceita um evento ou um lote, em varios formatos:
 *   {"badge":"0001234","timestamp":"2026-08-16T13:02:10-03:00","direction":"entrada"}
 *   {"events":[{"card":"1234","time":1755349330}, ...]}
 *   [{"cardNumber":"1234","data_hora":"2026-08-16 13:02:10"}]
 */
ingestRoutes.post('/', async (c) => {
  const device = await authenticateDevice(c.env, extractKey(c.req.raw));
  if (!device) return c.json({ ok: false, error: 'chave_invalida' }, 401);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'json_invalido' }, 400);
  }

  return c.json(await processPayload(c.env, device, payload));
});

/**
 * Variante GET para leitores antigos que so conseguem chamar uma URL simples:
 *   GET /api/ingest?key=dev_xxx&badge=0001234&at=2026-08-16T13:02:10-03:00
 */
ingestRoutes.get('/', async (c) => {
  const device = await authenticateDevice(c.env, extractKey(c.req.raw));
  if (!device) return c.json({ ok: false, error: 'chave_invalida' }, 401);

  const query = c.req.query();
  const badge = query.badge ?? query.cracha ?? query.card ?? query.code;
  if (!badge) return c.json({ ok: false, error: 'cracha_ausente' }, 400);

  const result = await processPayload(c.env, device, {
    badge,
    timestamp: query.at ?? query.timestamp ?? null,
    direction: query.direction ?? query.sentido ?? null,
  });
  return c.json(result);
});

/** Teste de conectividade do leitor: confirma a chave sem gravar nada. */
ingestRoutes.get('/ping', async (c) => {
  const device = await authenticateDevice(c.env, extractKey(c.req.raw));
  if (!device) return c.json({ ok: false, error: 'chave_invalida' }, 401);
  return c.json({ ok: true, device: device.name, server_time: nowIso() });
});

function extractKey(request: Request): string | null {
  const header = request.headers.get('x-device-key');
  if (header) return header.trim();

  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();

  return new URL(request.url).searchParams.get('key');
}

async function authenticateDevice(env: Env, key: string | null): Promise<DeviceRow | null> {
  if (!key) return null;
  const device = await env.DB.prepare(
    `SELECT id, name, serial, room_id, direction, active FROM devices WHERE key_hash = ?1 AND active = 1`,
  )
    .bind(await sha256Hex(key))
    .first<DeviceRow>();
  return device ?? null;
}

interface EventOutcome {
  badge: string;
  scanned_at: string;
  status: 'registrado' | 'duplicado' | 'cracha_desconhecido';
  person?: string;
  session?: string | null;
  message: string;
}

async function processPayload(env: Env, device: DeviceRow, payload: unknown) {
  const timezone = env.APP_TIMEZONE ?? 'America/Sao_Paulo';
  const { events, invalid } = normalizeEvents(payload, timezone);

  if (events.length === 0 && invalid.length === 0) {
    return { ok: false, error: 'nenhum_evento', results: [] as EventOutcome[] };
  }

  const results: EventOutcome[] = [];
  for (const event of events.slice(0, MAX_EVENTS_PER_REQUEST)) {
    results.push(await storeEvent(env, device, event));
  }

  await env.DB.prepare(`UPDATE devices SET last_seen_at = ?1 WHERE id = ?2`)
    .bind(nowIso(), device.id)
    .run();

  return {
    ok: true,
    device: device.name,
    received: events.length,
    stored: results.filter((r) => r.status === 'registrado').length,
    duplicates: results.filter((r) => r.status === 'duplicado').length,
    invalid,
    results,
  };
}

async function storeEvent(env: Env, device: DeviceRow, event: NormalizedEvent): Promise<EventOutcome> {
  const person = await env.DB.prepare(
    `SELECT p.id, p.full_name FROM badges b
       JOIN people p ON p.id = b.person_id
      WHERE b.code = ?1 AND b.active = 1 AND p.active = 1`,
  )
    .bind(event.badge)
    .first<{ id: string; full_name: string }>();

  // Leitor com sentido fixo (catraca de entrada/saida) sobrepoe o campo do evento.
  const direction =
    device.direction === 'ambos'
      ? event.direction
      : device.direction === 'entrada'
        ? 'entrada'
        : 'saida';

  const session = await findSessionForScan(
    env.DB,
    person?.id ?? null,
    event.scannedAt,
    device.room_id,
    matchWindow(env),
  );

  const inserted = await env.DB.prepare(
    `INSERT INTO scans (
       id, device_id, badge_code, person_id, scanned_at, direction, session_id,
       source, external_id, raw, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'dispositivo', ?8, ?9, ?10)
     ON CONFLICT (device_id, badge_code, scanned_at) DO NOTHING
     RETURNING id`,
  )
    .bind(
      randomId('scn_'),
      device.id,
      event.badge,
      person?.id ?? null,
      event.scannedAt,
      direction,
      session?.id ?? null,
      event.externalId,
      event.raw,
      nowIso(),
    )
    .first<{ id: string }>();

  if (!inserted) {
    return {
      badge: event.badge,
      scanned_at: event.scannedAt,
      status: 'duplicado',
      person: person?.full_name,
      message: 'Leitura ja registrada.',
    };
  }

  if (person && session) {
    await recomputePerson(env.DB, session, person.id);
  }

  if (!person) {
    return {
      badge: event.badge,
      scanned_at: event.scannedAt,
      status: 'cracha_desconhecido',
      message: 'Cracha nao cadastrado. Leitura guardada para vinculo posterior.',
    };
  }

  return {
    badge: event.badge,
    scanned_at: event.scannedAt,
    status: 'registrado',
    person: person.full_name,
    session: session?.id ?? null,
    message: session
      ? `Presenca registrada: ${person.full_name}`
      : `${person.full_name}: leitura registrada, sem aula no horario.`,
  };
}

export { normalizeBadge, parseTimestamp };
