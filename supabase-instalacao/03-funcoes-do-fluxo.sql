-- =============================================================================
-- 03 — FUNCOES DO FLUXO DE SOLICITACOES
-- Estados: Rascunho C&R -> Aguardando preenchimento -> Aguardando validação de
-- C&R -> Concluído. "Devolvido ao gestor" volta para o Gestor; "Cancelado"
-- encerra.
-- =============================================================================

create or replace function public.progresso_do_status(p_status text)
returns integer language sql immutable as $$
  select case p_status
           when 'Rascunho C&R' then 15
           when 'Aguardando preenchimento' then 45
           when 'Devolvido ao gestor' then 45
           when 'Aguardando validação de C&R' then 75
           when 'Concluído' then 100
           else 0 end;
$$;

create or replace function public.pode_ver_solicitacao(p_request public.requests)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_gestao_user()
      or exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active
                   and (p_request.manager_id = p.id or p_request.created_by = p.id))
      or exists (select 1 from public.request_additional_approvals a
                 where a.request_id = p_request.id and a.approver_id = auth.uid());
$$;

-- Monta o objeto que a tela consome -------------------------------------------
create or replace function public.solicitacao_em_json(p_request public.requests, p_completo boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(
    to_jsonb(p_request)
    || jsonb_build_object(
      'progress', public.progresso_do_status(p_request.status),
      'manager', (select jsonb_build_object('id', m.id, 'name', m.name, 'email', m.email,
                                            'company', m.company, 'branch', m.branch,
                                            'area', m.area, 'role_title', m.role_title)
                  from public.profiles m where m.id = p_request.manager_id),
      'creator', (select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email)
                  from public.profiles c where c.id = p_request.created_by),
      'intake_selected_sections', to_jsonb(p_request.update_sections),
      'request_field_values', case when p_completo then coalesce((
          select jsonb_agg(jsonb_build_object('field_id', v.field_id, 'field_key', v.field_key,
                                              'field_value', v.field_value))
          from public.request_field_values v where v.request_id = p_request.id), '[]'::jsonb) end,
      'history', case when p_completo then coalesce((
          select jsonb_agg(jsonb_build_object('id', h.id, 'action', h.action, 'note', h.note,
                                              'actor_name', h.actor_name, 'created_at', h.created_at)
                           order by h.created_at desc)
          from public.request_history h where h.request_id = p_request.id), '[]'::jsonb) end
    ));
$$;

create or replace function public.list_visible_requests()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public.solicitacao_em_json(r, false)
  from public.requests r
  where public.pode_ver_solicitacao(r)
  order by r.updated_at desc;
$$;

create or replace function public.get_visible_request(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request_id;
  if r is null then return null; end if;
  if not public.pode_ver_solicitacao(r) then
    raise exception 'Sem permissão para abrir esta solicitação.';
  end if;
  return public.solicitacao_em_json(r, true);
end;
$$;

-- Numero da solicitacao --------------------------------------------------------
create or replace function public.proximo_numero_solicitacao()
returns text language sql volatile as $$
  select 'DC-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
$$;

create or replace function public.create_request(
  p_title text, p_company text, p_branch text, p_manager_id uuid,
  p_deadline date default null, p_job_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v record;
begin
  if not public.is_gestao_user() then
    raise exception 'Apenas C&R e ADMIN criam solicitações.';
  end if;
  select name into v from public.profiles where id = auth.uid();
  insert into public.requests (request_number, title, job_code, company, branch, manager_id,
                               created_by, deadline, status)
  values (public.proximo_numero_solicitacao(), p_title, nullif(p_job_code, ''), p_company, p_branch,
          p_manager_id, auth.uid(), p_deadline, 'Rascunho C&R')
  returning id into v_id;

  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (v_id, 'Solicitação criada', null, auth.uid(), v.name);
  return v_id;
end;
$$;

create or replace function public.cr_mark_request_kind(p_request_id uuid, p_request_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  update public.requests set request_kind = coalesce(nullif(p_request_kind, ''), 'NEW'), updated_at = now()
   where id = p_request_id;
  return true;
end;
$$;

create or replace function public.cr_set_request_update_scope(
  p_request_id uuid, p_source_job_id uuid default null, p_update_sections text[] default '{}',
  p_source_snapshot jsonb default '{}'::jsonb, p_current_values jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  update public.requests
     set source_job_id = p_source_job_id,
         update_sections = coalesce(p_update_sections, '{}'),
         source_snapshot = coalesce(p_source_snapshot, '{}'::jsonb),
         current_values = coalesce(p_current_values, '{}'::jsonb),
         request_kind = 'UPDATE',
         updated_at = now()
   where id = p_request_id;
  return true;
end;
$$;

create or replace function public.cr_set_request_job_code(p_request_id uuid, p_job_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  if length(coalesce(p_job_code, '')) > 30 then
    raise exception 'O código deve ter no máximo 30 caracteres.';
  end if;
  update public.requests set job_code = nullif(btrim(p_job_code), ''), updated_at = now()
   where id = p_request_id;
  return true;
end;
$$;

-- Gravacao dos valores dos campos ---------------------------------------------
create or replace function public.save_dynamic_values(p_request_id uuid, p_values jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.requests; item record; v_field public.form_fields;
begin
  select * into r from public.requests where id = p_request_id;
  if r is null then raise exception 'Solicitação não encontrada.'; end if;
  if not public.pode_ver_solicitacao(r) then raise exception 'Sem permissão.'; end if;
  if r.status = 'Concluído' and not public.is_admin_user() then
    raise exception 'Solicitação concluída: os campos ficam somente para consulta.';
  end if;

  for item in select key, value from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) loop
    -- a chave pode vir como field_key (padrao da tela) ou como o id do campo
    select * into v_field from public.form_fields f
     where (f.field_key = item.key or f.id::text = item.key) and f.active
     order by f.sort_order limit 1;
    if v_field.id is null then continue; end if;

    insert into public.request_field_values (request_id, field_id, field_key, field_value, updated_by)
    values (p_request_id, v_field.id, v_field.field_key, item.value, auth.uid())
    on conflict (request_id, field_id) do update
      set field_value = excluded.field_value, updated_by = excluded.updated_by, updated_at = now();
  end loop;

  update public.requests set updated_at = now() where id = p_request_id;
  return true;
end;
$$;

-- Transicoes -------------------------------------------------------------------
create or replace function public.transition_dynamic_request(
  p_request_id uuid, p_action text, p_reason text default null, p_values jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.requests; v record; v_novo text; v_acao text; v_faltando text;
begin
  select * into r from public.requests where id = p_request_id;
  if r is null then raise exception 'Solicitação não encontrada.'; end if;
  if not public.pode_ver_solicitacao(r) then raise exception 'Sem permissão.'; end if;
  select name into v from public.profiles where id = auth.uid();

  perform public.save_dynamic_values(p_request_id, p_values);

  if p_action = 'request' then
    if not public.is_gestao_user() then raise exception 'Apenas C&R atribui ao Gestor.'; end if;
    if r.manager_id is null then raise exception 'Defina o Gestor responsável antes de atribuir.'; end if;
    v_novo := 'Aguardando preenchimento'; v_acao := 'Atribuída ao Gestor';

  elsif p_action = 'sendCR' then
    if r.status not in ('Aguardando preenchimento', 'Devolvido ao gestor') then
      raise exception 'A solicitação não está com o Gestor.';
    end if;
    v_novo := 'Aguardando validação de C&R'; v_acao := 'Enviada para C&R';

  elsif p_action = 'return' then
    if not public.is_gestao_user() then raise exception 'Apenas C&R devolve ao Gestor.'; end if;
    v_novo := 'Devolvido ao gestor'; v_acao := 'Devolvida ao Gestor';
    update public.requests set return_reason = p_reason where id = p_request_id;

  elsif p_action = 'approve' then
    if not public.is_gestao_user() then raise exception 'Apenas C&R conclui a solicitação.'; end if;
    if coalesce(btrim(r.job_code), '') = '' then
      raise exception 'Informe e salve o código do cargo antes da aprovação final.';
    end if;
    select string_agg(f.label, ', ') into v_faltando
      from public.form_fields f
      left join public.request_field_values x on x.request_id = p_request_id and x.field_id = f.id
     where f.active and f.required and coalesce(btrim(x.field_value), '') = '';
    if v_faltando is not null then
      raise exception 'Preencha os campos obrigatórios antes de concluir: %', v_faltando;
    end if;
    v_novo := 'Concluído'; v_acao := 'Solicitação concluída';
    update public.requests set approved_at = now() where id = p_request_id;

  elsif p_action = 'cancel' then
    if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
    v_novo := 'Cancelado'; v_acao := 'Solicitação cancelada';
  else
    raise exception 'Ação desconhecida: %', p_action;
  end if;

  update public.requests set status = v_novo, updated_at = now() where id = p_request_id;
  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (p_request_id, v_acao, nullif(p_reason, ''), auth.uid(), v.name);
  return true;
end;
$$;

create or replace function public.cr_send_optional_manager_review(p_request_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  select name into v from public.profiles where id = auth.uid();
  update public.requests set status = 'Devolvido ao gestor', return_reason = p_reason, updated_at = now()
   where id = p_request_id;
  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (p_request_id, 'Enviada ao Gestor para conferência', p_reason, auth.uid(), v.name);
  return true;
end;
$$;

create or replace function public.cr_reject_request(p_request_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_gestao_user() then raise exception 'Apenas C&R ou ADMIN recusa.'; end if;
  select name into v from public.profiles where id = auth.uid();
  update public.requests set status = 'Cancelado', rejection_reason = p_reason, updated_at = now()
   where id = p_request_id;
  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (p_request_id, 'Solicitação recusada', p_reason, auth.uid(), v.name);
  return true;
end;
$$;

create or replace function public.admin_delete_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_admin_user() then raise exception 'Apenas o ADMIN exclui solicitações.'; end if;
  select title into v from public.requests where id = p_request_id;
  delete from public.requests where id = p_request_id;
  perform public.registrar_auditoria('requests', p_request_id::text, v.title, 'DELETE', null);
  return true;
end;
$$;
