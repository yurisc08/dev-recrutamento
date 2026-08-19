-- =============================================================================
-- 11 — NOTIFICACOES POR ETAPA VIA POWER AUTOMATE
--
-- Cada passo do fluxo (criada, atribuida ao Gestor, devolvida, enviada para
-- C&R, validacao adicional, concluida, recusada, cancelada) grava uma linha em
-- public.request_history. Este arquivo pendura um gatilho nessa tabela: a cada
-- linha nova, o banco monta o aviso e faz um POST no fluxo do Power Automate.
--
-- Por que no banco e nao na tela: a chamada que existe hoje no navegador
-- (notify-workflow) so acontece no botao de transicao. Criacao, triagem do
-- Gestor, validacao adicional, recusa e conferencia opcional passam por outros
-- caminhos e nao avisariam ninguem. No gatilho, nenhuma etapa escapa.
--
-- O envio e assincrono (pg_net): o fluxo do portal nunca fica esperando o Power
-- Automate, e uma falha la nao derruba a solicitacao aqui.
--
-- Execute depois dos arquivos 01 a 07.
-- =============================================================================

create extension if not exists pg_net;

-- 1. Onde fica o endereco do fluxo ---------------------------------------------
create table if not exists public.notificacao_config (
  id boolean primary key default true check (id),
  webhook_url text,
  segredo text,
  portal_url text not null default 'https://portal.marcopolo.com.br',
  ativo boolean not null default false,
  acoes_ignoradas text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.notificacao_config (id) values (true) on conflict (id) do nothing;

-- Registro do que foi enviado, para conferir depois.
create table if not exists public.notificacao_envio (
  id bigserial primary key,
  history_id bigint,
  request_id uuid,
  evento text,
  destinatarios text,
  net_request_id bigint,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists notificacao_envio_req_idx
  on public.notificacao_envio (request_id, created_at desc);

-- 2. Quem deve receber cada etapa ----------------------------------------------
create or replace function public.destinatarios_do_aviso(p_request public.requests, p_acao text)
returns jsonb language sql stable security definer set search_path = public as $$
  with alvo as (
    -- Validacao adicional: quem recebe e o aprovador pendente.
    select p.id, p.name, p.email, p.role
      from public.request_additional_approvals a
      join public.profiles p on p.id = a.approver_id
     where p_acao ilike '%validação adicional%'
       and a.request_id = p_request.id and a.status = 'PENDING'

    union
    -- Etapas que ficam com o Gestor.
    select p.id, p.name, p.email, p.role
      from public.profiles p
     where p_acao not ilike '%validação adicional%'
       and p_request.status in ('Aguardando preenchimento', 'Devolvido ao gestor')
       and p.id = p_request.manager_id

    union
    -- Etapas que voltam para C&R: quem abriu a solicitacao e o time de C&R.
    select p.id, p.name, p.email, p.role
      from public.profiles p
     where p_acao not ilike '%validação adicional%'
       and p_request.status = 'Aguardando validação de C&R'
       and p.active
       and (p.id = p_request.created_by or p.role = 'CR')

    union
    -- Encerramentos: avisa os dois lados.
    select p.id, p.name, p.email, p.role
      from public.profiles p
     where p_acao not ilike '%validação adicional%'
       and p_request.status in ('Concluído', 'Cancelado')
       and p.id in (p_request.manager_id, p_request.created_by)
  )
  select coalesce(
    jsonb_agg(distinct jsonb_build_object('nome', name, 'email', email, 'perfil', role)),
    '[]'::jsonb)
  from alvo
  where coalesce(btrim(email), '') <> '';
$$;

-- 3. O aviso completo, do jeito que o Power Automate recebe ---------------------
create or replace function public.aviso_de_etapa(p_history_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'evento', h.action,
    'etapa', r.status,
    'quando', h.created_at,
    'observacao', coalesce(h.note, ''),
    'autor', jsonb_build_object('nome', coalesce(h.actor_name, 'Sistema'),
                                'email', coalesce(a.email, ''),
                                'perfil', coalesce(a.role, '')),
    'destinatarios', public.destinatarios_do_aviso(r, h.action),
    'solicitacao', jsonb_build_object(
      'id', r.id,
      'numero', r.request_number,
      'titulo', r.title,
      'codigo_cargo', coalesce(r.job_code, ''),
      'tipo', coalesce(r.request_kind, 'NEW'),
      'empresa', coalesce(r.company, ''),
      'filial', coalesce(r.branch, ''),
      'setor', coalesce(r.sector, ''),
      'justificativa', coalesce(r.justification, ''),
      'prazo', r.deadline,
      'status', r.status,
      'progresso', public.progresso_do_status(r.status),
      'criada_em', r.created_at,
      'atualizada_em', r.updated_at,
      'gestor', jsonb_build_object('nome', coalesce(m.name, ''), 'email', coalesce(m.email, '')),
      'criador', jsonb_build_object('nome', coalesce(c.name, ''), 'email', coalesce(c.email, ''))
    ),
    'portal', (select portal_url from public.notificacao_config where id)
  )
  from public.request_history h
  join public.requests r on r.id = h.request_id
  left join public.profiles a on a.id = h.actor_id
  left join public.profiles m on m.id = r.manager_id
  left join public.profiles c on c.id = r.created_by
  where h.id = p_history_id;
$$;

-- 4. O gatilho -----------------------------------------------------------------
create or replace function public.notificar_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg public.notificacao_config; aviso jsonb; v_req bigint;
begin
  select * into cfg from public.notificacao_config where id;
  if cfg is null or not cfg.ativo or coalesce(btrim(cfg.webhook_url), '') = '' then
    return new;
  end if;
  if new.action = any (cfg.acoes_ignoradas) then
    return new;
  end if;

  aviso := public.aviso_de_etapa(new.id);
  -- Sem ninguem para avisar, nao adianta chamar o fluxo.
  if jsonb_array_length(coalesce(aviso->'destinatarios', '[]'::jsonb)) = 0 then
    insert into public.notificacao_envio (history_id, request_id, evento, destinatarios, erro)
    values (new.id, new.request_id, new.action, '', 'sem destinatário para esta etapa');
    return new;
  end if;

  select net.http_post(
           url := cfg.webhook_url,
           body := aviso,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-portal-segredo', coalesce(cfg.segredo, '')),
           timeout_milliseconds := 8000)
    into v_req;

  insert into public.notificacao_envio (history_id, request_id, evento, destinatarios, net_request_id)
  values (new.id, new.request_id, new.action,
          (select string_agg(d->>'email', ', ') from jsonb_array_elements(aviso->'destinatarios') d),
          v_req);
  return new;
exception when others then
  -- Aviso e complementar: se falhar, a etapa ja foi gravada e o fluxo continua.
  insert into public.notificacao_envio (history_id, request_id, evento, erro)
  values (new.id, new.request_id, new.action, left(sqlerrm, 400));
  return new;
end;
$$;

drop trigger if exists ao_registrar_etapa on public.request_history;
create trigger ao_registrar_etapa
  after insert on public.request_history
  for each row execute function public.notificar_etapa();

-- 4b. Pedido aberto pelo Gestor (triagem) --------------------------------------
-- Esse pedido ainda nao e uma solicitacao: fica na caixa de triagem do C&R e nao
-- passa por request_history. Sem este gatilho, ninguem seria avisado ate alguem
-- abrir o portal e reparar no pedido.
create or replace function public.notificar_triagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg public.notificacao_config; aviso jsonb; v_req bigint; destinos jsonb;
begin
  select * into cfg from public.notificacao_config where id;
  if cfg is null or not cfg.ativo or coalesce(btrim(cfg.webhook_url), '') = '' then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nome', p.name, 'email', p.email, 'perfil', p.role)), '[]'::jsonb)
    into destinos
    from public.profiles p
   where p.active and p.role = 'CR' and coalesce(btrim(p.email), '') <> '';

  if jsonb_array_length(destinos) = 0 then
    insert into public.notificacao_envio (request_id, evento, erro)
    values (null, 'Pedido do Gestor', 'nenhum C&R ativo para avisar');
    return new;
  end if;

  aviso := jsonb_build_object(
    'evento', 'Pedido aberto pelo Gestor',
    'etapa', 'Aguardando triagem de C&R',
    'quando', new.created_at,
    'observacao', coalesce(new.justification, ''),
    'autor', jsonb_build_object('nome', coalesce(new.manager_name, ''),
                                'email', coalesce(new.manager_email, ''), 'perfil', 'GESTOR'),
    'destinatarios', destinos,
    'solicitacao', jsonb_build_object(
      'id', new.id, 'numero', '', 'titulo', new.title,
      'codigo_cargo', '', 'tipo', coalesce(new.request_type, 'NEW'),
      'empresa', coalesce(new.company, ''), 'filial', coalesce(new.branch, ''),
      'setor', coalesce(new.sector, ''), 'justificativa', coalesce(new.justification, ''),
      'prazo', null, 'status', 'Aguardando triagem de C&R', 'progresso', 10,
      'criada_em', new.created_at, 'atualizada_em', new.created_at,
      'gestor', jsonb_build_object('nome', coalesce(new.manager_name, ''),
                                   'email', coalesce(new.manager_email, '')),
      'criador', jsonb_build_object('nome', coalesce(new.manager_name, ''),
                                    'email', coalesce(new.manager_email, ''))),
    'portal', cfg.portal_url);

  select net.http_post(
           url := cfg.webhook_url, body := aviso,
           headers := jsonb_build_object('Content-Type', 'application/json',
                                         'x-portal-segredo', coalesce(cfg.segredo, '')),
           timeout_milliseconds := 8000)
    into v_req;

  insert into public.notificacao_envio (request_id, evento, destinatarios, net_request_id)
  values (null, 'Pedido aberto pelo Gestor',
          (select string_agg(d->>'email', ', ') from jsonb_array_elements(destinos) d), v_req);
  return new;
exception when others then
  insert into public.notificacao_envio (request_id, evento, erro)
  values (null, 'Pedido aberto pelo Gestor', left(sqlerrm, 400));
  return new;
end;
$$;

drop trigger if exists ao_registrar_pedido_do_gestor on public.manager_intake_requests;
create trigger ao_registrar_pedido_do_gestor
  after insert on public.manager_intake_requests
  for each row execute function public.notificar_triagem();

-- 5. Configuracao e teste pelo ADMIN -------------------------------------------
create or replace function public.admin_configurar_notificacao(
  p_webhook_url text, p_segredo text default null,
  p_portal_url text default null, p_ativo boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Apenas o ADMIN configura as notificações.'; end if;
  update public.notificacao_config
     set webhook_url = p_webhook_url,
         segredo     = coalesce(p_segredo, segredo),
         portal_url  = coalesce(p_portal_url, portal_url),
         ativo       = p_ativo,
         updated_at  = now()
   where id;
  return jsonb_build_object('ativo', p_ativo, 'webhook_configurado', coalesce(btrim(p_webhook_url), '') <> '');
end;
$$;

create or replace function public.admin_testar_notificacao()
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg public.notificacao_config; v_req bigint; corpo jsonb;
begin
  if not public.is_admin_user() then raise exception 'Apenas o ADMIN testa as notificações.'; end if;
  select * into cfg from public.notificacao_config where id;
  if coalesce(btrim(cfg.webhook_url), '') = '' then
    raise exception 'Configure o endereço do fluxo antes de testar.';
  end if;
  corpo := jsonb_build_object(
    'evento', 'Teste de integração',
    'etapa', 'Aguardando preenchimento',
    'quando', now(),
    'observacao', 'Disparo manual feito pelo ADMIN para conferir o fluxo.',
    'autor', jsonb_build_object('nome', 'Portal', 'email', '', 'perfil', 'ADMIN'),
    'destinatarios', jsonb_build_array(
      jsonb_build_object('nome', p.name, 'email', p.email, 'perfil', p.role)),
    'solicitacao', jsonb_build_object(
      'id', gen_random_uuid(), 'numero', 'DC-0000-TESTE', 'titulo', 'Cargo de teste',
      'codigo_cargo', 'TESTE', 'tipo', 'NEW', 'empresa', 'Marcopolo', 'filial', '-',
      'setor', 'Teste', 'justificativa', 'Teste de integração', 'prazo', current_date,
      'status', 'Aguardando preenchimento', 'progresso', 50,
      'criada_em', now(), 'atualizada_em', now(),
      'gestor', jsonb_build_object('nome', p.name, 'email', p.email),
      'criador', jsonb_build_object('nome', p.name, 'email', p.email)),
    'portal', cfg.portal_url)
  from public.profiles p where p.id = auth.uid();

  select net.http_post(
           url := cfg.webhook_url, body := corpo,
           headers := jsonb_build_object('Content-Type', 'application/json',
                                         'x-portal-segredo', coalesce(cfg.segredo, '')),
           timeout_milliseconds := 8000)
    into v_req;

  insert into public.notificacao_envio (evento, destinatarios, net_request_id)
  values ('Teste de integração', (select email from public.profiles where id = auth.uid()), v_req);
  return jsonb_build_object('enviado', true, 'net_request_id', v_req);
end;
$$;

-- 6. Permissoes -----------------------------------------------------------------
alter table public.notificacao_config enable row level security;
alter table public.notificacao_envio enable row level security;

drop policy if exists notificacao_config_admin on public.notificacao_config;
create policy notificacao_config_admin on public.notificacao_config
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists notificacao_envio_gestao on public.notificacao_envio;
create policy notificacao_envio_gestao on public.notificacao_envio
  for select to authenticated using (public.is_gestao_user());

revoke all on function public.admin_configurar_notificacao(text, text, text, boolean) from public;
revoke all on function public.admin_testar_notificacao() from public;
grant execute on function public.admin_configurar_notificacao(text, text, text, boolean) to authenticated;
grant execute on function public.admin_testar_notificacao() to authenticated;
grant execute on function public.aviso_de_etapa(bigint) to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- COMO LIGAR
--
-- 1. No Power Automate, crie um fluxo com o gatilho
--    "Quando uma solicitação HTTP for recebida" e copie a URL gerada.
-- 2. Aqui no SQL Editor:
--
--      select public.admin_configurar_notificacao(
--        'https://prod-00.westeurope.logic.azure.com:443/workflows/...',
--        'um-segredo-qualquer',
--        'https://o-endereco-do-seu-portal',
--        true);
--
-- 3. Dispare um teste e confira se o fluxo rodou:
--
--      select public.admin_testar_notificacao();
--
-- 4. Para acompanhar os envios:
--
--      select e.created_at, e.evento, e.destinatarios, e.erro,
--             r.status_code, left(r.content, 200) as resposta
--        from public.notificacao_envio e
--        left join net._http_response r on r.id = e.net_request_id
--       order by e.created_at desc limit 20;
--
-- Para desligar sem apagar nada:
--
--      update public.notificacao_config set ativo = false;
-- =============================================================================
