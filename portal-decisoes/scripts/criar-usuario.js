#!/usr/bin/env node
'use strict';
/**
 * Cria (ou atualiza) um usuário pela linha de comando.
 * Uso: node scripts/criar-usuario.js <usuario> <"Nome Completo"> <perfil> [senha] [divisao1,divisao2]
 * Perfis: admin | diretor | gestor
 */
const readline = require('readline');
const { obter } = require('../src/db');
const auth = require('../src/auth');
const { agora } = require('../src/util');

async function perguntarSenha() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const resposta = await new Promise((r) => rl.question('Senha (mín. 10 caracteres, letras e números): ', r));
  rl.close();
  return resposta;
}

(async () => {
  const [usuario, nome, perfil, senhaArg, escoposArg] = process.argv.slice(2);
  if (!usuario || !nome || !perfil) {
    console.error('Uso: node scripts/criar-usuario.js <usuario> <"Nome"> <admin|diretor|gestor> [senha] [divisoes]');
    process.exit(1);
  }
  if (!['admin', 'diretor', 'gestor'].includes(perfil)) {
    console.error('Perfil inválido. Use admin, diretor ou gestor.');
    process.exit(1);
  }
  const senha = senhaArg || (await perguntarSenha());
  const erro = auth.validarSenha(senha);
  if (erro) { console.error(erro); process.exit(1); }

  const db = obter();
  const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
  let id;
  if (existente) {
    db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, senha_hash = ?, ativo = 1, trocar_senha = ? WHERE id = ?')
      .run(nome, perfil, auth.gerarHash(senha), senhaArg ? 1 : 0, existente.id);
    id = existente.id;
    console.log(`Usuário "${usuario}" atualizado.`);
  } else {
    const info = db.prepare(`
      INSERT INTO usuarios (usuario, nome, senha_hash, perfil, ativo, trocar_senha, criado_em)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(usuario, nome, auth.gerarHash(senha), perfil, senhaArg ? 1 : 0, agora());
    id = info.lastInsertRowid;
    console.log(`Usuário "${usuario}" criado com perfil ${perfil}.`);
  }
  if (escoposArg) {
    db.prepare('DELETE FROM usuario_escopos WHERE usuario_id = ?').run(id);
    for (const valor of escoposArg.split(',').map((v) => v.trim()).filter(Boolean)) {
      db.prepare('INSERT OR IGNORE INTO usuario_escopos (usuario_id, valor) VALUES (?, ?)').run(id, valor);
    }
    console.log(`Divisões atribuídas: ${escoposArg}`);
  }
})();
