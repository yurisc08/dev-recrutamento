-- =============================================================================
-- EXPORTAR O QUE JA EXISTE NO SEU SUPABASE
--
-- Este pacote nao contem todas as funcoes do portal: as ligadas ao fluxo de
-- solicitacoes vieram de versoes anteriores do projeto. Para poder recriar o
-- ambiente do zero, o mais seguro e exportar do seu proprio banco — o que sai
-- daqui e exatamente o que esta rodando hoje, sem reconstrucao nem suposicao.
--
-- Rode cada parte no SQL Editor e guarde o resultado num arquivo .sql.
-- Este arquivo apenas LE o catalogo; nao altera nada.
-- =============================================================================

-- PARTE 1 — Definicao completa de todas as funcoes do schema public ------------
-- Copie a coluna "script" inteira: ela ja vem pronta para ser executada em um
-- projeto novo.
select string_agg(pg_get_functiondef(p.oid), E';\n\n' order by p.proname) || ';' as script
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f';

-- PARTE 2 — Permissoes de execucao das funcoes --------------------------------
select string_agg(
         format('grant execute on function public.%I(%s) to %I;',
                p.proname, pg_get_function_identity_arguments(p.oid), a.grantee),
         E'\n' order by p.proname)  as script
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral (
  select unnest(array['authenticated', 'anon', 'service_role']) as grantee
) a
where n.nspname = 'public'
  and p.prokind = 'f'
  and has_function_privilege(a.grantee, p.oid, 'execute');

-- PARTE 3 — Politicas de seguranca (RLS) --------------------------------------
select string_agg(
         format(
           'alter table public.%I enable row level security;' || E'\n' ||
           'create policy %I on public.%I as %s for %s to %s%s%s;',
           tablename, policyname, tablename, permissive, cmd,
           array_to_string(roles, ', '),
           case when qual is not null then E'\n  using (' || qual || ')' else '' end,
           case when with_check is not null then E'\n  with check (' || with_check || ')' else '' end),
         E'\n\n' order by tablename, policyname) as script
from pg_policies
where schemaname = 'public';

-- PARTE 4 — Tabelas, colunas, chaves e indices --------------------------------
-- O catalogo nao devolve o CREATE TABLE pronto. Para as tabelas, use o utilitario
-- oficial, que gera o arquivo completo (estrutura, chaves, indices e politicas):
--
--   Opcao A — Supabase CLI (recomendada):
--     supabase login
--     supabase link --project-ref SEU_PROJECT_REF
--     supabase db dump --schema public -f esquema-completo.sql
--     supabase db dump --schema public --data-only -f dados.sql      (opcional)
--
--   Opcao B — pg_dump, com a connection string em
--   Supabase > Project Settings > Database > Connection string:
--     pg_dump "postgresql://postgres:SENHA@db.SEU_REF.supabase.co:5432/postgres" \
--             --schema=public --schema-only --no-owner --no-privileges \
--             -f esquema-completo.sql
--
-- Guarde esse arquivo junto com este pacote: com ele mais os scripts daqui, o
-- ambiente pode ser recriado do zero.

-- PARTE 5 — Conferencia: o que existe hoje ------------------------------------
select 'tabelas' as tipo, count(*) as quantidade
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
union all
select 'funcoes', count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
union all
select 'politicas RLS', count(*) from pg_policies where schemaname = 'public';

-- Lembrete: as Edge Functions (admin-users e notify-workflow) nao estao no banco.
-- O codigo delas fica em Supabase > Edge Functions, e tambem precisa ser salvo
-- (supabase functions download admin-users, por exemplo) para recriar o ambiente.
