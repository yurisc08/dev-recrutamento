/**
 * Cria (ou redefine) o usuário administrador inicial no banco do Supabase.
 *
 * Roda na sua máquina, não no Worker — a senha nunca passa pela nuvem em texto,
 * só o hash PBKDF2 é gravado.
 *
 *   DATABASE_URL="postgres://..." ADMIN_SENHA="..." npx tsx scripts/criar-admin.ts
 */
import postgres from 'postgres';
import { gerarHash, senhaProvisoria, validarSenha } from '../src/senha.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL com a string de conexão do Supabase (pooler, porta 6543).');
  process.exit(1);
}

const usuario = (process.env.ADMIN_USUARIO ?? 'rh.admin').trim().toLowerCase();
const nome = process.env.ADMIN_NOME ?? 'Administrador RH';
const email = process.env.ADMIN_EMAIL ?? null;
const senha = process.env.ADMIN_SENHA ?? senhaProvisoria();
const gerada = !process.env.ADMIN_SENHA;

const problema = validarSenha(senha);
if (problema) {
  console.error(`Senha recusada: ${problema}`);
  process.exit(1);
}

const sql = postgres(url, {
  ssl: process.env.DB_SSL === 'false' ? false : 'require',
  prepare: false,
  max: 1,
});

try {
  const hash = await gerarHash(senha);
  const [linha] = await sql<{ id: number; criado: boolean }[]>`
    INSERT INTO portal.usuarios (usuario, nome, email, perfil, senha_hash, trocar_senha, ativo)
    VALUES (${usuario}, ${nome}, ${email}, 'admin', ${hash}, ${gerada}, true)
    ON CONFLICT (usuario) DO UPDATE
      SET nome = EXCLUDED.nome, email = EXCLUDED.email, perfil = 'admin',
          senha_hash = EXCLUDED.senha_hash, trocar_senha = EXCLUDED.trocar_senha, ativo = true
    RETURNING id, (xmax = 0) AS criado`;

  console.log(`${linha.criado ? 'Criado' : 'Atualizado'} o administrador "${usuario}" (id ${linha.id}).`);
  if (gerada) {
    console.log(`Senha provisória: ${senha}`);
    console.log('Troca obrigatória no primeiro acesso.');
  }
} finally {
  await sql.end();
}
