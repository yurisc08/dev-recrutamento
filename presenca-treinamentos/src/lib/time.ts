/** Horarios sao sempre gravados em UTC no formato ISO-8601 com milissegundos. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Aceita o que os leitores costumam mandar: ISO com ou sem fuso, epoch em
 * segundos/milissegundos e "YYYY-MM-DD HH:MM:SS". Sem fuso explicito o horario
 * e interpretado no fuso informado (padrao: horario de Brasilia).
 */
export function parseTimestamp(value: unknown, timezone = 'America/Sao_Paulo'): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' || /^\d{9,13}$/.test(String(value).trim())) {
    const num = Number(value);
    const ms = num > 1e11 ? num : num * 1000; // epoch em segundos ou milissegundos
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = String(value).trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');

  if (hasZone) {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const local = new Date(normalized + 'Z');
  if (Number.isNaN(local.getTime())) return null;
  // Desconta o offset do fuso local do dispositivo para chegar no UTC real.
  return new Date(local.getTime() - timezoneOffsetMs(local, timezone)).toISOString();
}

/** Offset do fuso (em ms) vigente naquele instante, considerando horario de verao. */
export function timezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function minutesBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 60000;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

export function isValidIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
