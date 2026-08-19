-- =============================================================================
-- 01 — ESQUEMA E TABELAS
-- Fluxo de Descritivos de Cargos — instalacao em projeto Supabase NOVO.
--
-- Todos os comandos usam "if not exists": rodar de novo nao apaga nada.
-- Execute os arquivos na ordem 01, 02, 03, 04, 05.
-- =============================================================================

create extension if not exists pgcrypto;

-- Perfis: espelham auth.users e definem o papel de cada pessoa -----------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'GESTOR' check (role in ('ADMIN','CR','GESTOR','APROVADOR')),
  company text,
  branch text,
  area text,
  role_title text,
  approval_area_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Empresas e filiais ----------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

-- Areas aprovadoras e fluxos --------------------------------------------------
create table if not exists public.approval_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_templates(id) on delete cascade,
  step_name text not null,
  responsible_type text not null default 'CR' check (responsible_type in ('CR','GESTOR','AREA')),
  approval_area_id uuid references public.approval_areas(id) on delete set null,
  action_type text not null default 'FILL' check (action_type in ('FILL','REVIEW','APPROVE','OPINION')),
  sort_order integer not null default 10,
  created_at timestamptz not null default now()
);

-- Campos do formulario --------------------------------------------------------
create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  field_key text not null,
  label text not null,
  field_type text not null default 'textarea'
    check (field_type in ('text','textarea','number','date','select','checkbox')),
  owner_role text not null default 'CR' check (owner_role in ('CR','GESTOR')),
  approval_area_id uuid references public.approval_areas(id) on delete set null,
  help_text text,
  placeholder text,
  options text[] not null default '{}',
  required boolean not null default false,
  update_editable boolean not null default false,
  is_system boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists form_fields_key_ativo_idx
  on public.form_fields (field_key) where active;

-- Solicitacoes ----------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique,
  title text not null,
  job_code text,
  company text,
  branch text,
  sector text,
  justification text,
  manager_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  status text not null default 'Rascunho C&R',
  request_kind text default 'NEW' check (request_kind in ('NEW','UPDATE')),
  source_job_id uuid,
  source_snapshot jsonb not null default '{}'::jsonb,
  current_values jsonb not null default '{}'::jsonb,
  update_sections text[] not null default '{}',
  intake_manager_values jsonb not null default '{}'::jsonb,
  intake_suggested_values jsonb not null default '{}'::jsonb,
  deadline date,
  return_reason text,
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_manager_idx on public.requests (manager_id);

create table if not exists public.request_field_values (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  field_id uuid not null references public.form_fields(id) on delete cascade,
  field_key text,
  field_value text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (request_id, field_id)
);

create table if not exists public.request_history (
  id bigserial primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  action text not null,
  note text,
  actor_id uuid references public.profiles(id),
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists request_history_req_idx on public.request_history (request_id, created_at desc);

-- Solicitacoes iniciadas pelo Gestor (triagem) --------------------------------
create table if not exists public.manager_intake_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'NEW' check (request_type in ('NEW','UPDATE')),
  title text not null,
  company text,
  branch text,
  sector text,
  justification text,
  source_job_id uuid,
  source_snapshot jsonb not null default '{}'::jsonb,
  update_sections text[] not null default '{}',
  manager_initial_values jsonb not null default '{}'::jsonb,
  suggested_values jsonb not null default '{}'::jsonb,
  manager_id uuid references public.profiles(id),
  manager_name text,
  manager_email text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','EM_ANALISE','CONVERTIDA','RECUSADA')),
  assigned_cr_id uuid references public.profiles(id),
  assigned_cr_name text,
  rejection_reason text,
  request_id uuid references public.requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Validacao adicional ---------------------------------------------------------
create table if not exists public.request_additional_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  area_id uuid references public.approval_areas(id) on delete set null,
  approver_id uuid references public.profiles(id) on delete set null,
  note text,
  response_note text,
  status text not null default 'PLANNED' check (status in ('PLANNED','PENDING','APPROVED','REJECTED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raa_request_idx on public.request_additional_approvals (request_id, created_at desc);

-- Documento -------------------------------------------------------------------
create table if not exists public.document_field_mappings (
  id uuid primary key default gen_random_uuid(),
  marker text not null unique,
  source_type text not null default 'fixed' check (source_type in ('fixed','field')),
  source_value text,
  fallback_text text default 'Não informado',
  sort_order integer not null default 100,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Registros de acesso e de alteracao ------------------------------------------
create table if not exists public.access_logs (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  user_email text,
  user_role text,
  event_type text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  entity_name text not null,
  record_id text,
  record_label text,
  action text not null,
  changed_fields text[],
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists access_logs_created_idx on public.access_logs (created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- Base geral de cargos ---------------------------------------------------------
-- Criada aqui porque os scripts da base (06 e 07) apenas complementam colunas e
-- funcoes: em um projeto novo a tabela precisa existir antes.
create table if not exists public.job_catalog (
  id uuid primary key default gen_random_uuid(),
  job_code text,
  job_name text,
  full_name text,
  company text,
  company_code text,
  cbo text,
  nature text,
  career_track text,
  level text,
  family_code text,
  grouping_key text,
  expected_result text,
  job_description text,
  activities text,
  requirements jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  source text not null default 'IMPORT',
  import_run_id uuid,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  manual_updated_at timestamptz,
  manual_updated_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists job_catalog_codigo_idx on public.job_catalog (job_code);
create index if not exists job_catalog_empresa_idx on public.job_catalog (company_code);
create index if not exists job_catalog_ativo_idx on public.job_catalog (active);

-- Area de carga da importacao antiga. O script 06 termina com um diagnostico que
-- conta as linhas dela; em projeto novo a tabela nasce vazia.
create table if not exists public.job_catalog_import (
  id bigserial primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
