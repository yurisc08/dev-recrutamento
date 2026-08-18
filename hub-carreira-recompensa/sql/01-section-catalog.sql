-- =====================================================================
-- HUB Carreira & Recompensa - catalogo de secoes do descritivo
-- Opcional. Sem esta migration o app usa o catalogo embutido no pacote
-- e a tela "Base e modelo" funciona em modo conferencia + exportacao.
-- Com ela, o ADMIN redefine as secoes pela tela e a mudanca vale para
-- todos os usuarios.
-- =====================================================================

create table if not exists public.section_catalog (
  key         text primary key,
  label       text        not null,
  base_label  text,                                  -- coluna _DESC na planilha base
  legacy_keys text[]      not null default '{}',     -- apelidos aceitos em dados antigos
  suggestable boolean     not null default false,    -- o Gestor pode propor alteracao?
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

alter table public.section_catalog enable row level security;

-- Todo usuario autenticado le; so o ADMIN grava (pelas RPCs abaixo).
drop policy if exists section_catalog_read on public.section_catalog;
create policy section_catalog_read on public.section_catalog
  for select to authenticated using (true);

create or replace function public.list_section_catalog()
returns setof public.section_catalog
language sql
security definer
set search_path = public
as $$
  select * from public.section_catalog where active order by sort_order, key;
$$;

create or replace function public.save_section_catalog(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count integer;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'ADMIN' then
    raise exception 'Apenas o Administrador pode alterar o catálogo de seções.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Envie ao menos uma seção.';
  end if;

  create temp table _novo on commit drop as
  select
    upper(trim(x->>'key'))                                as key,
    trim(x->>'label')                                     as label,
    nullif(trim(coalesce(x->>'baseLabel','')), '')        as base_label,
    coalesce(
      (select array_agg(trim(v)) from jsonb_array_elements_text(
         case when jsonb_typeof(x->'legacy') = 'array' then x->'legacy' else '[]'::jsonb end) v
       where trim(v) <> ''), '{}'::text[])                as legacy_keys,
    coalesce((x->>'suggestable')::boolean, false)         as suggestable,
    coalesce((x->>'sort_order')::integer, 0)              as sort_order,
    coalesce((x->>'active')::boolean, true)               as active
  from jsonb_array_elements(p_rows) x;

  if exists (select 1 from _novo where key = '' or label = '') then
    raise exception 'Toda seção precisa de chave e rótulo.';
  end if;
  if exists (select key from _novo group by key having count(*) > 1) then
    raise exception 'Há chaves repetidas no catálogo.';
  end if;

  delete from public.section_catalog
   where key not in (select key from _novo);

  insert into public.section_catalog
    (key, label, base_label, legacy_keys, suggestable, sort_order, active, updated_at, updated_by)
  select key, label, base_label, legacy_keys, suggestable, sort_order, active, now(), auth.uid()
    from _novo
  on conflict (key) do update set
    label       = excluded.label,
    base_label  = excluded.base_label,
    legacy_keys = excluded.legacy_keys,
    suggestable = excluded.suggestable,
    sort_order  = excluded.sort_order,
    active      = excluded.active,
    updated_at  = now(),
    updated_by  = auth.uid();

  select count(*) into v_count from _novo;
  return v_count;
end;
$$;

revoke all on function public.save_section_catalog(jsonb) from public;
grant execute on function public.list_section_catalog()      to authenticated;
grant execute on function public.save_section_catalog(jsonb) to authenticated;

-- Carga inicial: a numeracao conferida na planilha e no modelo .docx.
insert into public.section_catalog (key, label, base_label, legacy_keys, suggestable, sort_order) values
  ('TEXTO_RESULTADO_ESPERADO','Foco de atuação',                             null,                                  '{expected_result,foco_atuacao,resultado_esperado}',            false,  0),
  ('ATIV_DESC',               'Missão',                                      null,                                  '{mission,activities,ativ_desc}',                               true,  10),
  ('DESCRICAO_CARGO',         'Principais responsabilidades/atividades',     null,                                  '{responsibilities,job_description,description,descricao_cargo}',true, 20),
  ('SKILL_30',                'Formação/Escolaridade mínima',                'ESCOLARIDADE MÍNIMA',                 '{formation_min}',                                             false, 30),
  ('SKILL_31',                'Formação/Escolaridade desejável',             'ESCOLARIDADE DESEJÁVEL',              '{formation_desired}',                                         false, 40),
  ('SKILL_32',                'Idioma mínimo',                               'IDIOMA MÍNIMO',                       '{language_min}',                                              false, 50),
  ('SKILL_33',                'Idioma desejável',                            'IDIOMA DESEJÁVEL',                    '{language_desired}',                                          false, 60),
  ('SKILL_34',                'Competências técnicas mínimas',               'COMPETÊNCIAS TÉCNICAS MÍNIMAS',       '{technical_min}',                                             false, 70),
  ('SKILL_35',                'Competências técnicas desejáveis',            'COMPETÊNCIAS TÉCNICAS DESEJÁVEIS',    '{technical_desired}',                                         false, 80),
  ('SKILL_36',                'Experiência profissional desejável',          'EXPERIÊNCIA PROFISSIONAL DESEJÁVEL',  '{experience_min,experience_desired}',                          false, 90),
  ('SKILL_37',                'Competências comportamentais Marcopolo desejáveis','COMPETÊNCIAS MARCOPOLO DESEJÁVEIS','{behavioral}',                                              false,100)
on conflict (key) do nothing;
