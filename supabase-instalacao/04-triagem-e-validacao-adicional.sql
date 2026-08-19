-- =============================================================================
-- 04 — TRIAGEM DE PEDIDOS DO GESTOR E VALIDACAO ADICIONAL
-- =============================================================================

-- Pedido iniciado pelo Gestor --------------------------------------------------
create or replace function public.create_manager_intake_request_v2(
  p_request_type text,
  p_title text,
  p_company text default null,
  p_branch text default null,
  p_sector text default null,
  p_justification text default null,
  p_source_job_id uuid default null,
  p_update_sections text[] default '{}',
  p_manager_initial_values jsonb default '{}'::jsonb,
  p_suggested_values jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v record;
begin
  select * into v from public.profiles where id = auth.uid() and active;
  if v is null then raise exception 'Perfil não encontrado ou inativo.'; end if;

  insert into public.manager_intake_requests (
    request_type, title, company, branch, sector, justification, source_job_id,
    update_sections, manager_initial_values, suggested_values,
    manager_id, manager_name, manager_email)
  values (coalesce(p_request_type, 'NEW'), p_title, p_company, p_branch, p_sector, p_justification,
          p_source_job_id, coalesce(p_update_sections, '{}'),
          coalesce(p_manager_initial_values, '{}'::jsonb), coalesce(p_suggested_values, '{}'::jsonb),
          v.id, v.name, v.email)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_manager_intake_requests()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(i) || jsonb_build_object('requester_name', i.manager_name,
                                           'sections', to_jsonb(i.update_sections))
  from public.manager_intake_requests i
  where (public.is_gestao_user() or i.manager_id = auth.uid())
    and i.status in ('PENDENTE', 'EM_ANALISE')
  order by i.created_at desc;
$$;

create or replace function public.claim_manager_intake_request(p_intake_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_gestao_user() then raise exception 'Apenas C&R responde à triagem.'; end if;
  select name into v from public.profiles where id = auth.uid();
  update public.manager_intake_requests
     set status = 'EM_ANALISE', assigned_cr_id = auth.uid(), assigned_cr_name = v.name, updated_at = now()
   where id = p_intake_id and status = 'PENDENTE';
  if not found then raise exception 'Este pedido já está em análise com outra pessoa.'; end if;
  return true;
end;
$$;

create or replace function public.reject_manager_intake_request(p_intake_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Apenas C&R responde à triagem.'; end if;
  update public.manager_intake_requests
     set status = 'RECUSADA', rejection_reason = p_reason, updated_at = now()
   where id = p_intake_id;
  return true;
end;
$$;

create or replace function public.convert_manager_intake_to_request(p_intake_id uuid, p_deadline date)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.manager_intake_requests; v_id uuid; v record;
begin
  if not public.is_gestao_user() then raise exception 'Apenas C&R converte pedidos.'; end if;
  select * into i from public.manager_intake_requests where id = p_intake_id;
  if i is null then raise exception 'Pedido não encontrado.'; end if;
  if i.request_id is not null then raise exception 'Este pedido já virou solicitação.'; end if;
  select name into v from public.profiles where id = auth.uid();

  insert into public.requests (request_number, title, company, branch, sector, justification,
                               manager_id, created_by, deadline, status, request_kind,
                               source_job_id, source_snapshot, update_sections,
                               intake_manager_values, intake_suggested_values)
  values (public.proximo_numero_solicitacao(), i.title, i.company, i.branch, i.sector, i.justification,
          i.manager_id, auth.uid(), p_deadline, 'Rascunho C&R', i.request_type,
          i.source_job_id, i.source_snapshot, i.update_sections,
          i.manager_initial_values, i.suggested_values)
  returning id into v_id;

  update public.manager_intake_requests
     set status = 'CONVERTIDA', request_id = v_id, updated_at = now()
   where id = p_intake_id;

  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (v_id, 'Criada a partir do pedido do Gestor', i.manager_name, auth.uid(), v.name);
  return v_id;
end;
$$;

create or replace function public.get_request_intake_metadata(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'requester_name', i.manager_name,
           'request_type', i.request_type,
           'justification', i.justification,
           'update_sections', to_jsonb(i.update_sections),
           'suggested_values', i.suggested_values,
           'manager_initial_values', i.manager_initial_values,
           'source_snapshot', i.source_snapshot,
           'created_at', i.created_at)
  from public.manager_intake_requests i
  where i.request_id = p_request_id
  order by i.created_at desc
  limit 1;
$$;

-- Validacao adicional ----------------------------------------------------------
create or replace function public.set_request_additional_approval_plan(
  p_request_id uuid, p_area_id uuid default null, p_approver_id uuid default null, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  if p_approver_id is null then return true; end if;
  insert into public.request_additional_approvals (request_id, area_id, approver_id, note, status)
  values (p_request_id, p_area_id, p_approver_id, p_note, 'PLANNED');
  return true;
end;
$$;

create or replace function public.assign_request_additional_approval(
  p_request_id uuid, p_area_id uuid, p_approver_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  select name into v from public.profiles where id = auth.uid();
  update public.request_additional_approvals set status = 'CLOSED', updated_at = now()
   where request_id = p_request_id and status in ('PLANNED', 'PENDING');
  insert into public.request_additional_approvals (request_id, area_id, approver_id, note, status)
  values (p_request_id, p_area_id, p_approver_id, p_note, 'PENDING');
  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (p_request_id, 'Enviada para validação adicional', p_note, auth.uid(), v.name);
  return true;
end;
$$;

create or replace function public.respond_request_additional_approval(
  p_request_id uuid, p_status text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select name into v from public.profiles where id = auth.uid();
  update public.request_additional_approvals
     set status = case when p_status = 'APPROVED' then 'APPROVED' else 'REJECTED' end,
         response_note = p_note, updated_at = now()
   where request_id = p_request_id and approver_id = auth.uid() and status = 'PENDING';
  if not found then raise exception 'Não há validação adicional pendente para você nesta solicitação.'; end if;
  insert into public.request_history (request_id, action, note, actor_id, actor_name)
  values (p_request_id,
          case when p_status = 'APPROVED' then 'Validação adicional aprovada' else 'Validação adicional não aprovada' end,
          p_note, auth.uid(), v.name);
  return true;
end;
$$;

create or replace function public.close_request_additional_approval(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestao_user() then raise exception 'Sem permissão.'; end if;
  update public.request_additional_approvals set status = 'CLOSED', updated_at = now()
   where request_id = p_request_id and status in ('PLANNED', 'PENDING', 'APPROVED', 'REJECTED');
  return true;
end;
$$;

create or replace function public.get_request_additional_approval(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', a.id, 'status', a.status, 'note', a.note, 'response_note', a.response_note,
           'area_id', a.area_id, 'area_name', ar.name,
           'approver_id', a.approver_id, 'approver_name', p.name, 'approver_email', p.email,
           'created_at', a.created_at)
  from public.request_additional_approvals a
  left join public.approval_areas ar on ar.id = a.area_id
  left join public.profiles p on p.id = a.approver_id
  where a.request_id = p_request_id and a.status <> 'CLOSED'
  order by a.created_at desc
  limit 1;
$$;
