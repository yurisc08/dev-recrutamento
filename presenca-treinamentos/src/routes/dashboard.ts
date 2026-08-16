import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { addMinutes, nowIso, timezoneOffsetMs } from '../lib/time';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

dashboardRoutes.get('/', async (c) => {
  const timezone = c.env.APP_TIMEZONE ?? 'America/Sao_Paulo';
  const { start, end } = localDayRange(new Date(), timezone);
  const now = nowIso();

  const [counts, todaySessions, liveScans, unknownBadges, offlineDevices] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM people WHERE active = 1) AS pessoas,
         (SELECT COUNT(*) FROM classes WHERE status IN ('planejada','em_andamento')) AS turmas_abertas,
         (SELECT COUNT(*) FROM devices WHERE active = 1) AS dispositivos,
         (SELECT COUNT(*) FROM scans WHERE scanned_at >= ?1 AND scanned_at <= ?2) AS leituras_hoje,
         (SELECT COUNT(*) FROM class_sessions WHERE starts_at >= ?1 AND starts_at <= ?2 AND canceled = 0) AS aulas_hoje`,
    )
      .bind(start, end)
      .first(),

    c.env.DB.prepare(
      `SELECT s.id, s.title, s.starts_at, s.ends_at, cl.code AS class_code, co.name AS course_name,
              r.name AS room_name,
              (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = s.class_id AND e.status = 'ativa') AS matriculados,
              (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('presente','justificada')) AS presentes,
              (SELECT COUNT(DISTINCT sc.person_id) FROM scans sc WHERE sc.session_id = s.id AND sc.person_id IS NOT NULL) AS ja_passaram
         FROM class_sessions s
         JOIN classes cl ON cl.id = s.class_id
         JOIN courses co ON co.id = cl.course_id
         LEFT JOIN rooms r ON r.id = s.room_id
        WHERE s.starts_at >= ?1 AND s.starts_at <= ?2 AND s.canceled = 0
        ORDER BY s.starts_at`,
    )
      .bind(start, end)
      .all(),

    c.env.DB.prepare(
      `SELECT s.id, s.badge_code, s.scanned_at, s.direction, p.full_name, d.name AS device_name,
              cl.code AS class_code
         FROM scans s
         LEFT JOIN people p ON p.id = s.person_id
         LEFT JOIN devices d ON d.id = s.device_id
         LEFT JOIN class_sessions cs ON cs.id = s.session_id
         LEFT JOIN classes cl ON cl.id = cs.class_id
        ORDER BY s.scanned_at DESC LIMIT 12`,
    ).all(),

    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT badge_code) AS total FROM scans WHERE person_id IS NULL`,
    ).first<{ total: number }>(),

    // Leitor sem comunicacao ha mais de 1h costuma indicar problema de rede.
    c.env.DB.prepare(
      `SELECT name, last_seen_at FROM devices
        WHERE active = 1 AND (last_seen_at IS NULL OR last_seen_at < ?1)
        ORDER BY name`,
    )
      .bind(addMinutes(now, -60))
      .all(),
  ]);

  return c.json({
    counts: { ...counts, crachas_nao_identificados: unknownBadges?.total ?? 0 },
    aulas_hoje: todaySessions.results ?? [],
    ultimas_leituras: liveScans.results ?? [],
    dispositivos_sem_comunicacao: offlineDevices.results ?? [],
    servidor: { agora: now, timezone },
  });
});

/** Intervalo UTC correspondente ao dia local (evita virada de dia errada). */
function localDayRange(reference: Date, timezone: string): { start: string; end: string } {
  const offset = timezoneOffsetMs(reference, timezone);
  const local = new Date(reference.getTime() + offset);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0);
  return {
    start: new Date(startLocal - offset).toISOString(),
    end: new Date(startLocal - offset + 24 * 3600 * 1000 - 1).toISOString(),
  };
}
