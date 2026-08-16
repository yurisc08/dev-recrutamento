import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { generateDeviceKey, randomId, sha256Hex } from '../lib/crypto';
import { badRequest, boolToInt, notFound, optionalString, readJson, requireString } from '../lib/http';
import { nowIso } from '../lib/time';

export const deviceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const DIRECTIONS = ['entrada', 'saida', 'ambos'];

deviceRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.name, d.serial, d.room_id, d.direction, d.active, d.key_prefix,
            d.last_seen_at, d.created_at, r.name AS room_name,
            (SELECT COUNT(*) FROM scans s WHERE s.device_id = d.id) AS scans_count
       FROM devices d LEFT JOIN rooms r ON r.id = d.room_id
      ORDER BY d.name`,
  ).all();
  return c.json({ devices: rows.results ?? [] });
});

/** A chave completa so aparece nesta resposta — depois fica apenas o hash. */
deviceRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const direction = optionalString(body, 'direction') ?? 'ambos';
  if (!DIRECTIONS.includes(direction)) badRequest('direcao_invalida');

  const key = generateDeviceKey();
  const id = randomId('dev_');

  await c.env.DB.prepare(
    `INSERT INTO devices (id, name, serial, room_id, key_hash, key_prefix, direction, active, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(
      id,
      requireString(body, 'name'),
      optionalString(body, 'serial'),
      optionalString(body, 'room_id'),
      await sha256Hex(key),
      key.slice(0, 12),
      direction,
      boolToInt(body.active, 1),
      nowIso(),
    )
    .run();

  return c.json({ id, key, aviso: 'Guarde esta chave: ela nao sera exibida novamente.' }, 201);
});

deviceRoutes.put('/:id', async (c) => {
  const body = await readJson(c);
  const direction = optionalString(body, 'direction') ?? 'ambos';
  if (!DIRECTIONS.includes(direction)) badRequest('direcao_invalida');

  const result = await c.env.DB.prepare(
    `UPDATE devices SET name = ?2, serial = ?3, room_id = ?4, direction = ?5, active = ?6 WHERE id = ?1`,
  )
    .bind(
      c.req.param('id'),
      requireString(body, 'name'),
      optionalString(body, 'serial'),
      optionalString(body, 'room_id'),
      direction,
      boolToInt(body.active, 1),
    )
    .run();

  if (!result.meta.changes) notFound('dispositivo_nao_encontrado');
  return c.json({ ok: true });
});

/** Gera uma nova chave (invalida a anterior imediatamente). */
deviceRoutes.post('/:id/rotate-key', async (c) => {
  const key = generateDeviceKey();
  const result = await c.env.DB.prepare(`UPDATE devices SET key_hash = ?2, key_prefix = ?3 WHERE id = ?1`)
    .bind(c.req.param('id'), await sha256Hex(key), key.slice(0, 12))
    .run();

  if (!result.meta.changes) notFound('dispositivo_nao_encontrado');
  return c.json({ key, aviso: 'A chave anterior deixou de funcionar.' });
});

deviceRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM devices WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
