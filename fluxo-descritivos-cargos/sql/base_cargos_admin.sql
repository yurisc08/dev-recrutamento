-- =============================================================================
-- Base de cargos editavel pelo ADMIN (aba "Base de cargos")
-- Execute este arquivo no SQL Editor do Supabase (uma unica vez).
--
-- O que ele faz:
--   1. Garante a tabela public.job_catalog e as colunas usadas pelo fluxo.
--   2. Cria as funcoes que a planilha usa: listar, gravar e excluir linhas.
--   3. Restringe a escrita ao perfil ADMIN e registra o historico das alteracoes.
--
-- NAO altera search_job_catalog nem get_job_catalog_details: as funcoes que o
-- fluxo ja usa continuam lendo a mesma tabela, entao tudo que for editado aqui
-- aparece imediatamente na pesquisa de cargo vigente e nos campos do descritivo.
-- =============================================================================

create extension if not exists pgcrypto;

-- 1) Tabela da base ------------------------------------------------------------
create table if not exists public.job_catalog (
  id uuid primary key default gen_random_uuid()
);

alter table public.job_catalog add column if not exists job_code text;
alter table public.job_catalog add column if not exists job_name text;
alter table public.job_catalog add column if not exists company text;
alter table public.job_catalog add column if not exists cbo text;
alter table public.job_catalog add column if not exists level text;
alter table public.job_catalog add column if not exists raw_data jsonb not null default '{}'::jsonb;
alter table public.job_catalog add column if not exists created_at timestamptz not null default now();
alter table public.job_catalog add column if not exists updated_at timestamptz not null default now();
alter table public.job_catalog add column if not exists updated_by uuid;

create index if not exists job_catalog_job_code_idx on public.job_catalog (job_code);
create index if not exists job_catalog_company_idx on public.job_catalog (company);

-- 2) Historico das alteracoes da base ------------------------------------------
create table if not exists public.job_catalog_changes (
  id bigserial primary key,
  job_id uuid,
  action text not null,
  record_label text,
  changed_fields text[],
  actor_id uuid,
  actor_name text,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists job_catalog_changes_created_idx on public.job_catalog_changes (created_at desc);

-- 3) Verificacao de perfil ------------------------------------------------------
create or replace function public.is_base_cargos_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'ADMIN'
  );
$$;

create or replace function public.can_read_base_cargos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role in ('ADMIN', 'CR')
  );
$$;

-- 4) Leitura da base para a planilha --------------------------------------------
-- Devolve um jsonb por linha, com as chaves no padrao da planilha oficial
-- (COD_DO_CARGO, CARGO, ATIV_DESC, SKILL_30...). O conteudo de raw_data tem
-- prioridade sobre as colunas resumidas, que servem apenas de complemento.
create or replace function public.admin_list_job_catalog(
  p_query text default '',
  p_limit integer default 100000,
  p_offset integer default 0
)
returns table (id uuid, data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_read_base_cargos() then
    raise exception 'Somente ADMIN e C&R podem consultar a base de cargos.';
  end if;

  return query
    select j.id,
           jsonb_strip_nulls(jsonb_build_object(
             'COD_DO_CARGO', j.job_code,
             'NOME_COMPLETO', j.job_name,
             'CARGO', j.job_name,
             'EMPRESA', j.company,
             'CBO', j.cbo,
             'NIVEL_CARGO', j.level
           )) || coalesce(j.raw_data, '{}'::jsonb) as data
    from public.job_catalog j
    where coalesce(nullif(btrim(p_query), ''), '') = ''
       or j.job_code ilike '%' || btrim(p_query) || '%'
       or j.job_name ilike '%' || btrim(p_query) || '%'
       or j.company ilike '%' || btrim(p_query) || '%'
    order by j.company nulls last, j.job_code nulls last, j.id
    limit greatest(coalesce(p_limit, 100000), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- 5) Gravacao (inclusao e alteracao) ---------------------------------------------
-- p_rows: [{ "client_key": "k1", "id": null | uuid, "data": { "COD_DO_CARGO": "120", ... } }]
create or replace function public.admin_save_job_catalog_rows(p_rows jsonb)
returns table (client_key text, id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_data jsonb;
  v_id uuid;
  v_before jsonb;
  v_changed text[];
  v_actor record;
begin
  if not public.is_base_cargos_admin() then
    raise exception 'Somente o perfil ADMIN pode alterar a base de cargos.';
  end if;

  select p.name, p.email into v_actor from public.profiles p where p.id = auth.uid();

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_data := coalesce(item -> 'data', '{}'::jsonb);
    v_id := nullif(item ->> 'id', '')::uuid;

    if v_id is not null then
      select coalesce(raw_data, '{}'::jsonb) into v_before from public.job_catalog where job_catalog.id = v_id;
    else
      v_before := null;
    end if;

    if v_id is null or v_before is null then
      insert into public.job_catalog (id, job_code, job_name, company, cbo, level, raw_data, updated_by, updated_at)
      values (
        coalesce(v_id, gen_random_uuid()),
        nullif(v_data ->> 'COD_DO_CARGO', ''),
        coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', '')),
        nullif(v_data ->> 'EMPRESA', ''),
        nullif(v_data ->> 'CBO', ''),
        nullif(v_data ->> 'NIVEL_CARGO', ''),
        v_data,
        auth.uid(),
        now()
      )
      returning job_catalog.id into v_id;

      insert into public.job_catalog_changes (job_id, action, record_label, changed_fields, actor_id, actor_name, actor_email)
      values (v_id, 'INSERT',
              concat_ws(' — ', nullif(v_data ->> 'COD_DO_CARGO', ''), coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', ''))),
              array(select jsonb_object_keys(v_data)), auth.uid(), v_actor.name, v_actor.email);
    else
      v_changed := array(
        select key from jsonb_each_text(v_data)
        where coalesce(v_before ->> key, '') is distinct from value
        union
        select key from jsonb_each_text(v_before)
        where not jsonb_exists(v_data, key)
      );

      update public.job_catalog set
        job_code = nullif(v_data ->> 'COD_DO_CARGO', ''),
        job_name = coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', '')),
        company = nullif(v_data ->> 'EMPRESA', ''),
        cbo = nullif(v_data ->> 'CBO', ''),
        level = nullif(v_data ->> 'NIVEL_CARGO', ''),
        raw_data = v_data,
        updated_by = auth.uid(),
        updated_at = now()
      where job_catalog.id = v_id;

      if array_length(v_changed, 1) is not null then
        insert into public.job_catalog_changes (job_id, action, record_label, changed_fields, actor_id, actor_name, actor_email)
        values (v_id, 'UPDATE',
                concat_ws(' — ', nullif(v_data ->> 'COD_DO_CARGO', ''), coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', ''))),
                v_changed, auth.uid(), v_actor.name, v_actor.email);
      end if;
    end if;

    client_key := item ->> 'client_key';
    id := v_id;
    return next;
  end loop;
end;
$$;

-- 6) Exclusao -------------------------------------------------------------------
create or replace function public.admin_delete_job_catalog_rows(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_actor record;
begin
  if not public.is_base_cargos_admin() then
    raise exception 'Somente o perfil ADMIN pode excluir cargos da base.';
  end if;

  select p.name, p.email into v_actor from public.profiles p where p.id = auth.uid();

  insert into public.job_catalog_changes (job_id, action, record_label, actor_id, actor_name, actor_email)
  select j.id, 'DELETE', concat_ws(' — ', j.job_code, j.job_name), auth.uid(), v_actor.name, v_actor.email
  from public.job_catalog j
  where j.id = any(coalesce(p_ids, '{}'::uuid[]));

  delete from public.job_catalog where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 7) Historico da base para consulta ---------------------------------------------
create or replace function public.list_job_catalog_changes(p_limit integer default 300)
returns setof public.job_catalog_changes
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.job_catalog_changes
  where public.can_read_base_cargos()
  order by created_at desc
  limit greatest(coalesce(p_limit, 300), 1);
$$;

-- 8) Permissoes -------------------------------------------------------------------
alter table public.job_catalog enable row level security;
alter table public.job_catalog_changes enable row level security;

drop policy if exists job_catalog_read on public.job_catalog;
create policy job_catalog_read on public.job_catalog
  for select to authenticated using (true);

drop policy if exists job_catalog_admin_write on public.job_catalog;
create policy job_catalog_admin_write on public.job_catalog
  for all to authenticated
  using (public.is_base_cargos_admin())
  with check (public.is_base_cargos_admin());

drop policy if exists job_catalog_changes_read on public.job_catalog_changes;
create policy job_catalog_changes_read on public.job_catalog_changes
  for select to authenticated using (public.can_read_base_cargos());

revoke all on function public.admin_list_job_catalog(text, integer, integer) from public;
revoke all on function public.admin_save_job_catalog_rows(jsonb) from public;
revoke all on function public.admin_delete_job_catalog_rows(uuid[]) from public;
revoke all on function public.list_job_catalog_changes(integer) from public;

grant execute on function public.admin_list_job_catalog(text, integer, integer) to authenticated;
grant execute on function public.admin_save_job_catalog_rows(jsonb) to authenticated;
grant execute on function public.admin_delete_job_catalog_rows(uuid[]) to authenticated;
grant execute on function public.list_job_catalog_changes(integer) to authenticated;
