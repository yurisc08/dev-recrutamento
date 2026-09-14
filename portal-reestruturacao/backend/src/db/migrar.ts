import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, encerrarPool } from './pool.js';

/** Aplica o esquema (idempotente: todos os objetos usam IF NOT EXISTS). */
export async function migrar(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'esquema.sql'), 'utf8');
  await pool.query(sql);
}

if (require.main === module) {
  migrar()
    .then(() => console.log('Esquema aplicado com sucesso.'))
    .catch((erro) => {
      console.error('Falha ao aplicar o esquema:', erro);
      process.exitCode = 1;
    })
    .finally(() => encerrarPool());
}
