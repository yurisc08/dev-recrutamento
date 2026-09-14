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
