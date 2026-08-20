-- ============================================================================
-- DataHub - Schema completo (PostgreSQL / Supabase)
-- Execute este arquivo no SQL Editor do Supabase (roda de ponta a ponta).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum (
    'analista_dados', 'cientista_dados', 'engenheiro_dados',
    'analista_bi', 'produto', 'gestor'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. PROFILES
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (char_length(username) between 3 and 30),
  full_name    text not null check (char_length(full_name) between 2 and 80),
  avatar_url   text,
  role         user_role not null default 'analista_dados',
  team         text,
  bio          text check (char_length(bio) <= 280),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. CATEGORIAS
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  description  text,
  icon         text not null default 'MessageSquare',
  color        text not null default 'blue',
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. TÓPICOS (THREADS)
-- ---------------------------------------------------------------------------
create table if not exists public.threads (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.categories(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 5 and 160),
  content       text not null check (char_length(content) between 10 and 20000),
  tags          text[] not null default '{}',
  is_pinned     boolean not null default false,
  is_locked     boolean not null default false,
  view_count    int not null default 0,
  reply_count   int not null default 0,
  score         int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists threads_category_idx  on public.threads(category_id);
create index if not exists threads_author_idx    on public.threads(author_id);
create index if not exists threads_activity_idx  on public.threads(last_activity_at desc);
create index if not exists threads_tags_idx      on public.threads using gin(tags);
create index if not exists threads_search_idx    on public.threads
  using gin(to_tsvector('portuguese', title || ' ' || content));

-- ---------------------------------------------------------------------------
-- 5. RESPOSTAS
-- ---------------------------------------------------------------------------
create table if not exists public.replies (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.threads(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  parent_id    uuid references public.replies(id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 20000),
  is_solution  boolean not null default false,
  score        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists replies_thread_idx on public.replies(thread_id, created_at);
create index if not exists replies_author_idx on public.replies(author_id);

-- ---------------------------------------------------------------------------
-- 6. VOTOS
-- ---------------------------------------------------------------------------
create table if not exists public.thread_votes (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  value     smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.reply_votes (
  reply_id  uuid not null references public.replies(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  value     smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 7. CHAT
-- ---------------------------------------------------------------------------
create table if not exists public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_idx on public.chat_messages(channel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. NOTIFICAÇÕES
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  type        text not null,
  thread_id   uuid references public.threads(id) on delete cascade,
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- ============================================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================================

-- Cria o profile automaticamente ao cadastrar um usuário no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
  );
  if char_length(base_username) < 3 then
    base_username := base_username || '_user';
  end if;

  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, full_name, role, team)
  values (
    new.id,
    final_username,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), final_username),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'analista_dados'),
    nullif(new.raw_user_meta_data->>'team', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists threads_touch on public.threads;
create trigger threads_touch before update on public.threads
  for each row execute function public.touch_updated_at();

drop trigger if exists replies_touch on public.replies;
create trigger replies_touch before update on public.replies
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Contador de respostas + última atividade
create or replace function public.sync_reply_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.threads
       set reply_count = reply_count + 1,
           last_activity_at = now()
     where id = new.thread_id;
  elsif TG_OP = 'DELETE' then
    update public.threads
       set reply_count = greatest(reply_count - 1, 0)
     where id = old.thread_id;
  end if;
  return null;
end;
$$;

drop trigger if exists replies_count_sync on public.replies;
create trigger replies_count_sync
  after insert or delete on public.replies
  for each row execute function public.sync_reply_count();

-- Score dos tópicos
create or replace function public.sync_thread_score()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.thread_id, old.thread_id);
begin
  update public.threads t
     set score = coalesce((select sum(value) from public.thread_votes where thread_id = target), 0)
   where t.id = target;
  return null;
end;
$$;

drop trigger if exists thread_votes_sync on public.thread_votes;
create trigger thread_votes_sync
  after insert or update or delete on public.thread_votes
  for each row execute function public.sync_thread_score();

-- Score das respostas
create or replace function public.sync_reply_score()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.reply_id, old.reply_id);
begin
  update public.replies r
     set score = coalesce((select sum(value) from public.reply_votes where reply_id = target), 0)
   where r.id = target;
  return null;
end;
$$;

drop trigger if exists reply_votes_sync on public.reply_votes;
create trigger reply_votes_sync
  after insert or update or delete on public.reply_votes
  for each row execute function public.sync_reply_score();

-- Notifica o autor do tópico quando alguém responde
create or replace function public.notify_thread_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  t_title text;
  actor_name text;
begin
  select author_id, title into owner, t_title from public.threads where id = new.thread_id;
  if owner is null or owner = new.author_id then
    return null;
  end if;
  select full_name into actor_name from public.profiles where id = new.author_id;
  insert into public.notifications (user_id, actor_id, type, thread_id, message)
  values (owner, new.author_id, 'reply', new.thread_id,
          coalesce(actor_name, 'Alguém') || ' respondeu em "' || t_title || '"');
  return null;
end;
$$;

drop trigger if exists replies_notify on public.replies;
create trigger replies_notify
  after insert on public.replies
  for each row execute function public.notify_thread_author();

-- Incremento de visualizações (RPC chamado pelo front)
create or replace function public.increment_thread_views(thread_uuid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.threads set view_count = view_count + 1 where id = thread_uuid;
end;
$$;

-- Estatísticas para a home
create or replace function public.forum_stats()
returns table (total_threads bigint, total_replies bigint, total_members bigint, threads_today bigint)
language sql stable as $$
  select
    (select count(*) from public.threads),
    (select count(*) from public.replies),
    (select count(*) from public.profiles),
    (select count(*) from public.threads where created_at > now() - interval '24 hours');
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.threads        enable row level security;
alter table public.replies        enable row level security;
alter table public.thread_votes   enable row level security;
alter table public.reply_votes    enable row level security;
alter table public.chat_channels  enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.notifications  enable row level security;

-- PROFILES: todos os autenticados leem, cada um edita o seu
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- CATEGORIES / CHANNELS: leitura para autenticados
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select to authenticated using (true);

drop policy if exists "channels_select" on public.chat_channels;
create policy "channels_select" on public.chat_channels
  for select to authenticated using (true);

-- THREADS
drop policy if exists "threads_select" on public.threads;
create policy "threads_select" on public.threads
  for select to authenticated using (true);

drop policy if exists "threads_insert" on public.threads;
create policy "threads_insert" on public.threads
  for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "threads_update_own" on public.threads;
create policy "threads_update_own" on public.threads
  for update to authenticated
  using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "threads_delete_own" on public.threads;
create policy "threads_delete_own" on public.threads
  for delete to authenticated
  using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- REPLIES
drop policy if exists "replies_select" on public.replies;
create policy "replies_select" on public.replies
  for select to authenticated using (true);

drop policy if exists "replies_insert" on public.replies;
create policy "replies_insert" on public.replies
  for insert to authenticated with check (
    auth.uid() = author_id
    and not exists (select 1 from public.threads t where t.id = thread_id and t.is_locked)
  );

drop policy if exists "replies_update_own" on public.replies;
create policy "replies_update_own" on public.replies
  for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "replies_delete_own" on public.replies;
create policy "replies_delete_own" on public.replies
  for delete to authenticated
  using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- VOTOS
drop policy if exists "thread_votes_select" on public.thread_votes;
create policy "thread_votes_select" on public.thread_votes
  for select to authenticated using (true);

drop policy if exists "thread_votes_write" on public.thread_votes;
create policy "thread_votes_write" on public.thread_votes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reply_votes_select" on public.reply_votes;
create policy "reply_votes_select" on public.reply_votes
  for select to authenticated using (true);

drop policy if exists "reply_votes_write" on public.reply_votes;
create policy "reply_votes_write" on public.reply_votes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CHAT
drop policy if exists "chat_select" on public.chat_messages;
create policy "chat_select" on public.chat_messages
  for select to authenticated using (true);

drop policy if exists "chat_insert" on public.chat_messages;
create policy "chat_insert" on public.chat_messages
  for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "chat_delete_own" on public.chat_messages;
create policy "chat_delete_own" on public.chat_messages
  for delete to authenticated using (auth.uid() = author_id);

-- NOTIFICAÇÕES
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- REALTIME
-- ============================================================================
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.replies;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- SEED
-- ============================================================================
insert into public.categories (slug, name, description, icon, color, position) values
  ('anuncios',      'Anúncios',               'Comunicados oficiais da área de dados',                    'Megaphone',   'amber',   1),
  ('projetos',      'Projetos & Roadmap',     'Atualizações de projetos, entregas e prioridades',         'GitBranch',   'blue',    2),
  ('analises',      'Análises & Insights',    'Descobertas, estudos e leituras de dados',                 'BarChart3',   'violet',  3),
  ('sql-modelagem', 'SQL & Modelagem',        'Queries, performance, modelagem dimensional e dbt',        'Database',    'emerald', 4),
  ('ml-ia',         'Machine Learning & IA',  'Modelos, experimentos, MLOps e IA generativa',             'Brain',       'rose',    5),
  ('bi-dataviz',    'BI & Data Viz',          'Dashboards, autoatendimento e boas práticas de visualização', 'PieChart', 'cyan',    6),
  ('governanca',    'Governança & Qualidade', 'Qualidade de dados, catálogo, LGPD e documentação',        'ShieldCheck', 'slate',   7),
  ('duvidas',       'Dúvidas & Ajuda',        'Perguntas pontuais do time no dia a dia',                  'HelpCircle',  'orange',  8)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  color       = excluded.color,
  position    = excluded.position;

insert into public.chat_channels (slug, name, description, position) values
  ('geral',     'geral',     'Comunicação geral do time de dados',                1),
  ('duvidas',   'duvidas',   'Perguntas rápidas que não exigem um tópico',        2),
  ('deploys',   'deploys',   'Avisos de pipeline, carga e publicação',            3),
  ('aleatorio', 'aleatorio', 'Assuntos diversos fora da pauta de trabalho',       4)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  position    = excluded.position;
