import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { randomId } from '../lib/crypto';
import { badRequest, boolToInt, notFound, optionalString, readJson, requireString } from '../lib/http';
import { nowIso } from '../lib/time';
import { normalizeBadge } from '../services/ingest';
import { matchWindow, rematchScansForPerson } from '../services/presence';

export const peopleRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

peopleRoutes.get('/', async (c) => {
  const search = c.req.query('q')?.trim();
  const like = `%${search ?? ''}%`;
  const rows = await c.env.DB.prepare(
    `SELECT p.*,
            (SELECT GROUP_CONCAT(b.code, ', ') FROM badges b WHERE b.person_id = p.id AND b.active = 1) AS badges
       FROM people p
      WHERE (?1 = '' OR p.full_name LIKE ?2 OR COALESCE(p.document,'') LIKE ?2
             OR COALESCE(p.email,'') LIKE ?2 OR COALESCE(p.department,'') LIKE ?2)
      ORDER BY p.full_name
      LIMIT 500`,
  )
    .bind(search ?? '', like)
    .all();
  return c.json({ people: rows.results ?? [] });
});

peopleRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const id = randomId('per_');

  await c.env.DB.prepare(
    `INSERT INTO people (id, full_name, document, email, department, job_title, active, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      id,
      requireString(body, 'full_name'),
      optionalString(body, 'document'),
      optionalString(body, 'email'),
      optionalString(body, 'department'),
      optionalString(body, 'job_title'),
      boolToInt(body.active, 1),
      nowIso(),
    )
    .run();

  // Cadastro do cracha junto com a pessoa, quando informado.
  const badge = optionalString(body, 'badge_code');
  if (badge) await insertBadge(c.env.DB, id, badge);

  return c.json({ id }, 201);
});

peopleRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const person = await c.env.DB.prepare(`SELECT * FROM people WHERE id = ?1`).bind(id).first();
  if (!person) notFound('pessoa_nao_encontrada');

  const badges = await c.env.DB.prepare(
    `SELECT * FROM badges WHERE person_id = ?1 ORDER BY active DESC, created_at DESC`,
  )
    .bind(id)
    .all();

  const classes = await c.env.DB.prepare(
    `SELECT c.id, c.code, c.name, co.name AS course_name, e.status
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN courses co ON co.id = c.course_id
      WHERE e.person_id = ?1
      ORDER BY c.created_at DESC`,
  )
    .bind(id)
    .all();

  return c.json({ person, badges: badges.results ?? [], classes: classes.results ?? [] });
});

peopleRoutes.put('/:id', async (c) => {
  const body = await readJson(c);
  const result = await c.env.DB.prepare(
    `UPDATE people SET full_name = ?2, document = ?3, email = ?4, department = ?5,
            job_title = ?6, active = ?7
      WHERE id = ?1`,
  )
    .bind(
      c.req.param('id'),
      requireString(body, 'full_name'),
      optionalString(body, 'document'),
      optionalString(body, 'email'),
      optionalString(body, 'department'),
      optionalString(body, 'job_title'),
      boolToInt(body.active, 1),
    )
    .run();

  if (!result.meta.changes) notFound('pessoa_nao_encontrada');
  return c.json({ ok: true });
});

peopleRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM people WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// --- Crachas -----------------------------------------------------------------

peopleRoutes.post('/:id/badges', async (c) => {
  const body = await readJson(c);
  const personId = c.req.param('id');
  const person = await c.env.DB.prepare(`SELECT id FROM people WHERE id = ?1`).bind(personId).first();
  if (!person) notFound('pessoa_nao_encontrada');

  const code = await insertBadge(c.env.DB, personId, requireString(body, 'code'), optionalString(body, 'label'));
  // Vincula leituras antigas do mesmo numero que ficaram sem dono...
  await c.env.DB.prepare(
    `UPDATE scans SET person_id = ?1 WHERE badge_code = ?2 AND person_id IS NULL`,
  )
    .bind(personId, code)
    .run();
  // ...e tenta encaixa-las nas aulas correspondentes.
  const sessions = await rematchScansForPerson(c.env.DB, personId, matchWindow(c.env));

  return c.json({ ok: true, code, aulas_atualizadas: sessions }, 201);
});

peopleRoutes.delete('/:personId/badges/:badgeId', async (c) => {
  await c.env.DB.prepare(`UPDATE badges SET active = 0 WHERE id = ?1 AND person_id = ?2`)
    .bind(c.req.param('badgeId'), c.req.param('personId'))
    .run();
  return c.json({ ok: true });
});

async function insertBadge(
  db: D1Database,
  personId: string,
  rawCode: string,
  label: string | null = null,
): Promise<string> {
  const code = normalizeBadge(rawCode);
  const existing = await db
    .prepare(`SELECT person_id FROM badges WHERE code = ?1 AND active = 1`)
    .bind(code)
    .first<{ person_id: string }>();

  if (existing && existing.person_id !== personId) {
    badRequest('cracha_em_uso', 'Este numero de cracha ja esta ativo para outra pessoa.');
  }
  if (existing) return code;

  await db
    .prepare(`INSERT INTO badges (id, person_id, code, label, active, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)`)
    .bind(randomId('bdg_'), personId, code, label, nowIso())
    .run();

  return code;
}
