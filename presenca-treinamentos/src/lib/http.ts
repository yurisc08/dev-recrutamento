import type { Context } from 'hono';

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function badRequest(code: string, message?: string): never {
  throw new HttpError(400, code, message);
}

export function notFound(code = 'nao_encontrado', message?: string): never {
  throw new HttpError(404, code, message);
}

/** Le e valida o corpo JSON da requisicao. */
export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    const body = await c.req.json();
    if (body === null || typeof body !== 'object') badRequest('json_invalido');
    return body as T;
  } catch {
    return badRequest('json_invalido', 'Corpo da requisicao precisa ser um JSON valido.');
  }
}

export function requireString(body: Record<string, unknown>, field: string, max = 255): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    badRequest('campo_obrigatorio', `O campo "${field}" e obrigatorio.`);
  }
  const text = (value as string).trim();
  if (text.length > max) badRequest('campo_muito_longo', `O campo "${field}" excede ${max} caracteres.`);
  return text;
}

export function optionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim();
}

export function optionalNumber(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) badRequest('campo_numerico', `O campo "${field}" precisa ser numerico.`);
  return num;
}

export function boolToInt(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

/** Gera CSV com BOM para abrir corretamente no Excel em portugues. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escape = (value: string | number | null) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))];
  return '﻿' + lines.join('\r\n');
}
