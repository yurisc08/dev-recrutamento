-- =============================================================================
-- VERIFICACAO DA INSTALACAO — Fluxo de Descritivos de Cargos
-- Execute no Supabase (SQL Editor). Nao altera nada: so confere o que existe.
--
-- O resultado lista cada tabela e cada funcao que a tela usa, com OK ou FALTA.
-- Se aparecer FALTA, aquele recurso ainda nao foi criado neste projeto e a
-- funcionalidade correspondente vai falhar no portal.
-- =============================================================================

with esperado(tipo, nome) as (
  values
    ('tabela', 'approval_areas'),
    ('tabela', 'branches'),
    ('tabela', 'companies'),
    ('tabela', 'document_field_mappings'),
    ('tabela', 'form_fields'),
    ('tabela', 'job_catalog'),
    ('tabela', 'job_import_runs'),
    ('tabela', 'profiles'),
    ('tabela', 'request_field_values'),
    ('tabela', 'requests'),
    ('tabela', 'workflow_steps'),
    ('tabela', 'workflow_templates'),
    ('funcao', 'admin_delete_request'),
    ('funcao', 'admin_job_catalog_overview'),
    ('funcao', 'admin_job_delete'),
    ('funcao', 'admin_job_export'),
    ('funcao', 'admin_job_get'),
    ('funcao', 'admin_job_import_cancel'),
    ('funcao', 'admin_job_import_commit'),
    ('funcao', 'admin_job_import_push'),
    ('funcao', 'admin_job_import_start'),
    ('funcao', 'admin_job_list'),
    ('funcao', 'admin_job_set_active'),
    ('funcao', 'admin_job_upsert'),
    ('funcao', 'admin_list_import_profiles'),
    ('funcao', 'admin_remove_field'),
    ('funcao', 'admin_save_import_profile'),
    ('funcao', 'admin_set_field_approval'),
    ('funcao', 'admin_set_field_update_editable'),
    ('funcao', 'admin_upsert_field'),
    ('funcao', 'assign_request_additional_approval'),
    ('funcao', 'claim_manager_intake_request'),
    ('funcao', 'close_request_additional_approval'),
    ('funcao', 'convert_manager_intake_to_request'),
    ('funcao', 'cr_mark_request_kind'),
    ('funcao', 'cr_reject_request'),
    ('funcao', 'cr_send_optional_manager_review'),
    ('funcao', 'cr_set_request_job_code'),
    ('funcao', 'cr_set_request_update_scope'),
    ('funcao', 'create_manager_intake_request_v2'),
    ('funcao', 'create_request'),
    ('funcao', 'get_job_catalog_details'),
    ('funcao', 'get_request_additional_approval'),
    ('funcao', 'get_request_intake_metadata'),
    ('funcao', 'get_visible_request'),
    ('funcao', 'list_access_logs'),
    ('funcao', 'list_audit_logs'),
    ('funcao', 'list_available_approvers'),
    ('funcao', 'list_manager_intake_requests'),
    ('funcao', 'list_visible_requests'),
    ('funcao', 'register_access_log'),
    ('funcao', 'respond_request_additional_approval'),
    ('funcao', 'save_document_field_mappings'),
    ('funcao', 'save_dynamic_values'),
    ('funcao', 'search_job_catalog'),
    ('funcao', 'set_request_additional_approval_plan'),
    ('funcao', 'transition_dynamic_request')
),
situacao as (
  select
    e.tipo,
    e.nome,
    case
      when e.tipo = 'tabela' then
        case when to_regclass('public.' || e.nome) is not null then 'OK' else 'FALTA' end
      else
        case when exists (
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = e.nome
        ) then 'OK' else 'FALTA' end
    end as resultado
  from esperado e
)
select resultado, tipo, nome
from situacao
order by (resultado = 'OK'), tipo, nome;

-- Resumo -----------------------------------------------------------------
with esperado(tipo, nome) as (
  values
    ('tabela', 'approval_areas'),
    ('tabela', 'branches'),
    ('tabela', 'companies'),
    ('tabela', 'document_field_mappings'),
    ('tabela', 'form_fields'),
    ('tabela', 'job_catalog'),
    ('tabela', 'job_import_runs'),
    ('tabela', 'profiles'),
    ('tabela', 'request_field_values'),
    ('tabela', 'requests'),
    ('tabela', 'workflow_steps'),
    ('tabela', 'workflow_templates'),
    ('funcao', 'admin_delete_request'),
    ('funcao', 'admin_job_catalog_overview'),
    ('funcao', 'admin_job_delete'),
    ('funcao', 'admin_job_export'),
    ('funcao', 'admin_job_get'),
    ('funcao', 'admin_job_import_cancel'),
    ('funcao', 'admin_job_import_commit'),
    ('funcao', 'admin_job_import_push'),
    ('funcao', 'admin_job_import_start'),
    ('funcao', 'admin_job_list'),
    ('funcao', 'admin_job_set_active'),
    ('funcao', 'admin_job_upsert'),
    ('funcao', 'admin_list_import_profiles'),
    ('funcao', 'admin_remove_field'),
    ('funcao', 'admin_save_import_profile'),
    ('funcao', 'admin_set_field_approval'),
    ('funcao', 'admin_set_field_update_editable'),
    ('funcao', 'admin_upsert_field'),
    ('funcao', 'assign_request_additional_approval'),
    ('funcao', 'claim_manager_intake_request'),
    ('funcao', 'close_request_additional_approval'),
    ('funcao', 'convert_manager_intake_to_request'),
    ('funcao', 'cr_mark_request_kind'),
    ('funcao', 'cr_reject_request'),
    ('funcao', 'cr_send_optional_manager_review'),
    ('funcao', 'cr_set_request_job_code'),
    ('funcao', 'cr_set_request_update_scope'),
    ('funcao', 'create_manager_intake_request_v2'),
    ('funcao', 'create_request'),
    ('funcao', 'get_job_catalog_details'),
    ('funcao', 'get_request_additional_approval'),
    ('funcao', 'get_request_intake_metadata'),
    ('funcao', 'get_visible_request'),
    ('funcao', 'list_access_logs'),
    ('funcao', 'list_audit_logs'),
    ('funcao', 'list_available_approvers'),
    ('funcao', 'list_manager_intake_requests'),
    ('funcao', 'list_visible_requests'),
    ('funcao', 'register_access_log'),
    ('funcao', 'respond_request_additional_approval'),
    ('funcao', 'save_document_field_mappings'),
    ('funcao', 'save_dynamic_values'),
    ('funcao', 'search_job_catalog'),
    ('funcao', 'set_request_additional_approval_plan'),
    ('funcao', 'transition_dynamic_request')
)
select
  count(*) filter (where tipo = 'tabela') as tabelas_esperadas,
  count(*) filter (where tipo = 'tabela' and to_regclass('public.' || nome) is not null) as tabelas_presentes,
  count(*) filter (where tipo = 'funcao') as funcoes_esperadas,
  count(*) filter (where tipo = 'funcao' and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = esperado.nome)) as funcoes_presentes
from esperado;

-- Colunas que a Base de cargos usa em job_catalog -------------------------
select *
from (
  select 'job_catalog.' || c.nome as coluna,
         case when exists (
           select 1 from information_schema.columns i
           where i.table_schema = 'public' and i.table_name = 'job_catalog' and i.column_name = c.nome
         ) then 'OK' else 'FALTA' end as resultado
  from (values ('id'),('job_code'),('job_name'),('full_name'),('company'),('company_code'),
               ('cbo'),('level'),('active'),('source'),('imported_at')) as c(nome)
) colunas
order by (resultado = 'OK'), coluna;

-- Observacao: as duas Edge Functions (admin-users e notify-workflow) nao
-- aparecem aqui — elas vivem fora do banco. Confira em
-- Supabase > Edge Functions se as duas estao publicadas.
