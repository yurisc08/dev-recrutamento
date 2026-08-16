import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { randomId } from '../lib/crypto';
import { boolToInt, notFound, optionalNumber, optionalString, readJson, requireString } from '../lib/http';
import { nowIso } from '../lib/time';

export const courseRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
export const roomRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- Treinamentos ------------------------------------------------------------

courseRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT co.*, (SELECT COUNT(*) FROM classes cl WHERE cl.course_id = co.id) AS classes_count
       FROM courses co ORDER BY co.name`,
  ).all();
  return c.json({ courses: rows.results ?? [] });
});

courseRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const id = randomId('crs_');
  await c.env.DB.prepare(
    `INSERT INTO courses (id, name, code, description, workload_minutes, min_attendance_percent, active, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      id,
      requireString(body, 'name'),
      optionalString(body, 'code'),
      optionalString(body, 'description'),
      optionalNumber(body, 'workload_minutes'),
      optionalNumber(body, 'min_attendance_percent') ?? 75,
      boolToInt(body.active, 1),
      nowIso(),
    )
    .run();
  return c.json({ id }, 201);
});

courseRoutes.put('/:id', async (c) => {
  const body = await readJson(c);
  const result = await c.env.DB.prepare(
    `UPDATE courses SET name = ?2, code = ?3, description = ?4, workload_minutes = ?5,
            min_attendance_percent = ?6, active = ?7 WHERE id = ?1`,
  )
    .bind(
      c.req.param('id'),
      requireString(body, 'name'),
      optionalString(body, 'code'),
      optionalString(body, 'description'),
      optionalNumber(body, 'workload_minutes'),
      optionalNumber(body, 'min_attendance_percent') ?? 75,
      boolToInt(body.active, 1),
    )
    .run();
  if (!result.meta.changes) notFound('treinamento_nao_encontrado');
  return c.json({ ok: true });
});

courseRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM courses WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// --- Salas -------------------------------------------------------------------

roomRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM devices d WHERE d.room_id = r.id) AS devices_count
       FROM rooms r ORDER BY r.name`,
  ).all();
  return c.json({ rooms: rows.results ?? [] });
});

roomRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const id = randomId('rom_');
  await c.env.DB.prepare(
    `INSERT INTO rooms (id, name, location, capacity, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, requireString(body, 'name'), optionalString(body, 'location'), optionalNumber(body, 'capacity'), nowIso())
    .run();
  return c.json({ id }, 201);
});

roomRoutes.put('/:id', async (c) => {
  const body = await readJson(c);
  const result = await c.env.DB.prepare(
    `UPDATE rooms SET name = ?2, location = ?3, capacity = ?4 WHERE id = ?1`,
  )
    .bind(c.req.param('id'), requireString(body, 'name'), optionalString(body, 'location'), optionalNumber(body, 'capacity'))
    .run();
  if (!result.meta.changes) notFound('sala_nao_encontrada');
  return c.json({ ok: true });
});

roomRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM rooms WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
