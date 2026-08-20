-- =============================================================================
-- Atlas IA — dados de demonstracao
--
-- Gera 60 dias de historico realista para o painel ter o que mostrar antes de
-- existir trafego real. Rode no SQL Editor do Supabase DEPOIS do schema.sql.
--
-- Para limpar tudo depois:
--   delete from public.conversations where title like '[demo]%';
--   delete from public.documents where metadata ->> 'origem' = 'demo';
--
-- Importante: as mensagens aqui nao tem embedding — servem so para o painel.
-- Para a busca semantica funcionar de verdade, indexe conteudo pela interface
-- ou por POST /api/documents, que e quem calcula os vetores.
-- =============================================================================

begin;

-- Limpa uma execucao anterior, para rodar o arquivo de novo ser seguro.
delete from public.conversations where title like '[demo]%';
delete from public.documents where metadata ->> 'origem' = 'demo';

insert into public.documents (id, owner_id, title, source_url, metadata, created_at)
values
  ('00000000-0000-4000-8000-000000000001', null, 'Politica de trocas e devolucoes', 'https://exemplo.com/trocas',    '{"origem":"demo"}'::jsonb, now() - interval '75 days'),
  ('00000000-0000-4000-8000-000000000002', null, 'Prazos e custos de entrega',       'https://exemplo.com/entrega',   '{"origem":"demo"}'::jsonb, now() - interval '75 days'),
  ('00000000-0000-4000-8000-000000000003', null, 'Formas de pagamento',              'https://exemplo.com/pagamento', '{"origem":"demo"}'::jsonb, now() - interval '70 days'),
  ('00000000-0000-4000-8000-000000000004', null, 'Guia de tamanhos',                 null,                            '{"origem":"demo"}'::jsonb, now() - interval '68 days'),
  ('00000000-0000-4000-8000-000000000005', null, 'Garantia e assistencia tecnica',   'https://exemplo.com/garantia',  '{"origem":"demo"}'::jsonb, now() - interval '60 days'),
  ('00000000-0000-4000-8000-000000000006', null, 'Programa de fidelidade',           null,                            '{"origem":"demo"}'::jsonb, now() - interval '30 days');

do $$
declare
  -- Perguntas que a base cobre bem.
  perguntas_cobertas text[] := array[
    'Qual o prazo para trocar um produto?',
    'Vocês entregam no interior de Minas?',
    'Posso parcelar em quantas vezes?',
    'Como faço para devolver uma compra?',
    'Qual o prazo de entrega para o Nordeste?',
    'A garantia cobre defeito de fabricacao?',
    'Como escolho o tamanho certo da camiseta?',
    'Aceita pagamento por Pix?',
    'Quanto custa o frete para Sao Paulo?',
    'Preciso da nota fiscal para trocar?',
    'Posso trocar por um tamanho maior?',
    'Como acumulo pontos no programa de fidelidade?',
    'O frete e gratis acima de quanto?',
    'Qual o prazo da garantia estendida?',
    'Consigo rastrear meu pedido?'
  ];

  -- Perguntas fora do que esta indexado: viram "lacunas da base" no painel.
  perguntas_lacuna text[] := array[
    'Vocês tem loja fisica em Curitiba?',
    'Qual o CNPJ da empresa?',
    'Posso retirar o pedido na loja?',
    'Vocês fazem venda para revenda?',
    'Tem cupom de primeira compra?',
    'Qual o horario do atendimento por telefone?',
    'Vocês entregam no exterior?'
  ];

  titulos_doc text[] := array[
    'Politica de trocas e devolucoes',
    'Prazos e custos de entrega',
    'Formas de pagamento',
    'Guia de tamanhos',
    'Garantia e assistencia tecnica',
    'Programa de fidelidade'
  ];
  ids_doc uuid[] := array[
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid,
    '00000000-0000-4000-8000-000000000005'::uuid,
    '00000000-0000-4000-8000-000000000006'::uuid
  ];

  dia            date;
  offset_dias    integer;
  progresso      double precision;  -- 0.0 no inicio do periodo, 1.0 no fim
  perguntas_dia  integer;
  fator_semana   double precision;

  conversa_id    uuid;
  restantes_conv integer := 0;

  i              integer;
  momento        timestamptz;
  eh_lacuna      boolean;
  eh_seguimento  boolean;
  pergunta       text;
  similaridade   double precision;
  fontes         jsonb;
  n_fontes       integer;
  j              integer;
  idx_doc        integer;

  tok_entrada    integer;
  tok_cache_w    integer;
  tok_cache_r    integer;
  tok_saida      integer;
  latencia       integer;
begin
  for offset_dias in reverse 59 .. 0 loop
    dia := (now() - make_interval(days => offset_dias))::date;
    progresso := (59 - offset_dias)::double precision / 59.0;

    -- Fim de semana movimenta bem menos que dia util.
    fator_semana := case extract(isodow from dia)
      when 6 then 0.45
      when 7 then 0.35
      else 1.0
    end;

    -- Adocao crescente + variacao diaria, para a serie nao parecer sintetica.
    perguntas_dia := greatest(
      1,
      round((14 + 30 * progresso) * fator_semana * (0.75 + random() * 0.5))::integer
    );

    restantes_conv := 0;

    for i in 1 .. perguntas_dia loop
      -- Cada conversa concentra de 1 a 4 perguntas seguidas.
      if restantes_conv <= 0 then
        restantes_conv := 1 + floor(random() * 4)::integer;
        eh_seguimento := false;

        insert into public.conversations (owner_id, title, created_at, updated_at)
        values (
          null,
          '[demo] ' || perguntas_cobertas[1 + floor(random() * array_length(perguntas_cobertas, 1))::integer],
          dia + (random() * interval '14 hours') + interval '7 hours',
          dia + interval '20 hours'
        )
        returning id into conversa_id;
      else
        eh_seguimento := true;
      end if;

      restantes_conv := restantes_conv - 1;

      momento := dia
        + interval '7 hours'
        + (random() * interval '13 hours')
        + (i * interval '17 seconds');

      -- ~14% das perguntas caem fora do que a base cobre.
      eh_lacuna := random() < 0.14;

      if eh_lacuna then
        pergunta := perguntas_lacuna[1 + floor(random() * array_length(perguntas_lacuna, 1))::integer];
        -- Um terco das lacunas nao recupera nada: similaridade NULL.
        similaridade := case when random() < 0.33 then null else 0.18 + random() * 0.25 end;
        n_fontes := case when similaridade is null then 0 else 1 + floor(random() * 2)::integer end;
      else
        pergunta := perguntas_cobertas[1 + floor(random() * array_length(perguntas_cobertas, 1))::integer];
        similaridade := 0.52 + random() * 0.34;
        n_fontes := 3 + floor(random() * 4)::integer;
      end if;

      -- Monta o array de fontes citadas, com similaridades decrescentes.
      fontes := '[]'::jsonb;
      for j in 1 .. n_fontes loop
        idx_doc := 1 + floor(random() * array_length(titulos_doc, 1))::integer;
        fontes := fontes || jsonb_build_array(jsonb_build_object(
          'chunkId',    gen_random_uuid(),
          'documentId', ids_doc[idx_doc],
          'title',      titulos_doc[idx_doc],
          'sourceUrl',  null,
          'similarity', round((coalesce(similaridade, 0.3) - (j - 1) * 0.04)::numeric, 4),
          'excerpt',    'Trecho de demonstracao do documento ' || titulos_doc[idx_doc] || '.'
        ));
      end loop;

      -- Consumo de tokens. O cache so entra a partir da segunda pergunta da
      -- conversa (na primeira, o prefixo ainda esta sendo gravado) — e por isso
      -- que o aproveitamento do cache sobe conforme as conversas ficam longas.
      if eh_seguimento then
        tok_entrada := 260 + floor(random() * 220)::integer;
        tok_cache_w := 0;
        tok_cache_r := 1150 + floor(random() * 700)::integer;
      else
        tok_entrada := 480 + floor(random() * 300)::integer;
        tok_cache_w := 900 + floor(random() * 400)::integer;
        tok_cache_r := 0;
      end if;

      tok_saida := 160 + floor(random() * 300)::integer;
      latencia  := 1500 + floor(random() * 2600)::integer;

      insert into public.messages (conversation_id, role, content, created_at)
      values (conversa_id, 'user', pergunta, momento);

      insert into public.messages (
        conversation_id, role, content, sources, usage,
        model, latency_ms, first_token_ms, top_similarity, created_at
      )
      values (
        conversa_id,
        'assistant',
        case
          when similaridade is null then
            'Nao encontrei essa informacao na base de conhecimento. Posso ajudar com trocas, entrega, pagamento, tamanhos ou garantia.'
          else
            'Resposta de demonstracao para: ' || pergunta
        end,
        fontes,
        jsonb_build_object(
          'input_tokens', tok_entrada,
          'output_tokens', tok_saida,
          'cache_read_input_tokens', tok_cache_r,
          'cache_creation_input_tokens', tok_cache_w
        ),
        'claude-opus-5',
        latencia,
        round(latencia * (0.25 + random() * 0.2))::integer,
        similaridade,
        momento + make_interval(secs => latencia / 1000.0)
      );
    end loop;
  end loop;
end
$$;

commit;

-- Confira o que foi gerado:
--   select count(*) from public.messages where role = 'assistant';
--   select * from public.analytics_summary(now() - interval '30 days', now(), null);
