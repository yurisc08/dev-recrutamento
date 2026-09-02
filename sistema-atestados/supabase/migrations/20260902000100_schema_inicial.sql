-- =============================================================================
-- Sistema de Controle de Atestados — schema inicial
-- =============================================================================
-- Fluxo:
--   controlador digitaliza  ->  aguardando_validacao
--   enfermaria assume       ->  em_analise
--   enfermaria valida       ->  validado  -> enfileira integracoes (RSData, ...)
--   worker integra          ->  integrado / erro_integracao
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'controlador', 'enfermaria', 'gestor', 'colaborador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.atestado_status as enum (
    'rascunho',
    'aguardando_validacao',
    'em_analise',
    'pendente_informacao',
    'validado',
    'rejeitado',
    'integrado',
    'erro_integracao'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.atestado_tipo as enum (
    'atestado_medico',
    'atestado_odontologico',
    'declaracao_comparecimento',
    'atestado_acompanhante',
    'licenca_maternidade',
    'inss'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('pendente', 'processando', 'sucesso', 'erro', 'cancelado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Estrutura organizacional
-- ---------------------------------------------------------------------------
create table if not exists public.unidades (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.setores (
  id         uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  codigo     text not null,
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (unidade_id, codigo)
);

create table if not exists public.colaboradores (
  id            uuid primary key default gen_random_uuid(),
  matricula     text not null unique,
  nome          text not null,
  cpf           text,
  email         text,
  cargo         text,
  unidade_id    uuid references public.unidades(id) on delete set null,
  setor_id      uuid references public.setores(id) on delete set null,
  data_admissao date,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_colaboradores_nome on public.colaboradores using gin (to_tsvector('portuguese', nome));
create index if not exists idx_colaboradores_setor on public.colaboradores (setor_id);

-- ---------------------------------------------------------------------------
-- Usuarios do sistema (espelho de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null default '',
  email          text,
  role           public.app_role not null default 'colaborador',
  unidade_id     uuid references public.unidades(id) on delete set null,
  setor_id       uuid references public.setores(id) on delete set null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  telefone       text,
  ativo          boolean not null default true,
  ultimo_acesso  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atestados
-- ---------------------------------------------------------------------------
create sequence if not exists public.protocolo_seq;

create table if not exists public.atestados (
  id                     uuid primary key default gen_random_uuid(),
  protocolo              text unique,
  colaborador_id         uuid not null references public.colaboradores(id) on delete restrict,
  unidade_id             uuid references public.unidades(id) on delete set null,
  setor_id               uuid references public.setores(id) on delete set null,

  tipo                   public.atestado_tipo not null default 'atestado_medico',
  status                 public.atestado_status not null default 'rascunho',

  data_emissao           date not null,
  data_inicio            date not null,
  dias                   integer not null default 1 check (dias >= 0),
  horas                  numeric(5,2) check (horas is null or horas >= 0),
  data_fim               date generated always as (
                           case when dias > 0 then data_inicio + (dias - 1) else data_inicio end
                         ) stored,

  cid                    text,
  cid_descricao          text,
  medico_nome            text,
  medico_conselho        text default 'CRM',
  medico_registro        text,
  medico_uf              text,
  instituicao            text,

  observacao_controlador text,
  parecer_enfermaria     text,
  motivo_rejeicao        text,
  restricao_funcional    text,
  afasta_inss            boolean not null default false,

  registrado_por         uuid references public.profiles(id) on delete set null,
  registrado_em          timestamptz not null default now(),
  assumido_por           uuid references public.profiles(id) on delete set null,
  assumido_em            timestamptz,
  validado_por           uuid references public.profiles(id) on delete set null,
  validado_em            timestamptz,
  integrado_em           timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_atestados_status      on public.atestados (status);
create index if not exists idx_atestados_colaborador on public.atestados (colaborador_id);
create index if not exists idx_atestados_setor       on public.atestados (setor_id);
create index if not exists idx_atestados_registrado  on public.atestados (registrado_em desc);

create table if not exists public.atestado_arquivos (
  id            uuid primary key default gen_random_uuid(),
  atestado_id   uuid not null references public.atestados(id) on delete cascade,
  storage_path  text not null,
  nome_original text not null,
  mime_type     text,
  tamanho_bytes bigint,
  tipo          text not null default 'digitalizacao',
  ocr_texto     text,
  enviado_por   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_arquivos_atestado on public.atestado_arquivos (atestado_id);

create table if not exists public.atestado_eventos (
  id          uuid primary key default gen_random_uuid(),
  atestado_id uuid not null references public.atestados(id) on delete cascade,
  tipo        text not null,
  de_status   public.atestado_status,
  para_status public.atestado_status,
  autor_id    uuid references public.profiles(id) on delete set null,
  autor_nome  text,
  descricao   text,
  dados       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_eventos_atestado on public.atestado_eventos (atestado_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integracoes (RSData e demais sistemas)
-- ---------------------------------------------------------------------------
create table if not exists public.integracao_destinos (
  id                 uuid primary key default gen_random_uuid(),
  chave              text not null unique,
  nome               text not null,
  descricao          text,
  conector           text not null default 'webhook',   -- 'rsdata' | 'webhook' | 'simulado'
  endpoint_url       text,
  metodo             text not null default 'POST',
  cabecalhos         jsonb not null default '{}'::jsonb,
  segredo_env        text,                              -- nome da var de ambiente no Worker
  mapeamento         jsonb not null default '{}'::jsonb,
  disparo_automatico boolean not null default true,
  ativo              boolean not null default true,
  max_tentativas     integer not null default 5,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.integracao_jobs (
  id               uuid primary key default gen_random_uuid(),
  atestado_id      uuid not null references public.atestados(id) on delete cascade,
  destino_id       uuid not null references public.integracao_destinos(id) on delete cascade,
  status           public.job_status not null default 'pendente',
  tentativas       integer not null default 0,
  max_tentativas   integer not null default 5,
  proxima_tentativa timestamptz not null default now(),
  payload          jsonb not null default '{}'::jsonb,
  resposta         jsonb,
  erro             text,
  referencia_externa text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (atestado_id, destino_id)
);

create index if not exists idx_jobs_pendentes on public.integracao_jobs (status, proxima_tentativa);

create table if not exists public.configuracoes (
  chave      text primary key,
  valor      jsonb not null default '{}'::jsonb,
  descricao  text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Triggers utilitarios
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['colaboradores','profiles','atestados','integracao_destinos','integracao_jobs'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- Protocolo legivel: ATT-AAAAMM-000123
create or replace function public.tg_gerar_protocolo()
returns trigger language plpgsql as $$
begin
  if new.protocolo is null then
    new.protocolo := 'ATT-' || to_char(now(), 'YYYYMM') || '-' ||
                     lpad(nextval('public.protocolo_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists gerar_protocolo on public.atestados;
create trigger gerar_protocolo before insert on public.atestados
  for each row execute function public.tg_gerar_protocolo();

-- Herda unidade/setor do colaborador quando nao informado
create or replace function public.tg_preencher_lotacao()
returns trigger language plpgsql as $$
declare c record;
begin
  select unidade_id, setor_id into c from public.colaboradores where id = new.colaborador_id;
  new.unidade_id := coalesce(new.unidade_id, c.unidade_id);
  new.setor_id   := coalesce(new.setor_id, c.setor_id);
  return new;
end $$;

drop trigger if exists preencher_lotacao on public.atestados;
create trigger preencher_lotacao before insert on public.atestados
  for each row execute function public.tg_preencher_lotacao();

-- Trilha de auditoria automatica
create or replace function public.tg_registrar_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_uid  uuid := auth.uid();
begin
  select nome into v_nome from public.profiles where id = v_uid;

  if tg_op = 'INSERT' then
    insert into public.atestado_eventos (atestado_id, tipo, para_status, autor_id, autor_nome, descricao)
    values (new.id, 'criado', new.status, v_uid, coalesce(v_nome, 'sistema'),
            'Atestado registrado no sistema');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.atestado_eventos (atestado_id, tipo, de_status, para_status, autor_id, autor_nome, descricao)
    values (new.id, 'status_alterado', old.status, new.status, v_uid, coalesce(v_nome, 'sistema'),
            format('Status alterado de %s para %s', old.status, new.status));
  end if;
  return new;
end $$;

drop trigger if exists registrar_evento_insert on public.atestados;
create trigger registrar_evento_insert after insert on public.atestados
  for each row execute function public.tg_registrar_evento();

drop trigger if exists registrar_evento_update on public.atestados;
create trigger registrar_evento_update after update on public.atestados
  for each row execute function public.tg_registrar_evento();

-- Cria profile automaticamente ao criar usuario no Auth
create or replace function public.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'colaborador')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_novo_usuario();
