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
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Busca semantica
-- -----------------------------------------------------------------------------

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
