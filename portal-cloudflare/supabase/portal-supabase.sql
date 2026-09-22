-- =====================================================================
-- Portal de Decisões — Supabase (PostgreSQL)
--
-- ARQUIVO ÚNICO. Cole tudo no SQL Editor do Supabase e rode uma vez.
-- Pode rodar de novo sem medo: nada é duplicado e nada é apagado.
--
-- ANTES DE RODAR: troque TROQUE_ESTA_SENHA (aparece uma vez, no papel
-- portal_app) por uma senha longa e aleatória, e guarde-a — ela vai na
-- string de conexão que o Worker usa.
--
-- Gerado por portal-cloudflare/supabase/montar.mjs a partir de:
--   01-esquema.sql
--   02-seguranca.sql
--   03-carga-inicial.sql
--   04-gestores.sql
-- NÃO EDITE ESTE ARQUIVO À MÃO: edite as partes e gere de novo.
-- =====================================================================


-- ###################################################################
-- 01-esquema.sql
-- ###################################################################

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
  gerente_nome   text,
  diretor_nome   text,
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
CREATE INDEX IF NOT EXISTS idx_colab_gerente_nome ON portal.colaboradores (processo_id, lower(gerente_nome));
CREATE INDEX IF NOT EXISTS idx_colab_diretor_nome ON portal.colaboradores (processo_id, lower(diretor_nome));

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


-- ###################################################################
-- 02-seguranca.sql
-- ###################################################################

-- =====================================================================
-- Portal de Decisões — endurecimento do banco no Supabase
-- Rode DEPOIS do 01-esquema.sql, também no SQL Editor.
--
-- O que isto faz:
--   1. cria um papel de aplicação com privilégio mínimo (o Worker usa ele,
--      nunca o "postgres"): sem DDL, sem DROP, sem acesso a outros schemas;
--   2. torna a auditoria à prova de alteração: a aplicação só insere,
--      nunca altera nem apaga — nem por engano, nem por invasor;
--   3. bloqueia o acesso anônimo das APIs automáticas do Supabase ao
--      schema do portal.
--
-- Troque TROQUE_ESTA_SENHA por uma senha longa e aleatória e guarde-a:
-- ela vai na string de conexão que o Worker usa.
-- =====================================================================

-- 1. papel da aplicação -------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    CREATE ROLE portal_app LOGIN PASSWORD 'TROQUE_ESTA_SENHA';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM portal_app;
GRANT USAGE ON SCHEMA portal TO portal_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA portal
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA portal
  GRANT USAGE, SELECT ON SEQUENCES TO portal_app;

-- 2. auditoria só de inserção ------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON portal.auditoria FROM portal_app;

CREATE OR REPLACE FUNCTION portal.auditoria_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria não pode ser alterada nem apagada.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditoria_sem_update ON portal.auditoria;
CREATE TRIGGER auditoria_sem_update
  BEFORE UPDATE OR DELETE ON portal.auditoria
  FOR EACH ROW EXECUTE FUNCTION portal.auditoria_imutavel();

-- 3. fecha as APIs automáticas do Supabase para este schema -------------
-- (o portal fala com o banco por conexão direta; PostgREST/anon não entram)
-- (os papéis anon/authenticated só existem no Supabase; em banco local isto passa batido)
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA portal FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA portal FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA portal FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;

-- 4. conferência --------------------------------------------------------
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'portal' AND table_name = 'auditoria';


-- ###################################################################
-- 03-carga-inicial.sql
-- ###################################################################

-- =====================================================================
-- Portal de Decisões — processo, campos, ações e regras iniciais.
-- Catálogo gerado por modelo/gerar.mjs a partir de modelo/colunas.json
-- (aba "2. BASE DECISÕES_CONS" da planilha do processo: 50 colunas + JUSTIFICATIVA).
-- NÃO EDITE OS BLOCOS "campos(...)" E "acoes(...)" À MÃO.
-- Pode rodar mais de uma vez: nada é duplicado.
-- =====================================================================
SET search_path = portal, public;

INSERT INTO portal.processos (nome, data_base, prazo, aviso_confidencialidade)
SELECT 'Reestruturação', DATE '2026-07-31', DATE '2026-09-11',
       'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.'
WHERE NOT EXISTS (SELECT 1 FROM portal.processos WHERE ativo);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
campos(chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, ordem, ajuda) AS (VALUES
  ('concatenar','CONCATENAR','texto','Controle','base',false,false,false,false,'admin',10,null),
  ('competencia','COMPETENCIA','texto','Controle','base',false,false,false,false,'admin',20,null),
  ('area_ajustada','ÁREA AJUSTADA','texto','Organização','base',false,true,false,false,'admin',30,null),
  ('filial','FILIAL','texto','Organização','base',false,true,false,false,'admin',40,null),
  ('emp_cod','EMP_COD','texto','Controle','base',false,false,false,false,'admin',50,null),
  ('fil_cod','FIL_COD','texto','Controle','base',false,false,false,false,'admin',60,null),
  ('diretoria','DIRETORIA','texto','Organização','base',true,true,false,false,'admin',70,'Define a Diretoria do colaborador — usada no recorte de acesso do Diretor.'),
  ('divisao','DIVISAO','texto','Organização','base',true,true,false,false,'admin',80,'Define a Divisão do colaborador — usada no recorte de acesso do Gestor.'),
  ('departamento','DEPARTAMENTO','texto','Organização','base',false,true,false,false,'admin',90,null),
  ('uorg_cod','UORG_COD','texto','Controle','base',false,false,false,false,'admin',100,null),
  ('des_uo','DES_UO','texto','Organização','base',false,false,false,false,'admin',110,null),
  ('nome','NOME','texto','Identificação','base',true,false,false,false,'admin',120,null),
  ('chapa','CHAPA','texto','Identificação','base',true,false,false,false,'admin',130,'Matrícula — é a chave que a importação usa para atualizar em vez de duplicar.'),
  ('pessoa_fisica','PESSOA_FISICA','texto','Identificação','base',false,false,false,false,'admin',140,null),
  ('cpf','CPF','texto','Identificação','base',false,false,false,true,'admin',150,'Dado pessoal sensível: fica restrito ao RH, fora da lista e da exportação de quem não é RH.'),
  ('cjca_cod','CJCA_COD','texto','Cargo','base',false,false,false,false,'admin',160,null),
  ('des_conjunto_cargo','DES_CONJUNTO_CARGO','texto','Cargo','base',false,false,false,false,'admin',170,null),
  ('car_cod','CAR_COD','texto','Cargo','base',false,false,false,false,'admin',180,null),
  ('des_cargo','DES_CARGO','texto','Cargo','base',true,false,false,false,'admin',190,null),
  ('segmento','SEGMENTO','texto','Organização','base',false,true,false,false,'admin',200,null),
  ('tur_cod','TUR_COD','texto','Cargo','base',false,false,false,false,'admin',210,null),
  ('mo','MO','texto','Cargo','base',false,true,false,false,'admin',220,null),
  ('natureza','NATUREZA','texto','Cargo','base',false,true,false,false,'admin',230,null),
  ('situacao','SITUACAO','texto','Situação','base',true,true,false,false,'admin',240,null),
  ('dt_admissao','DT_ADMISSAO','data','Situação','base',false,false,false,false,'admin',250,null),
  ('tempo_casa','TEMPO_CASA','numero','Situação','base',false,false,false,false,'admin',260,null),
  ('idade','IDADE','numero','Situação','base',false,false,false,false,'admin',270,null),
  ('dt_nasc','DT_NASC','data','Situação','base',false,false,false,true,'admin',280,'Dado pessoal sensível: restrito ao RH.'),
  ('dt_aposentadoria','DT_APOSENTADORIA','data','Situação','base',false,false,false,false,'admin',290,null),
  ('tipo_invalidez','TIPO_INVALIDEZ','texto','Situação','base',false,false,false,true,'admin',300,'Dado de saúde: restrito ao RH.'),
  ('horario','HORARIO','texto','Cargo','base',false,false,false,false,'admin',310,null),
  ('hrs_teor_mes','HRS_TEOR_MES','numero','Cargo','base',false,false,false,false,'admin',320,null),
  ('tsal_cod','TSAL_COD','texto','Remuneração','base',false,false,false,false,'admin',330,null),
  ('fxsl_cod','FXSL_COD','texto','Remuneração','base',false,false,false,false,'admin',340,null),
  ('salario','SALARIO','moeda','Remuneração','base',false,false,false,false,'admin',350,null),
  ('evento_grat','EVENTO_GRAT','moeda','Remuneração','base',false,false,false,false,'admin',360,null),
  ('perc_grat','PERC_GRAT','numero','Remuneração','base',false,false,false,false,'admin',370,null),
  ('salario_total','SALARIO_TOTAL','moeda','Remuneração','base',true,false,false,false,'admin',380,null),
  ('vlr_mediana','VLR_MEDIANA','moeda','Remuneração','base',false,false,false,false,'admin',390,null),
  ('prm','PRM','moeda','Remuneração','base',false,false,false,false,'admin',400,null),
  ('gestor_imediato','GESTOR IMEDIATO','texto','Hierarquia','base',true,true,false,false,'admin',410,'Nome do gestor imediato, como está na planilha. É por esta coluna que o portal separa a base e distribui.'),
  ('gerente','GERENTE','texto','Hierarquia','base',false,true,false,false,'admin',420,'Nível acima do gestor imediato. Permite o recorte do Gerente sem depender da Divisão.'),
  ('diretor','DIRETOR','texto','Hierarquia','base',false,true,false,false,'admin',430,'Nível acima do gerente. Permite o recorte do Diretor sem depender da Diretoria.'),
  ('avaliacao_performar','DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR REGISTRADA','texto','Desempenho','base',true,false,false,false,'admin',440,null),
  ('centro_custo_sap','CENTRO DE CUSTO_SAP','texto','Remuneração','base',false,false,false,false,'admin',450,null),
  ('estabilidade','ESTABILIDADE','texto','Estabilidade','base',true,false,false,false,'admin',460,'Qualquer condição de estabilidade ou afastamento informada pelo RH.'),
  ('data_fim_estabilidade','DATA FIM ESTABILIDADE','data','Estabilidade','base',true,false,false,false,'admin',470,null),
  ('salario_anual','SALÁRIO ANUAL','moeda','Remuneração','base',false,false,true,false,'admin',480,'Base do cálculo de custo e de redução anual no painel.'),
  ('acao','AÇÃO INDICADA','lista','Decisão','avaliacao',true,false,false,false,'gestor',490,null),
  ('destino','EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE SETOR/ÁREA/Nº PROCESSO','texto','Decisão','avaliacao',false,false,false,false,'gestor',500,null),
  ('justificativa','JUSTIFICATIVA','texto','Decisão','avaliacao',true,false,false,false,'gestor',510,'Não existe na planilha — é exigência do portal, para a decisão ficar registrada com o motivo.')
)
INSERT INTO portal.campos (processo_id, chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, somente_leitura, ordem, ajuda)
SELECT p.id, c.chave, c.rotulo, c.tipo, c.grupo, c.origem, c.visivel_lista, c.agrupar, c.somar, c.sensivel, c.editavel_por, c.origem = 'base', c.ordem, c.ajuda
  FROM p, campos c
 WHERE NOT EXISTS (SELECT 1 FROM portal.campos x WHERE x.processo_id = p.id AND x.chave = c.chave);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
acoes(valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem) AS (VALUES
  ('ATIVO','manter',false,false,false,10),
  ('DESLIGAMENTO','desligamento',true,false,true,20),
  ('TRANSFERÊNCIA DE ÁREA','transferencia',true,true,false,30),
  ('ESTABILIDADE','atencao',true,false,false,40)
)
INSERT INTO portal.acoes (processo_id, valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem)
SELECT p.id, a.valor, a.cor, a.exige_justificativa, a.exige_destino, a.considera_desligamento, a.ordem
  FROM p, acoes a
 WHERE NOT EXISTS (SELECT 1 FROM portal.acoes x WHERE x.processo_id = p.id AND x.valor = a.valor);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
regras(nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem) AS (VALUES
  ('Desligado na posição-base','situacao','igual','DESLIGADO',
   'Colaborador já desligado na posição-base. Confirme com o RH antes de registrar nova decisão.','info',NULL,false,10),
  ('Estabilidade declarada','estabilidade','preenchido',NULL,
   '⚠️ Atenção: este colaborador possui uma condição que requer validação do RH antes de eventual desligamento.','atencao','DESLIGAMENTO',true,20),
  ('Estabilidade vigente','data_fim_estabilidade','data_futura',NULL,
   'Estabilidade vigente na data informada — o desligamento não pode ocorrer antes do término da vigência.','critico','DESLIGAMENTO',true,30),
  ('Afastamento / invalidez','tipo_invalidez','preenchido',NULL,
   'Há registro de afastamento/invalidez. Validação do RH é obrigatória antes de qualquer ação.','atencao',NULL,false,40),
  ('Aposentadoria prevista','dt_aposentadoria','preenchido',NULL,
   'Existe data de aposentadoria informada. Considere no planejamento da decisão.','info',NULL,false,50)
)
INSERT INTO portal.regras (processo_id, nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem)
SELECT p.id, r.nome, r.campo, r.operador, r.valor, r.mensagem, r.severidade, r.aplica_acao, r.exige_justificativa, r.ordem
  FROM p, regras r
 WHERE NOT EXISTS (SELECT 1 FROM portal.regras x WHERE x.processo_id = p.id AND x.nome = r.nome);


-- ###################################################################
-- 04-gestores.sql
-- ###################################################################

-- ---------------------------------------------------------------------
-- 04. Gestor imediato e senha própria de cada gestor
--
-- Duas mudanças que andam juntas:
--
-- 1. A base passa a guardar o GESTOR IMEDIATO de cada colaborador (coluna da
--    planilha) e, quando esse gestor tem acesso ao portal, o vínculo direto.
--    É assim que o diretor distribui a lista sem partir arquivo por e-mail.
--
-- 2. Ninguém mais recebe "senha provisória". O acesso é criado sem senha e o
--    gestor define a dele no link de primeiro acesso — nem o RH conhece.
--
-- Pode rodar em banco já em uso: tudo aqui é idempotente.
-- ---------------------------------------------------------------------

-- 1. acesso sem senha até o gestor definir a dele --------------------------
ALTER TABLE portal.usuarios
  ADD COLUMN IF NOT EXISTS ativacao_hash      text,
  ADD COLUMN IF NOT EXISTS ativacao_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_definida_em  timestamptz,
  ADD COLUMN IF NOT EXISTS criado_por         integer REFERENCES portal.usuarios(id);

-- senha_hash fica opcional: usuário recém-criado NÃO tem senha nenhuma
ALTER TABLE portal.usuarios ALTER COLUMN senha_hash DROP NOT NULL;

-- quem já usa o portal continua valendo como "senha definida"
UPDATE portal.usuarios
   SET senha_definida_em = coalesce(senha_definida_em, criado_em)
 WHERE senha_hash IS NOT NULL AND senha_definida_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_ativacao ON portal.usuarios (ativacao_hash)
  WHERE ativacao_hash IS NOT NULL;

-- 2. gestor imediato na base ----------------------------------------------
ALTER TABLE portal.colaboradores
  ADD COLUMN IF NOT EXISTS gestor_nome    text,
  ADD COLUMN IF NOT EXISTS gerente_nome   text,
  ADD COLUMN IF NOT EXISTS diretor_nome   text,
  ADD COLUMN IF NOT EXISTS responsavel_id integer REFERENCES portal.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_colab_responsavel ON portal.colaboradores (processo_id, responsavel_id);
CREATE INDEX IF NOT EXISTS idx_colab_gestor_nome ON portal.colaboradores (processo_id, lower(gestor_nome));
CREATE INDEX IF NOT EXISTS idx_colab_gerente_nome ON portal.colaboradores (processo_id, lower(gerente_nome));
CREATE INDEX IF NOT EXISTS idx_colab_diretor_nome ON portal.colaboradores (processo_id, lower(diretor_nome));

-- 3. o campo aparece no catálogo, como veio da planilha --------------------
WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1)
INSERT INTO portal.campos (processo_id, chave, rotulo, tipo, grupo, origem,
                           visivel_lista, agrupar, somar, sensivel, editavel_por, somente_leitura, ordem)
SELECT p.id, 'gestor_imediato', 'GESTOR IMEDIATO', 'texto', 'Estrutura', 'base',
       true, true, false, false, 'ninguem', true, 125
  FROM p
 WHERE NOT EXISTS (
   SELECT 1 FROM portal.campos x WHERE x.processo_id = p.id AND x.chave = 'gestor_imediato'
 );

-- 4. privilégios das colunas novas para o papel da aplicação ---------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
