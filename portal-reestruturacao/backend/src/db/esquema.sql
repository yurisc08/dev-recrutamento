-- Esquema do Portal de Decisões (PostgreSQL).
-- Separação essencial: dados vindos do Excel ficam em "colaboradores";
-- o que é preenchido no portal fica em "avaliacoes". Uma nova carga nunca
-- sobrescreve avaliações sem confirmação explícita do RH.

CREATE TABLE IF NOT EXISTS processos (
  id                      serial PRIMARY KEY,
  nome                    text        NOT NULL,
  data_base               date        NOT NULL,
  prazo                   date,
  aviso_confidencialidade text,
  ativo                   boolean     NOT NULL DEFAULT true,
  criado_em               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diretorias (
  id          serial PRIMARY KEY,
  processo_id integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome        text    NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  UNIQUE (processo_id, nome)
);

CREATE TABLE IF NOT EXISTS divisoes (
  id           serial PRIMARY KEY,
  diretoria_id integer NOT NULL REFERENCES diretorias(id) ON DELETE CASCADE,
  nome         text    NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  UNIQUE (diretoria_id, nome)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            serial PRIMARY KEY,
  usuario       text        NOT NULL UNIQUE,
  nome          text        NOT NULL,
  email         text,
  senha_hash    text        NOT NULL,
  perfil        text        NOT NULL CHECK (perfil IN ('admin', 'diretor', 'gestor')),
  ativo         boolean     NOT NULL DEFAULT true,
  trocar_senha  boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso timestamptz
);

-- Abrangência de cada usuário: diretor responde por diretorias, gestor por divisões.
CREATE TABLE IF NOT EXISTS usuario_diretorias (
  usuario_id   integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  diretoria_id integer NOT NULL REFERENCES diretorias(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, diretoria_id)
);

CREATE TABLE IF NOT EXISTS usuario_divisoes (
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  divisao_id integer NOT NULL REFERENCES divisoes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, divisao_id)
);

CREATE TABLE IF NOT EXISTS sessoes (
  id         text        PRIMARY KEY,
  usuario_id integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL,
  ip         text,
  navegador  text
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);

CREATE TABLE IF NOT EXISTS tentativas_login (
  id        bigserial PRIMARY KEY,
  usuario   text,
  ip        text,
  sucesso   boolean     NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tentativas_login ON tentativas_login (usuario, criado_em DESC);

-- Catálogo de campos: permite adicionar/renomear/desativar colunas sem mexer no código.
CREATE TABLE IF NOT EXISTS campos (
  id              serial PRIMARY KEY,
  processo_id     integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
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
  ordem           integer NOT NULL DEFAULT 0,
  ajuda           text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, chave)
);

-- Ações disponíveis na avaliação (configuráveis pelo RH).
CREATE TABLE IF NOT EXISTS acoes (
  id                     serial PRIMARY KEY,
  processo_id            integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  valor                  text    NOT NULL,
  cor                    text    NOT NULL DEFAULT 'neutra',
  exige_justificativa    boolean NOT NULL DEFAULT false,
  exige_destino          boolean NOT NULL DEFAULT false,
  considera_desligamento boolean NOT NULL DEFAULT false,
  ordem                  integer NOT NULL DEFAULT 0,
  ativo                  boolean NOT NULL DEFAULT true,
  UNIQUE (processo_id, valor)
);

-- Regras de alerta configuráveis: o portal sinaliza, nunca decide sozinho.
CREATE TABLE IF NOT EXISTS regras (
  id                  serial PRIMARY KEY,
  processo_id         integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome                text    NOT NULL,
  campo               text    NOT NULL,
  operador            text    NOT NULL CHECK (operador IN ('preenchido', 'vazio', 'igual', 'diferente', 'contem', 'data_futura', 'data_passada', 'maior_que', 'menor_que')),
  valor               text,
  mensagem            text    NOT NULL,
  severidade          text    NOT NULL DEFAULT 'atencao' CHECK (severidade IN ('info', 'atencao', 'critico')),
  aplica_acao         text,
  exige_justificativa boolean NOT NULL DEFAULT false,
  ordem               integer NOT NULL DEFAULT 0,
  ativo               boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS importacoes (
  id           serial PRIMARY KEY,
  processo_id  integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  usuario_id   integer REFERENCES usuarios(id),
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

-- Dados vindos da planilha.
CREATE TABLE IF NOT EXISTS colaboradores (
  id            serial PRIMARY KEY,
  processo_id   integer NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  chapa         text    NOT NULL,
  nome          text,
  diretoria_id  integer REFERENCES diretorias(id),
  divisao_id    integer REFERENCES divisoes(id),
  situacao      text,
  dados         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ativo         boolean NOT NULL DEFAULT true,
  importacao_id integer REFERENCES importacoes(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, chapa)
);
CREATE INDEX IF NOT EXISTS idx_colab_divisao ON colaboradores (processo_id, divisao_id);
CREATE INDEX IF NOT EXISTS idx_colab_diretoria ON colaboradores (processo_id, diretoria_id);
CREATE INDEX IF NOT EXISTS idx_colab_dados ON colaboradores USING gin (dados);

-- Dados preenchidos no portal.
CREATE TABLE IF NOT EXISTS avaliacoes (
  id                serial PRIMARY KEY,
  colaborador_id    integer NOT NULL UNIQUE REFERENCES colaboradores(id) ON DELETE CASCADE,
  acao              text,
  nova_diretoria_id integer REFERENCES diretorias(id),
  nova_divisao_id   integer REFERENCES divisoes(id),
  destino_livre     text,
  justificativa     text,
  status            text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'preenchida', 'homologada')),
  atualizado_por    integer REFERENCES usuarios(id),
  atualizado_em     timestamptz,
  homologado_por    integer REFERENCES usuarios(id),
  homologado_em     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_acao ON avaliacoes (acao);

-- Trilha de auditoria: apenas inserções, nunca alterada nem apagada pela aplicação.
CREATE TABLE IF NOT EXISTS auditoria (
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
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_chapa ON auditoria (chapa);
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON auditoria (tipo);
