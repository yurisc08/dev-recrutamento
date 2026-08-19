-- =====================================================================
-- V73 - Atualizacao da base de cargos pelo proprio ADMIN (sem SQL)
-- ---------------------------------------------------------------------
-- Cria a estrutura usada pela nova aba "Base de cargos" do portal:
--   * perfis de importacao (mapeamento de colunas salvo e reutilizavel)
--   * area de estagio (staging) para receber a planilha em lotes
--   * historico de importacoes
--   * funcoes RPC protegidas: somente o perfil ADMIN executa
--
-- Execute este arquivo UMA vez no SQL Editor do Supabase.
-- Depois disso, toda atualizacao da planilha e feita pela tela do ADMIN.
-- Nao exige nova publicacao no Cloudflare alem do index.html/styles.css.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Colunas auxiliares na base de cargos (idempotente)
-- ---------------------------------------------------------------------
alter table public.job_catalog add column if not exists raw_data jsonb;
alter table public.job_catalog add column if not exists requirements jsonb;
alter table public.job_catalog add column if not exists imported_at timestamptz default now();
alter table public.job_catalog add column if not exists updated_at timestamptz default now();
alter table public.job_catalog add column if not exists import_run_id uuid;
alter table public.job_catalog add column if not exists active boolean default true;

-- ---------------------------------------------------------------------
-- 1. Helper de permissao
-- ---------------------------------------------------------------------
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.active,true) and p.role = 'ADMIN'
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Perfis de importacao (mapeamento de colunas salvo)
-- ---------------------------------------------------------------------
create table if not exists public.job_import_profiles(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sheet_name text,
  header_row int not null default 1,
  column_map jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_job_import_profiles_name on public.job_import_profiles(lower(name));
alter table public.job_import_profiles enable row level security;

-- ---------------------------------------------------------------------
-- 3. Historico de importacoes
-- ---------------------------------------------------------------------
create table if not exists public.job_import_runs(
  id uuid primary key default gen_random_uuid(),
  file_name text,
  sheet_name text,
  header_row int,
  column_map jsonb,
  mode text not null default 'REPLACE',            -- REPLACE | MERGE
  scope_companies boolean not null default true,
  blank_clears boolean not null default false,
  status text not null default 'UPLOADING',        -- UPLOADING | DONE | CANCELLED | ERROR
  total_rows int not null default 0,
  received_rows int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  deactivated_count int not null default 0,
  skipped_count int not null default 0,
  message text,
  started_by uuid references public.profiles(id),
  started_by_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_job_import_runs_started_at on public.job_import_runs(started_at desc);
alter table public.job_import_runs enable row level security;

-- ---------------------------------------------------------------------
-- 4. Estagio (recebe a planilha em lotes antes de aplicar)
-- ---------------------------------------------------------------------
create table if not exists public.job_import_stage(
  id bigserial primary key,
  run_id uuid not null references public.job_import_runs(id) on delete cascade,
  row_number int not null,
  payload jsonb not null
);
create index if not exists idx_job_import_stage_run on public.job_import_stage(run_id);
alter table public.job_import_stage enable row level security;

-- ---------------------------------------------------------------------
-- 5. Perfis de importacao - listar / salvar / excluir
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_import_profiles();
create function public.admin_list_import_profiles()
returns setof public.job_import_profiles
language sql
stable
security definer
set search_path=public
as $$
  select * from public.job_import_profiles
  where public.is_admin_user()
  order by is_default desc, updated_at desc;
$$;

drop function if exists public.admin_save_import_profile(text,text,int,jsonb,boolean);
create function public.admin_save_import_profile(
  p_name text,
  p_sheet_name text,
  p_header_row int,
  p_column_map jsonb,
  p_is_default boolean default true
)
returns public.job_import_profiles
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.job_import_profiles;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode salvar mapeamentos de importacao.';
  end if;
  if coalesce(btrim(p_name),'') = '' then
    raise exception 'Informe um nome para o mapeamento.';
  end if;

  insert into public.job_import_profiles(name, sheet_name, header_row, column_map, is_default, created_by)
  values (btrim(p_name), p_sheet_name, greatest(coalesce(p_header_row,1),1), coalesce(p_column_map,'{}'::jsonb), coalesce(p_is_default,false), auth.uid())
  on conflict (lower(name)) do update
    set sheet_name = excluded.sheet_name,
        header_row = excluded.header_row,
        column_map = excluded.column_map,
        is_default = excluded.is_default,
        updated_at = now()
  returning * into v_row;

  if v_row.is_default then
    update public.job_import_profiles set is_default = false where id <> v_row.id and is_default;
  end if;

  return v_row;
end;
$$;

drop function if exists public.admin_delete_import_profile(uuid);
create function public.admin_delete_import_profile(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode excluir mapeamentos de importacao.';
  end if;
  delete from public.job_import_profiles where id = p_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Importacao - abrir, enviar lotes, aplicar, cancelar
-- ---------------------------------------------------------------------
drop function if exists public.admin_job_import_start(text,text,int,jsonb,text,int,boolean);
drop function if exists public.admin_job_import_start(text,text,int,jsonb,text,int,boolean,boolean);
create function public.admin_job_import_start(
  p_file_name text,
  p_sheet_name text,
  p_header_row int,
  p_column_map jsonb,
  p_mode text,
  p_total_rows int,
  p_scope_companies boolean default true,
  p_blank_clears boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_name text;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode atualizar a base de cargos.';
  end if;
  if upper(coalesce(p_mode,'REPLACE')) not in ('REPLACE','MERGE') then
    raise exception 'Modo de importacao invalido: %', p_mode;
  end if;

  select name into v_name from public.profiles where id = auth.uid();

  -- fecha importacoes anteriores que ficaram abertas por queda de conexao
  update public.job_import_runs
     set status='CANCELLED', finished_at=now(), message='Importacao anterior encerrada automaticamente.'
   where status='UPLOADING' and started_by = auth.uid();

  insert into public.job_import_runs(
    file_name, sheet_name, header_row, column_map, mode, scope_companies, blank_clears,
    status, total_rows, started_by, started_by_name)
  values (
    p_file_name, p_sheet_name, greatest(coalesce(p_header_row,1),1), coalesce(p_column_map,'{}'::jsonb),
    upper(coalesce(p_mode,'REPLACE')), coalesce(p_scope_companies,true), coalesce(p_blank_clears,false),
    'UPLOADING', greatest(coalesce(p_total_rows,0),0), auth.uid(), v_name)
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.admin_job_import_push(uuid,jsonb);
create function public.admin_job_import_push(p_run_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare v_count int; v_status text;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode atualizar a base de cargos.';
  end if;

  select status into v_status from public.job_import_runs where id = p_run_id;
  if v_status is null then raise exception 'Importacao nao localizada.'; end if;
  if v_status <> 'UPLOADING' then raise exception 'Esta importacao ja foi encerrada (%).', v_status; end if;

  insert into public.job_import_stage(run_id, row_number, payload)
  select p_run_id,
         coalesce((e.value->>'_row')::int, e.ordinality::int),
         e.value
  from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality as e(value, ordinality);

  get diagnostics v_count = row_count;

  update public.job_import_runs
     set received_rows = received_rows + v_count
   where id = p_run_id;

  return v_count;
end;
$$;

drop function if exists public.admin_job_import_commit(uuid);
create function public.admin_job_import_commit(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.job_import_runs;
  v_inserted int := 0;
  v_updated int := 0;
  v_deactivated int := 0;
  v_skipped int := 0;
  v_staged int := 0;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode atualizar a base de cargos.';
  end if;

  select * into v_run from public.job_import_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Importacao nao localizada.'; end if;
  if v_run.status <> 'UPLOADING' then raise exception 'Esta importacao ja foi encerrada (%).', v_run.status; end if;

  select count(*) into v_staged from public.job_import_stage where run_id = p_run_id;
  if v_staged = 0 then
    update public.job_import_runs
       set status='ERROR', finished_at=now(), message='Nenhuma linha valida foi recebida.'
     where id = p_run_id;
    raise exception 'Nenhuma linha valida foi recebida para importacao.';
  end if;

  -- 6.1 Deduplica: para o mesmo par empresa + codigo do cargo, vale a ultima linha da planilha.
  --     requirements_full  = tudo o que veio na planilha (inclusive vazios)
  --     requirements_clean = apenas o que veio preenchido
  create temporary table tmp_job_import on commit drop as
  select distinct on (coalesce(nullif(btrim(s.payload->>'company_code'),''),'-'), upper(btrim(s.payload->>'job_code')))
         coalesce(nullif(btrim(s.payload->>'company_code'),''), null)         as company_code,
         btrim(s.payload->>'job_code')                                        as job_code,
         nullif(btrim(coalesce(s.payload->>'job_name','')),'')                as job_name,
         nullif(btrim(coalesce(s.payload->>'full_name','')),'')               as full_name,
         nullif(btrim(coalesce(s.payload->>'company','')),'')                 as company,
         nullif(btrim(coalesce(s.payload->>'cbo','')),'')                     as cbo,
         nullif(btrim(coalesce(s.payload->>'nature','')),'')                  as nature,
         nullif(btrim(coalesce(s.payload->>'career_track','')),'')            as career_track,
         nullif(btrim(coalesce(s.payload->>'level','')),'')                   as level,
         nullif(btrim(coalesce(s.payload->>'family_code','')),'')             as family_code,
         nullif(btrim(coalesce(s.payload->>'grouping_key','')),'')            as grouping_key,
         nullif(btrim(coalesce(s.payload->>'expected_result','')),'')         as expected_result,
         nullif(btrim(coalesce(s.payload->>'job_description','')),'')         as job_description,
         nullif(btrim(coalesce(s.payload->>'activities','')),'')              as activities,
         coalesce(s.payload->'requirements','{}'::jsonb)                      as requirements_full,
         coalesce(rq.obj,'{}'::jsonb)                                         as requirements_clean,
         coalesce(s.payload->'raw','{}'::jsonb)                               as raw_data
    from public.job_import_stage s
    left join lateral (
      select jsonb_object_agg(e.key, e.value) as obj
        from jsonb_each(coalesce(s.payload->'requirements','{}'::jsonb)) as e
       where nullif(btrim(e.value #>> '{}'),'') is not null
    ) rq on true
   where s.run_id = p_run_id
     and nullif(btrim(coalesce(s.payload->>'job_code','')),'') is not null
   order by coalesce(nullif(btrim(s.payload->>'company_code'),''),'-'),
            upper(btrim(s.payload->>'job_code')),
            s.row_number desc;

  v_skipped := v_staged - (select count(*) from tmp_job_import);

  -- 6.2 Atualiza cargos existentes.
  --     Celula em branco so apaga o conteudo atual quando o ADMIN marcou "blank_clears"
  --     E a coluna correspondente foi realmente mapeada nesta importacao.
  with upd as (
    update public.job_catalog j
       set job_name        = case when v_run.blank_clears and v_run.column_map ? 'job_name'        then t.job_name        else coalesce(t.job_name, j.job_name) end,
           full_name       = case when v_run.blank_clears and v_run.column_map ? 'full_name'       then t.full_name       else coalesce(t.full_name, j.full_name) end,
           company         = case when v_run.blank_clears and v_run.column_map ? 'company'         then t.company         else coalesce(t.company, j.company) end,
           cbo             = case when v_run.blank_clears and v_run.column_map ? 'cbo'             then t.cbo             else coalesce(t.cbo, j.cbo) end,
           nature          = case when v_run.blank_clears and v_run.column_map ? 'nature'          then t.nature          else coalesce(t.nature, j.nature) end,
           career_track    = case when v_run.blank_clears and v_run.column_map ? 'career_track'    then t.career_track    else coalesce(t.career_track, j.career_track) end,
           level           = case when v_run.blank_clears and v_run.column_map ? 'level'           then t.level           else coalesce(t.level, j.level) end,
           family_code     = case when v_run.blank_clears and v_run.column_map ? 'family_code'     then t.family_code     else coalesce(t.family_code, j.family_code) end,
           grouping_key    = case when v_run.blank_clears and v_run.column_map ? 'grouping_key'    then t.grouping_key    else coalesce(t.grouping_key, j.grouping_key) end,
           expected_result = case when v_run.blank_clears and v_run.column_map ? 'expected_result' then t.expected_result else coalesce(t.expected_result, j.expected_result) end,
           job_description = case when v_run.blank_clears and v_run.column_map ? 'job_description' then t.job_description else coalesce(t.job_description, j.job_description) end,
           activities      = case when v_run.blank_clears and v_run.column_map ? 'activities'      then t.activities      else coalesce(t.activities, j.activities) end,
           requirements    = coalesce(j.requirements,'{}'::jsonb)
                             || (case when v_run.blank_clears then t.requirements_full else t.requirements_clean end),
           raw_data        = t.raw_data,
           active          = true,
           imported_at     = now(),
           updated_at      = now(),
           import_run_id   = p_run_id
      from tmp_job_import t
     where upper(btrim(j.job_code)) = upper(t.job_code)
       and coalesce(nullif(btrim(j.company_code),''),'-') = coalesce(t.company_code,'-')
    returning j.id)
  select count(*) into v_updated from upd;

  -- 6.3 Insere os cargos novos.
  with ins as (
    insert into public.job_catalog(
      job_code, job_name, full_name, company_code, company, cbo, nature, career_track,
      level, family_code, grouping_key, expected_result, job_description, activities,
      requirements, raw_data, active, imported_at, updated_at, import_run_id)
    select t.job_code, t.job_name, t.full_name, t.company_code, t.company, t.cbo, t.nature, t.career_track,
           t.level, t.family_code, t.grouping_key, t.expected_result, t.job_description, t.activities,
           t.requirements_clean, t.raw_data, true, now(), now(), p_run_id
      from tmp_job_import t
     where not exists (
       select 1 from public.job_catalog j
        where upper(btrim(j.job_code)) = upper(t.job_code)
          and coalesce(nullif(btrim(j.company_code),''),'-') = coalesce(t.company_code,'-'))
    returning id)
  select count(*) into v_inserted from ins;

  -- 6.4 Modo "substituir": desativa o que nao veio na planilha.
  if v_run.mode = 'REPLACE' then
    with off as (
      update public.job_catalog j
         set active = false, updated_at = now()
       where coalesce(j.active,true)
         and not exists (
           select 1 from tmp_job_import t
            where upper(btrim(j.job_code)) = upper(t.job_code)
              and coalesce(nullif(btrim(j.company_code),''),'-') = coalesce(t.company_code,'-'))
         and (
           not v_run.scope_companies
           or coalesce(nullif(btrim(j.company_code),''),'-') in (
                select distinct coalesce(t2.company_code,'-') from tmp_job_import t2))
      returning j.id)
    select count(*) into v_deactivated from off;
  end if;

  update public.job_import_runs
     set status='DONE',
         finished_at=now(),
         inserted_count=v_inserted,
         updated_count=v_updated,
         deactivated_count=v_deactivated,
         skipped_count=v_skipped,
         message=format('%s incluidos, %s atualizados, %s desativados, %s linhas ignoradas (sem codigo ou repetidas).',
                        v_inserted, v_updated, v_deactivated, v_skipped)
   where id = p_run_id;

  delete from public.job_import_stage where run_id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'deactivated', v_deactivated,
    'skipped', v_skipped,
    'total', v_staged);
end;
$$;

drop function if exists public.admin_job_import_cancel(uuid);
create function public.admin_job_import_cancel(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode atualizar a base de cargos.';
  end if;
  delete from public.job_import_stage where run_id = p_run_id;
  update public.job_import_runs
     set status='CANCELLED', finished_at=now(), message='Importacao cancelada pelo ADMIN.'
   where id = p_run_id and status='UPLOADING';
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Painel: situacao atual da base e ultimas importacoes
-- ---------------------------------------------------------------------
drop function if exists public.admin_job_catalog_overview(int);
create function public.admin_job_catalog_overview(p_limit int default 10)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_stats jsonb; v_runs jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o perfil ADMIN pode consultar a base de cargos.';
  end if;

  select jsonb_build_object(
           'total', count(*),
           'active', count(*) filter (where coalesce(active,true)),
           'inactive', count(*) filter (where not coalesce(active,true)),
           'companies', count(distinct coalesce(nullif(btrim(company_code),''),'-')),
           'last_import', max(imported_at))
    into v_stats
    from public.job_catalog;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb)
    into v_runs
    from (select * from public.job_import_runs order by started_at desc limit greatest(coalesce(p_limit,10),1)) r;

  return jsonb_build_object('stats', v_stats, 'runs', v_runs);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Permissoes
-- ---------------------------------------------------------------------
revoke all on function public.admin_list_import_profiles() from public;
revoke all on function public.admin_save_import_profile(text,text,int,jsonb,boolean) from public;
revoke all on function public.admin_delete_import_profile(uuid) from public;
revoke all on function public.admin_job_import_start(text,text,int,jsonb,text,int,boolean,boolean) from public;
revoke all on function public.admin_job_import_push(uuid,jsonb) from public;
revoke all on function public.admin_job_import_commit(uuid) from public;
revoke all on function public.admin_job_import_cancel(uuid) from public;
revoke all on function public.admin_job_catalog_overview(int) from public;

grant execute on function public.admin_list_import_profiles() to authenticated;
grant execute on function public.admin_save_import_profile(text,text,int,jsonb,boolean) to authenticated;
grant execute on function public.admin_delete_import_profile(uuid) to authenticated;
grant execute on function public.admin_job_import_start(text,text,int,jsonb,text,int,boolean,boolean) to authenticated;
grant execute on function public.admin_job_import_push(uuid,jsonb) to authenticated;
grant execute on function public.admin_job_import_commit(uuid) to authenticated;
grant execute on function public.admin_job_import_cancel(uuid) to authenticated;
grant execute on function public.admin_job_catalog_overview(int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Indices usados pela pesquisa apos cada importacao
-- ---------------------------------------------------------------------
create index if not exists idx_job_catalog_active on public.job_catalog(active);
create index if not exists idx_job_catalog_job_code_lower on public.job_catalog(lower(job_code));
create index if not exists idx_job_catalog_job_name_lower on public.job_catalog(lower(job_name));
create index if not exists idx_job_catalog_company_code on public.job_catalog(company_code);

notify pgrst,'reload schema';

-- ---------------------------------------------------------------------
-- 10. Diagnostico
-- ---------------------------------------------------------------------
select
  count(*) as cargos_na_base,
  count(*) filter (where coalesce(active,true)) as cargos_ativos,
  max(imported_at) as ultima_importacao
from public.job_catalog;
