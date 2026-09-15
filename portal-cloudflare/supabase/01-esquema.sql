-- =====================================================================
-- Portal de Decisões — esquema para Supabase (PostgreSQL)
-- Rode no SQL Editor do Supabase, na ordem: 01, 02, 03.
--
-- Tudo vive no schema "portal": mantém a base fora do schema public,
-- que é o exposto pelas APIs automáticas do Supabase.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS portal;
SET search_path = portal, public;

CREATE TABLE IF NOT EXISTS portal.processos (
  id                      serial PRIMARY KEY,
  nome                    text        NOT NULL,
  data_base               date        NOT NULL,
  prazo                   date,
  aviso_confidencialidade text,
  ativo                   boolean     NOT NULL DEFAULT true,
  criado_em               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal.diretorias (
  id          serial PRIMARY KEY,
  processo_id integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  nome        text    NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  UNIQUE (processo_id, nome)
);

CREATE TABLE IF NOT EXISTS portal.divisoes (
  id           serial PRIMARY KEY,
  diretoria_id integer NOT NULL REFERENCES portal.diretorias(id) ON DELETE CASCADE,
  nome         text    NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  UNIQUE (diretoria_id, nome)
);

-- senha_hash nasce NULO de propósito: o acesso é criado sem senha e quem define
-- a dela é a própria pessoa, no link de primeiro acesso (ativacao_hash).
CREATE TABLE IF NOT EXISTS portal.usuarios (
  id                 serial PRIMARY KEY,
  usuario            text        NOT NULL UNIQUE,
  nome               text        NOT NULL,
  email              text,
  senha_hash         text,
  perfil             text        NOT NULL CHECK (perfil IN ('admin', 'diretor', 'gestor')),
  ativo              boolean     NOT NULL DEFAULT true,
  trocar_senha       boolean     NOT NULL DEFAULT false,
  ativacao_hash      text,
  ativacao_expira_em timestamptz,
  senha_definida_em  timestamptz,
  criado_por         integer,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativacao ON portal.usuarios (ativacao_hash)
  WHERE ativacao_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal.usuario_diretorias (
  usuario_id   integer NOT NULL REFERENCES portal.usuarios(id) ON DELETE CASCADE,
  diretoria_id integer NOT NULL REFERENCES portal.diretorias(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, diretoria_id)
);

CREATE TABLE IF NOT EXISTS portal.usuario_divisoes (
  usuario_id integer NOT NULL REFERENCES portal.usuarios(id) ON DELETE CASCADE,
  divisao_id integer NOT NULL REFERENCES portal.divisoes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, divisao_id)
);

CREATE TABLE IF NOT EXISTS portal.sessoes (
  id         text        PRIMARY KEY,
  usuario_id integer     NOT NULL REFERENCES portal.usuarios(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL,
  ip         text,
  navegador  text
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON portal.sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON portal.sessoes (expira_em);

CREATE TABLE IF NOT EXISTS portal.tentativas_login (
  id        bigserial PRIMARY KEY,
  usuario   text,
  ip        text,
  sucesso   boolean     NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tentativas ON portal.tentativas_login (usuario, criado_em DESC);

CREATE TABLE IF NOT EXISTS portal.campos (
  id              serial PRIMARY KEY,
  processo_id     integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  chave           text    NOT NULL,
  rotulo          text    NOT NULL,
  tipo            text    NOT NULL CHECK (tipo IN ('texto', 'numero', 'moeda', 'data', 'lista', 'booleano')),
  opcoes          jsonb,
  grupo           text,
  origem          text    NOT NULL DEFAULT 'base' CHECK (origem IN ('base', 'avaliacao')),
  obrigatorio     boolean NOT NULL DEFAULT false,
  somente_leitura boolean NOT NULL DEFAULT true,
  editavel_por    text    NOT NULL DEFAULT 'ninguem' CHECK (editavel_por IN ('ninguem', 'gestor', 'diretor', 'admin')),
  visivel_lista   boolean NOT NULL DEFAULT false,
  ativo           boolean NOT NULL DEFAULT true,
  somar           boolean NOT NULL DEFAULT false,
  agrupar         boolean NOT NULL DEFAULT false,
  sensivel        boolean NOT NULL DEFAULT false,
  ordem           integer NOT NULL DEFAULT 0,
  ajuda           text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, chave)
);
COMMENT ON COLUMN portal.campos.sensivel IS
  'Campo que não deve sair em exportação nem aparecer em listas (ex.: CPF). Bloqueado na API.';

CREATE TABLE IF NOT EXISTS portal.acoes (
  id                     serial PRIMARY KEY,
  processo_id            integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  valor                  text    NOT NULL,
  cor                    text    NOT NULL DEFAULT 'neutra',
  exige_justificativa    boolean NOT NULL DEFAULT false,
  exige_destino          boolean NOT NULL DEFAULT false,
  considera_desligamento boolean NOT NULL DEFAULT false,
  ordem                  integer NOT NULL DEFAULT 0,
  ativo                  boolean NOT NULL DEFAULT true,
  UNIQUE (processo_id, valor)
);

CREATE TABLE IF NOT EXISTS portal.regras (
  id                  serial PRIMARY KEY,
  processo_id         integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  nome                text    NOT NULL,
  campo               text    NOT NULL,
  operador            text    NOT NULL CHECK (operador IN ('preenchido', 'vazio', 'igual', 'diferente', 'contem', 'data_futura', 'data_passada')),
  valor               text,
  mensagem            text    NOT NULL,
  severidade          text    NOT NULL DEFAULT 'atencao' CHECK (severidade IN ('info', 'atencao', 'critico')),
  aplica_acao         text,
  exige_justificativa boolean NOT NULL DEFAULT false,
  ordem               integer NOT NULL DEFAULT 0,
  ativo               boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS portal.importacoes (
  id           serial PRIMARY KEY,
  processo_id  integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  usuario_id   integer REFERENCES portal.usuarios(id),
  usuario_nome text,
  arquivo      text,
  aba          text,
  data_base    date,
  linhas       integer NOT NULL DEFAULT 0,
  novos        integer NOT NULL DEFAULT 0,
  alterados    integer NOT NULL DEFAULT 0,
  inalterados  integer NOT NULL DEFAULT 0,
  erros        integer NOT NULL DEFAULT 0,
  status       text    NOT NULL DEFAULT 'concluida',
  resumo       jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal.colaboradores (
  id            serial PRIMARY KEY,
  processo_id   integer NOT NULL REFERENCES portal.processos(id) ON DELETE CASCADE,
  chapa         text    NOT NULL,
  nome          text,
  diretoria_id  integer REFERENCES portal.diretorias(id),
  divisao_id    integer REFERENCES portal.divisoes(id),
  situacao      text,
  -- gestor imediato: o nome como veio da planilha e, quando ele tem acesso ao
  -- portal, o vínculo com o usuário que responde por essas pessoas
  gestor_nome    text,
  responsavel_id integer REFERENCES portal.usuarios(id) ON DELETE SET NULL,
  dados         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ativo         boolean NOT NULL DEFAULT true,
  importacao_id integer REFERENCES portal.importacoes(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, chapa)
);
CREATE INDEX IF NOT EXISTS idx_colab_divisao ON portal.colaboradores (processo_id, divisao_id);
CREATE INDEX IF NOT EXISTS idx_colab_diretoria ON portal.colaboradores (processo_id, diretoria_id);
CREATE INDEX IF NOT EXISTS idx_colab_responsavel ON portal.colaboradores (processo_id, responsavel_id);
CREATE INDEX IF NOT EXISTS idx_colab_gestor_nome ON portal.colaboradores (processo_id, lower(gestor_nome));

CREATE TABLE IF NOT EXISTS portal.avaliacoes (
  id                serial PRIMARY KEY,
  colaborador_id    integer NOT NULL UNIQUE REFERENCES portal.colaboradores(id) ON DELETE CASCADE,
  acao              text,
  nova_diretoria_id integer REFERENCES portal.diretorias(id),
  nova_divisao_id   integer REFERENCES portal.divisoes(id),
  destino_livre     text,
  justificativa     text,
  status            text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'preenchida', 'homologada')),
  atualizado_por    integer REFERENCES portal.usuarios(id),
  atualizado_em     timestamptz,
  homologado_por    integer REFERENCES portal.usuarios(id),
  homologado_em     timestamptz
);

CREATE TABLE IF NOT EXISTS portal.auditoria (
  id             bigserial PRIMARY KEY,
  usuario_id     integer,
  usuario_nome   text,
  perfil         text,
  tipo           text NOT NULL,
  entidade       text,
  entidade_id    text,
  chapa          text,
  campo          text,
  valor_anterior text,
  valor_novo     text,
  detalhes       jsonb,
  ip             text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON portal.auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_chapa ON portal.auditoria (chapa);
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON portal.auditoria (tipo);
