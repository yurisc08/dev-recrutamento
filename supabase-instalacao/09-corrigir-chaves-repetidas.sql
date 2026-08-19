-- =============================================================================
-- CORRIGE AS CHAVES REPETIDAS EM form_fields
--
-- Rode antes o sql-01-chaves-duplicadas.sql para conferir o que sera alterado.
-- Este arquivo pode ser executado como esta, quantas vezes precisar.
--
-- Regra: entre os campos ativos que dividem a mesma chave, o primeiro (menor
-- ordem) mantem a chave atual e os demais recebem uma chave derivada do proprio
-- nome do campo. Valores ja gravados continuam ligados ao campo pelo seu
-- identificador, entao nada do historico se perde. O mapeamento do documento
-- tambem aponta para o identificador, e nao para a chave.
-- =============================================================================

with base as (
  select f.id, f.label, f.field_key,
         row_number() over (partition by f.field_key order by f.sort_order, f.label, f.id) as posicao
  from public.form_fields f
  where f.active
    and f.field_key in (
      select field_key from public.form_fields where active group by field_key having count(*) > 1
    )
),
sugerido as (
  select b.id, b.posicao,
         regexp_replace(
           regexp_replace(
             lower(translate(b.label,
               'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
               'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
             '[^a-z0-9]+', '_', 'g'),
           '(^_+|_+$)', '', 'g') as chave_nova
  from base b
)
update public.form_fields f
   set field_key = s.chave_nova
  from sugerido s
 where f.id = s.id
   and s.posicao > 1
   and s.chave_nova <> ''
   and not exists (
     select 1 from public.form_fields x
     where x.field_key = s.chave_nova and x.id <> f.id
   );

-- Conferencia: esta lista precisa voltar vazia.
select f.field_key as chave_ainda_repetida,
       count(*)    as quantidade,
       string_agg(f.label, '  |  ' order by f.sort_order, f.label) as campos
from public.form_fields f
where f.active
group by f.field_key
having count(*) > 1
order by f.field_key;

-- Como ficaram os campos ativos:
select field_key as chave, label as campo, sort_order as ordem
from public.form_fields
where active
order by sort_order, label;
