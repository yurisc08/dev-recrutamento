-- =============================================================================
-- CHAVES REPETIDAS EM form_fields
--
-- Dois campos ativos com a mesma chave interna (field_key) dividem o mesmo
-- conteudo na solicitacao: o que for digitado em um substitui o outro ao salvar,
-- e o campo parece "nao aceitar edicao". E o caso tipico de
-- "Escolaridade minima" e "Escolaridade desejavel" com a chave "escolaridade".
--
-- Este arquivo apenas CONSULTA: a parte 1 diz se o problema existe e a parte 2
-- mostra como ficariam as chaves. Para corrigir, rode depois o arquivo
-- sql-02-corrigir-chaves-duplicadas.sql.
-- =============================================================================

-- PARTE 1 — Diagnostico: existe chave repetida entre campos ativos? ------------
select f.field_key                          as chave_repetida,
       count(*)                             as quantidade,
       string_agg(f.label, '  |  ' order by f.sort_order, f.label) as campos
from public.form_fields f
where f.active
group by f.field_key
having count(*) > 1
order by f.field_key;

-- PARTE 2 — Previa da correcao -------------------------------------------------
-- O primeiro campo de cada chave (menor ordem) mantem a chave atual. Os demais
-- recebem uma chave nova, derivada do proprio nome do campo.
with base as (
  select f.id, f.label, f.field_key, f.sort_order,
         row_number() over (partition by f.field_key order by f.sort_order, f.label, f.id) as posicao
  from public.form_fields f
  where f.active
    and f.field_key in (
      select field_key from public.form_fields where active group by field_key having count(*) > 1
    )
),
sugerido as (
  select b.*,
         regexp_replace(
           regexp_replace(
             lower(translate(b.label,
               'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
               'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
             '[^a-z0-9]+', '_', 'g'),
           '(^_+|_+$)', '', 'g') as chave_nova
  from base b
)
select id,
       label                as campo,
       field_key            as chave_atual,
       case when posicao = 1 then field_key else chave_nova end as chave_depois,
       case when posicao = 1 then 'mantem' else 'renomeia' end  as acao
from sugerido
order by field_key, posicao;

-- Se a parte 1 vier vazia, nao ha nada a corrigir.
-- Se vier com linhas, confira a parte 2 e rode sql-02-corrigir-chaves-duplicadas.sql.
