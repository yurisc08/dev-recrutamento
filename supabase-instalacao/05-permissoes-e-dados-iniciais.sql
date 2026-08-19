-- =============================================================================
-- 05 — PERMISSOES (RLS), ACESSOS E DADOS INICIAIS
-- =============================================================================

-- RLS: as telas leem estas tabelas direto; o resto passa pelas funcoes ---------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.approval_areas enable row level security;
alter table public.form_fields enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.document_field_mappings enable row level security;
alter table public.requests enable row level security;
alter table public.request_field_values enable row level security;
alter table public.request_history enable row level security;
alter table public.manager_intake_requests enable row level security;
alter table public.request_additional_approvals enable row level security;
alter table public.access_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_leitura on public.profiles;
create policy profiles_leitura on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_gestao_user());

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for all to authenticated using (public.is_gestao_user()) with check (public.is_gestao_user());

do $$
declare t text;
begin
  foreach t in array array['companies','branches','approval_areas','form_fields',
                           'workflow_templates','workflow_steps','document_field_mappings'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_leitura', t);
    execute format('create policy %I on public.%I for select to authenticated using (true);', t || '_leitura', t);
    execute format('drop policy if exists %I on public.%I;', t || '_gestao', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.is_gestao_user()) with check (public.is_gestao_user());', t || '_gestao', t);
  end loop;
end $$;

-- Tabelas do fluxo: acesso apenas pelas funcoes (security definer) -------------
do $$
declare t text;
begin
  foreach t in array array['requests','request_field_values','request_history',
                           'manager_intake_requests','request_additional_approvals',
                           'access_logs','audit_logs'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_gestao', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.is_gestao_user());', t || '_gestao', t);
  end loop;
end $$;

-- Permissao de execucao --------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public;', f.assinatura);
    execute format('grant execute on function %s to authenticated;', f.assinatura);
  end loop;
end $$;

-- Perfil criado automaticamente ao criar o usuario no Auth ---------------------
create or replace function public.criar_perfil_do_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.email,
          coalesce(new.raw_user_meta_data->>'role', 'GESTOR'),
          true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();

-- Dados iniciais ---------------------------------------------------------------
insert into public.workflow_templates (name, description, is_default, active)
select 'Fluxo oficial', 'C&R cria, Gestor preenche, C&R conclui.', true, true
where not exists (select 1 from public.workflow_templates where is_default);

insert into public.workflow_steps (workflow_id, step_name, responsible_type, action_type, sort_order)
select w.id, x.nome, x.responsavel, x.acao, x.ordem
from public.workflow_templates w
cross join (values ('Cadastro C&R','CR','FILL',10),
                   ('Preenchimento Gestor','GESTOR','FILL',20),
                   ('Validação C&R','CR','REVIEW',30),
                   ('Aprovado','CR','APPROVE',40)) as x(nome, responsavel, acao, ordem)
where w.is_default
  and not exists (select 1 from public.workflow_steps s where s.workflow_id = w.id and s.step_name = x.nome);

-- Campos oficiais do documento -------------------------------------------------
insert into public.form_fields (field_key, label, field_type, owner_role, required,
                                update_editable, is_system, sort_order, help_text)
select x.chave, x.rotulo, x.tipo, x.area, x.obrigatorio, x.editavel, true, x.ordem, x.ajuda
from (values
  ('ativ_desc','Missão','textarea','GESTOR',true,true,10,
   'Para que o cargo existe e qual resultado a área espera dele. Evite listar tarefas.'),
  ('descricao_cargo','Principais responsabilidades/atividades','textarea','GESTOR',true,true,20,
   'As atividades do dia a dia, uma por linha.'),
  ('cbo','CBO','text','CR',false,false,30,'Código da Classificação Brasileira de Ocupações.'),
  ('tclc_desc','Trilha de carreira','text','CR',false,false,40,null),
  ('nivel_cargo','Nível do cargo','text','CR',false,false,50,null),
  ('skill_30','Escolaridade mínima','textarea','CR',false,true,60,'Formação exigida para assumir o cargo.'),
  ('skill_31','Escolaridade desejável','textarea','CR',false,true,70,'Formação que agrega, mas não é exigida.'),
  ('skill_32','Idioma mínimo','textarea','CR',false,true,80,null),
  ('skill_33','Idioma desejável','textarea','CR',false,true,90,null),
  ('skill_34','Competências técnicas mínimas','textarea','CR',false,true,100,null),
  ('skill_35','Competências técnicas desejáveis','textarea','CR',false,true,110,null),
  ('skill_36','Experiência profissional desejável','textarea','CR',false,true,120,null),
  ('skill_37','Competências Marcopolo desejáveis','textarea','CR',false,true,130,null)
) as x(chave, rotulo, tipo, area, obrigatorio, editavel, ordem, ajuda)
where not exists (select 1 from public.form_fields f where f.field_key = x.chave);

-- Mapeamento padrao do documento ----------------------------------------------
insert into public.document_field_mappings (marker, source_type, source_value, fallback_text, sort_order)
select x.marcador, x.origem, x.valor, 'Não informado', x.ordem
from (values
  ('EMPRESA','fixed','request.company',10),
  ('COD_DO_CARGO','fixed','request.job_code',20),
  ('NOME_COMPLETO','fixed','request.title',30),
  ('DT_ATIVACAO','fixed','request.approved_at',40)
) as x(marcador, origem, valor, ordem)
where not exists (select 1 from public.document_field_mappings m where m.marker = x.marcador);

-- =============================================================================
-- PRIMEIRO ADMIN
-- Crie o usuário em Supabase > Authentication > Users (e-mail + senha, que é o
-- "código de acesso"). O gatilho acima já cria o perfil. Depois rode:
--
--   update public.profiles set role = 'ADMIN', active = true
--    where email = 'seu.email@marcopolo.com.br';
-- =============================================================================
