import { Hono } from 'hono';
import type { AttendanceStatus, ClassSessionRow, Env, Variables } from '../types';
import { minutesOfSession, summarizeClassAttendance } from '../attendance';
import { randomId } from '../lib/crypto';
import {
  badRequest,
  boolToInt,
  notFound,
  optionalNumber,
  optionalString,
  readJson,
  requireString,
  toCsv,
} from '../lib/http';
import { isValidIso, nowIso } from '../lib/time';
import { matchWindow, recomputeClass, recomputePerson, recomputeSession, rematchScansForPerson } from '../services/presence';

export const classRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const STATUSES: AttendanceStatus[] = ['presente', 'parcial', 'ausente', 'justificada'];

// --- Turmas ------------------------------------------------------------------

classRoutes.get('/', async (c) => {
  const courseId = c.req.query('course_id');
  const rows = await c.env.DB.prepare(
    `SELECT cl.*, co.name AS course_name, r.name AS room_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cl.id AND e.status = 'ativa') AS students,
            (SELECT COUNT(*) FROM class_sessions s WHERE s.class_id = cl.id AND s.canceled = 0) AS sessions,
            (SELECT MIN(s.starts_at) FROM class_sessions s WHERE s.class_id = cl.id AND s.canceled = 0) AS first_session,
            (SELECT MAX(s.ends_at) FROM class_sessions s WHERE s.class_id = cl.id AND s.canceled = 0) AS last_session
       FROM classes cl
       JOIN courses co ON co.id = cl.course_id
       LEFT JOIN rooms r ON r.id = cl.room_id
      WHERE (?1 = '' OR cl.course_id = ?1)
      ORDER BY cl.created_at DESC`,
  )
    .bind(courseId ?? '')
    .all();
  return c.json({ classes: rows.results ?? [] });
});

classRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const courseId = requireString(body, 'course_id');
  const course = await c.env.DB.prepare(
    `SELECT min_attendance_percent FROM courses WHERE id = ?1`,
  )
    .bind(courseId)
    .first<{ min_attendance_percent: number }>();
  if (!course) badRequest('treinamento_invalido', 'Treinamento nao encontrado.');

  const id = randomId('cls_');
  await c.env.DB.prepare(
    `INSERT INTO classes (id, course_id, code, name, instructor, room_id, min_attendance_percent, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(
      id,
      courseId,
      requireString(body, 'code'),
      optionalString(body, 'name'),
      optionalString(body, 'instructor'),
      optionalString(body, 'room_id'),
      optionalNumber(body, 'min_attendance_percent') ?? course!.min_attendance_percent,
      optionalString(body, 'status') ?? 'planejada',
      nowIso(),
    )
    .run();

  return c.json({ id }, 201);
});

classRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const turma = await c.env.DB.prepare(
    `SELECT cl.*, co.name AS course_name, co.workload_minutes, r.name AS room_name
       FROM classes cl JOIN courses co ON co.id = cl.course_id
       LEFT JOIN rooms r ON r.id = cl.room_id
      WHERE cl.id = ?1`,
  )
    .bind(id)
    .first();
  if (!turma) notFound('turma_nao_encontrada');

  const sessions = await c.env.DB.prepare(
    `SELECT s.*, r.name AS room_name,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('presente','justificada')) AS presentes,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'parcial') AS parciais,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'ausente') AS ausentes
       FROM class_sessions s LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.class_id = ?1 ORDER BY s.starts_at`,
  )
    .bind(id)
    .all();

  const students = await c.env.DB.prepare(
    `SELECT e.id AS enrollment_id, e.status, p.id, p.full_name, p.department,
            (SELECT GROUP_CONCAT(b.code, ', ') FROM badges b WHERE b.person_id = p.id AND b.active = 1) AS badges
       FROM enrollments e JOIN people p ON p.id = e.person_id
      WHERE e.class_id = ?1 ORDER BY p.full_name`,
  )
    .bind(id)
    .all();

  return c.json({ turma, sessions: sessions.results ?? [], students: students.results ?? [] });
});

classRoutes.put('/:id', async (c) => {
  const body = await readJson(c);
  const result = await c.env.DB.prepare(
    `UPDATE classes SET code = ?2, name = ?3, instructor = ?4, room_id = ?5,
            min_attendance_percent = ?6, status = ?7 WHERE id = ?1`,
  )
    .bind(
      c.req.param('id'),
      requireString(body, 'code'),
      optionalString(body, 'name'),
      optionalString(body, 'instructor'),
      optionalString(body, 'room_id'),
      optionalNumber(body, 'min_attendance_percent') ?? 75,
      optionalString(body, 'status') ?? 'planejada',
    )
    .run();
  if (!result.meta.changes) notFound('turma_nao_encontrada');
  return c.json({ ok: true });
});

classRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM classes WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// --- Matriculas --------------------------------------------------------------

classRoutes.post('/:id/enrollments', async (c) => {
  const classId = c.req.param('id');
  const body = await readJson(c);
  const ids = Array.isArray(body.person_ids)
    ? (body.person_ids as unknown[]).map(String)
    : [requireString(body, 'person_id')];

  const window = matchWindow(c.env);
  let added = 0;
  for (const personId of ids) {
    const result = await c.env.DB.prepare(
      `INSERT INTO enrollments (id, class_id, person_id, status, created_at)
       VALUES (?1, ?2, ?3, 'ativa', ?4)
       ON CONFLICT (class_id, person_id) DO UPDATE SET status = 'ativa'`,
    )
      .bind(randomId('enr_'), classId, personId, nowIso())
      .run();
    if (result.meta.changes) added++;
    // Matricula tardia: aproveita leituras que ja existiam nas aulas da turma.
    await rematchScansForPerson(c.env.DB, personId, window);
  }

  await recomputeClass(c.env.DB, classId);
  return c.json({ ok: true, matriculados: added }, 201);
});

classRoutes.delete('/:id/enrollments/:personId', async (c) => {
  const classId = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM enrollments WHERE class_id = ?1 AND person_id = ?2`)
    .bind(classId, c.req.param('personId'))
    .run();
  await recomputeClass(c.env.DB, classId);
  return c.json({ ok: true });
});

// --- Aulas -------------------------------------------------------------------

classRoutes.post('/:id/sessions', async (c) => {
  const classId = c.req.param('id');
  const turma = await c.env.DB.prepare(`SELECT id, room_id FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; room_id: string | null }>();
  if (!turma) notFound('turma_nao_encontrada');

  const body = await readJson(c);
  const startsAt = requireString(body, 'starts_at');
  const endsAt = requireString(body, 'ends_at');
  if (!isValidIso(startsAt) || !isValidIso(endsAt)) badRequest('data_invalida');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    badRequest('intervalo_invalido', 'O fim da aula precisa ser depois do inicio.');
  }

  // Repeticao semanal opcional: cria N encontros no mesmo horario.
  const repeatWeeks = Math.min(Math.max(Number(body.repeat_weeks ?? 1) || 1, 1), 52);
  const created: string[] = [];

  for (let week = 0; week < repeatWeeks; week++) {
    const offset = week * 7 * 24 * 3600 * 1000;
    const id = randomId('ses_');
    await c.env.DB.prepare(
      `INSERT INTO class_sessions (id, class_id, title, starts_at, ends_at, room_id,
              tolerance_minutes, min_presence_percent, require_checkout, canceled, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)`,
    )
      .bind(
        id,
        classId,
        optionalString(body, 'title'),
        new Date(Date.parse(startsAt) + offset).toISOString(),
        new Date(Date.parse(endsAt) + offset).toISOString(),
        optionalString(body, 'room_id') ?? turma!.room_id,
        optionalNumber(body, 'tolerance_minutes') ?? 10,
        optionalNumber(body, 'min_presence_percent') ?? 75,
        boolToInt(body.require_checkout, 0),
        nowIso(),
      )
      .run();
    created.push(id);
    await recomputeSession(c.env.DB, id);
  }

  return c.json({ ids: created, criadas: created.length }, 201);
});

// --- Relatorio consolidado da turma -----------------------------------------

classRoutes.post('/:id/recompute', async (c) => {
  const total = await recomputeClass(c.env.DB, c.req.param('id'));
  return c.json({ ok: true, aulas_recalculadas: total });
});

classRoutes.get('/:id/report', async (c) => {
  return c.json(await buildClassReport(c.env, c.req.param('id')));
});

classRoutes.get('/:id/report.csv', async (c) => {
  const report = await buildClassReport(c.env, c.req.param('id'));
  const rows = report.students.map((student) => [
    student.full_name,
    student.document ?? '',
    student.department ?? '',
    student.summary.sessions_present,
    student.summary.sessions_partial,
    student.summary.sessions_justified,
    student.summary.sessions_absent,
    student.summary.minutes_present,
    student.summary.minutes_expected,
    student.summary.percent.toFixed(2).replace('.', ','),
    { aprovado: 'Aprovado', reprovado: 'Reprovado', em_andamento: 'Em andamento' }[student.summary.situacao],
  ]);

  const csv = toCsv(
    ['Nome', 'Documento', 'Setor', 'Presencas', 'Parciais', 'Abonadas', 'Faltas',
     'Minutos presentes', 'Minutos realizados', 'Frequencia (%)', 'Situacao'],
    rows,
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="frequencia-${report.turma.code}.csv"`,
    },
  });
});

type Situacao = 'aprovado' | 'reprovado' | 'em_andamento';

interface ReportStudent {
  id: string;
  full_name: string;
  document: string | null;
  department: string | null;
  summary: ReturnType<typeof summarizeClassAttendance> & { situacao: Situacao };
  sessions: Record<string, { status: AttendanceStatus; percent: number; minutes_present: number }>;
}

async function buildClassReport(env: Env, classId: string) {
  const turma = await env.DB.prepare(
    `SELECT cl.id, cl.code, cl.name, cl.instructor, cl.min_attendance_percent, co.name AS course_name
       FROM classes cl JOIN courses co ON co.id = cl.course_id WHERE cl.id = ?1`,
  )
    .bind(classId)
    .first<{
      id: string; code: string; name: string | null; instructor: string | null;
      min_attendance_percent: number; course_name: string;
    }>();
  if (!turma) notFound('turma_nao_encontrada');

  const sessionsQuery = await env.DB.prepare(
    `SELECT id, title, starts_at, ends_at FROM class_sessions
      WHERE class_id = ?1 AND canceled = 0 ORDER BY starts_at`,
  )
    .bind(classId)
    .all<{ id: string; title: string | null; starts_at: string; ends_at: string }>();

  // Aula que ainda nao aconteceu nao pode contar como falta: a frequencia
  // consolidada considera apenas as aulas ja encerradas.
  const agora = nowIso();
  const sessions = (sessionsQuery.results ?? []).map((session) => ({
    ...session,
    realizada: session.ends_at <= agora,
  }));

  const sessionMinutes: Record<string, number> = {};
  let minutosPrevistosTotal = 0;
  for (const session of sessions) {
    const minutes = minutesOfSession(session);
    minutosPrevistosTotal += minutes;
    if (session.realizada) sessionMinutes[session.id] = minutes;
  }
  const minutosPendentes = minutosPrevistosTotal - Object.values(sessionMinutes).reduce((a, b) => a + b, 0);

  const studentsQuery = await env.DB.prepare(
    `SELECT p.id, p.full_name, p.document, p.department
       FROM enrollments e JOIN people p ON p.id = e.person_id
      WHERE e.class_id = ?1 AND e.status = 'ativa' ORDER BY p.full_name`,
  )
    .bind(classId)
    .all<{ id: string; full_name: string; document: string | null; department: string | null }>();

  const attendanceQuery = await env.DB.prepare(
    `SELECT a.session_id, a.person_id, a.status, a.percent, a.minutes_present, a.late, a.left_early
       FROM attendance a JOIN class_sessions s ON s.id = a.session_id
      WHERE s.class_id = ?1 AND s.canceled = 0`,
  )
    .bind(classId)
    .all<{
      session_id: string; person_id: string; status: AttendanceStatus;
      percent: number; minutes_present: number; late: number; left_early: number;
    }>();

  const byPerson = new Map<string, typeof attendanceQuery.results>();
  for (const row of attendanceQuery.results ?? []) {
    const list = byPerson.get(row.person_id) ?? [];
    list.push(row);
    byPerson.set(row.person_id, list);
  }

  const students: ReportStudent[] = (studentsQuery.results ?? []).map((person) => {
    const records = byPerson.get(person.id) ?? [];
    const grid: ReportStudent['sessions'] = {};
    for (const session of sessions) {
      const record = records.find((r) => r.session_id === session.id);
      grid[session.id] = record
        ? { status: record.status, percent: record.percent, minutes_present: record.minutes_present }
        : { status: 'ausente', percent: 0, minutes_present: 0 };
    }

    const summary = summarizeClassAttendance({
      sessionMinutes,
      records: sessions
        .filter((session) => session.realizada)
        .map((session) => ({
          session_id: session.id,
          minutes_present: grid[session.id].minutes_present,
          status: grid[session.id].status,
        })),
      minAttendancePercent: turma!.min_attendance_percent,
    });

    return { ...person, sessions: grid, summary: { ...summary, situacao: situacaoDe(summary) } };
  });

  /**
   * Situacao final so e fechada quando todas as aulas terminaram. Antes disso,
   * "reprovado" so aparece se nem comparecendo a tudo que falta o aluno alcanca
   * a frequencia minima.
   */
  function situacaoDe(summary: ReturnType<typeof summarizeClassAttendance>): Situacao {
    if (minutosPendentes <= 0) return summary.approved ? 'aprovado' : 'reprovado';
    const maximoPossivel =
      minutosPrevistosTotal > 0
        ? ((summary.minutes_present + minutosPendentes) / minutosPrevistosTotal) * 100
        : 0;
    return maximoPossivel < turma!.min_attendance_percent ? 'reprovado' : 'em_andamento';
  }

  return {
    turma: turma!,
    sessions,
    students,
    minutos_previstos_total: Math.round(minutosPrevistosTotal),
    minutos_pendentes: Math.round(minutosPendentes),
  };
}

// --- Aulas (rotas diretas) ---------------------------------------------------

export const sessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

sessionRoutes.get('/', async (c) => {
  const from = c.req.query('from') ?? '1970-01-01T00:00:00.000Z';
  const to = c.req.query('to') ?? '2999-12-31T23:59:59.999Z';
  const classId = c.req.query('class_id') ?? '';

  const rows = await c.env.DB.prepare(
    `SELECT s.*, cl.code AS class_code, cl.name AS class_name, co.name AS course_name, r.name AS room_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = s.class_id AND e.status = 'ativa') AS matriculados,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('presente','justificada')) AS presentes
       FROM class_sessions s
       JOIN classes cl ON cl.id = s.class_id
       JOIN courses co ON co.id = cl.course_id
       LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.starts_at >= ?1 AND s.starts_at <= ?2 AND (?3 = '' OR s.class_id = ?3)
      ORDER BY s.starts_at
      LIMIT 500`,
  )
    .bind(from, to, classId)
    .all();

  return c.json({ sessions: rows.results ?? [] });
});

/** Lista de chamada da aula, com quem estava matriculado e quem apareceu sem estar. */
sessionRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(c.env, id);

  const attendance = await c.env.DB.prepare(
    `SELECT p.id AS person_id, p.full_name, p.department,
            a.status, a.first_seen_at, a.last_seen_at, a.minutes_present, a.percent,
            a.late, a.left_early, a.missing_checkout, a.scan_count, a.source, a.note
       FROM enrollments e
       JOIN people p ON p.id = e.person_id
       LEFT JOIN attendance a ON a.session_id = ?1 AND a.person_id = p.id
      WHERE e.class_id = ?2 AND e.status = 'ativa'
      ORDER BY p.full_name`,
  )
    .bind(id, session.class_id)
    .all();

  // Quem passou o cracha na aula sem estar matriculado.
  const visitors = await c.env.DB.prepare(
    `SELECT s.badge_code, s.person_id, p.full_name, MIN(s.scanned_at) AS first_seen_at,
            MAX(s.scanned_at) AS last_seen_at, COUNT(*) AS scans
       FROM scans s LEFT JOIN people p ON p.id = s.person_id
      WHERE s.session_id = ?1
        AND (s.person_id IS NULL
             OR s.person_id NOT IN (SELECT person_id FROM enrollments WHERE class_id = ?2 AND status = 'ativa'))
      GROUP BY s.badge_code, s.person_id, p.full_name
      ORDER BY first_seen_at`,
  )
    .bind(id, session.class_id)
    .all();

  return c.json({
    session,
    attendance: (attendance.results ?? []).map(normalizeAttendanceRow),
    visitors: visitors.results ?? [],
  });
});

sessionRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await readJson(c);
  const startsAt = requireString(body, 'starts_at');
  const endsAt = requireString(body, 'ends_at');
  if (!isValidIso(startsAt) || !isValidIso(endsAt)) badRequest('data_invalida');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) badRequest('intervalo_invalido');

  const result = await c.env.DB.prepare(
    `UPDATE class_sessions SET title = ?2, starts_at = ?3, ends_at = ?4, room_id = ?5,
            tolerance_minutes = ?6, min_presence_percent = ?7, require_checkout = ?8, canceled = ?9
      WHERE id = ?1`,
  )
    .bind(
      id,
      optionalString(body, 'title'),
      startsAt,
      endsAt,
      optionalString(body, 'room_id'),
      optionalNumber(body, 'tolerance_minutes') ?? 10,
      optionalNumber(body, 'min_presence_percent') ?? 75,
      boolToInt(body.require_checkout, 0),
      boolToInt(body.canceled, 0),
    )
    .run();
  if (!result.meta.changes) notFound('aula_nao_encontrada');

  await recomputeSession(c.env.DB, id);
  return c.json({ ok: true });
});

sessionRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM class_sessions WHERE id = ?1`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

sessionRoutes.post('/:id/recompute', async (c) => {
  const total = await recomputeSession(c.env.DB, c.req.param('id'));
  return c.json({ ok: true, alunos: total });
});

/** Ajuste manual do instrutor (abono, atestado, presenca sem cracha). */
sessionRoutes.put('/:id/attendance/:personId', async (c) => {
  const sessionId = c.req.param('id');
  const personId = c.req.param('personId');
  const body = await readJson(c);
  const status = requireString(body, 'status') as AttendanceStatus;
  if (!STATUSES.includes(status)) badRequest('status_invalido', `Use um de: ${STATUSES.join(', ')}.`);

  const session = await loadSession(c.env, sessionId);
  await c.env.DB.prepare(
    `INSERT INTO attendance_overrides (id, session_id, person_id, status, justification, created_by, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (session_id, person_id) DO UPDATE SET
       status = excluded.status, justification = excluded.justification,
       created_by = excluded.created_by, created_at = excluded.created_at`,
  )
    .bind(
      randomId('ovr_'),
      sessionId,
      personId,
      status,
      optionalString(body, 'justification'),
      c.get('user')?.id ?? null,
      nowIso(),
    )
    .run();

  await recomputePerson(c.env.DB, session, personId);
  return c.json({ ok: true });
});

/** Remove o ajuste manual e volta ao calculo automatico das leituras. */
sessionRoutes.delete('/:id/attendance/:personId', async (c) => {
  const sessionId = c.req.param('id');
  const personId = c.req.param('personId');
  await c.env.DB.prepare(`DELETE FROM attendance_overrides WHERE session_id = ?1 AND person_id = ?2`)
    .bind(sessionId, personId)
    .run();

  await recomputePerson(c.env.DB, await loadSession(c.env, sessionId), personId);
  return c.json({ ok: true });
});

sessionRoutes.get('/:id/report.csv', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(c.env, id);
  const rows = await c.env.DB.prepare(
    `SELECT p.full_name, p.document, p.department, a.status, a.first_seen_at, a.last_seen_at,
            a.minutes_present, a.percent, a.late, a.left_early, a.note
       FROM enrollments e JOIN people p ON p.id = e.person_id
       LEFT JOIN attendance a ON a.session_id = ?1 AND a.person_id = p.id
      WHERE e.class_id = ?2 AND e.status = 'ativa' ORDER BY p.full_name`,
  )
    .bind(id, session.class_id)
    .all<Record<string, string | number | null>>();

  const csv = toCsv(
    ['Nome', 'Documento', 'Setor', 'Situacao', 'Entrada', 'Saida', 'Minutos', 'Presenca (%)', 'Atrasado', 'Saiu antes', 'Observacao'],
    (rows.results ?? []).map((row) => [
      row.full_name,
      row.document ?? '',
      row.department ?? '',
      row.status ?? 'ausente',
      formatLocal(row.first_seen_at as string | null, c.env),
      formatLocal(row.last_seen_at as string | null, c.env),
      row.minutes_present ?? 0,
      String(row.percent ?? 0).replace('.', ','),
      row.late ? 'Sim' : 'Nao',
      row.left_early ? 'Sim' : 'Nao',
      row.note ?? '',
    ]),
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="chamada-${id}.csv"`,
    },
  });
});

async function loadSession(env: Env, id: string): Promise<ClassSessionRow & Record<string, unknown>> {
  const session = await env.DB.prepare(
    `SELECT s.*, cl.code AS class_code, cl.name AS class_name, cl.instructor,
            co.name AS course_name, r.name AS room_name
       FROM class_sessions s
       JOIN classes cl ON cl.id = s.class_id
       JOIN courses co ON co.id = cl.course_id
       LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.id = ?1`,
  )
    .bind(id)
    .first<ClassSessionRow & Record<string, unknown>>();
  if (!session) notFound('aula_nao_encontrada');
  return session!;
}

function normalizeAttendanceRow(row: Record<string, unknown>) {
  // Aluno matriculado que ainda nao tem linha calculada aparece como ausente.
  return { ...row, status: (row.status as AttendanceStatus | null) ?? 'ausente' };
}

function formatLocal(iso: string | null, env: Env): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: env.APP_TIMEZONE ?? 'America/Sao_Paulo' });
}
