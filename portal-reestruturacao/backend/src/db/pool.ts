import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config.js';

// Bancos gerenciados (Supabase, Neon, Render externo) exigem TLS: ligue com DB_SSL=true.
export const pool = new Pool({
  connectionString: config.bancoUrl,
  max: 10,
  ...(config.bancoSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function consultar<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const resultado = await pool.query<T>(sql, params as never[]);
  return resultado.rows;
}

export async function consultarUm<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const linhas = await consultar<T>(sql, params);
  return linhas[0] ?? null;
}

/** Executa um bloco dentro de uma transação, com rollback automático em caso de erro. */
export async function emTransacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

export async function encerrarPool(): Promise<void> {
  await pool.end();
}
