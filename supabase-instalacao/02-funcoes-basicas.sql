-- =============================================================================
-- 02 — FUNCOES DE APOIO, PERFIS, LOGS E CAMPOS
-- =============================================================================

-- Papel de quem esta usando ----------------------------------------------------
create or replace function public.perfil_atual()
returns public.profiles language sql stable security definer set search_path = public as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_admin_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active and p.role = 'ADMIN');
$$;

create or replace function public.is_gestao_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active and p.role in ('ADMIN','CR'));
$$;

-- Registro de auditoria (usado pelas demais funcoes) ---------------------------
create or replace function public.registrar_auditoria(
  p_entity text, p_record_id text, p_label text, p_action text, p_fields text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select name, email into v from public.profiles where id = auth.uid();
  insert into public.audit_logs (entity_name, record_id, record_label, action, changed_fields,
                                 actor_id, actor_name, actor_email)
  values (p_entity, p_record_id, p_label, p_action, p_fields, auth.uid(), v.name, v.email);
end;
$$;

-- Acessos ---------------------------------------------------------------------
create or replace function public.register_access_log(p_event_type text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if auth.uid() is null then return; end if;
  select name, email, role into v from public.profiles where id = auth.uid();
  insert into public.access_logs (user_id, user_name, user_email, user_role, event_type, user_agent)
  values (auth.uid(), v.name, v.email, v.role, p_event_type, p_user_agent);
end;
$$;

create or replace function public.list_access_logs(p_limit integer default 500)
returns setof public.access_logs language sql stable security definer set search_path = public as $$
  select * from public.access_logs
  where public.is_admin_user()
  order by created_at desc
  limit greatest(coalesce(p_limit, 500), 1);
$$;

create or replace function public.list_audit_logs(p_limit integer default 500)
returns setof public.audit_logs language sql stable security definer set search_path = public as $$
  select * from public.audit_logs
  where public.is_admin_user()
  order by created_at desc
  limit greatest(coalesce(p_limit, 500), 1);
$$;

-- Campos do formulario ---------------------------------------------------------
create or replace function public.chave_do_campo(p_label text)
returns text language sql immutable as $$
  select nullif(regexp_replace(
           regexp_replace(
             lower(translate(coalesce(p_label,''),
               'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
               'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
             '[^a-z0-9]+', '_', 'g'),
           '(^_+|_+$)', '', 'g'), '');
$$;

create or replace function public.admin_upsert_field(
  p_label text,
  p_owner_role text,
  p_field_type text,
  p_required boolean,
  p_help_text text default null,
  p_placeholder text default null,
  p_options text[] default '{}',
  p_sort_order integer default 100,
  p_active boolean default true,
  p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_key text; v_sufixo integer := 1;
begin
  if not public.is_gestao_user() then
    raise exception 'Apenas C&R e ADMIN podem configurar campos.';
  end if;

  if p_id is not null then
    update public.form_fields set
      label = p_label, owner_role = p_owner_role, field_type = p_field_type,
      required = coalesce(p_required, false), help_text = p_help_text,
      placeholder = p_placeholder, options = coalesce(p_options, '{}'),
      sort_order = coalesce(p_sort_order, 100), active = coalesce(p_active, true),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Campo não encontrado.'; end if;
    perform public.registrar_auditoria('form_fields', v_id::text, p_label, 'UPDATE', array['label','field_type','options']);
    return v_id;
  end if;

  -- chave unica derivada do nome do campo
  v_key := coalesce(public.chave_do_campo(p_label), 'campo');
  while exists (select 1 from public.form_fields f where f.field_key = v_key and f.active) loop
    v_sufixo := v_sufixo + 1;
    v_key := coalesce(public.chave_do_campo(p_label), 'campo') || '_' || v_sufixo;
  end loop;

  insert into public.form_fields (field_key, label, owner_role, field_type, required,
                                  help_text, placeholder, options, sort_order, active)
  values (v_key, p_label, p_owner_role, p_field_type, coalesce(p_required, false),
          p_help_text, p_placeholder, coalesce(p_options, '{}'),
          coalesce(p_sort_order, 100), coalesce(p_active, true))
  returning id into v_id;
  perform public.registrar_auditoria('form_fields', v_id::text, p_label, 'INSERT', null);
  return v_id;
end;
$$;

-- Campo do sistema e desativado; campo criado no portal e removido -------------
create or replace function public.admin_remove_field(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_gestao_user() then
    raise exception 'Apenas C&R e ADMIN podem remover campos.';
  end if;
  select * into v from public.form_fields where id = p_id;
  if v is null then raise exception 'Campo não encontrado.'; end if;

  if v.is_system or exists (select 1 from public.request_field_values where field_id = p_id) then
    update public.form_fields set active = false, updated_at = now() where id = p_id;
    perform public.registrar_auditoria('form_fields', p_id::text, v.label, 'UPDATE', array['active']);
    return 'desativado';
  end if;

  delete from public.form_fields where id = p_id;
  perform public.registrar_auditoria('form_fields', p_id::text, v.label, 'DELETE', null);
  return 'removido';
end;
$$;

create or replace function public.admin_set_field_update_editable(
  p_update_editable boolean, p_field_id uuid default null, p_label text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o ADMIN configura a edição em atualizações.';
  end if;
  update public.form_fields
     set update_editable = coalesce(p_update_editable, false), updated_at = now()
   where (p_field_id is not null and id = p_field_id)
      or (p_field_id is null and label = p_label);
  return true;
end;
$$;

create or replace function public.admin_set_field_approval(
  p_approval_area_id uuid default null, p_field_id uuid default null, p_label text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o ADMIN configura o aprovador do campo.';
  end if;
  update public.form_fields
     set approval_area_id = p_approval_area_id, updated_at = now()
   where (p_field_id is not null and id = p_field_id)
      or (p_field_id is null and label = p_label);
  return true;
end;
$$;

-- Aprovadores disponiveis ------------------------------------------------------
create or replace function public.list_available_approvers()
returns table (user_id uuid, user_name text, user_email text, area_id uuid, area_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, a.id, a.name
  from public.profiles p
  join public.approval_areas a on a.id = p.approval_area_id
  where p.active and a.active and public.is_gestao_user()
  order by a.name, p.name;
$$;

-- Configuracao do documento ----------------------------------------------------
create or replace function public.save_document_field_mappings(p_mappings jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare item jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o ADMIN altera a configuração do documento.';
  end if;
  delete from public.document_field_mappings;
  for item in select value from jsonb_array_elements(coalesce(p_mappings, '[]'::jsonb)) loop
    insert into public.document_field_mappings (marker, source_type, source_value, fallback_text, sort_order, updated_by)
    values (item->>'marker',
            coalesce(item->>'source_type', 'fixed'),
            nullif(item->>'source_value', ''),
            coalesce(nullif(item->>'fallback_text', ''), 'Não informado'),
            coalesce((item->>'sort_order')::int, 100),
            auth.uid())
    on conflict (marker) do update
      set source_type = excluded.source_type,
          source_value = excluded.source_value,
          fallback_text = excluded.fallback_text,
          sort_order = excluded.sort_order,
          updated_by = excluded.updated_by,
          updated_at = now();
  end loop;
  return true;
end;
$$;
