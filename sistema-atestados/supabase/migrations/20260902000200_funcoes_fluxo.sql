-- =============================================================================
-- Funcoes de apoio (papeis) e RPCs do fluxo de trabalho
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de autorizacao — security definer para nao recursionar na RLS
-- ---------------------------------------------------------------------------
create or replace function public.meu_papel()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo;
$$;

create or replace function public.tem_papel(variadic papeis public.app_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and ativo and role = any(papeis)
  );
$$;

create or replace function public.meu_setor()
returns uuid
language sql stable security definer set search_path = public as $$
  select setor_id from public.profiles where id = auth.uid();
$$;

create or replace function public.meu_colaborador()
returns uuid
language sql stable security definer set search_path = public as $$
  select colaborador_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enfileiramento de integracoes
-- ---------------------------------------------------------------------------
create or replace function public.montar_payload_atestado(p_atestado_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'protocolo',    a.protocolo,
    'tipo',         a.tipo,
    'status',       a.status,
    'colaborador',  jsonb_build_object(
                      'matricula', c.matricula,
                      'nome',      c.nome,
                      'cpf',       c.cpf,
                      'cargo',     c.cargo,
                      'setor',     s.nome,
                      'unidade',   u.nome
                    ),
    'afastamento',  jsonb_build_object(
                      'data_emissao', a.data_emissao,
                      'data_inicio',  a.data_inicio,
                      'data_fim',     a.data_fim,
                      'dias',         a.dias,
                      'horas',        a.horas,
                      'afasta_inss',  a.afasta_inss
                    ),
    'cid',          jsonb_build_object('codigo', a.cid, 'descricao', a.cid_descricao),
    'emitente',     jsonb_build_object(
                      'nome',     a.medico_nome,
                      'conselho', a.medico_conselho,
                      'registro', a.medico_registro,
                      'uf',       a.medico_uf,
                      'instituicao', a.instituicao
                    ),
    'validacao',    jsonb_build_object(
                      'parecer',     a.parecer_enfermaria,
                      'restricao',   a.restricao_funcional,
                      'validado_em', a.validado_em,
                      'validado_por', p.nome
                    ),
    'anexos',       coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'nome', ar.nome_original,
                               'path', ar.storage_path,
                               'mime', ar.mime_type))
                      from public.atestado_arquivos ar where ar.atestado_id = a.id
                    ), '[]'::jsonb)
  )
  from public.atestados a
  join public.colaboradores c on c.id = a.colaborador_id
  left join public.setores  s on s.id = a.setor_id
  left join public.unidades u on u.id = a.unidade_id
  left join public.profiles p on p.id = a.validado_por
  where a.id = p_atestado_id;
$$;

create or replace function public.enfileirar_integracoes(p_atestado_id uuid, p_somente_automaticos boolean default true)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb := public.montar_payload_atestado(p_atestado_id);
  v_total   integer := 0;
begin
  insert into public.integracao_jobs (atestado_id, destino_id, payload, max_tentativas, status, proxima_tentativa)
  select p_atestado_id, d.id, v_payload, d.max_tentativas, 'pendente', now()
  from public.integracao_destinos d
  where d.ativo
    and (not p_somente_automaticos or d.disparo_automatico)
  on conflict (atestado_id, destino_id) do update
    set status = 'pendente',
        payload = excluded.payload,
        tentativas = 0,
        erro = null,
        proxima_tentativa = now(),
        updated_at = now();

  get diagnostics v_total = row_count;

  insert into public.atestado_eventos (atestado_id, tipo, autor_id, autor_nome, descricao, dados)
  select p_atestado_id, 'integracao_enfileirada', auth.uid(),
         coalesce((select nome from public.profiles where id = auth.uid()), 'sistema'),
         format('%s destino(s) enfileirado(s) para envio', v_total),
         jsonb_build_object('total', v_total);

  return v_total;
end $$;

-- ---------------------------------------------------------------------------
-- Transicoes de estado
-- ---------------------------------------------------------------------------
create or replace function public.enviar_para_validacao(p_atestado_id uuid)
returns public.atestados
language plpgsql security definer set search_path = public as $$
declare v_at public.atestados;
begin
  if not public.tem_papel('admin', 'controlador', 'enfermaria') then
    raise exception 'Sem permissao para enviar atestado para validacao' using errcode = '42501';
  end if;

  update public.atestados
     set status = 'aguardando_validacao'
   where id = p_atestado_id
     and status in ('rascunho', 'pendente_informacao')
  returning * into v_at;

  if v_at.id is null then
    raise exception 'Atestado inexistente ou fora do estado permitido' using errcode = 'P0001';
  end if;
  return v_at;
end $$;

create or replace function public.assumir_atestado(p_atestado_id uuid)
returns public.atestados
language plpgsql security definer set search_path = public as $$
declare v_at public.atestados;
begin
  if not public.tem_papel('admin', 'enfermaria') then
    raise exception 'Somente a enfermaria pode assumir atestados' using errcode = '42501';
  end if;

  update public.atestados
     set status = 'em_analise', assumido_por = auth.uid(), assumido_em = now()
   where id = p_atestado_id
     and status = 'aguardando_validacao'
  returning * into v_at;

  if v_at.id is null then
    raise exception 'Atestado ja assumido por outro usuario ou fora da fila' using errcode = 'P0001';
  end if;
  return v_at;
end $$;

create or replace function public.validar_atestado(
  p_atestado_id       uuid,
  p_parecer           text default null,
  p_cid               text default null,
  p_cid_descricao     text default null,
  p_dias              integer default null,
  p_restricao         text default null,
  p_afasta_inss       boolean default null
)
returns public.atestados
language plpgsql security definer set search_path = public as $$
declare v_at public.atestados;
begin
  if not public.tem_papel('admin', 'enfermaria') then
    raise exception 'Somente a enfermaria pode validar atestados' using errcode = '42501';
  end if;

  update public.atestados
     set status              = 'validado',
         parecer_enfermaria  = coalesce(p_parecer, parecer_enfermaria),
         cid                 = coalesce(p_cid, cid),
         cid_descricao       = coalesce(p_cid_descricao, cid_descricao),
         dias                = coalesce(p_dias, dias),
         restricao_funcional = coalesce(p_restricao, restricao_funcional),
         afasta_inss         = coalesce(p_afasta_inss, afasta_inss),
         validado_por        = auth.uid(),
         validado_em         = now(),
         motivo_rejeicao     = null
   where id = p_atestado_id
     and status in ('aguardando_validacao', 'em_analise', 'pendente_informacao')
  returning * into v_at;

  if v_at.id is null then
    raise exception 'Atestado fora do estado permitido para validacao' using errcode = 'P0001';
  end if;

  perform public.enfileirar_integracoes(p_atestado_id, true);
  return v_at;
end $$;

create or replace function public.rejeitar_atestado(p_atestado_id uuid, p_motivo text)
returns public.atestados
language plpgsql security definer set search_path = public as $$
declare v_at public.atestados;
begin
  if not public.tem_papel('admin', 'enfermaria') then
    raise exception 'Somente a enfermaria pode rejeitar atestados' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da rejeicao' using errcode = 'P0001';
  end if;

  update public.atestados
     set status = 'rejeitado', motivo_rejeicao = p_motivo,
         validado_por = auth.uid(), validado_em = now()
   where id = p_atestado_id
     and status in ('aguardando_validacao', 'em_analise', 'pendente_informacao')
  returning * into v_at;

  if v_at.id is null then
    raise exception 'Atestado fora do estado permitido para rejeicao' using errcode = 'P0001';
  end if;
  return v_at;
end $$;

create or replace function public.solicitar_informacao(p_atestado_id uuid, p_motivo text)
returns public.atestados
language plpgsql security definer set search_path = public as $$
declare v_at public.atestados;
begin
  if not public.tem_papel('admin', 'enfermaria') then
    raise exception 'Somente a enfermaria pode solicitar complemento' using errcode = '42501';
  end if;

  update public.atestados
     set status = 'pendente_informacao', motivo_rejeicao = p_motivo
   where id = p_atestado_id
     and status in ('aguardando_validacao', 'em_analise')
  returning * into v_at;

  if v_at.id is null then
    raise exception 'Atestado fora do estado permitido' using errcode = 'P0001';
  end if;
  return v_at;
end $$;

-- Reprocessamento manual de um envio que falhou
create or replace function public.reenfileirar_job(p_job_id uuid)
returns public.integracao_jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.integracao_jobs;
begin
  if not public.tem_papel('admin', 'enfermaria', 'controlador') then
    raise exception 'Sem permissao para reprocessar integracoes' using errcode = '42501';
  end if;

  update public.integracao_jobs
     set status = 'pendente', tentativas = 0, erro = null,
         proxima_tentativa = now(),
         payload = public.montar_payload_atestado(atestado_id)
   where id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'Job nao encontrado' using errcode = 'P0001';
  end if;
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- Consumo pelo Worker (service role): busca lote e conclui
-- ---------------------------------------------------------------------------
create or replace function public.reservar_jobs(p_limite integer default 10)
returns setof public.integracao_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with alvo as (
    select j.id
    from public.integracao_jobs j
    join public.integracao_destinos d on d.id = j.destino_id and d.ativo
    where j.status = 'pendente'
      and j.proxima_tentativa <= now()
      and j.tentativas < j.max_tentativas
    order by j.proxima_tentativa
    limit p_limite
    for update of j skip locked
  )
  update public.integracao_jobs j
     set status = 'processando', tentativas = j.tentativas + 1, updated_at = now()
    from alvo
   where j.id = alvo.id
  returning j.*;
end $$;

create or replace function public.concluir_job(
  p_job_id     uuid,
  p_sucesso    boolean,
  p_resposta   jsonb default '{}'::jsonb,
  p_erro       text default null,
  p_referencia text default null
)
returns public.integracao_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job     public.integracao_jobs;
  v_pendentes integer;
begin
  update public.integracao_jobs
     set status = case
                    when p_sucesso then 'sucesso'::public.job_status
                    when tentativas >= max_tentativas then 'erro'::public.job_status
                    else 'pendente'::public.job_status
                  end,
         resposta = p_resposta,
         erro = case when p_sucesso then null else p_erro end,
         referencia_externa = coalesce(p_referencia, referencia_externa),
         -- backoff exponencial: 1min, 2min, 4min, 8min...
         proxima_tentativa = case
                               when p_sucesso then proxima_tentativa
                               else now() + (interval '1 minute' * power(2, least(tentativas, 6)))
                             end
   where id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'Job nao encontrado' using errcode = 'P0001';
  end if;

  insert into public.atestado_eventos (atestado_id, tipo, autor_nome, descricao, dados)
  select v_job.atestado_id,
         case when p_sucesso then 'integracao_sucesso' else 'integracao_falha' end,
         'integrador',
         format('%s: %s', d.nome, case when p_sucesso then 'enviado com sucesso' else coalesce(p_erro, 'falha no envio') end),
         jsonb_build_object('destino', d.chave, 'tentativa', v_job.tentativas)
  from public.integracao_destinos d where d.id = v_job.destino_id;

  -- o atestado so vira "integrado" quando nao restar nenhum envio pendente
  select count(*) into v_pendentes
  from public.integracao_jobs
  where atestado_id = v_job.atestado_id and status in ('pendente', 'processando');

  if v_pendentes = 0 then
    update public.atestados a
       set status = case
                      when exists (select 1 from public.integracao_jobs j
                                    where j.atestado_id = a.id and j.status = 'erro')
                        then 'erro_integracao'::public.atestado_status
                      else 'integrado'::public.atestado_status
                    end,
           integrado_em = now()
     where a.id = v_job.atestado_id
       and a.status in ('validado', 'erro_integracao');
  end if;

  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- Metricas do painel
-- ---------------------------------------------------------------------------
create or replace function public.metricas_dashboard(p_dias integer default 30)
returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select * from public.atestados
    where registrado_em >= now() - (p_dias || ' days')::interval
  )
  select jsonb_build_object(
    'periodo_dias',        p_dias,
    'total',               (select count(*) from base),
    'fila_validacao',      (select count(*) from public.atestados where status = 'aguardando_validacao'),
    'em_analise',          (select count(*) from public.atestados where status = 'em_analise'),
    'pendente_informacao', (select count(*) from public.atestados where status = 'pendente_informacao'),
    'validados',           (select count(*) from base where status in ('validado','integrado')),
    'rejeitados',          (select count(*) from base where status = 'rejeitado'),
    'erros_integracao',    (select count(*) from public.integracao_jobs where status = 'erro'),
    'dias_afastamento',    (select coalesce(sum(dias), 0) from base where status in ('validado','integrado')),
    'tempo_medio_horas',   (select round(coalesce(avg(extract(epoch from (validado_em - registrado_em)) / 3600), 0)::numeric, 1)
                              from base where validado_em is not null),
    'por_status',          (select coalesce(jsonb_object_agg(status, qtd), '{}'::jsonb)
                              from (select status, count(*) qtd from base group by status) t),
    'por_setor',           (select coalesce(jsonb_agg(jsonb_build_object('setor', nome, 'total', qtd, 'dias', dias)
                                                       order by qtd desc), '[]'::jsonb)
                              from (select coalesce(s.nome, 'Sem setor') nome, count(*) qtd, coalesce(sum(b.dias),0) dias
                                      from base b left join public.setores s on s.id = b.setor_id
                                     group by 1 order by 2 desc limit 8) t),
    'serie_diaria',        (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', qtd) order by dia), '[]'::jsonb)
                              from (select date_trunc('day', registrado_em)::date dia, count(*) qtd
                                      from base group by 1) t)
  );
$$;
