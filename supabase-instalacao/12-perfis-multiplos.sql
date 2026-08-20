-- =============================================================================
-- 12 — DOIS PERFIS PARA O MESMO E-MAIL
--
-- Hoje cada pessoa tem um papel so (profiles.role). Este arquivo permite
-- liberar papeis adicionais para o mesmo cadastro — por exemplo C&R + ADMIN —
-- sem criar um segundo usuario e sem mudar nenhuma regra do fluxo.
--
-- Como funciona:
--   . profiles.role continua sendo o papel padrao, o que a pessoa ve ao entrar
--     quando nao escolhe nada. Nenhuma funcao existente precisou mudar por causa
--     dele.
--   . profiles.extra_roles guarda os papeis adicionais liberados.
--   . No portal, quem tem mais de um papel escolhe na entrada com qual vai
--     trabalhar, e pode trocar depois sem sair.
--
-- IMPORTANTE, e vale ler com atencao: a escolha muda **a interface**. No banco,
-- a permissao continua sendo a soma dos papeis liberados — quem tem ADMIN
-- liberado continua tendo direito de ADMIN mesmo trabalhando no modo C&R. Se a
-- intencao for tirar o direito, tire o papel da pessoa, nao basta ela escolher
-- o outro modo.
--
-- Execute depois dos arquivos 01 a 07.
-- =============================================================================

alter table public.profiles
  add column if not exists extra_roles text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_extra_roles_validos') then
    alter table public.profiles add constraint profiles_extra_roles_validos
      check (extra_roles <@ array['ADMIN','CR','GESTOR','APROVADOR']::text[]);
  end if;
end $$;

-- 1. Todos os papeis de uma pessoa (o padrao mais os adicionais) ----------------
create or replace function public.papeis_do_perfil(p_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array(
    select distinct papel
    from public.profiles p, unnest(array[p.role] || p.extra_roles) as papel
    where p.id = p_id and p.active and coalesce(btrim(papel), '') <> ''
    order by papel);
$$;

-- 2. As permissoes passam a considerar os papeis adicionais ---------------------
-- A assinatura e o comportamento para quem tem um papel so continuam iguais.
create or replace function public.is_admin_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active
                   and ('ADMIN' = p.role or 'ADMIN' = any (p.extra_roles)));
$$;

create or replace function public.is_gestao_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active
                   and (p.role in ('ADMIN','CR')
                        or p.extra_roles && array['ADMIN','CR']::text[]));
$$;

-- 3. Liberar e retirar papeis (somente ADMIN) -----------------------------------
create or replace function public.admin_set_profile_roles(p_id uuid, p_extra_roles text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare v_alvo public.profiles; v_limpos text[]; v_admins int;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas o ADMIN libera perfis adicionais.';
  end if;
  select * into v_alvo from public.profiles where id = p_id;
  if v_alvo is null then raise exception 'Usuário não encontrado.'; end if;

  -- Tira repetidos, vazios e o proprio papel padrao (que ja vale por si).
  select array(
    select distinct papel
    from unnest(coalesce(p_extra_roles, '{}')) as papel
    where coalesce(btrim(papel), '') <> '' and papel <> v_alvo.role
    order by papel)
  into v_limpos;

  if not (v_limpos <@ array['ADMIN','CR','GESTOR','APROVADOR']::text[]) then
    raise exception 'Perfil inválido. Use ADMIN, CR, GESTOR ou APROVADOR.';
  end if;

  -- Nao deixa o portal ficar sem nenhum administrador ativo.
  if v_alvo.role <> 'ADMIN' and 'ADMIN' = any (v_alvo.extra_roles) and not ('ADMIN' = any (v_limpos)) then
    select count(*) into v_admins
      from public.profiles p
     where p.active and p.id <> p_id
       and ('ADMIN' = p.role or 'ADMIN' = any (p.extra_roles));
    if v_admins = 0 then
      raise exception 'Este é o último administrador ativo: libere outro antes de retirar o perfil.';
    end if;
  end if;

  update public.profiles
     set extra_roles = v_limpos, updated_at = now()
   where id = p_id;

  perform public.registrar_auditoria('profiles', p_id::text, v_alvo.name,
            'perfis adicionais', array['extra_roles']);
  return v_limpos;
end;
$$;

revoke all on function public.admin_set_profile_roles(uuid, text[]) from public;
grant execute on function public.admin_set_profile_roles(uuid, text[]) to authenticated;
grant execute on function public.papeis_do_perfil(uuid) to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- COMO USAR
--
-- Liberar ADMIN para quem hoje e C&R:
--   select public.admin_set_profile_roles(
--            (select id from public.profiles where email = 'fulano@marcopolo.com.br'),
--            array['ADMIN']);
--
-- Tirar os adicionais (volta a ter so o papel padrao):
--   select public.admin_set_profile_roles(
--            (select id from public.profiles where email = 'fulano@marcopolo.com.br'),
--            array[]::text[]);
--
-- Conferir quem tem mais de um perfil:
--   select email, role, extra_roles from public.profiles
--    where array_length(extra_roles, 1) > 0 order by email;
--
-- Pelo portal: aba Usuarios -> Editar -> "Também pode entrar como".
-- =============================================================================
