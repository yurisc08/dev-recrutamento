-- =============================================================================
-- Massa de dados do PROTOTIPO
-- =============================================================================
-- ATENCAO: cria usuarios com senha fixa. Use apenas em ambiente local/homologacao
-- (`supabase db reset`). Nunca rode este arquivo em producao.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Estrutura organizacional
-- ---------------------------------------------------------------------------
insert into public.unidades (id, codigo, nome) values
  ('11111111-1111-1111-1111-111111111111', 'MTZ', 'Matriz - Planta I'),
  ('11111111-1111-1111-1111-111111111112', 'FIL', 'Filial - Centro de Distribuicao')
on conflict (codigo) do nothing;

insert into public.setores (id, unidade_id, codigo, nome) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'PROD', 'Producao'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'MANU', 'Manutencao'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'ADM',  'Administrativo'),
  ('22222222-2222-2222-2222-222222222224', '11111111-1111-1111-1111-111111111111', 'SESMT','SESMT / Enfermagem'),
  ('22222222-2222-2222-2222-222222222225', '11111111-1111-1111-1111-111111111112', 'LOG',  'Logistica')
on conflict (unidade_id, codigo) do nothing;

insert into public.colaboradores (matricula, nome, cpf, cargo, unidade_id, setor_id, data_admissao) values
  ('001234', 'Ana Paula Ribeiro',    '123.456.789-01', 'Operadora de Producao II', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '2019-03-11'),
  ('001235', 'Carlos Eduardo Lima',  '234.567.890-12', 'Mecanico de Manutencao',   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '2021-07-05'),
  ('001236', 'Fernanda Souza',       '345.678.901-23', 'Analista de RH',           '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222223', '2020-01-20'),
  ('001237', 'Joao Pedro Martins',   '456.789.012-34', 'Auxiliar de Logistica',    '11111111-1111-1111-1111-111111111112', '22222222-2222-2222-2222-222222222225', '2022-09-14'),
  ('001238', 'Marina Alves Costa',   '567.890.123-45', 'Tecnica de Enfermagem',    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222224', '2018-05-02'),
  ('001239', 'Rafael Nogueira',      '678.901.234-56', 'Operador de Empilhadeira', '11111111-1111-1111-1111-111111111112', '22222222-2222-2222-2222-222222222225', '2023-02-27'),
  ('001240', 'Beatriz Camargo',      '789.012.345-67', 'Supervisora de Producao',  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '2017-11-08')
on conflict (matricula) do nothing;

-- ---------------------------------------------------------------------------
-- Usuarios-chave (login facilitado: e-mail + senha ou link magico)
-- ---------------------------------------------------------------------------
do $$
declare
  u          record;
  v_id       uuid;
  v_setor    uuid;
  usuarios   jsonb := '[
    {"email": "admin@empresa.com.br",       "nome": "Administrador do Sistema", "role": "admin",       "setor": "ADM"},
    {"email": "controle@empresa.com.br",    "nome": "Juliana Prado (Controle)", "role": "controlador", "setor": "ADM"},
    {"email": "enfermaria@empresa.com.br",  "nome": "Marina Alves (Enfermaria)","role": "enfermaria",  "setor": "SESMT"},
    {"email": "gestor@empresa.com.br",      "nome": "Beatriz Camargo (Gestao)", "role": "gestor",      "setor": "PROD"}
  ]'::jsonb;
begin
  for u in select * from jsonb_to_recordset(usuarios) as x(email text, nome text, role text, setor text) loop
    select id into v_setor from public.setores where codigo = u.setor limit 1;
    select id into v_id from auth.users where email = u.email;

    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        u.email, crypt('atestado123', gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('nome', u.nome, 'role', u.role),
        now(), now()
      );

      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
              'email', now(), now(), now())
      on conflict do nothing;
    end if;

    insert into public.profiles (id, nome, email, role, setor_id, unidade_id)
    values (v_id, u.nome, u.email, u.role::public.app_role, v_setor,
            (select unidade_id from public.setores where id = v_setor))
    on conflict (id) do update
      set nome = excluded.nome, role = excluded.role,
          setor_id = excluded.setor_id, unidade_id = excluded.unidade_id;
  end loop;
end $$;

-- vincula o perfil do gestor ao respectivo colaborador
update public.profiles p
   set colaborador_id = c.id
  from public.colaboradores c
 where p.email = 'gestor@empresa.com.br' and c.matricula = '001240';

-- ---------------------------------------------------------------------------
-- Destinos de integracao
-- ---------------------------------------------------------------------------
insert into public.integracao_destinos (chave, nome, descricao, conector, endpoint_url, segredo_env, disparo_automatico, ativo, mapeamento) values
  ('rsdata', 'RSData - Modulo Ocupacional',
   'Envia o afastamento validado para o prontuario ocupacional do RSData.',
   'rsdata', null, 'RSDATA_TOKEN', true, true,
   '{"matricula": "colaborador.matricula", "cid": "cid.codigo", "inicio": "afastamento.data_inicio", "dias": "afastamento.dias"}'::jsonb),
  ('folha', 'Folha de Pagamento',
   'Lancamento do afastamento no sistema de folha/ponto.',
   'webhook', null, 'FOLHA_TOKEN', true, true, '{}'::jsonb),
  ('bi', 'Data Lake / BI',
   'Replica o evento para o repositorio analitico de absenteismo.',
   'webhook', null, 'BI_TOKEN', false, true, '{}'::jsonb)
on conflict (chave) do nothing;

insert into public.configuracoes (chave, valor, descricao) values
  ('sla_validacao_horas', '{"valor": 8}',  'Prazo alvo, em horas, para a enfermaria validar um atestado.'),
  ('dias_alerta_inss',    '{"valor": 15}', 'A partir de quantos dias de afastamento o caso e sinalizado para o INSS.'),
  ('exigir_cid',          '{"valor": false}', 'Torna o CID obrigatorio na validacao.'),
  ('organizacao',         '{"nome": "Empresa Demonstracao S.A.", "sigla": "EDSA"}', 'Identificacao da organizacao.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- Atestados de exemplo (um em cada etapa do fluxo)
-- ---------------------------------------------------------------------------
do $$
declare
  v_controlador uuid := (select id from public.profiles where email = 'controle@empresa.com.br');
  v_enfermaria  uuid := (select id from public.profiles where email = 'enfermaria@empresa.com.br');
  v_id          uuid;
begin
  if exists (select 1 from public.atestados) then return; end if;

  insert into public.atestados (colaborador_id, tipo, status, data_emissao, data_inicio, dias, cid, cid_descricao,
                                medico_nome, medico_registro, medico_uf, instituicao, observacao_controlador, registrado_por)
  values ((select id from public.colaboradores where matricula = '001234'),
          'atestado_medico', 'aguardando_validacao', current_date - 1, current_date - 1, 3,
          'J11', 'Influenza devida a virus nao identificado',
          'Dr. Ricardo Menezes', '54321', 'SP', 'UBS Central',
          'Documento legivel, entregue na portaria.', v_controlador);

  insert into public.atestados (colaborador_id, tipo, status, data_emissao, data_inicio, dias,
                                medico_nome, medico_registro, medico_uf, registrado_por, assumido_por, assumido_em)
  values ((select id from public.colaboradores where matricula = '001235'),
          'atestado_medico', 'em_analise', current_date - 2, current_date - 2, 1,
          'Dra. Helena Prado', '12345', 'SP', v_controlador, v_enfermaria, now() - interval '2 hours');

  insert into public.atestados (colaborador_id, tipo, status, data_emissao, data_inicio, horas, dias,
                                medico_nome, medico_registro, medico_uf, registrado_por)
  values ((select id from public.colaboradores where matricula = '001236'),
          'declaracao_comparecimento', 'aguardando_validacao', current_date, current_date, 4, 0,
          'Dr. Paulo Vieira', '99887', 'SP', v_controlador);

  insert into public.atestados (colaborador_id, tipo, status, data_emissao, data_inicio, dias, cid,
                                medico_nome, medico_registro, medico_uf, registrado_por,
                                validado_por, validado_em, parecer_enfermaria)
  values ((select id from public.colaboradores where matricula = '001237'),
          'atestado_medico', 'validado', current_date - 5, current_date - 5, 15, 'M54',
          'Dr. Sergio Tavares', '33221', 'SP', v_controlador,
          v_enfermaria, now() - interval '3 days',
          'Afastamento superior a 15 dias: encaminhar para pericia do INSS.')
  returning id into v_id;

  perform public.enfileirar_integracoes(v_id, true);
end $$;
