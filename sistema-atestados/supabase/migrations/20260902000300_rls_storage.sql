-- =============================================================================
-- Row Level Security + bucket de digitalizacoes
-- =============================================================================

alter table public.unidades            enable row level security;
alter table public.setores             enable row level security;
alter table public.colaboradores       enable row level security;
alter table public.profiles            enable row level security;
alter table public.atestados           enable row level security;
alter table public.atestado_arquivos   enable row level security;
alter table public.atestado_eventos    enable row level security;
alter table public.integracao_destinos enable row level security;
alter table public.integracao_jobs     enable row level security;
alter table public.configuracoes       enable row level security;

-- ---------------------------------------------------------------------------
-- Cadastros basicos: todos leem, admin/controlador escrevem
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['unidades', 'setores', 'colaboradores'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_write  on public.%I', t, t);
    execute format($f$create policy %I_select on public.%I
                      for select to authenticated using (true)$f$, t, t);
    execute format($f$create policy %I_write on public.%I
                      for all to authenticated
                      using (public.tem_papel('admin', 'controlador'))
                      with check (public.tem_papel('admin', 'controlador'))$f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select      on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin       on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.meu_papel());

create policy profiles_admin on public.profiles
  for all to authenticated
  using (public.tem_papel('admin'))
  with check (public.tem_papel('admin'));

-- ---------------------------------------------------------------------------
-- Atestados
--   admin / enfermaria / controlador  -> visao central (todos)
--   gestor                            -> apenas o proprio setor
--   colaborador                       -> apenas os proprios
-- ---------------------------------------------------------------------------
drop policy if exists atestados_select      on public.atestados;
drop policy if exists atestados_insert      on public.atestados;
drop policy if exists atestados_update      on public.atestados;
drop policy if exists atestados_delete      on public.atestados;

create policy atestados_select on public.atestados
  for select to authenticated
  using (
    public.tem_papel('admin', 'enfermaria', 'controlador')
    or (public.tem_papel('gestor') and setor_id = public.meu_setor())
    or (colaborador_id is not distinct from public.meu_colaborador())
  );

create policy atestados_insert on public.atestados
  for insert to authenticated
  with check (
    public.tem_papel('admin', 'controlador', 'enfermaria')
    and registrado_por = auth.uid()
  );

create policy atestados_update on public.atestados
  for update to authenticated
  using (
    public.tem_papel('admin', 'enfermaria')
    or (
      public.tem_papel('controlador')
      and status in ('rascunho', 'pendente_informacao', 'aguardando_validacao')
    )
  )
  with check (
    public.tem_papel('admin', 'enfermaria', 'controlador')
  );

create policy atestados_delete on public.atestados
  for delete to authenticated
  using (public.tem_papel('admin') or (public.tem_papel('controlador') and status = 'rascunho'));

-- ---------------------------------------------------------------------------
-- Arquivos e eventos seguem a visibilidade do atestado
-- ---------------------------------------------------------------------------
drop policy if exists arquivos_select on public.atestado_arquivos;
drop policy if exists arquivos_insert on public.atestado_arquivos;
drop policy if exists arquivos_delete on public.atestado_arquivos;

create policy arquivos_select on public.atestado_arquivos
  for select to authenticated
  using (exists (select 1 from public.atestados a where a.id = atestado_id));

create policy arquivos_insert on public.atestado_arquivos
  for insert to authenticated
  with check (public.tem_papel('admin', 'controlador', 'enfermaria'));

create policy arquivos_delete on public.atestado_arquivos
  for delete to authenticated
  using (public.tem_papel('admin', 'controlador'));

drop policy if exists eventos_select on public.atestado_eventos;
drop policy if exists eventos_insert on public.atestado_eventos;

create policy eventos_select on public.atestado_eventos
  for select to authenticated
  using (exists (select 1 from public.atestados a where a.id = atestado_id));

create policy eventos_insert on public.atestado_eventos
  for insert to authenticated
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Integracoes
-- ---------------------------------------------------------------------------
drop policy if exists destinos_select on public.integracao_destinos;
drop policy if exists destinos_admin  on public.integracao_destinos;

create policy destinos_select on public.integracao_destinos
  for select to authenticated using (true);

create policy destinos_admin on public.integracao_destinos
  for all to authenticated
  using (public.tem_papel('admin'))
  with check (public.tem_papel('admin'));

drop policy if exists jobs_select on public.integracao_jobs;
drop policy if exists jobs_admin  on public.integracao_jobs;

create policy jobs_select on public.integracao_jobs
  for select to authenticated
  using (public.tem_papel('admin', 'enfermaria', 'controlador'));

create policy jobs_admin on public.integracao_jobs
  for all to authenticated
  using (public.tem_papel('admin'))
  with check (public.tem_papel('admin'));

drop policy if exists config_select on public.configuracoes;
drop policy if exists config_admin  on public.configuracoes;

create policy config_select on public.configuracoes
  for select to authenticated using (true);

create policy config_admin on public.configuracoes
  for all to authenticated
  using (public.tem_papel('admin'))
  with check (public.tem_papel('admin'));

-- ---------------------------------------------------------------------------
-- Storage: bucket privado com as digitalizacoes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atestados', 'atestados', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists atestados_storage_select on storage.objects;
drop policy if exists atestados_storage_insert on storage.objects;
drop policy if exists atestados_storage_delete on storage.objects;

create policy atestados_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'atestados' and public.tem_papel('admin', 'controlador', 'enfermaria', 'gestor'));

create policy atestados_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'atestados' and public.tem_papel('admin', 'controlador', 'enfermaria'));

create policy atestados_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'atestados' and public.tem_papel('admin', 'controlador'));

-- ---------------------------------------------------------------------------
-- Permissoes de execucao das RPCs
-- ---------------------------------------------------------------------------
grant execute on function public.meu_papel, public.tem_papel, public.meu_setor, public.meu_colaborador,
                          public.enviar_para_validacao, public.assumir_atestado, public.validar_atestado,
                          public.rejeitar_atestado, public.solicitar_informacao, public.reenfileirar_job,
                          public.enfileirar_integracoes, public.montar_payload_atestado,
                          public.metricas_dashboard
  to authenticated;

-- reservar_jobs/concluir_job sao exclusivas do Worker (service_role)
revoke execute on function public.reservar_jobs(integer)                                   from authenticated, anon;
revoke execute on function public.concluir_job(uuid, boolean, jsonb, text, text)           from authenticated, anon;
grant  execute on function public.reservar_jobs(integer)                                   to service_role;
grant  execute on function public.concluir_job(uuid, boolean, jsonb, text, text)           to service_role;
