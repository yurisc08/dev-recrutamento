import { computeAttendance, minutesOfSession, pickSessionForScan } from '../attendance';
import type { AttendanceStatus, ClassSessionRow, Env } from '../types';
import { randomId } from '../lib/crypto';
import { addMinutes, nowIso } from '../lib/time';

export interface MatchWindow {
  beforeMin: number;
  afterMin: number;
}

export function matchWindow(env: Env): MatchWindow {
  return {
    beforeMin: Number(env.MATCH_WINDOW_BEFORE_MIN ?? 60) || 60,
    afterMin: Number(env.MATCH_WINDOW_AFTER_MIN ?? 60) || 60,
  };
}

/**
 * Descobre a qual aula uma leitura pertence.
 * Primeiro tenta aulas de turmas em que a pessoa esta matriculada; se nao houver,
 * tenta aulas que estejam acontecendo na sala do leitor (visitante / nao matriculado).
 */
export async function findSessionForScan(
  db: D1Database,
  personId: string | null,
  scannedAt: string,
  deviceRoomId: string | null,
  window: MatchWindow,
): Promise<ClassSessionRow | null> {
  const startsBefore = addMinutes(scannedAt, window.beforeMin);
  const endsAfter = addMinutes(scannedAt, -window.afterMin);

  if (personId) {
    const enrolled = await db
      .prepare(
        `SELECT s.* FROM class_sessions s
           JOIN enrollments e ON e.class_id = s.class_id
          WHERE e.person_id = ?1 AND e.status = 'ativa'
            AND s.canceled = 0
            AND s.starts_at <= ?2 AND s.ends_at >= ?3`,
      )
      .bind(personId, startsBefore, endsAfter)
      .all<ClassSessionRow>();

    const match = pickSessionForScan(scannedAt, enrolled.results ?? [], deviceRoomId);
    if (match) return match;
  }

  if (deviceRoomId) {
    const inRoom = await db
      .prepare(
        `SELECT s.* FROM class_sessions s
           LEFT JOIN classes c ON c.id = s.class_id
          WHERE s.canceled = 0
            AND COALESCE(s.room_id, c.room_id) = ?1
            AND s.starts_at <= ?2 AND s.ends_at >= ?3`,
      )
      .bind(deviceRoomId, startsBefore, endsAfter)
      .all<ClassSessionRow>();

    return pickSessionForScan(scannedAt, inRoom.results ?? [], deviceRoomId);
  }

  return null;
}

/** Recalcula a presenca de uma pessoa em uma aula a partir das leituras gravadas. */
export async function recomputePerson(
  db: D1Database,
  session: ClassSessionRow,
  personId: string,
): Promise<void> {
  const scans = await db
    .prepare(`SELECT scanned_at FROM scans WHERE session_id = ?1 AND person_id = ?2 ORDER BY scanned_at`)
    .bind(session.id, personId)
    .all<{ scanned_at: string }>();

  const result = computeAttendance(session, (scans.results ?? []).map((row) => row.scanned_at));

  const override = await db
    .prepare(`SELECT status, justification FROM attendance_overrides WHERE session_id = ?1 AND person_id = ?2`)
    .bind(session.id, personId)
    .first<{ status: AttendanceStatus; justification: string | null }>();

  const status = override?.status ?? result.status;
  const source = override ? 'manual' : 'automatica';

  await db
    .prepare(
      `INSERT INTO attendance (
         id, session_id, person_id, status, first_seen_at, last_seen_at, minutes_present,
         percent, late, left_early, missing_checkout, scan_count, source, note, computed_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
       ON CONFLICT (session_id, person_id) DO UPDATE SET
         status = excluded.status,
         first_seen_at = excluded.first_seen_at,
         last_seen_at = excluded.last_seen_at,
         minutes_present = excluded.minutes_present,
         percent = excluded.percent,
         late = excluded.late,
         left_early = excluded.left_early,
         missing_checkout = excluded.missing_checkout,
         scan_count = excluded.scan_count,
         source = excluded.source,
         note = excluded.note,
         computed_at = excluded.computed_at`,
    )
    .bind(
      randomId('att_'),
      session.id,
      personId,
      status,
      result.first_seen_at,
      result.last_seen_at,
      result.minutes_present,
      result.percent,
      result.late ? 1 : 0,
      result.left_early ? 1 : 0,
      result.missing_checkout ? 1 : 0,
      result.scan_count,
      source,
      override?.justification ?? null,
      nowIso(),
    )
    .run();
}

/** Recalcula a aula inteira (todos os matriculados, inclusive os ausentes). */
export async function recomputeSession(db: D1Database, sessionId: string): Promise<number> {
  const session = await db
    .prepare(`SELECT * FROM class_sessions WHERE id = ?1`)
    .bind(sessionId)
    .first<ClassSessionRow>();
  if (!session) return 0;

  const enrolled = await db
    .prepare(`SELECT person_id FROM enrollments WHERE class_id = ?1 AND status = 'ativa'`)
    .bind(session.class_id)
    .all<{ person_id: string }>();

  const people = (enrolled.results ?? []).map((row) => row.person_id);
  for (const personId of people) {
    await recomputePerson(db, session, personId);
  }

  // Remove linhas de quem saiu da turma.
  if (people.length > 0) {
    const placeholders = people.map((_, i) => `?${i + 2}`).join(', ');
    await db
      .prepare(`DELETE FROM attendance WHERE session_id = ?1 AND person_id NOT IN (${placeholders})`)
      .bind(sessionId, ...people)
      .run();
  } else {
    await db.prepare(`DELETE FROM attendance WHERE session_id = ?1`).bind(sessionId).run();
  }

  return people.length;
}

/**
 * Reprocessa leituras que ficaram sem aula (cracha vinculado depois, matricula
 * feita apos a aula, importacao retroativa) e recalcula o que foi afetado.
 */
export async function rematchScansForPerson(
  db: D1Database,
  personId: string,
  window: MatchWindow,
): Promise<number> {
  const pending = await db
    .prepare(
      `SELECT s.id, s.scanned_at, d.room_id AS device_room_id
         FROM scans s LEFT JOIN devices d ON d.id = s.device_id
        WHERE s.person_id = ?1 AND s.session_id IS NULL
        ORDER BY s.scanned_at
        LIMIT 2000`,
    )
    .bind(personId)
    .all<{ id: string; scanned_at: string; device_room_id: string | null }>();

  const touched = new Map<string, ClassSessionRow>();
  for (const scan of pending.results ?? []) {
    const session = await findSessionForScan(db, personId, scan.scanned_at, scan.device_room_id, window);
    if (!session) continue;
    await db.prepare(`UPDATE scans SET session_id = ?2 WHERE id = ?1`).bind(scan.id, session.id).run();
    touched.set(session.id, session);
  }

  for (const session of touched.values()) {
    await recomputePerson(db, session, personId);
  }
  return touched.size;
}

/** Recalcula todas as aulas de uma turma. */
export async function recomputeClass(db: D1Database, classId: string): Promise<number> {
  const sessions = await db
    .prepare(`SELECT id FROM class_sessions WHERE class_id = ?1`)
    .bind(classId)
    .all<{ id: string }>();

  for (const row of sessions.results ?? []) {
    await recomputeSession(db, row.id);
  }
  return (sessions.results ?? []).length;
}

export { minutesOfSession };
