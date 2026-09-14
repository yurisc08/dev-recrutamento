import postgres from 'postgres';
import type { Ambiente } from './tipos.js';

/**
 * Conexão com o Supabase.
 *
 * No Workers cada requisição abre e fecha a própria conexão — por isso o
 * endereço deve ser o do **pooler em modo transação** (porta 6543), e
 * "prepare: false" é obrigatório: o pooler não mantém prepared statements.
 */
export function conectar(env: Ambiente) {
  return postgres(env.DATABASE_URL, {
    // Supabase exige TLS. DB_SSL=false existe só para banco local em teste.
    ssl: env.DB_SSL === 'false' ? false : 'require',
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    // int8 volta como texto (padrão do driver): evita BigInt não serializável em JSON.
  });
}
