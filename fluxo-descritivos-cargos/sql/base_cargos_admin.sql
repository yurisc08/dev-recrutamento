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
--
-- As funcoes usam o prefixo base_cargos_ para nao colidir com funcoes
-- admin_*_job_catalog que ja existam no projeto (nomes iguais com assinaturas
-- diferentes fazem o Supabase responder "Could not choose the best candidate
-- function"). Pode executar o arquivo quantas vezes precisar.
-- =============================================================================

-- Remove a versao anterior deste mesmo arquivo, quando ela tiver sido aplicada.
-- Nenhuma outra funcao do projeto e afetada: apenas estas assinaturas exatas.
drop function if exists public.admin_list_job_catalog(text, integer, integer);
drop function if exists public.admin_save_job_catalog_rows(jsonb);
drop function if exists public.admin_delete_job_catalog_rows(uuid[]);
drop function if exists public.list_job_catalog_changes(integer);

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
create or replace function public.base_cargos_list(
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
           -- 1) colunas reais da tabela (qualquer nome, convertido para MAIUSCULAS),
           -- 2) as colunas resumidas mapeadas para as chaves da planilha,
           -- 3) raw_data por ultimo, que tem prioridade sobre as anteriores.
           coalesce((
             select jsonb_object_agg(upper(t.k), t.v)
             from jsonb_each_text(to_jsonb(j)) as t(k, v)
             where t.v is not null and t.v <> ''
               and t.k not in ('id', 'raw_data', 'created_at', 'updated_at', 'updated_by')
           ), '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'COD_DO_CARGO', j.job_code,
                'NOME_COMPLETO', j.job_name,
                'CARGO', j.job_name,
                'EMPRESA', j.company,
                'CBO', j.cbo,
                'NIVEL_CARGO', j.level
              ))
           || coalesce(j.raw_data, '{}'::jsonb) as data
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
--
-- Grava sempre em raw_data e nas colunas resumidas. Alem disso, se a tabela ja
-- tiver colunas de texto com o nome de algum campo da planilha (ativ_desc,
-- descricao_cargo, skill_31...), essas colunas tambem sao atualizadas — assim
-- funciona tanto na base montada por este arquivo quanto numa base ja existente
-- com as 35 colunas. Colunas nao textuais (datas, numeros) nunca sao tocadas,
-- para nao arriscar erro de conversao.
create or replace function public.base_cargos_save(p_rows jsonb)
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
  v_text_cols text[];
  v_typed_cols jsonb;
  v_sets text;
  v_label text;
  v_is_new boolean;
  v_col record;
begin
  if not public.is_base_cargos_admin() then
    raise exception 'Somente o perfil ADMIN pode alterar a base de cargos.';
  end if;

  select p.name, p.email into v_actor from public.profiles p where p.id = auth.uid();

  -- colunas de texto da tabela que podem receber os campos da planilha
  select coalesce(array_agg(lower(c.column_name)), '{}')
    into v_text_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'job_catalog'
    and c.data_type in ('text', 'character varying', 'character')
    and lower(c.column_name) not in ('id', 'raw_data', 'created_at', 'updated_at', 'updated_by',
                                     'job_code', 'job_name', 'company', 'cbo', 'level');

  -- colunas nao textuais (datas, numeros): recebem o valor com conversao explicita
  -- e sao ignoradas silenciosamente quando o conteudo digitado nao converte.
  select coalesce(jsonb_object_agg(lower(a.attname), format_type(a.atttypid, a.atttypmod)), '{}'::jsonb)
    into v_typed_cols
  from pg_attribute a
  where a.attrelid = 'public.job_catalog'::regclass
    and a.attnum > 0 and not a.attisdropped
    and format_type(a.atttypid, a.atttypmod) not in ('text', 'character varying', 'uuid', 'jsonb')
    and lower(a.attname) not in ('id', 'raw_data', 'created_at', 'updated_at', 'updated_by');

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_data := coalesce(item -> 'data', '{}'::jsonb);
    v_id := nullif(item ->> 'id', '')::uuid;
    v_before := null;

    if v_id is not null then
      select coalesce(j.raw_data, '{}'::jsonb) into v_before from public.job_catalog j where j.id = v_id;
    end if;

    v_is_new := (v_id is null or v_before is null);

    if v_is_new then
      insert into public.job_catalog (id, raw_data)
      values (coalesce(v_id, gen_random_uuid()), '{}'::jsonb)
      returning job_catalog.id into v_id;
    end if;

    -- colunas extras da propria tabela, quando existirem e forem de texto
    select string_agg(format('%I = %L', lower(t.key), t.value), ', ')
      into v_sets
    from jsonb_each_text(v_data) as t(key, value)
    where lower(t.key) = any(v_text_cols);

    execute format(
      'update public.job_catalog set %s job_code = $1, job_name = $2, company = $3, cbo = $4, level = $5,'
      || ' raw_data = $6, updated_by = $7, updated_at = now() where id = $8',
      case when v_sets is null or v_sets = '' then '' else v_sets || ', ' end
    )
    using nullif(v_data ->> 'COD_DO_CARGO', ''),
          coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', '')),
          nullif(v_data ->> 'EMPRESA', ''),
          nullif(v_data ->> 'CBO', ''),
          nullif(v_data ->> 'NIVEL_CARGO', ''),
          v_data,
          auth.uid(),
          v_id;

    -- colunas tipadas da propria tabela (data, numero): uma a uma, sem derrubar o lote
    for v_col in
      select lower(t.key) as nome, t.value as valor, v_typed_cols ->> lower(t.key) as tipo
      from jsonb_each_text(v_data) as t(key, value)
      where jsonb_exists(v_typed_cols, lower(t.key)) and nullif(btrim(t.value), '') is not null
    loop
      begin
        execute format('update public.job_catalog set %I = ($1)::%s where id = $2', v_col.nome, v_col.tipo)
        using btrim(v_col.valor), v_id;
      exception when others then
        null; -- valor incompativel com o tipo da coluna: fica registrado apenas em raw_data
      end;
    end loop;

    v_label := concat_ws(' — ', nullif(v_data ->> 'COD_DO_CARGO', ''),
                         coalesce(nullif(v_data ->> 'NOME_COMPLETO', ''), nullif(v_data ->> 'CARGO', '')));

    if v_is_new then
      insert into public.job_catalog_changes (job_id, action, record_label, changed_fields, actor_id, actor_name, actor_email)
      values (v_id, 'INSERT', v_label, array(select jsonb_object_keys(v_data)), auth.uid(), v_actor.name, v_actor.email);
    else
      v_changed := array(
        select key from jsonb_each_text(v_data)
        where coalesce(v_before ->> key, '') is distinct from value
        union
        select key from jsonb_each_text(v_before)
        where not jsonb_exists(v_data, key)
      );
      if array_length(v_changed, 1) is not null then
        insert into public.job_catalog_changes (job_id, action, record_label, changed_fields, actor_id, actor_name, actor_email)
        values (v_id, 'UPDATE', v_label, v_changed, auth.uid(), v_actor.name, v_actor.email);
      end if;
    end if;

    client_key := item ->> 'client_key';
    id := v_id;
    return next;
  end loop;
end;
$$;

-- 6) Exclusao -------------------------------------------------------------------
create or replace function public.base_cargos_delete(p_ids uuid[])
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
create or replace function public.base_cargos_history(p_limit integer default 300)
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

revoke all on function public.base_cargos_list(text, integer, integer) from public;
revoke all on function public.base_cargos_save(jsonb) from public;
revoke all on function public.base_cargos_delete(uuid[]) from public;
revoke all on function public.base_cargos_history(integer) from public;

grant execute on function public.base_cargos_list(text, integer, integer) to authenticated;
grant execute on function public.base_cargos_save(jsonb) to authenticated;
grant execute on function public.base_cargos_delete(uuid[]) to authenticated;
grant execute on function public.base_cargos_history(integer) to authenticated;
