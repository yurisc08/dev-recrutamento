import { Hono } from 'hono';
import type { ClassSessionRow, Env, Variables } from '../types';
import { randomId } from '../lib/crypto';
import { badRequest, notFound, optionalString, readJson, requireString } from '../lib/http';
import { isValidIso, nowIso } from '../lib/time';
import { normalizeBadge } from '../services/ingest';
import { findSessionForScan, matchWindow, recomputePerson } from '../services/presence';

export const scanRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Monitor de leituras — usado tambem pela tela "ao vivo". */
scanRoutes.get('/', async (c) => {
  const query = c.req.query();
  const limit = Math.min(Number(query.limit ?? 100) || 100, 500);

  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.badge_code, s.scanned_at, s.direction, s.source, s.session_id,
            p.id AS person_id, p.full_name, d.name AS device_name, r.name AS room_name,
            cl.code AS class_code, co.name AS course_name
       FROM scans s
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN devices d ON d.id = s.device_id
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN class_sessions cs ON cs.id = s.session_id
       LEFT JOIN classes cl ON cl.id = cs.class_id
       LEFT JOIN courses co ON co.id = cl.course_id
      WHERE (?1 = '' OR s.scanned_at >= ?1)
        AND (?2 = '' OR s.scanned_at <= ?2)
        AND (?3 = '' OR s.person_id = ?3)
        AND (?4 = '' OR s.device_id = ?4)
        AND (?5 = '' OR s.session_id = ?5)
        AND (?6 = '0' OR s.person_id IS NULL)
      ORDER BY s.scanned_at DESC
      LIMIT ?7`,
  )
    .bind(
      query.from ?? '',
      query.to ?? '',
      query.person_id ?? '',
      query.device_id ?? '',
      query.session_id ?? '',
      query.unknown === '1' ? '1' : '0',
      limit,
    )
    .all();

  return c.json({ scans: rows.results ?? [] });
});

/** Crachas lidos que ainda nao pertencem a ninguem — fila de vinculo. */
scanRoutes.get('/unknown', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT badge_code, COUNT(*) AS leituras, MIN(scanned_at) AS primeira, MAX(scanned_at) AS ultima
       FROM scans WHERE person_id IS NULL
      GROUP BY badge_code ORDER BY ultima DESC LIMIT 200`,
  ).all();
  return c.json({ badges: rows.results ?? [] });
});

/**
 * Marcacao manual (pessoa esqueceu o cracha, leitor fora do ar).
 * Segue exatamente o mesmo caminho de uma leitura real: casa com a aula e recalcula.
 */
scanRoutes.post('/manual', async (c) => {
  const body = await readJson(c);
  const personId = requireString(body, 'person_id');
  const scannedAt = optionalString(body, 'scanned_at') ?? nowIso();
  if (!isValidIso(scannedAt)) badRequest('data_invalida');

  const person = await c.env.DB.prepare(`SELECT id FROM people WHERE id = ?1`).bind(personId).first();
  if (!person) notFound('pessoa_nao_encontrada');

  const badge = await c.env.DB.prepare(
    `SELECT code FROM badges WHERE person_id = ?1 AND active = 1 LIMIT 1`,
  )
    .bind(personId)
    .first<{ code: string }>();

  let session: ClassSessionRow | null = null;
  const sessionId = optionalString(body, 'session_id');
  if (sessionId) {
    session = await c.env.DB.prepare(`SELECT * FROM class_sessions WHERE id = ?1`)
      .bind(sessionId)
      .first<ClassSessionRow>();
    if (!session) notFound('aula_nao_encontrada');
  } else {
    session = await findSessionForScan(c.env.DB, personId, scannedAt, null, matchWindow(c.env));
  }

  const id = randomId('scn_');
  await c.env.DB.prepare(
    `INSERT INTO scans (id, device_id, badge_code, person_id, scanned_at, direction, session_id,
            source, external_id, raw, created_at)
     VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, 'manual', NULL, ?7, ?8)`,
  )
    .bind(
      id,
      badge?.code ?? normalizeBadge('MANUAL-' + personId.slice(-6)),
      personId,
      scannedAt,
      optionalString(body, 'direction') ?? 'desconhecida',
      session?.id ?? null,
      JSON.stringify({ registrado_por: c.get('user')?.email ?? null }),
      nowIso(),
    )
    .run();

  if (session) await recomputePerson(c.env.DB, session, personId);
  return c.json({ id, session_id: session?.id ?? null }, 201);
});

scanRoutes.delete('/:id', async (c) => {
  const scan = await c.env.DB.prepare(`SELECT person_id, session_id FROM scans WHERE id = ?1`)
    .bind(c.req.param('id'))
    .first<{ person_id: string | null; session_id: string | null }>();
  if (!scan) notFound('leitura_nao_encontrada');

  await c.env.DB.prepare(`DELETE FROM scans WHERE id = ?1`).bind(c.req.param('id')).run();

  if (scan.person_id && scan.session_id) {
    const session = await c.env.DB.prepare(`SELECT * FROM class_sessions WHERE id = ?1`)
      .bind(scan.session_id)
      .first<ClassSessionRow>();
    if (session) await recomputePerson(c.env.DB, session, scan.person_id);
  }

  return c.json({ ok: true });
});
