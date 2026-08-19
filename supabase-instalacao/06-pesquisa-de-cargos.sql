-- V57 - Corrige a lista/pesquisa de cargos apos a atualizacao da base
-- Nao exige alteracao ou nova publicacao no Cloudflare.

-- 1. Busca usada pelo campo "Pesquisar cargo vigente".
drop function if exists public.search_job_catalog(text);
create function public.search_job_catalog(p_query text)
returns table(
  id uuid,
  job_code text,
  job_name text,
  full_name text,
  company_code text,
  company text,
  active boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    j.id,
    j.job_code,
    j.job_name,
    j.full_name,
    j.company_code,
    j.company,
    j.active
  from public.job_catalog j
  where j.active=true
    and (
      nullif(btrim(coalesce(p_query,'')),'') is null
      or j.job_code ilike '%'||btrim(p_query)||'%'
      or j.job_name ilike '%'||btrim(p_query)||'%'
      or coalesce(j.full_name,'') ilike '%'||btrim(p_query)||'%'
      or coalesce(j.company,'') ilike '%'||btrim(p_query)||'%'
    )
  order by
    case when lower(j.job_code)=lower(btrim(coalesce(p_query,''))) then 0 else 1 end,
    j.job_name,
    j.company
  limit 100;
$$;

revoke all on function public.search_job_catalog(text) from public;
grant execute on function public.search_job_catalog(text) to authenticated;

-- 2. Detalhes completos do cargo. Converte requirements para o formato esperado no front-end.
drop function if exists public.get_job_catalog_details(uuid);
create function public.get_job_catalog_details(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    to_jsonb(j)
    || coalesce(j.requirements,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'COD_EMPRESA',j.company_code,
      'EMPRESA',j.company,
      'COD_DO_CARGO',j.job_code,
      'CARGO',j.job_name,
      'NOME_COMPLETO',j.full_name,
      'CBO',j.cbo,
      'NATUREZA_DO_CARGO',j.nature,
      'TCLC_DESC',j.career_track,
      'NIVEL_CARGO',j.level,
      'COD_FAMILIA_CARGO',j.family_code,
      'CHAVE_AGRUPAMENTO',j.grouping_key,
      'TEXTO_RESULTADO_ESPERADO',j.expected_result,
      'DESCRICAO_CARGO',j.job_description,
      'ATIV_DESC',j.activities
    )),
    '{}'::jsonb
  )
  from public.job_catalog j
  where j.id=p_job_id;
$$;

revoke all on function public.get_job_catalog_details(uuid) from public;
grant execute on function public.get_job_catalog_details(uuid) to authenticated;

-- 3. Indices para a pesquisa.
create index if not exists idx_job_catalog_active on public.job_catalog(active);
create index if not exists idx_job_catalog_job_code_lower on public.job_catalog(lower(job_code));
create index if not exists idx_job_catalog_job_name_lower on public.job_catalog(lower(job_name));

notify pgrst,'reload schema';

-- 4. Diagnostico exibido ao final.
select
  (select count(*) from public.job_catalog_import) as linhas_na_importacao,
  count(*) as cargos_na_base,
  count(*) filter(where active) as cargos_ativos,
  count(*) filter(where imported_at >= now()-interval '1 day') as importados_ultimo_dia,
  max(imported_at) as ultima_importacao
from public.job_catalog;
