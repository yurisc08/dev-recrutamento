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
