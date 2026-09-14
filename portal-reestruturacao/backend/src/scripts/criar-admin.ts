import readline from 'node:readline/promises';
import { consultarUm, encerrarPool, pool } from '../db/pool.js';
import { gerarHash, validarSenha } from '../http/auth.js';
import { semear } from '../db/semear.js';

/**
 * Cria (ou atualiza) o usuário administrador inicial.
 * Uso: npm run criar-admin -- <usuario> "<Nome>" [senha]
 */
async function principal(): Promise<void> {
  const [usuario, nome, senhaArg] = process.argv.slice(2);
  if (!usuario || !nome) {
    console.error('Uso: npm run criar-admin -- <usuario> "<Nome completo>" [senha]');
    process.exitCode = 1;
    return;
  }

  await semear();

  let senha = senhaArg;
  if (!senha) {
    const leitor = readline.createInterface({ input: process.stdin, output: process.stdout });
    senha = await leitor.question('Senha (mín. 10 caracteres, com letras e números): ');
    leitor.close();
  }
  const problema = validarSenha(senha);
  if (problema) {
    console.error(problema);
    process.exitCode = 1;
    return;
  }

  const existente = await consultarUm<{ id: number }>('SELECT id FROM usuarios WHERE lower(usuario) = lower($1)', [usuario]);
  if (existente) {
    await pool.query(
      'UPDATE usuarios SET nome = $1, perfil = $2, senha_hash = $3, ativo = true, trocar_senha = $4 WHERE id = $5',
      [nome, 'admin', gerarHash(senha), !senhaArg, existente.id],
    );
    console.log(`Usuário "${usuario}" atualizado como administrador.`);
  } else {
    await pool.query(
      'INSERT INTO usuarios (usuario, nome, senha_hash, perfil, trocar_senha) VALUES ($1, $2, $3, $4, $5)',
      [usuario.toLowerCase(), nome, gerarHash(senha), 'admin', !senhaArg],
    );
    console.log(`Administrador "${usuario}" criado.`);
  }
}

principal()
  .catch((erro) => {
    console.error('Falha:', erro);
    process.exitCode = 1;
  })
  .finally(() => encerrarPool());
