import { parseTimestamp } from '../lib/time';

export interface NormalizedEvent {
  badge: string;
  scannedAt: string;
  direction: 'entrada' | 'saida' | 'desconhecida';
  externalId: string | null;
  raw: string;
}

// Cada leitor de cracha nomeia os campos de um jeito. Em vez de exigir um
// formato unico, aceitamos os nomes mais comuns do mercado.
const BADGE_KEYS = [
  'badge', 'badge_code', 'badgeCode', 'cracha', 'card', 'card_number', 'cardNumber',
  'cartao', 'code', 'codigo', 'credential', 'pis', 'matricula', 'registration',
  'user_id', 'userId', 'tag', 'rfid', 'uid',
];

const TIME_KEYS = [
  'scanned_at', 'scannedAt', 'timestamp', 'time', 'at', 'datetime', 'date_time',
  'data_hora', 'dataHora', 'event_time', 'eventTime', 'occurred_at', 'log_time',
  'created_at', 'date',
];

const DIRECTION_KEYS = ['direction', 'sentido', 'io', 'in_out', 'event', 'type', 'tipo', 'movement'];

const EXTERNAL_ID_KEYS = ['external_id', 'externalId', 'log_id', 'logId', 'event_id', 'record_id', 'sequence', 'id'];

const LIST_KEYS = ['events', 'eventos', 'values', 'logs', 'records', 'registros', 'data', 'items', 'access_logs'];

/**
 * Extrai a lista de leituras de qualquer um dos formatos aceitos:
 *  - objeto unico: {"badge": "123", "timestamp": "..."}
 *  - lote: {"events": [...]} / {"values": [...]} (padrao Control iD) / array puro
 */
export function normalizeEvents(payload: unknown, timezone: string): {
  events: NormalizedEvent[];
  invalid: Array<{ raw: unknown; reason: string }>;
} {
  const candidates = extractList(payload);
  const events: NormalizedEvent[] = [];
  const invalid: Array<{ raw: unknown; reason: string }> = [];

  for (const item of candidates) {
    if (item === null || typeof item !== 'object') {
      invalid.push({ raw: item, reason: 'evento_invalido' });
      continue;
    }
    const record = item as Record<string, unknown>;

    const badge = firstString(record, BADGE_KEYS);
    if (!badge) {
      invalid.push({ raw: item, reason: 'cracha_ausente' });
      continue;
    }

    const rawTime = firstValue(record, TIME_KEYS);
    // Leitor sem relogio sincronizado ou sem campo de hora: usa o horario de chegada.
    const scannedAt = rawTime === undefined ? new Date().toISOString() : parseTimestamp(rawTime, timezone);
    if (!scannedAt) {
      invalid.push({ raw: item, reason: 'data_invalida' });
      continue;
    }

    events.push({
      badge: normalizeBadge(badge),
      scannedAt,
      direction: normalizeDirection(firstValue(record, DIRECTION_KEYS)),
      externalId: firstString(record, EXTERNAL_ID_KEYS),
      raw: JSON.stringify(item).slice(0, 2000),
    });
  }

  return { events, invalid };
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload === null || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  for (const key of LIST_KEYS) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [payload];
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = firstValue(record, keys);
  return value === undefined ? null : String(value).trim();
}

/**
 * Alguns leitores mandam o numero com zeros a esquerda, outros nao.
 * Normalizamos para casar sempre com o cadastro.
 */
export function normalizeBadge(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return /^\d+$/.test(trimmed) ? String(BigInt(trimmed)) : trimmed;
}

function normalizeDirection(value: unknown): 'entrada' | 'saida' | 'desconhecida' {
  if (value === undefined || value === null) return 'desconhecida';
  const text = String(value).trim().toLowerCase();
  if (['in', 'entrada', 'entry', 'checkin', 'check_in', 'e', '1'].includes(text)) return 'entrada';
  if (['out', 'saida', 'saída', 'exit', 'checkout', 'check_out', 's', '2'].includes(text)) return 'saida';
  return 'desconhecida';
}
