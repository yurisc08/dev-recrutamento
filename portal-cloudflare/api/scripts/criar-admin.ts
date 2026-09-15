/**
 * Cria (ou redefine) o usuário administrador inicial no banco do Supabase.
 *
 * Roda na sua máquina, não no Worker — a senha nunca passa pela nuvem em texto,
 * só o hash PBKDF2 é gravado.
 *
 *   DATABASE_URL="postgres://..." ADMIN_SENHA="..." npx tsx scripts/criar-admin.ts
 */
import postgres from 'postgres';
import { gerarHash, novoConvite, resumoConvite, validarSenha } from '../src/senha.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL com a string de conexão do Supabase (pooler, porta 6543).');
  process.exit(1);
}

const usuario = (process.env.ADMIN_USUARIO ?? 'rh.admin').trim().toLowerCase();
const nome = process.env.ADMIN_NOME ?? 'Administrador RH';
const email = process.env.ADMIN_EMAIL ?? null;
/**
 * Com ADMIN_SENHA, o acesso já nasce com a senha que você escolheu. Sem ela, o
 * acesso nasce SEM senha e sai um link de primeiro acesso para você definir a
 * sua — que é como todo mundo entra no portal.
 */
const senha = process.env.ADMIN_SENHA ?? null;
if (senha) {
  const problema = validarSenha(senha);
  if (problema) {
    console.error(`Senha recusada: ${problema}`);
    process.exit(1);
  }
}

const sql = postgres(url, {
  ssl: process.env.DB_SSL === 'false' ? false : 'require',
  prepare: false,
  max: 1,
});

try {
  const hash = senha ? await gerarHash(senha) : null;
  const convite = senha ? null : novoConvite();
  const expira = convite ? new Date(Date.now() + 7 * 86400 * 1000) : null;
  const resumo = convite ? await resumoConvite(convite) : null;

  const [linha] = await sql<{ id: number; criado: boolean }[]>`
    INSERT INTO portal.usuarios (usuario, nome, email, perfil, senha_hash, trocar_senha, ativo,
                                 ativacao_hash, ativacao_expira_em, senha_definida_em)
    VALUES (${usuario}, ${nome}, ${email}, 'admin', ${hash}, false, true,
            ${resumo}, ${expira}, ${hash ? new Date() : null})
    ON CONFLICT (usuario) DO UPDATE
      SET nome = EXCLUDED.nome, email = EXCLUDED.email, perfil = 'admin', ativo = true,
          senha_hash = EXCLUDED.senha_hash, trocar_senha = false,
          ativacao_hash = EXCLUDED.ativacao_hash, ativacao_expira_em = EXCLUDED.ativacao_expira_em,
          senha_definida_em = EXCLUDED.senha_definida_em
    RETURNING id, (xmax = 0) AS criado`;

  console.log(`${linha.criado ? 'Criado' : 'Atualizado'} o administrador "${usuario}" (id ${linha.id}).`);
  if (convite) {
    console.log('\nAbra este link no portal para definir a sua senha (vale por 7 dias, uso único):');
    console.log(`  https://portal.suaempresa.com.br/ativar?t=${convite}`);
    console.log('\nTrocando o domínio pelo endereço real do portal.');
  } else {
    console.log('Entre com a senha que você definiu em ADMIN_SENHA.');
  }
} finally {
  await sql.end();
}
