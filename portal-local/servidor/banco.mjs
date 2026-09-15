/**
 * Banco do portal local: SQLite, que já vem dentro do Node.
 *
 * Nada de instalar servidor de banco: o processo abre um arquivo em dados/ e
 * pronto. É o mesmo modelo de dados da versão em nuvem — as mesmas tabelas, as
 * mesmas regras, a mesma trilha de auditoria que ninguém consegue apagar.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const agora = () => new Date().toISOString();

const ESQUEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS processos (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                    TEXT    NOT NULL,
  data_base               TEXT    NOT NULL,
  prazo                   TEXT,
  aviso_confidencialidade TEXT,
  ativo                   INTEGER NOT NULL DEFAULT 1,
  criado_em               TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS diretorias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome        TEXT    NOT NULL,
  ativo       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (processo_id, nome)
);

CREATE TABLE IF NOT EXISTS divisoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  diretoria_id INTEGER NOT NULL REFERENCES diretorias(id) ON DELETE CASCADE,
  nome         TEXT    NOT NULL,
  ativo        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (diretoria_id, nome)
);

-- senha_hash nasce NULO de propósito: o acesso é criado sem senha e quem define
-- a dela é a própria pessoa, no link de primeiro acesso.
CREATE TABLE IF NOT EXISTS usuarios (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario            TEXT    NOT NULL UNIQUE,
  nome               TEXT    NOT NULL,
  email              TEXT,
  senha_hash         TEXT,
  perfil             TEXT    NOT NULL CHECK (perfil IN ('admin','diretor','gestor')),
  ativo              INTEGER NOT NULL DEFAULT 1,
  trocar_senha       INTEGER NOT NULL DEFAULT 0,
  ativacao_hash      TEXT,
  ativacao_expira_em TEXT,
  senha_definida_em  TEXT,
  criado_por         INTEGER,
  criado_em          TEXT    NOT NULL,
  ultimo_acesso      TEXT
);

CREATE TABLE IF NOT EXISTS usuario_diretorias (
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  diretoria_id INTEGER NOT NULL REFERENCES diretorias(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, diretoria_id)
);

CREATE TABLE IF NOT EXISTS usuario_divisoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  divisao_id INTEGER NOT NULL REFERENCES divisoes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, divisao_id)
);

CREATE TABLE IF NOT EXISTS sessoes (
  id         TEXT    PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em  TEXT    NOT NULL,
  expira_em  TEXT    NOT NULL,
  ip         TEXT,
  navegador  TEXT
);

CREATE TABLE IF NOT EXISTS tentativas_login (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario   TEXT,
  ip        TEXT,
  sucesso   INTEGER NOT NULL,
  criado_em TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS campos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id    INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  chave          TEXT    NOT NULL,
  rotulo         TEXT    NOT NULL,
  tipo           TEXT    NOT NULL DEFAULT 'texto',
  opcoes         TEXT,
  grupo          TEXT,
  origem         TEXT    NOT NULL DEFAULT 'base',
  obrigatorio    INTEGER NOT NULL DEFAULT 0,
  somente_leitura INTEGER NOT NULL DEFAULT 0,
  editavel_por   TEXT    NOT NULL DEFAULT 'admin',
  visivel_lista  INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1,
  somar          INTEGER NOT NULL DEFAULT 0,
  agrupar        INTEGER NOT NULL DEFAULT 0,
  sensivel       INTEGER NOT NULL DEFAULT 0,
  ordem          INTEGER NOT NULL DEFAULT 0,
  ajuda          TEXT,
  UNIQUE (processo_id, chave)
);

CREATE TABLE IF NOT EXISTS acoes (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id            INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  valor                  TEXT    NOT NULL,
  cor                    TEXT    NOT NULL DEFAULT 'neutra',
  exige_justificativa    INTEGER NOT NULL DEFAULT 0,
  exige_destino          INTEGER NOT NULL DEFAULT 0,
  considera_desligamento INTEGER NOT NULL DEFAULT 0,
  ativo                  INTEGER NOT NULL DEFAULT 1,
  ordem                  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (processo_id, valor)
);

CREATE TABLE IF NOT EXISTS regras (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id         INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome                TEXT    NOT NULL,
  campo               TEXT    NOT NULL,
  operador            TEXT    NOT NULL,
  valor               TEXT,
  mensagem            TEXT    NOT NULL,
  severidade          TEXT    NOT NULL DEFAULT 'info',
  aplica_acao         TEXT,
  exige_justificativa INTEGER NOT NULL DEFAULT 0,
  ativo               INTEGER NOT NULL DEFAULT 1,
  ordem               INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS importacoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id  INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  usuario_id   INTEGER REFERENCES usuarios(id),
  usuario_nome TEXT,
  arquivo      TEXT,
  aba          TEXT,
  data_base    TEXT,
  linhas       INTEGER NOT NULL DEFAULT 0,
  novos        INTEGER NOT NULL DEFAULT 0,
  alterados    INTEGER NOT NULL DEFAULT 0,
  inalterados  INTEGER NOT NULL DEFAULT 0,
  erros        INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'concluida',
  resumo       TEXT,
  criado_em    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id    INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  chapa          TEXT    NOT NULL,
  nome           TEXT,
  diretoria_id   INTEGER REFERENCES diretorias(id),
  divisao_id     INTEGER REFERENCES divisoes(id),
  situacao       TEXT,
  gestor_nome    TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  dados          TEXT    NOT NULL DEFAULT '{}',
  ativo          INTEGER NOT NULL DEFAULT 1,
  importacao_id  INTEGER REFERENCES importacoes(id),
  criado_em      TEXT    NOT NULL,
  atualizado_em  TEXT    NOT NULL,
  UNIQUE (processo_id, chapa)
);
CREATE INDEX IF NOT EXISTS idx_colab_divisao ON colaboradores (processo_id, divisao_id);
CREATE INDEX IF NOT EXISTS idx_colab_diretoria ON colaboradores (processo_id, diretoria_id);
CREATE INDEX IF NOT EXISTS idx_colab_responsavel ON colaboradores (processo_id, responsavel_id);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id    INTEGER NOT NULL UNIQUE REFERENCES colaboradores(id) ON DELETE CASCADE,
  acao              TEXT,
  nova_diretoria_id INTEGER REFERENCES diretorias(id),
  nova_divisao_id   INTEGER REFERENCES divisoes(id),
  destino_livre     TEXT,
  justificativa     TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','preenchida','homologada')),
  atualizado_por    INTEGER REFERENCES usuarios(id),
  atualizado_em     TEXT,
  homologado_por    INTEGER REFERENCES usuarios(id),
  homologado_em     TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id     INTEGER,
  usuario_nome   TEXT,
  perfil         TEXT,
  tipo           TEXT NOT NULL,
  entidade       TEXT,
  entidade_id    TEXT,
  chapa          TEXT,
  campo          TEXT,
  valor_anterior TEXT,
  valor_novo     TEXT,
  detalhes       TEXT,
  ip             TEXT,
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria (criado_em);

-- A trilha não muda e não some: o próprio banco recusa.
CREATE TRIGGER IF NOT EXISTS auditoria_sem_update BEFORE UPDATE ON auditoria
BEGIN SELECT RAISE(ABORT, 'A trilha de auditoria não pode ser alterada nem apagada.'); END;
CREATE TRIGGER IF NOT EXISTS auditoria_sem_delete BEFORE DELETE ON auditoria
BEGIN SELECT RAISE(ABORT, 'A trilha de auditoria não pode ser alterada nem apagada.'); END;
`;

/** Catálogo inicial: as colunas da planilha do processo. */
const CAMPOS_PADRAO = [
  ['concatenar', 'CONCATENAR', 'texto', 'Controle', 'base', 0, 0, 0, 0, 'admin', 10],
  ['competencia', 'COMPETENCIA', 'texto', 'Controle', 'base', 0, 0, 0, 0, 'admin', 20],
  ['area_ajustada', 'ÁREA AJUSTADA', 'texto', 'Organização', 'base', 0, 1, 0, 0, 'admin', 30],
  ['filial', 'FILIAL', 'texto', 'Organização', 'base', 0, 1, 0, 0, 'admin', 40],
  ['diretoria', 'DIRETORIA', 'texto', 'Organização', 'base', 1, 1, 0, 0, 'admin', 50],
  ['divisao', 'DIVISAO', 'texto', 'Organização', 'base', 1, 1, 0, 0, 'admin', 60],
  ['gestor_imediato', 'GESTOR IMEDIATO', 'texto', 'Organização', 'base', 1, 1, 0, 0, 'admin', 65],
  ['departamento', 'DEPARTAMENTO', 'texto', 'Organização', 'base', 0, 1, 0, 0, 'admin', 70],
  ['des_uo', 'DES_UO', 'texto', 'Organização', 'base', 0, 0, 0, 0, 'admin', 80],
  ['nome', 'NOME', 'texto', 'Identificação', 'base', 1, 0, 0, 0, 'admin', 90],
  ['chapa', 'CHAPA', 'texto', 'Identificação', 'base', 1, 0, 0, 0, 'admin', 100],
  ['cpf', 'CPF', 'texto', 'Identificação', 'base', 0, 0, 0, 1, 'admin', 110],
  ['des_cargo', 'DES_CARGO', 'texto', 'Cargo', 'base', 1, 0, 0, 0, 'admin', 120],
  ['des_conjunto_cargo', 'DES_CONJUNTO_CARGO', 'texto', 'Cargo', 'base', 0, 0, 0, 0, 'admin', 130],
  ['natureza', 'NATUREZA', 'texto', 'Cargo', 'base', 0, 1, 0, 0, 'admin', 140],
  ['mo', 'MO', 'texto', 'Cargo', 'base', 0, 1, 0, 0, 'admin', 150],
  ['situacao', 'SITUACAO', 'texto', 'Situação', 'base', 1, 1, 0, 0, 'admin', 160],
  ['dt_admissao', 'DT_ADMISSAO', 'data', 'Situação', 'base', 0, 0, 0, 0, 'admin', 170],
  ['tempo_casa', 'TEMPO_CASA', 'numero', 'Situação', 'base', 0, 0, 0, 0, 'admin', 180],
  ['idade', 'IDADE', 'numero', 'Situação', 'base', 0, 0, 0, 0, 'admin', 190],
  ['dt_nasc', 'DT_NASC', 'data', 'Situação', 'base', 0, 0, 0, 1, 'admin', 200],
  ['dt_aposentadoria', 'DT_APOSENTADORIA', 'data', 'Situação', 'base', 0, 0, 0, 0, 'admin', 210],
  ['tipo_invalidez', 'TIPO_INVALIDEZ', 'texto', 'Situação', 'base', 0, 0, 0, 0, 'admin', 220],
  ['salario', 'SALARIO', 'moeda', 'Remuneração', 'base', 0, 0, 0, 0, 'admin', 230],
  ['salario_total', 'SALARIO_TOTAL', 'moeda', 'Remuneração', 'base', 1, 0, 0, 0, 'admin', 240],
  ['vlr_mediana', 'VLR_MEDIANA', 'moeda', 'Remuneração', 'base', 0, 0, 0, 0, 'admin', 250],
  ['prm', 'PRM', 'moeda', 'Remuneração', 'base', 0, 0, 0, 0, 'admin', 260],
  ['salario_anual', 'SALÁRIO ANUAL', 'moeda', 'Remuneração', 'base', 0, 0, 1, 0, 'admin', 270],
  ['centro_custo_sap', 'CENTRO DE CUSTO_SAP', 'texto', 'Remuneração', 'base', 0, 0, 0, 0, 'admin', 280],
  ['avaliacao_performar', 'DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR REGISTRADA', 'texto', 'Desempenho', 'base', 1, 0, 0, 0, 'admin', 290],
  ['estabilidade', 'ESTABILIDADE', 'texto', 'Estabilidade', 'base', 1, 0, 0, 0, 'admin', 300],
  ['data_fim_estabilidade', 'DATA FIM ESTABILIDADE', 'data', 'Estabilidade', 'base', 1, 0, 0, 0, 'admin', 310],
  ['acao', 'AÇÃO INDICADA', 'lista', 'Decisão', 'avaliacao', 1, 0, 0, 0, 'gestor', 320],
  ['destino', 'EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE', 'texto', 'Decisão', 'avaliacao', 0, 0, 0, 0, 'gestor', 330],
  ['justificativa', 'JUSTIFICATIVA', 'texto', 'Decisão', 'avaliacao', 1, 0, 0, 0, 'gestor', 340],
];

const ACOES_PADRAO = [
  ['ATIVO', 'manter', 0, 0, 0, 10],
  ['DESLIGAMENTO', 'desligamento', 1, 0, 1, 20],
  ['TRANSFERÊNCIA DE ÁREA', 'transferencia', 1, 1, 0, 30],
  ['ESTABILIDADE', 'atencao', 1, 0, 0, 40],
];

const REGRAS_PADRAO = [
  ['Desligado na posição-base', 'situacao', 'igual', 'DESLIGADO',
    'Colaborador já desligado na posição-base. Confirme com o RH antes de registrar nova decisão.', 'info', null, 0, 10],
  ['Estabilidade declarada', 'estabilidade', 'preenchido', null,
    '⚠️ Atenção: este colaborador possui uma condição que requer validação do RH antes de eventual desligamento.',
    'atencao', 'DESLIGAMENTO', 1, 20],
  ['Estabilidade vigente', 'data_fim_estabilidade', 'data_futura', null,
    'Estabilidade vigente na data informada — o desligamento não pode ocorrer antes do término da vigência.',
    'critico', 'DESLIGAMENTO', 1, 30],
  ['Afastamento / invalidez', 'tipo_invalidez', 'preenchido', null,
    'Há registro de afastamento/invalidez. Validação do RH é obrigatória antes de qualquer ação.', 'atencao', null, 0, 40],
  ['Aposentadoria prevista', 'dt_aposentadoria', 'preenchido', null,
    'Existe data de aposentadoria informada. Considere no planejamento da decisão.', 'info', null, 0, 50],
];

/** Abre (criando se preciso) o banco e garante estrutura e carga inicial. */
export function abrirBanco(caminho) {
  mkdirSync(dirname(caminho), { recursive: true });
  const bd = new DatabaseSync(caminho);
  bd.exec(ESQUEMA);

  const [processo] = bd.prepare('SELECT id FROM processos WHERE ativo = 1 ORDER BY id LIMIT 1').all();
  if (!processo) {
    const dataBase = new Date();
    const prazo = new Date(Date.now() + 45 * 86400 * 1000);
    const criado = bd.prepare(`
      INSERT INTO processos (nome, data_base, prazo, aviso_confidencialidade, criado_em)
      VALUES (?, ?, ?, ?, ?)`).run(
      'Reestruturação',
      dataBase.toISOString().slice(0, 10),
      prazo.toISOString().slice(0, 10),
      'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.',
      agora(),
    );
    const processoId = Number(criado.lastInsertRowid);

    const inserirCampo = bd.prepare(`
      INSERT INTO campos (processo_id, chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar,
                          sensivel, editavel_por, somente_leitura, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const c of CAMPOS_PADRAO) {
      const [chave, rotulo, tipo, grupo, origem, lista, agrupar, somar, sensivel, editavel, ordem] = c;
      inserirCampo.run(processoId, chave, rotulo, tipo, grupo, origem, lista, agrupar, somar, sensivel,
        editavel, origem === 'base' ? 1 : 0, ordem);
    }
    const inserirAcao = bd.prepare(`
      INSERT INTO acoes (processo_id, valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const a of ACOES_PADRAO) inserirAcao.run(processoId, ...a);

    const inserirRegra = bd.prepare(`
      INSERT INTO regras (processo_id, nome, campo, operador, valor, mensagem, severidade, aplica_acao,
                          exige_justificativa, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of REGRAS_PADRAO) inserirRegra.run(processoId, ...r);
  }

  return bd;
}

/* ---------------------------------------------------------------- */
/* Conversões: SQLite guarda 0/1 e texto; a API devolve JSON de verdade */
/* ---------------------------------------------------------------- */

const BOOLEANOS = new Set([
  'ativo', 'trocar_senha', 'obrigatorio', 'somente_leitura', 'visivel_lista', 'somar', 'agrupar',
  'sensivel', 'exige_justificativa', 'exige_destino', 'considera_desligamento', 'sucesso',
  'senha_definida', 'acesso_ativo', 'tem_avaliacao',
]);
const JSONS = new Set(['dados', 'detalhes', 'resumo', 'opcoes']);

export function normalizar(linha) {
  if (!linha) return linha;
  const saida = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (BOOLEANOS.has(chave)) saida[chave] = valor === null ? null : Boolean(valor);
    else if (JSONS.has(chave)) saida[chave] = valor ? JSON.parse(valor) : (chave === 'dados' ? {} : null);
    else saida[chave] = valor;
  }
  return saida;
}

export function criarAcesso(bd) {
  const consultar = (sql, ...params) => bd.prepare(sql).all(...params).map(normalizar);
  const primeiro = (sql, ...params) => normalizar(bd.prepare(sql).get(...params) ?? null);
  const executar = (sql, ...params) => bd.prepare(sql).run(...params);
  return { bd, consultar, primeiro, executar };
}

/** Lista de "?" para usar com IN (...), já que SQLite não tem ANY(array). */
export const marcadores = (lista) => lista.map(() => '?').join(', ');
