#!/usr/bin/env node
'use strict';
/**
 * Popula o banco com dados FICTÍCIOS para demonstração e testes.
 * Nunca execute em produção: use `node scripts/seed.js --confirmar`.
 */
const { obter } = require('../src/db');
const auth = require('../src/auth');
const { agora } = require('../src/util');

if (!process.argv.includes('--confirmar')) {
  console.error('Este script insere dados fictícios. Confirme com: node scripts/seed.js --confirmar');
  process.exit(1);
}

const db = obter();
const SENHA = 'Portal@2026';

const divisoes = [
  { divisao: 'Divisão Industrial', diretoria: 'Diretoria de Operações' },
  { divisao: 'Divisão de Engenharia', diretoria: 'Diretoria de Operações' },
  { divisao: 'Divisão Comercial', diretoria: 'Diretoria Comercial' },
  { divisao: 'Divisão Administrativa', diretoria: 'Diretoria Corporativa' },
  { divisao: 'Divisão de TI', diretoria: 'Diretoria Corporativa' },
];
const cargos = ['Analista I', 'Analista II', 'Analista Sênior', 'Coordenador', 'Especialista', 'Assistente', 'Técnico', 'Supervisor'];
const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Queila', 'Rafael', 'Sabrina', 'Tiago'];
const sobrenomes = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Ferreira', 'Gomes', 'Haas', 'Iglesias', 'Jung', 'Klein', 'Lima', 'Moraes', 'Nunes', 'Oliveira', 'Pereira'];

function usuarioDemo(usuario, nome, perfil, escopos = []) {
  const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
  const id = existente
    ? (db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, senha_hash = ?, ativo = 1, trocar_senha = 0 WHERE id = ?')
        .run(nome, perfil, auth.gerarHash(SENHA), existente.id), existente.id)
    : db.prepare(`INSERT INTO usuarios (usuario, nome, senha_hash, perfil, ativo, trocar_senha, criado_em)
                  VALUES (?, ?, ?, ?, 1, 0, ?)`).run(usuario, nome, auth.gerarHash(SENHA), perfil, agora()).lastInsertRowid;
  db.prepare('DELETE FROM usuario_escopos WHERE usuario_id = ?').run(id);
  for (const e of escopos) db.prepare('INSERT OR IGNORE INTO usuario_escopos (usuario_id, valor) VALUES (?, ?)').run(id, e);
  return id;
}

usuarioDemo('rh.admin', 'Administração de RH', 'admin');
usuarioDemo('diretor.geral', 'Diretor Geral', 'diretor');
usuarioDemo('gestor.industrial', 'Gestor Industrial', 'gestor', ['Divisão Industrial']);
usuarioDemo('gestor.corporativo', 'Gestor Corporativo', 'gestor', ['Divisão Administrativa', 'Divisão de TI']);

const inserir = db.prepare(`
  INSERT INTO colaboradores (matricula, nome, escopo, dados, criado_em, atualizado_em)
  VALUES (@matricula, @nome, @escopo, @dados, @criado_em, @atualizado_em)
  ON CONFLICT(matricula) DO UPDATE SET dados = excluded.dados, escopo = excluded.escopo, nome = excluded.nome
`);

const criar = db.transaction(() => {
  for (let i = 1; i <= 120; i++) {
    const d = divisoes[i % divisoes.length];
    const nome = `${nomes[i % nomes.length]} ${sobrenomes[(i * 3) % sobrenomes.length]}`;
    const desligado = i % 17 === 0;
    const comEstabilidade = i % 11 === 0;
    const dados = {
      matricula: String(10000 + i),
      nome,
      diretoria: d.diretoria,
      divisao: d.divisao,
      area: `Área ${String.fromCharCode(65 + (i % 6))}`,
      cargo: cargos[i % cargos.length],
      gestor_imediato: `Gestor ${d.divisao.split(' ').pop()}`,
      data_admissao: `20${10 + (i % 15)}-${String(1 + (i % 12)).padStart(2, '0')}-1${i % 9}`,
      custo_mensal: 4200 + (i % 23) * 730,
      situacao: desligado ? 'Desligado' : 'Ativo',
      estabilidade: comEstabilidade ? (i % 22 === 0 ? 'Gestante' : 'CIPA') : '',
      estabilidade_ate: comEstabilidade ? '2026-12-3' + (i % 2) : '',
      observacoes: '',
    };
    inserir.run({
      matricula: dados.matricula, nome, escopo: d.divisao,
      dados: JSON.stringify(dados), criado_em: agora(), atualizado_em: agora(),
    });
  }
});
criar();

console.log('Dados fictícios criados.');
console.log(`Usuários de demonstração (senha "${SENHA}"): rh.admin, diretor.geral, gestor.industrial, gestor.corporativo`);
