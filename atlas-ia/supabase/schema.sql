-- =============================================================================
-- Atlas IA — esquema do Supabase
-- Rode este arquivo no SQL Editor do Supabase (ou `supabase db push`).
-- =============================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Base de conhecimento
-- -----------------------------------------------------------------------------

-- Um documento e uma fonte de conhecimento (um artigo, um FAQ, um manual...).
-- owner_id NULL = documento publico, visivel para todos os usuarios.
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  title       text not null,
  source_url  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists documents_owner_id_idx on public.documents (owner_id);
create index if not exists documents_created_at_idx on public.documents (created_at desc);

-- Cada documento e quebrado em pedacos ("chunks") e cada pedaco ganha um embedding.
-- 1024 dimensoes = tamanho do vetor do modelo @cf/baai/bge-m3 (Workers AI).
-- Se voce trocar de modelo de embedding, ajuste este numero E recrie a tabela.
create table if not exists public.document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  owner_id      uuid references auth.users (id) on delete cascade,
  chunk_index   integer not null,
  content       text not null,
  embedding     vector(1024),
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- Indice vetorial HNSW com distancia de cosseno: e o que torna a busca semantica rapida.
create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Historico de conversas
-- -----------------------------------------------------------------------------

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  title       text not null default 'Nova conversa',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_owner_id_idx
  on public.conversations (owner_id, updated_at desc);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  -- Trechos da base de conhecimento que embasaram a resposta.
  sources          jsonb not null default '[]'::jsonb,
  -- Consumo de tokens reportado pela API da Anthropic.
  usage            jsonb not null default '{}'::jsonb,
  -- Metricas usadas pelo dashboard.
  model            text,
  latency_ms       integer,
  first_token_ms   integer,
  -- Similaridade do melhor trecho recuperado. NULL nas mensagens do usuario.
  -- E o sinal de cobertura da base: baixo = a pergunta nao tem resposta indexada.
  top_similarity   double precision,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at);

-- O dashboard varre por data, entao o indice e por created_at.
create index if not exists messages_created_at_idx
  on public.messages (created_at desc);

-- Colunas adicionadas depois da primeira versao do schema: rodar de novo e seguro.
alter table public.messages add column if not exists model          text;
alter table public.messages add column if not exists latency_ms     integer;
alter table public.messages add column if not exists first_token_ms integer;
alter table public.messages add column if not exists top_similarity double precision;

-- -----------------------------------------------------------------------------
-- Busca semantica
-- -----------------------------------------------------------------------------

drop function if exists public.match_document_chunks(vector, integer, double precision, uuid);

-- Recebe o embedding da pergunta e devolve os trechos mais parecidos.
-- A similaridade e 1 - distancia_de_cosseno, entao 1.0 = identico, 0.0 = sem relacao.
create or replace function public.match_document_chunks (
  query_embedding      vector(1024),
  match_count          integer default 6,
  similarity_threshold double precision default 0.25,
  filter_owner_id      uuid default null
)
returns table (
  chunk_id    uuid,
  document_id uuid,
  title       text,
  source_url  text,
  content     text,
  chunk_index integer,
  similarity  double precision
)
language sql
stable
as $$
  select
    c.id            as chunk_id,
    d.id            as document_id,
    d.title,
    d.source_url,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    -- documento publico OU do proprio usuario
    and (d.owner_id is null or d.owner_id = filter_owner_id)
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- O Worker usa a service_role key, que ignora RLS (ele filtra por owner_id no codigo).
-- As policies abaixo protegem o caso de alguem acessar o Supabase direto do browser
-- com a anon key: so enxerga o que e publico ou dele.

alter table public.documents       enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (owner_id is null or owner_id = auth.uid());

drop policy if exists "documents_write" on public.documents;
create policy "documents_write" on public.documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "chunks_select" on public.document_chunks;
create policy "chunks_select" on public.document_chunks
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and (d.owner_id is null or d.owner_id = auth.uid())
    )
  );

drop policy if exists "conversations_own" on public.conversations;
create policy "conversations_own" on public.conversations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "messages_own" on public.messages;
create policy "messages_own" on public.messages
  for all using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Gatilho: mantem conversations.updated_at em dia
-- -----------------------------------------------------------------------------

create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- =============================================================================
-- Analytics — funcoes que alimentam o dashboard
--
-- A agregacao acontece no Postgres de proposito: o Worker recebe dezenas de
-- linhas ja somadas em vez de puxar milhares de mensagens para contar em
-- JavaScript. Isso mantem o dashboard rapido conforme o historico cresce.
-- =============================================================================

-- `create or replace` nao consegue alterar o tipo de retorno de uma funcao que
-- ja existe. Sem estes drops, rodar o schema de novo depois de uma atualizacao
-- falha com "cannot change return type of existing function".
drop function if exists public.analytics_daily(timestamptz, timestamptz, uuid);
drop function if exists public.analytics_summary(timestamptz, timestamptz, uuid);
drop function if exists public.analytics_top_documents(timestamptz, timestamptz, uuid, integer);
drop function if exists public.analytics_knowledge_gaps(timestamptz, timestamptz, uuid, integer, double precision);

-- Serie diaria: volume, tokens e latencia por dia, com os dias vazios
-- preenchidos com zero (senao o grafico "pula" datas sem movimento).
create or replace function public.analytics_daily (
  from_ts         timestamptz,
  to_ts           timestamptz,
  filter_owner_id uuid default null
)
returns table (
  dia                  date,
  perguntas            bigint,
  tokens_entrada_novos bigint,
  tokens_cache_escrita bigint,
  tokens_cache_leitura bigint,
  tokens_saida         bigint,
  latencia_media_ms    double precision,
  respostas_embasadas  bigint
)
language sql
stable
as $$
  with respostas as (
    select
      m.created_at,
      coalesce((m.usage ->> 'input_tokens')::bigint, 0)                 as entrada,
      coalesce((m.usage ->> 'cache_creation_input_tokens')::bigint, 0)  as cache_escrita,
      coalesce((m.usage ->> 'cache_read_input_tokens')::bigint, 0)      as cache_leitura,
      coalesce((m.usage ->> 'output_tokens')::bigint, 0)                as saida,
      m.latency_ms,
      m.top_similarity
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.role = 'assistant'
      and m.created_at >= from_ts
      and m.created_at <  to_ts
      and c.owner_id is not distinct from filter_owner_id
  )
  select
    serie.dia::date,
    count(r.created_at)                                    as perguntas,
    coalesce(sum(r.entrada), 0)                            as tokens_entrada_novos,
    coalesce(sum(r.cache_escrita), 0)                      as tokens_cache_escrita,
    coalesce(sum(r.cache_leitura), 0)                      as tokens_cache_leitura,
    coalesce(sum(r.saida), 0)                              as tokens_saida,
    avg(r.latency_ms)                                      as latencia_media_ms,
    count(*) filter (where r.top_similarity is not null)   as respostas_embasadas
  from generate_series(from_ts::date, (to_ts - interval '1 microsecond')::date, interval '1 day') as serie(dia)
  left join respostas r
    on r.created_at >= serie.dia
   and r.created_at <  serie.dia + interval '1 day'
  group by serie.dia
  order by serie.dia;
$$;

-- Totais do periodo, em uma linha so.
create or replace function public.analytics_summary (
  from_ts         timestamptz,
  to_ts           timestamptz,
  filter_owner_id uuid default null
)
returns table (
  perguntas            bigint,
  conversas            bigint,
  tokens_entrada_novos bigint,
  tokens_cache_escrita bigint,
  tokens_cache_leitura bigint,
  tokens_saida         bigint,
  latencia_media_ms    double precision,
  latencia_p95_ms      double precision,
  respostas_embasadas  bigint,
  similaridade_media   double precision
)
language sql
stable
as $$
  select
    count(*)                                                          as perguntas,
    count(distinct m.conversation_id)                                 as conversas,
    coalesce(sum((m.usage ->> 'input_tokens')::bigint), 0)                as tokens_entrada_novos,
    coalesce(sum((m.usage ->> 'cache_creation_input_tokens')::bigint), 0) as tokens_cache_escrita,
    coalesce(sum((m.usage ->> 'cache_read_input_tokens')::bigint), 0)     as tokens_cache_leitura,
    coalesce(sum((m.usage ->> 'output_tokens')::bigint), 0)               as tokens_saida,
    avg(m.latency_ms)                                                 as latencia_media_ms,
    percentile_cont(0.95) within group (order by m.latency_ms)        as latencia_p95_ms,
    count(*) filter (where m.top_similarity is not null)              as respostas_embasadas,
    avg(m.top_similarity)                                             as similaridade_media
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.role = 'assistant'
    and m.created_at >= from_ts
    and m.created_at <  to_ts
    and c.owner_id is not distinct from filter_owner_id;
$$;

-- Quais documentos da base realmente sustentam as respostas.
-- Documento que nunca aparece aqui e conteudo que ninguem consulta.
create or replace function public.analytics_top_documents (
  from_ts         timestamptz,
  to_ts           timestamptz,
  filter_owner_id uuid default null,
  max_rows        integer default 8
)
returns table (
  document_id        uuid,
  titulo             text,
  citacoes           bigint,
  similaridade_media double precision
)
language sql
stable
as $$
  select
    (fonte ->> 'documentId')::uuid                            as document_id,
    max(fonte ->> 'title')                                    as titulo,
    count(*)                                                  as citacoes,
    avg((fonte ->> 'similarity')::double precision)           as similaridade_media
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  cross join lateral jsonb_array_elements(m.sources) as fonte
  where m.role = 'assistant'
    and m.created_at >= from_ts
    and m.created_at <  to_ts
    and c.owner_id is not distinct from filter_owner_id
  group by 1
  order by citacoes desc, titulo
  limit greatest(max_rows, 1);
$$;

-- Lacunas: perguntas que a base nao soube responder bem.
-- E a lista de "o que escrever a seguir" — a metrica mais acionavel do painel.
create or replace function public.analytics_knowledge_gaps (
  from_ts         timestamptz,
  to_ts           timestamptz,
  filter_owner_id uuid default null,
  max_rows        integer default 10,
  limiar          double precision default 0.45
)
returns table (
  pergunta          text,
  ocorrencias       bigint,
  melhor_similaridade double precision,
  ultima_vez        timestamptz
)
language sql
stable
as $$
  with pares as (
    select
      m.role,
      m.created_at,
      m.top_similarity,
      -- a pergunta e a mensagem imediatamente anterior na mesma conversa
      lag(m.content) over (
        partition by m.conversation_id order by m.created_at
      ) as pergunta
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.created_at >= from_ts
      and m.created_at <  to_ts
      and c.owner_id is not distinct from filter_owner_id
  )
  -- Agrupa por pergunta: a mesma duvida repetida dez vezes e um sinal muito
  -- mais forte do que dez duvidas diferentes aparecendo uma vez cada.
  select
    pergunta,
    count(*)                as ocorrencias,
    max(top_similarity)     as melhor_similaridade,
    max(created_at)         as ultima_vez
  from pares
  where role = 'assistant'
    and pergunta is not null
    and (top_similarity is null or top_similarity < limiar)
  group by pergunta
  order by ocorrencias desc, melhor_similaridade nulls first
  limit greatest(max_rows, 1);
$$;
