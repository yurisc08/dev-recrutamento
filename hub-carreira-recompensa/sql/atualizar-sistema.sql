-- =====================================================================
-- HUB Carreira & Recompensa — atualização do sistema
--
-- COMO USAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   Pode rodar mais de uma vez: é idempotente, não apaga dados e não
--   sobrescreve configuração que você já tenha ajustado na tela.
--
-- O QUE ELE FAZ
--   1. Conserta o CHECK de manager_intake_requests que estava barrando a
--      triagem, sem que você precise descobrir os valores na mão.
--   2. Cria section_catalog  → as seções do descritivo, editáveis pelo ADMIN.
--   3. Cria app_settings     → regras gerais, editáveis pelo ADMIN.
--   Depois disso, tudo o que antes exigia mexer no código passa a ser
--   alterável na tela "Base e modelo".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. manager_intake_requests: liberar os status que o fluxo usa
--
-- O CHECK foi criado por uma migration antiga e ficou para trás quando as
-- funções passaram a gravar status novos. Em vez de adivinhar os valores,
-- montamos a lista a partir de três fontes: o que já existe gravado na
-- tabela, o que as funções do fluxo escrevem, e uma linha de base conhecida.
-- O constraint só é AMPLIADO — nada que já esteja gravado deixa de valer.
-- ---------------------------------------------------------------------
do $$
declare
  v_status  text[] := array['PENDENTE','EM_TRIAGEM','CONVERTIDA','RECUSADA_CR'];
  v_extra   text[];
  v_nome    text;
begin
  if to_regclass('public.manager_intake_requests') is null then
    raise notice '[1/3] Tabela manager_intake_requests não existe — etapa ignorada.';
    return;
  end if;

  -- o que já está gravado
  execute 'select coalesce(array_agg(distinct status), ''{}'') from public.manager_intake_requests where status is not null'
     into v_extra;
  v_status := v_status || v_extra;

  -- o que as funções do fluxo escrevem em status
  select coalesce(array_agg(distinct m[1]), '{}') into v_extra
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         lateral regexp_matches(p.prosrc, 'status[[:space:]]*(?::=|=)[[:space:]]*''([A-Za-z0-9_]+)''', 'g') m
   where n.nspname = 'public'
     and p.proname in ('claim_manager_intake_request','convert_manager_intake_to_request',
                       'reject_manager_intake_request','create_manager_intake_request_v2',
                       'create_manager_intake_request','list_manager_intake_requests');
  v_status := v_status || v_extra;

  -- limpa duplicados e vazios
  select array_agg(distinct x) into v_status
    from unnest(v_status) x where x is not null and x <> '';

  -- remove qualquer CHECK de status que exista hoje na tabela
  for v_nome in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.manager_intake_requests'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.manager_intake_requests drop constraint %I', v_nome);
    raise notice '[1/3] Constraint antigo removido: %', v_nome;
  end loop;

  execute format(
    'alter table public.manager_intake_requests add constraint manager_intake_requests_status_check check (status = any (%L))',
    v_status);
  raise notice '[1/3] Status liberados: %', array_to_string(v_status, ', ');
end $$;

-- ---------------------------------------------------------------------
-- 2. section_catalog — as seções do descritivo
--    Chave = marcador no modelo .docx = coluna na planilha base.
-- ---------------------------------------------------------------------
create table if not exists public.section_catalog (
  key         text primary key,
  label       text        not null,
  base_label  text,
  legacy_keys text[]      not null default '{}',
  suggestable boolean     not null default false,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.section_catalog enable row level security;
drop policy if exists section_catalog_read on public.section_catalog;
create policy section_catalog_read on public.section_catalog
  for select to authenticated using (true);

-- Carga inicial com a numeração conferida na planilha e no modelo .docx.
-- Só insere o que faltar: não desfaz ajuste seu.
insert into public.section_catalog (key, label, base_label, legacy_keys, suggestable, sort_order) values
  ('TEXTO_RESULTADO_ESPERADO','Foco de atuação',                                     null,                                 '{expected_result,foco_atuacao,resultado_esperado}',              false,  0),
  ('ATIV_DESC',               'Missão',                                              null,                                 '{mission,activities,ativ_desc}',                                 true,  10),
  ('DESCRICAO_CARGO',         'Principais responsabilidades/atividades',             null,                                 '{responsibilities,job_description,description,descricao_cargo}', true,  20),
  ('SKILL_30',                'Formação/Escolaridade mínima',                        'ESCOLARIDADE MÍNIMA',                '{formation_min}',                                               false, 30),
  ('SKILL_31',                'Formação/Escolaridade desejável',                     'ESCOLARIDADE DESEJÁVEL',             '{formation_desired}',                                           false, 40),
  ('SKILL_32',                'Idioma mínimo',                                       'IDIOMA MÍNIMO',                      '{language_min}',                                                false, 50),
  ('SKILL_33',                'Idioma desejável',                                    'IDIOMA DESEJÁVEL',                   '{language_desired}',                                            false, 60),
  ('SKILL_34',                'Competências técnicas mínimas',                       'COMPETÊNCIAS TÉCNICAS MÍNIMAS',      '{technical_min}',                                               false, 70),
  ('SKILL_35',                'Competências técnicas desejáveis',                    'COMPETÊNCIAS TÉCNICAS DESEJÁVEIS',   '{technical_desired}',                                           false, 80),
  ('SKILL_36',                'Experiência profissional desejável',                  'EXPERIÊNCIA PROFISSIONAL DESEJÁVEL', '{experience_min,experience_desired}',                            false, 90),
  ('SKILL_37',                'Competências comportamentais Marcopolo desejáveis',   'COMPETÊNCIAS MARCOPOLO DESEJÁVEIS',  '{behavioral}',                                                  false,100)
on conflict (key) do nothing;

create or replace function public.list_section_catalog()
returns setof public.section_catalog
language sql stable security definer set search_path = public as $$
  select * from public.section_catalog where active order by sort_order, key;
$$;

create or replace function public.save_section_catalog(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_total integer;
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'ADMIN' then
    raise exception 'Apenas o Administrador pode alterar o catálogo de seções.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Envie ao menos uma seção.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
              where trim(coalesce(x->>'key','')) = '' or trim(coalesce(x->>'label','')) = '') then
    raise exception 'Toda seção precisa de chave e rótulo.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
              group by upper(trim(x->>'key')) having count(*) > 1) then
    raise exception 'Há chaves repetidas no catálogo.';
  end if;

  -- CTE em vez de tabela temporária: a temp com ON COMMIT DROP quebrava se a
  -- função fosse chamada duas vezes dentro da mesma transação.
  with novo as (
    select upper(trim(x->>'key'))                         as key,
           trim(x->>'label')                              as label,
           nullif(trim(coalesce(x->>'baseLabel','')), '') as base_label,
           coalesce((select array_agg(trim(v))
                       from jsonb_array_elements_text(
                              case when jsonb_typeof(x->'legacy') = 'array' then x->'legacy' else '[]'::jsonb end) v
                      where trim(v) <> ''), '{}'::text[]) as legacy_keys,
           coalesce((x->>'suggestable')::boolean, false)  as suggestable,
           coalesce((x->>'sort_order')::integer, 0)       as sort_order,
           coalesce((x->>'active')::boolean, true)        as active
      from jsonb_array_elements(p_rows) x
  ),
  removidas as (
    delete from public.section_catalog
     where key not in (select key from novo)
  )
  insert into public.section_catalog
    (key, label, base_label, legacy_keys, suggestable, sort_order, active, updated_at, updated_by)
  select key, label, base_label, legacy_keys, suggestable, sort_order, active, now(), auth.uid()
    from novo
  on conflict (key) do update set
    label = excluded.label, base_label = excluded.base_label, legacy_keys = excluded.legacy_keys,
    suggestable = excluded.suggestable, sort_order = excluded.sort_order, active = excluded.active,
    updated_at = now(), updated_by = auth.uid();

  get diagnostics v_total = row_count;
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- 3. app_settings — regras gerais que antes ficavam fixas no código
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

insert into public.app_settings (key, value) values
  ('email_domains',              '["marcopolo.com.br"]'::jsonb),
  ('triage_deadline_days',       '15'::jsonb),
  ('fixed_markers',              '["EMPRESA","COD_DO_CARGO","NOME_COMPLETO","CBO","TCLC_DESC","DT_ATIVACAO"]'::jsonb),
  ('manager_can_open_new',       'true'::jsonb),
  ('manager_can_open_update',    'true'::jsonb),
  ('require_job_code_on_approve','true'::jsonb)
on conflict (key) do nothing;

create or replace function public.list_app_settings()
returns setof public.app_settings
language sql stable security definer set search_path = public as $$
  select * from public.app_settings order by key;
$$;

create or replace function public.save_app_settings(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_total integer;
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'ADMIN' then
    raise exception 'Apenas o Administrador pode alterar as configurações.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  select trim(x->>'key'), x->'value', now(), auth.uid()
    from jsonb_array_elements(p_rows) x
   where trim(coalesce(x->>'key','')) <> ''
  on conflict (key) do update set
    value = excluded.value, updated_at = now(), updated_by = auth.uid();

  select count(*) into v_total from jsonb_array_elements(p_rows);
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on function public.save_section_catalog(jsonb) from public;
revoke all on function public.save_app_settings(jsonb)    from public;
grant execute on function public.list_section_catalog()      to authenticated;
grant execute on function public.save_section_catalog(jsonb) to authenticated;
grant execute on function public.list_app_settings()         to authenticated;
grant execute on function public.save_app_settings(jsonb)    to authenticated;
