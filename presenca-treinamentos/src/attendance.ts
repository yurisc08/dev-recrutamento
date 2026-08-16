import type { AttendanceStatus } from './types';
import { minutesBetween } from './lib/time';

export interface SessionConfig {
  starts_at: string;
  ends_at: string;
  tolerance_minutes: number;
  min_presence_percent: number;
  require_checkout: number | boolean;
}

export interface AttendanceResult {
  status: AttendanceStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
  minutes_present: number;
  percent: number;
  late: boolean;
  left_early: boolean;
  missing_checkout: boolean;
  scan_count: number;
}

/**
 * Calcula a presenca de UMA pessoa em UMA aula a partir das leituras de cracha.
 *
 * Regras:
 *  - sem leitura            -> ausente;
 *  - 1 leitura              -> entrada; se a aula nao exige leitura de saida,
 *                              considera que a pessoa ficou ate o fim;
 *  - 2+ leituras            -> primeira = entrada, ultima = saida;
 *  - o tempo e sempre recortado dentro do intervalo da aula (quem chega 20 min
 *    antes nao ganha credito extra);
 *  - presenca = tempo dentro da aula / duracao da aula. Atingindo o minimo
 *    configurado o status e "presente", senao "parcial";
 *  - atraso e saida antecipada usam a tolerancia em minutos da aula.
 */
export function computeAttendance(session: SessionConfig, scanTimes: string[]): AttendanceResult {
  const start = Date.parse(session.starts_at);
  const end = Date.parse(session.ends_at);
  const durationMinutes = Math.max(0, (end - start) / 60000);
  const tolerance = session.tolerance_minutes * 60000;
  const requireCheckout = Boolean(session.require_checkout);

  const times = scanTimes
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (times.length === 0 || durationMinutes <= 0) {
    return {
      status: 'ausente',
      first_seen_at: null,
      last_seen_at: null,
      minutes_present: 0,
      percent: 0,
      late: false,
      left_early: false,
      missing_checkout: false,
      scan_count: times.length,
    };
  }

  const firstScan = times[0];
  const lastScan = times[times.length - 1];
  const hasCheckout = times.length > 1;

  const checkIn = clamp(firstScan, start, end);
  // Uma unica leitura: sem exigencia de saida, assume permanencia ate o fim.
  const rawCheckout = hasCheckout ? lastScan : requireCheckout ? firstScan : end;
  const checkOut = Math.max(checkIn, clamp(rawCheckout, start, end));

  const minutesPresent = Math.round((checkOut - checkIn) / 60000);
  const percent = round2((minutesPresent / durationMinutes) * 100);

  const late = firstScan > start + tolerance;
  const leftEarly = hasCheckout && checkOut < end - tolerance;
  const missingCheckout = requireCheckout && !hasCheckout;

  const status: AttendanceStatus = percent >= session.min_presence_percent ? 'presente' : 'parcial';

  return {
    status,
    first_seen_at: new Date(firstScan).toISOString(),
    last_seen_at: new Date(lastScan).toISOString(),
    minutes_present: minutesPresent,
    percent,
    late,
    left_early: leftEarly,
    missing_checkout: missingCheckout,
    scan_count: times.length,
  };
}

export interface ClassSummaryInput {
  sessionMinutes: Record<string, number>; // id da aula -> duracao prevista
  records: Array<{ session_id: string; minutes_present: number; status: AttendanceStatus }>;
  minAttendancePercent: number;
}

export interface ClassSummary {
  minutes_expected: number;
  minutes_present: number;
  percent: number;
  sessions_present: number;
  sessions_partial: number;
  sessions_absent: number;
  sessions_justified: number;
  approved: boolean;
}

/** Consolida a frequencia de uma pessoa na turma inteira. */
export function summarizeClassAttendance(input: ClassSummaryInput): ClassSummary {
  const minutesExpected = Object.values(input.sessionMinutes).reduce((sum, m) => sum + m, 0);
  let minutesPresent = 0;
  let present = 0;
  let partial = 0;
  let absent = 0;
  let justified = 0;

  for (const record of input.records) {
    const expected = input.sessionMinutes[record.session_id] ?? 0;
    switch (record.status) {
      case 'presente':
        present++;
        minutesPresent += record.minutes_present;
        break;
      case 'parcial':
        partial++;
        minutesPresent += record.minutes_present;
        break;
      case 'justificada':
        // Falta abonada conta como tempo cumprido para efeito de frequencia.
        justified++;
        minutesPresent += expected;
        break;
      default:
        absent++;
    }
  }

  const percent = minutesExpected > 0 ? round2((minutesPresent / minutesExpected) * 100) : 0;

  return {
    minutes_expected: Math.round(minutesExpected),
    minutes_present: Math.round(minutesPresent),
    percent,
    sessions_present: present,
    sessions_partial: partial,
    sessions_absent: absent,
    sessions_justified: justified,
    approved: percent >= input.minAttendancePercent,
  };
}

/**
 * Escolhe a qual aula uma leitura pertence. Prioriza:
 *  1. aula acontecendo no momento da leitura;
 *  2. aula na mesma sala do leitor;
 *  3. aula mais proxima no tempo dentro da janela de tolerancia.
 */
export function pickSessionForScan<
  T extends { id: string; starts_at: string; ends_at: string; room_id: string | null },
>(scanIso: string, candidates: T[], deviceRoomId: string | null): T | null {
  const scan = Date.parse(scanIso);
  if (Number.isNaN(scan) || candidates.length === 0) return null;

  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const start = Date.parse(candidate.starts_at);
    const end = Date.parse(candidate.ends_at);
    const inside = scan >= start && scan <= end;
    const distance = inside ? 0 : Math.min(Math.abs(scan - start), Math.abs(scan - end));
    const sameRoom = deviceRoomId !== null && candidate.room_id === deviceRoomId;

    // Menor pontuacao vence: dentro da aula e mesma sala pesam mais que a distancia.
    const score = distance + (inside ? 0 : 60 * 60 * 1000) + (sameRoom ? 0 : 30 * 60 * 1000);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function minutesOfSession(session: { starts_at: string; ends_at: string }): number {
  return Math.max(0, minutesBetween(session.starts_at, session.ends_at));
}
