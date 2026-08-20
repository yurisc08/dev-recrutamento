import type { Context } from "hono";

/** Erro com status HTTP, para o handler central transformar em JSON. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function unauthorized(message = "Autenticacao necessaria."): HttpError {
  return new HttpError(401, message);
}

export function notFound(message = "Nao encontrado."): HttpError {
  return new HttpError(404, message);
}

/** Le e valida o corpo JSON da requisicao. */
export async function readJson<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw badRequest("Corpo da requisicao precisa ser JSON valido.");
  }
}

export function requireString(
  value: unknown,
  field: string,
  { maxLength = 8000 }: { maxLength?: number } = {},
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`O campo "${field}" e obrigatorio.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(
      `O campo "${field}" excede o limite de ${maxLength} caracteres.`,
    );
  }
  return trimmed;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw badRequest(`O campo "${field}" precisa ser um UUID valido.`);
  }
  return value;
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireUuid(value, field);
}
