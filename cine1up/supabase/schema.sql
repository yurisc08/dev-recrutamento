-- ============================================================
-- CINE 1UP — schema.sql
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- Cria tabelas, índices, políticas de segurança (RLS) e o bucket
-- de mídia. Pode rodar de novo sem quebrar nada (é idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- 1. MATÉRIAS
-- ------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  titulo        text not null,
  subtitulo     text,
  categoria     text default 'Crítica',
  tags          text[] default '{}',

  corpo         text default '',

  -- capa: se capa_url for nulo, o site gera uma ilustração
  -- exclusiva em SVG a partir do slug (assets/js/art.js)
  capa_url      text,
  arte_cena     smallint,          -- variação da arte gerada (0-6)
  arte_tema     text,              -- força um tema visual, opcional

  -- ficha do filme (tudo opcional)
  diretor       text,
  ano           integer,
  duracao       integer,
  nota          numeric(3,1) check (nota is null or (nota >= 0 and nota <= 10)),
  trailer_url   text,

  autor         text default 'Redação CINE 1UP',
  destaque      boolean default false,
  status        text default 'rascunho' check (status in ('rascunho', 'publicado')),
  publicado_em  timestamptz default now(),
  views         integer default 0,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists posts_status_data_idx
  on public.posts (status, publicado_em desc);
create index if not exists posts_categoria_idx
  on public.posts (categoria);
create index if not exists posts_destaque_idx
  on public.posts (destaque) where destaque = true;

-- busca por texto (título e linha fina)
create index if not exists posts_busca_idx
  on public.posts using gin (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(subtitulo,'')));

-- updated_at automático
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.tocar_updated_at();

-- só um destaque por vez: ao marcar um, desmarca os outros
create or replace function public.destaque_unico()
returns trigger language plpgsql as $$
begin
  if new.destaque then
    update public.posts set destaque = false
      where destaque = true and id <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists posts_destaque_unico on public.posts;
create trigger posts_destaque_unico
  after insert or update of destaque on public.posts
  for each row when (new.destaque) execute function public.destaque_unico();

-- ------------------------------------------------------------
-- 2. NEWSLETTER
-- ------------------------------------------------------------
create table if not exists public.newsletter (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. PLACAR DO CINE RUNNER
-- ------------------------------------------------------------
create table if not exists public.placar (
  id         uuid primary key default gen_random_uuid(),
  apelido    text not null check (char_length(apelido) between 1 and 14),
  pontos     integer not null check (pontos >= 0 and pontos <= 1000000),
  created_at timestamptz default now()
);

create index if not exists placar_pontos_idx on public.placar (pontos desc);

-- ------------------------------------------------------------
-- 4. CONTADOR DE LEITURAS
-- ------------------------------------------------------------
create or replace function public.incrementar_views(p_slug text)
returns void language sql security definer set search_path = public as $$
  update public.posts set views = views + 1
   where slug = p_slug and status = 'publicado';
$$;

-- ------------------------------------------------------------
-- 5. QUEM PODE PUBLICAR
--    Ter conta não basta: a pessoa precisa estar nesta tabela.
--    Assim, mesmo que alguém consiga criar um login, não escreve
--    nada até você colocar o nome aqui.
-- ------------------------------------------------------------
create table if not exists public.redacao (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  papel      text default 'editor' check (papel in ('editor', 'admin')),
  criado_em  timestamptz default now()
);

-- É seguro chamar isso dentro das policies: roda como dono da função,
-- então não entra em recursão com o RLS da própria tabela.
create or replace function public.na_redacao()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.redacao where user_id = auth.uid());
$$;

alter table public.redacao enable row level security;

drop policy if exists "redacao: cada um vê seu cadastro" on public.redacao;
create policy "redacao: cada um vê seu cadastro"
  on public.redacao for select to authenticated
  using (user_id = auth.uid() or public.na_redacao());

-- ------------------------------------------------------------
-- 6. SEGURANÇA (RLS)
--    Visitante só lê o que está publicado.
--    Só quem está na tabela redacao escreve.
-- ------------------------------------------------------------
alter table public.posts      enable row level security;
alter table public.newsletter enable row level security;
alter table public.placar     enable row level security;

drop policy if exists "posts: leitura pública do publicado" on public.posts;
create policy "posts: leitura pública do publicado"
  on public.posts for select
  using (status = 'publicado');

drop policy if exists "posts: redação lê tudo" on public.posts;
create policy "posts: redação lê tudo"
  on public.posts for select to authenticated
  using (public.na_redacao());

drop policy if exists "posts: redação escreve" on public.posts;
create policy "posts: redação escreve"
  on public.posts for insert to authenticated
  with check (public.na_redacao());

drop policy if exists "posts: redação edita" on public.posts;
create policy "posts: redação edita"
  on public.posts for update to authenticated
  using (public.na_redacao()) with check (public.na_redacao());

drop policy if exists "posts: redação apaga" on public.posts;
create policy "posts: redação apaga"
  on public.posts for delete to authenticated
  using (public.na_redacao());

-- Newsletter: qualquer um assina, ninguém lê a lista pelo site
drop policy if exists "newsletter: qualquer um assina" on public.newsletter;
create policy "newsletter: qualquer um assina"
  on public.newsletter for insert to anon, authenticated
  with check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

drop policy if exists "newsletter: só a redação lê" on public.newsletter;
create policy "newsletter: só a redação lê"
  on public.newsletter for select to authenticated
  using (public.na_redacao());

-- Placar: todo mundo lê e envia a própria pontuação
drop policy if exists "placar: leitura pública" on public.placar;
create policy "placar: leitura pública"
  on public.placar for select to anon, authenticated
  using (true);

drop policy if exists "placar: envio público" on public.placar;
create policy "placar: envio público"
  on public.placar for insert to anon, authenticated
  with check (pontos >= 0 and pontos <= 1000000);

-- ------------------------------------------------------------
-- 7. BUCKET DE MÍDIA (imagens enviadas pelo painel)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('midia', 'midia', true)
on conflict (id) do nothing;

drop policy if exists "midia: leitura pública" on storage.objects;
create policy "midia: leitura pública"
  on storage.objects for select
  using (bucket_id = 'midia');

drop policy if exists "midia: redação envia" on storage.objects;
create policy "midia: redação envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'midia' and public.na_redacao());

drop policy if exists "midia: redação apaga" on storage.objects;
create policy "midia: redação apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'midia' and public.na_redacao());

-- ------------------------------------------------------------
-- 8. MATÉRIA DE EXEMPLO (rode só se quiser começar com conteúdo)
-- ------------------------------------------------------------
insert into public.posts (slug, titulo, subtitulo, categoria, tags, corpo, autor, destaque, status)
values (
  'primeira-sessao',
  'Primeira sessão',
  'O site está no ar — e a tempestade já começou',
  'Ensaio',
  array['cine1up', 'estreia'],
  E'## A sala acendeu\n\nEste é o primeiro texto da CINE 1UP. Apague a luz, aumente o volume.\n\n> Cinema é a arte de mostrar o tempo passando.\n\nEdite ou apague esta matéria pelo painel em **/admin.html**.',
  'Redação CINE 1UP',
  true,
  'publicado'
)
on conflict (slug) do nothing;


-- ------------------------------------------------------------
-- 9. LIBERAR UMA PESSOA PARA PUBLICAR
--    Crie o login em Authentication → Users → Add user e depois
--    rode isto trocando o e-mail. Sem este passo, a pessoa entra
--    no painel mas não consegue salvar nada.
-- ------------------------------------------------------------
-- insert into public.redacao (user_id, nome, papel)
-- select id, 'Seu Nome', 'admin' from auth.users where email = 'voce@exemplo.com'
-- on conflict (user_id) do nothing;

-- Para ver quem tem acesso hoje:
-- select r.papel, r.nome, u.email, r.criado_em
--   from public.redacao r join auth.users u on u.id = r.user_id
--  order by r.criado_em;

-- Para tirar o acesso de alguém (o login continua existindo,
-- mas deixa de poder escrever):
-- delete from public.redacao
--  where user_id = (select id from auth.users where email = 'ex@exemplo.com');
