'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const { agora } = require('./util');

let db;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome          TEXT NOT NULL,
  email         TEXT,
  senha_hash    TEXT NOT NULL,
  perfil        TEXT NOT NULL CHECK (perfil IN ('admin','diretor','gestor')),
  ativo         INTEGER NOT NULL DEFAULT 1,
  trocar_senha  INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL,
  ultimo_acesso TEXT
);

CREATE TABLE IF NOT EXISTS usuario_escopos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor      TEXT NOT NULL,
  PRIMARY KEY (usuario_id, valor)
);

CREATE TABLE IF NOT EXISTS sessoes (
  id         TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL,
  ip         TEXT,
  navegador  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS tentativas_login (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario   TEXT,
  ip        TEXT,
  sucesso   INTEGER NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tentativas ON tentativas_login(usuario, criado_em);

CREATE TABLE IF NOT EXISTS colunas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chave     TEXT NOT NULL UNIQUE,
  rotulo    TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('texto','numero','moeda','data','lista','booleano')),
  opcoes    TEXT,
  sistema   INTEGER NOT NULL DEFAULT 0,
  editavel  TEXT NOT NULL DEFAULT 'nao' CHECK (editavel IN ('nao','gestor','diretor','admin')),
  visivel   INTEGER NOT NULL DEFAULT 1,
  fixada    INTEGER NOT NULL DEFAULT 0,
  somar     INTEGER NOT NULL DEFAULT 0,
  agrupar   INTEGER NOT NULL DEFAULT 0,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ajuda     TEXT,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula      TEXT NOT NULL UNIQUE,
  nome           TEXT,
  escopo         TEXT,
  dados          TEXT NOT NULL DEFAULT '{}',
  acao           TEXT,
  justificativa  TEXT,
  decidido_por   INTEGER REFERENCES usuarios(id),
  decidido_em    TEXT,
  homologado     INTEGER NOT NULL DEFAULT 0,
  homologado_por INTEGER REFERENCES usuarios(id),
  homologado_em  TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_colab_escopo ON colaboradores(escopo);
CREATE INDEX IF NOT EXISTS idx_colab_acao ON colaboradores(acao);

CREATE TABLE IF NOT EXISTS historico (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  matricula      TEXT,
  usuario_id     INTEGER,
  usuario_nome   TEXT,
  campo          TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo     TEXT,
  origem         TEXT NOT NULL DEFAULT 'portal',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hist_colab ON historico(colaborador_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_hist_data ON historico(criado_em);

CREATE TABLE IF NOT EXISTS importacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER,
  usuario_nome  TEXT,
  arquivo       TEXT,
  linhas        INTEGER NOT NULL DEFAULT 0,
  criados       INTEGER NOT NULL DEFAULT 0,
  atualizados   INTEGER NOT NULL DEFAULT 0,
  ignorados     INTEGER NOT NULL DEFAULT 0,
  resumo        TEXT,
  criado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

// Colunas entregues prontas, espelhando a aba "2. Base Decisões" da planilha do RH.
const COLUNAS_PADRAO = [
  { chave: 'matricula', rotulo: 'Matrícula', tipo: 'texto', sistema: 1, fixada: 1, editavel: 'admin' },
  { chave: 'nome', rotulo: 'Nome', tipo: 'texto', sistema: 1, fixada: 1, editavel: 'admin' },
  { chave: 'diretoria', rotulo: 'Diretoria', tipo: 'texto', sistema: 1, editavel: 'admin', agrupar: 1 },
  { chave: 'divisao', rotulo: 'Divisão', tipo: 'texto', sistema: 1, editavel: 'admin', agrupar: 1 },
  { chave: 'area', rotulo: 'Área', tipo: 'texto', editavel: 'admin', agrupar: 1 },
  { chave: 'cargo', rotulo: 'Cargo', tipo: 'texto', editavel: 'admin' },
  { chave: 'gestor_imediato', rotulo: 'Gestor imediato', tipo: 'texto', editavel: 'admin' },
  { chave: 'data_admissao', rotulo: 'Data de admissão', tipo: 'data', editavel: 'admin' },
  { chave: 'custo_mensal', rotulo: 'Custo mensal', tipo: 'moeda', editavel: 'admin', somar: 1 },
  {
    chave: 'situacao', rotulo: 'Situação', tipo: 'lista', editavel: 'admin', agrupar: 1,
    opcoes: ['Ativo', 'Desligado', 'Afastado'],
    ajuda: 'Colaboradores marcados como "Desligado" (posição de 31/07/2026) não recebem decisão.',
  },
  {
    chave: 'estabilidade', rotulo: 'Estabilidade / afastamento', tipo: 'texto', editavel: 'admin',
    ajuda: 'Tipo de estabilidade ou afastamento (CIPA, acidente, gestante, auxílio-doença...).',
  },
  {
    chave: 'estabilidade_ate', rotulo: 'Estabilidade até', tipo: 'data', editavel: 'admin',
    ajuda: 'Data final da vigência. O desligamento fica bloqueado até essa data.',
  },
  { chave: 'observacoes', rotulo: 'Observações do RH', tipo: 'texto', editavel: 'admin' },
];

const CONFIG_PADRAO = {
  titulo: 'Portal de Decisões — Reestruturação',
  coluna_escopo: 'divisao',
  prazo: '2026-09-11',
  posicao_base: '2026-07-31',
  acoes: JSON.stringify([
    { valor: 'Desligamento', cor: 'desligamento', exige_justificativa: false },
    { valor: 'Transferência de área', cor: 'transferencia', exige_justificativa: true },
    { valor: 'Manter', cor: 'manter', exige_justificativa: false },
  ]),
  aviso_confidencialidade:
    'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.',
};

function abrir(caminho = config.bancoCaminho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const conexao = new Database(caminho);
  conexao.pragma('journal_mode = WAL');
  conexao.pragma('foreign_keys = ON');
  conexao.exec(ESQUEMA);
  semear(conexao);
  return conexao;
}

function semear(conexao) {
  const inserirConfig = conexao.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [chave, valor] of Object.entries(CONFIG_PADRAO)) inserirConfig.run(chave, valor);

  const total = conexao.prepare('SELECT COUNT(*) AS n FROM colunas').get().n;
  if (total === 0) {
    const inserir = conexao.prepare(`
      INSERT INTO colunas (chave, rotulo, tipo, opcoes, sistema, editavel, visivel, fixada, somar, agrupar, ordem, ajuda, criado_em)
      VALUES (@chave, @rotulo, @tipo, @opcoes, @sistema, @editavel, 1, @fixada, @somar, @agrupar, @ordem, @ajuda, @criado_em)
    `);
    COLUNAS_PADRAO.forEach((c, i) => {
      inserir.run({
        chave: c.chave,
        rotulo: c.rotulo,
        tipo: c.tipo,
        opcoes: c.opcoes ? JSON.stringify(c.opcoes) : null,
        sistema: c.sistema ? 1 : 0,
        editavel: c.editavel || 'nao',
        fixada: c.fixada ? 1 : 0,
        somar: c.somar ? 1 : 0,
        agrupar: c.agrupar ? 1 : 0,
        ordem: (i + 1) * 10,
        ajuda: c.ajuda || null,
        criado_em: agora(),
      });
    });
  }
}

function obter() {
  if (!db) db = abrir();
  return db;
}

function lerConfig(conexao = obter()) {
  const linhas = conexao.prepare('SELECT chave, valor FROM config').all();
  const cfg = {};
  for (const l of linhas) cfg[l.chave] = l.valor;
  cfg.acoes = JSON.parse(cfg.acoes || '[]');
  return cfg;
}

function gravarConfig(chave, valor, conexao = obter()) {
  conexao
    .prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
}

module.exports = { abrir, obter, lerConfig, gravarConfig, COLUNAS_PADRAO, CONFIG_PADRAO };
