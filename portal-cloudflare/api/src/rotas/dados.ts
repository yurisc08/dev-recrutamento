import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Ambiente, Variaveis } from '../tipos.js';
import {
  ErroApi, avaliarAlertas, carregarContexto, converter, dentroDoEscopo,
  exigirPerfil, podeEditarCampo, validarAvaliacao, normalizar, paraNumero,
} from '../dominio.js';
import { auditar } from '../auditoria.js';

export const rotasDados = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

type Ctx = Context<{ Bindings: Ambiente; Variables: Variaveis }>;

interface LinhaColaborador {
  id: number;
  chapa: string;
  nome: string | null;
  situacao: string | null;
  dados: Record<string, unknown>;
  diretoria_id: number | null;
  divisao_id: number | null;
  diretoria_nome: string | null;
  divisao_nome: string | null;
  gestor_nome: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  acao: string | null;
  justificativa: string | null;
  destino_livre: string | null;
  nova_diretoria_id: number | null;
  nova_divisao_id: number | null;
  nova_diretoria_nome: string | null;
  nova_divisao_nome: string | null;
  status: string | null;
  atualizado_em: Date | null;
  atualizado_por_nome: string | null;
  homologado_em: Date | null;
  homologado_por_nome: string | null;
}

function montarItem(linha: LinhaColaborador, regras: Parameters<typeof avaliarAlertas>[1], camposOcultos: string[]) {
  const dados: Record<string, unknown> = { ...linha.dados };
  for (const chave of camposOcultos) delete dados[chave];
  return {
    id: linha.id,
    chapa: linha.chapa,
    nome: linha.nome,
    situacao: linha.situacao,
    diretoria: linha.diretoria_id ? { id: linha.diretoria_id, nome: linha.diretoria_nome } : null,
    divisao: linha.divisao_id ? { id: linha.divisao_id, nome: linha.divisao_nome } : null,
    gestor: {
      nome: linha.gestor_nome ?? (linha.dados.gestor_imediato as string) ?? null,
      usuario_id: linha.responsavel_id,
      usuario_nome: linha.responsavel_nome,
    },
    dados,
    avaliacao: {
      acao: linha.acao,
      justificativa: linha.justificativa,
      destino: linha.destino_livre,
      nova_diretoria: linha.nova_diretoria_id ? { id: linha.nova_diretoria_id, nome: linha.nova_diretoria_nome } : null,
      nova_divisao: linha.nova_divisao_id ? { id: linha.nova_divisao_id, nome: linha.nova_divisao_nome } : null,
      status: linha.status ?? 'pendente',
      atualizado_em: linha.atualizado_em,
      atualizado_por: linha.atualizado_por_nome,
      homologado_em: linha.homologado_em,
      homologado_por: linha.homologado_por_nome,
    },
    alertas: avaliarAlertas({ ...linha.dados, situacao: linha.situacao ?? linha.dados.situacao }, regras),
  };
}

/** Condição de visibilidade, montada como fragmento SQL (nunca só na tela). */
export function condicaoEscopo(sql: Variaveis['sql'], usuario: NonNullable<Variaveis['usuario']>) {
  if (usuario.perfil === 'admin') return sql`true`;
  if (usuario.perfil === 'diretor') {
    return usuario.diretorias.length
      ? sql`c.diretoria_id = ANY(${usuario.diretorias}::int[])`
      : sql`false`;
  }
  // Gestor: quem está diretamente sob ele (gestor imediato) mais a Divisão
  // atribuída, quando houver. Fora disso, não enxerga.
  return usuario.divisoes.length
    ? sql`(c.responsavel_id = ${usuario.id} OR c.divisao_id = ANY(${usuario.divisoes}::int[]))`
    : sql`c.responsavel_id = ${usuario.id}`;
}

const SELECT_BASE = (sql: Variaveis['sql']) => sql`
  SELECT c.id, c.chapa, c.nome, c.situacao, c.dados, c.diretoria_id, c.divisao_id,
         c.gestor_nome, c.responsavel_id, ur.nome AS responsavel_nome,
         dir.nome AS diretoria_nome, dvs.nome AS divisao_nome,
         a.acao, a.justificativa, a.destino_livre, a.nova_diretoria_id, a.nova_divisao_id,
         ndir.nome AS nova_diretoria_nome, ndvs.nome AS nova_divisao_nome,
         a.status, a.atualizado_em, a.homologado_em,
         ua.nome AS atualizado_por_nome, uh.nome AS homologado_por_nome
    FROM portal.colaboradores c
    LEFT JOIN portal.diretorias dir ON dir.id = c.diretoria_id
    LEFT JOIN portal.divisoes  dvs  ON dvs.id = c.divisao_id
    LEFT JOIN portal.avaliacoes a   ON a.colaborador_id = c.id
    LEFT JOIN portal.diretorias ndir ON ndir.id = a.nova_diretoria_id
    LEFT JOIN portal.divisoes  ndvs ON ndvs.id = a.nova_divisao_id
    LEFT JOIN portal.usuarios  ua   ON ua.id = a.atualizado_por
    LEFT JOIN portal.usuarios  uh   ON uh.id = a.homologado_por
    LEFT JOIN portal.usuarios  ur   ON ur.id = c.responsavel_id`;

rotasDados.get('/colaboradores', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const query = ctx.req.query();
  const ocultos = usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave);

  const condicoes = [
    sql`c.processo_id = ${contexto.processo.id}`,
    sql`c.ativo`,
    condicaoEscopo(sql, usuario),
  ];
  if (query.busca) {
    const termo = `%${query.busca.trim().toLowerCase()}%`;
    condicoes.push(sql`(lower(coalesce(c.nome,'')) LIKE ${termo} OR lower(c.chapa) LIKE ${termo})`);
  }
  if (query.diretoria_id) condicoes.push(sql`c.diretoria_id = ${Number(query.diretoria_id)}`);
  if (query.divisao_id) condicoes.push(sql`c.divisao_id = ${Number(query.divisao_id)}`);
  if (query.gestor === '__sem__') condicoes.push(sql`coalesce(c.gestor_nome, '') = ''`);
  else if (query.gestor) condicoes.push(sql`lower(c.gestor_nome) = ${query.gestor.trim().toLowerCase()}`);
  if (query.responsavel_id) condicoes.push(sql`c.responsavel_id = ${Number(query.responsavel_id)}`);
  if (query.acao === '__sem__') condicoes.push(sql`a.acao IS NULL`);
  else if (query.acao) condicoes.push(sql`a.acao = ${query.acao}`);
  if (query.status === 'pendente') condicoes.push(sql`coalesce(a.status,'pendente') = 'pendente'`);
  else if (query.status) condicoes.push(sql`a.status = ${query.status}`);

  const where = condicoes.reduce((acumulado, atual) => sql`${acumulado} AND ${atual}`);
  const porPagina = Math.min(Math.max(Number(query.por_pagina) || 50, 1), 500);
  const pagina = Math.max(Number(query.pagina) || 1, 1);

  const [{ total }] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
     WHERE ${where}`;

  const linhas = await sql<LinhaColaborador[]>`
    ${SELECT_BASE(sql)} WHERE ${where}
     ORDER BY c.nome NULLS LAST, c.chapa
     LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`;

  let itens = linhas.map((l) => montarItem(l, contexto.regras, ocultos));
  if (query.com_alerta === '1') itens = itens.filter((i) => i.alertas.length > 0);

  return ctx.json({
    total: Number(total), pagina, por_pagina: porPagina,
    paginas: Math.max(Math.ceil(Number(total) / porPagina), 1), itens,
  });
});

async function buscarLinha(sql: Variaveis['sql'], usuario: NonNullable<Variaveis['usuario']>, id: number, processoId: number) {
  const [linha] = await sql<LinhaColaborador[]>`${SELECT_BASE(sql)} WHERE c.id = ${id} AND c.processo_id = ${processoId}`;
  if (!linha) throw new ErroApi(404, 'Colaborador não encontrado.');
  if (!dentroDoEscopo(usuario, linha)) throw new ErroApi(403, 'Este colaborador está fora da sua área de responsabilidade.');
  return linha;
}

rotasDados.get('/colaboradores/:id{[0-9]+}', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const ocultos = usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave);
  const linha = await buscarLinha(sql, usuario, Number(ctx.req.param('id')), contexto.processo.id);
  return ctx.json(montarItem(linha, contexto.regras, ocultos));
});

rotasDados.get('/colaboradores/:id{[0-9]+}/historico', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const linha = await buscarLinha(sql, usuario, Number(ctx.req.param('id')), contexto.processo.id);
  const itens = await sql`
    SELECT id, usuario_nome, perfil, tipo, campo, valor_anterior, valor_novo, criado_em
      FROM portal.auditoria
     WHERE entidade = 'colaborador' AND entidade_id = ${String(linha.id)}
     ORDER BY criado_em DESC, id DESC LIMIT 200`;
  return ctx.json({ itens });
});

async function salvarAvaliacao(ctx: Ctx, id: number, entrada: Record<string, unknown>) {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const linha = await buscarLinha(sql, usuario, id, contexto.processo.id);

  if (usuario.perfil === 'gestor' && linha.status === 'homologada') {
    throw new ErroApi(409, 'Avaliação já homologada. Procure a Diretoria ou o RH para reabrir.');
  }

  const tocaAvaliacao = ['acao', 'justificativa', 'destino', 'nova_diretoria_id', 'nova_divisao_id']
    .some((chave) => chave in entrada);

  const acao = 'acao' in entrada ? ((entrada.acao as string) || null) : linha.acao;
  const justificativa = 'justificativa' in entrada
    ? (String(entrada.justificativa ?? '').trim().slice(0, 4000) || null) : linha.justificativa;
  const destino = 'destino' in entrada
    ? (String(entrada.destino ?? '').trim().slice(0, 500) || null) : linha.destino_livre;
  const novaDiretoria = 'nova_diretoria_id' in entrada ? (entrada.nova_diretoria_id as number | null) : linha.nova_diretoria_id;
  const novaDivisao = 'nova_divisao_id' in entrada ? (entrada.nova_divisao_id as number | null) : linha.nova_divisao_id;

  const alertas = avaliarAlertas({ ...linha.dados, situacao: linha.situacao }, contexto.regras);
  if (tocaAvaliacao) {
    validarAvaliacao({ acao, justificativa, destino, nova_diretoria_id: novaDiretoria ?? null },
      { acoes: contexto.acoes, campos: contexto.campos, alertas });
  }

  // Campos da base: só quem tem permissão no catálogo, e nunca campos sensíveis fora do RH.
  const dadosNovos: Record<string, unknown> = { ...linha.dados };
  const mudancas: Array<{ chave: string; anterior: unknown; novo: unknown }> = [];
  for (const [chave, valor] of Object.entries((entrada.dados as Record<string, unknown>) ?? {})) {
    const campo = contexto.campos.find((c) => c.chave === chave);
    if (!campo) throw new ErroApi(422, `Campo desconhecido: ${chave}`);
    if (campo.origem !== 'base') continue;
    if (campo.sensivel && usuario.perfil !== 'admin') throw new ErroApi(403, 'Campo restrito ao RH.');
    if (!podeEditarCampo(usuario, campo)) throw new ErroApi(403, `Você não pode editar o campo "${campo.rotulo}".`);
    const convertido = converter(valor, campo);
    if (convertido.erro) throw new ErroApi(422, convertido.erro);
    if (campo.obrigatorio && (convertido.valor === null || convertido.valor === '')) {
      throw new ErroApi(422, `O campo "${campo.rotulo}" é obrigatório.`);
    }
    if (String(linha.dados[chave] ?? '') !== String(convertido.valor ?? '')) {
      mudancas.push({ chave, anterior: linha.dados[chave], novo: convertido.valor });
    }
    dadosNovos[chave] = convertido.valor;
  }

  const status = tocaAvaliacao
    ? (linha.status === 'homologada' ? 'homologada' : acao ? 'preenchida' : 'pendente')
    : (linha.status ?? 'pendente');

  if (tocaAvaliacao) {
    await sql`
      INSERT INTO portal.avaliacoes
        (colaborador_id, acao, justificativa, destino_livre, nova_diretoria_id, nova_divisao_id, status, atualizado_por, atualizado_em)
      VALUES (${id}, ${acao}, ${justificativa}, ${destino}, ${novaDiretoria ?? null}, ${novaDivisao ?? null}, ${status}, ${usuario.id}, now())
      ON CONFLICT (colaborador_id) DO UPDATE SET
        acao = EXCLUDED.acao, justificativa = EXCLUDED.justificativa, destino_livre = EXCLUDED.destino_livre,
        nova_diretoria_id = EXCLUDED.nova_diretoria_id, nova_divisao_id = EXCLUDED.nova_divisao_id,
        status = EXCLUDED.status, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`;

    const antes: Record<string, unknown> = { acao: linha.acao, justificativa: linha.justificativa, destino: linha.destino_livre };
    const depois: Record<string, unknown> = { acao, justificativa, destino };
    for (const campo of ['acao', 'justificativa', 'destino']) {
      if (String(antes[campo] ?? '') === String(depois[campo] ?? '')) continue;
      await auditar(sql, {
        usuario, tipo: 'avaliacao', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa, campo,
        valorAnterior: antes[campo] ?? 'Sem decisão', valorNovo: depois[campo] ?? 'Sem decisão', ip: ctx.get('ip'),
      });
    }
  }

  if (mudancas.length) {
    await sql`
      UPDATE portal.colaboradores
         SET dados = ${sql.json(dadosNovos as never)}, nome = coalesce(${(dadosNovos.nome as string) ?? null}, nome), atualizado_em = now()
       WHERE id = ${id}`;
    for (const mudanca of mudancas) {
      await auditar(sql, {
        usuario, tipo: 'dado', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa,
        campo: mudanca.chave, valorAnterior: mudanca.anterior, valorNovo: mudanca.novo, ip: ctx.get('ip'),
      });
    }
  }

  const atualizada = await buscarLinha(sql, usuario, id, contexto.processo.id);
  const ocultos = usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave);
  return montarItem(atualizada, contexto.regras, ocultos);
}

rotasDados.patch('/colaboradores/:id{[0-9]+}', async (ctx) => {
  const corpo = await ctx.req.json().catch(() => ({}));
  return ctx.json(await salvarAvaliacao(ctx, Number(ctx.req.param('id')), corpo));
});

rotasDados.post('/colaboradores/avaliar-lote', async (ctx) => {
  const corpo = await ctx.req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(corpo.ids) ? corpo.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new ErroApi(400, 'Selecione ao menos um colaborador.');
  if (ids.length > 500) throw new ErroApi(400, 'Aplique a ação em no máximo 500 colaboradores por vez.');

  const entrada = {
    acao: corpo.acao === undefined ? undefined : (corpo.acao || null),
    justificativa: corpo.justificativa,
    destino: corpo.destino,
    nova_diretoria_id: corpo.nova_diretoria_id ?? null,
  };
  const erros: Array<{ id: number; erro: string }> = [];
  let aplicados = 0;
  for (const id of ids) {
    try {
      await salvarAvaliacao(ctx, id, entrada as Record<string, unknown>);
      aplicados += 1;
    } catch (erro) {
      erros.push({ id, erro: (erro as Error).message });
    }
  }
  return ctx.json({ aplicados, erros });
});

/**
 * Gravação da tela Planilha: várias linhas, vários campos, de uma vez.
 *
 * Cada linha passa pela MESMA validação de sempre (salvarAvaliacao), então a
 * grade não é um atalho para escrever onde o perfil não pode. Uma linha com
 * erro não derruba as outras: volta na lista de erros para a célula acender.
 */
rotasDados.post('/colaboradores/planilha', async (ctx) => {
  const corpo = await ctx.req.json().catch(() => ({}));
  const alteracoes: any[] = Array.isArray(corpo.alteracoes) ? corpo.alteracoes : [];
  if (!alteracoes.length) throw new ErroApi(400, 'Nada para salvar.');
  if (alteracoes.length > 500) {
    throw new ErroApi(400, `São ${alteracoes.length} linhas de uma vez. Salve em blocos de até 500.`);
  }

  const itens: unknown[] = [];
  const erros: Array<{ id: number | null; erro: string }> = [];
  for (const alteracao of alteracoes) {
    const id = Number(alteracao?.id);
    if (!Number.isInteger(id) || id <= 0) {
      erros.push({ id: alteracao?.id ?? null, erro: 'Linha sem identificador.' });
      continue;
    }
    const entrada: Record<string, unknown> = {};
    if (alteracao.dados && typeof alteracao.dados === 'object') entrada.dados = alteracao.dados;
    for (const campo of ['acao', 'justificativa', 'destino'] as const) {
      if (campo in alteracao) entrada[campo] = alteracao[campo];
    }
    try {
      itens.push(await salvarAvaliacao(ctx, id, entrada));
    } catch (erro) {
      erros.push({ id, erro: (erro as Error).message });
    }
  }
  return ctx.json({ ok: erros.length === 0, salvos: itens.length, itens, erros });
});

rotasDados.post('/colaboradores/homologar', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const contexto = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(corpo.ids) ? corpo.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new ErroApi(400, 'Selecione ao menos um colaborador.');
  const homologado = corpo.homologado !== false;

  const itens = [];
  for (const id of ids) {
    const linha = await buscarLinha(sql, usuario, id, contexto.processo.id);
    if (homologado && !linha.acao) throw new ErroApi(422, `A matrícula ${linha.chapa} ainda não tem ação indicada.`);
    await sql`
      INSERT INTO portal.avaliacoes (colaborador_id, status, homologado_por, homologado_em)
      VALUES (${id}, ${homologado ? 'homologada' : 'preenchida'}, ${homologado ? usuario.id : null}, ${homologado ? new Date() : null})
      ON CONFLICT (colaborador_id) DO UPDATE SET
        status = EXCLUDED.status, homologado_por = EXCLUDED.homologado_por, homologado_em = EXCLUDED.homologado_em`;
    await auditar(sql, {
      usuario, tipo: 'homologacao', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa, campo: 'status',
      valorAnterior: linha.status ?? 'pendente', valorNovo: homologado ? 'homologada' : 'preenchida', ip: ctx.get('ip'),
    });
    const atualizada = await buscarLinha(sql, usuario, id, contexto.processo.id);
    itens.push(montarItem(atualizada, contexto.regras, []));
  }
  return ctx.json({ ok: true, itens });
});

/* ------------------------------ dashboard ----------------------------- */
rotasDados.get('/dashboard', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const campoSoma = contexto.campos.find((c) => c.somar && c.ativo);

  const condicoes = [sql`c.processo_id = ${contexto.processo.id}`, sql`c.ativo`, condicaoEscopo(sql, usuario)];
  const query = ctx.req.query();
  if (query.diretoria_id) condicoes.push(sql`c.diretoria_id = ${Number(query.diretoria_id)}`);
  if (query.divisao_id) condicoes.push(sql`c.divisao_id = ${Number(query.divisao_id)}`);
  if (query.gestor === '__sem__') condicoes.push(sql`coalesce(c.gestor_nome, '') = ''`);
  else if (query.gestor) condicoes.push(sql`lower(c.gestor_nome) = ${query.gestor.trim().toLowerCase()}`);
  if (query.responsavel_id) condicoes.push(sql`c.responsavel_id = ${Number(query.responsavel_id)}`);
  const where = condicoes.reduce((a, b) => sql`${a} AND ${b}`);
  const soma = campoSoma
    ? sql`coalesce((c.dados->>${campoSoma.chave})::numeric, 0)`
    : sql`0`;

  const [totais] = await sql<Record<string, string>[]>`
    SELECT COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE upper(coalesce(c.situacao,'')) = 'DESLIGADO')::text AS desligados_base,
           COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados,
           COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
           COUNT(*) FILTER (WHERE a.status = 'homologada')::text AS homologadas,
           coalesce(SUM(${soma}), 0)::text AS custo_total,
           coalesce(SUM(${soma}) FILTER (WHERE ac.considera_desligamento), 0)::text AS custo_reducao
      FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
      LEFT JOIN portal.acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
     WHERE ${where}`;

  const porAcao = await sql<{ acao: string | null; total: string }[]>`
    SELECT a.acao, COUNT(*)::text AS total
      FROM portal.colaboradores c LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
     WHERE ${where} GROUP BY a.acao`;

  const agrupamento = (coluna: 'diretoria' | 'divisao') => sql`
    SELECT alvo.id, alvo.nome, ${coluna === 'divisao' ? sql`dir.nome AS diretoria,` : sql``}
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados,
           COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
           COUNT(*) FILTER (WHERE ac.considera_desligamento)::text AS desligamentos,
           COUNT(*) FILTER (WHERE ac.exige_destino)::text AS transferencias
      FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
      LEFT JOIN portal.acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
      JOIN ${coluna === 'divisao' ? sql`portal.divisoes alvo ON alvo.id = c.divisao_id
      JOIN portal.diretorias dir ON dir.id = alvo.diretoria_id` : sql`portal.diretorias alvo ON alvo.id = c.diretoria_id`}
     WHERE ${where}
     GROUP BY alvo.id, alvo.nome${coluna === 'divisao' ? sql`, dir.nome` : sql``}
     ORDER BY alvo.nome`;

  const porDiretoria = await agrupamento('diretoria');
  const porDivisao = await agrupamento('divisao');

  // Andamento por gestor imediato (a coluna da planilha), com o acesso dele ao lado.
  const porGestor = usuario.perfil === 'gestor' ? [] : await sql`
    SELECT coalesce(nullif(c.gestor_nome, ''), ur.nome, '(sem gestor informado)') AS nome,
           ur.id AS usuario_id,
           (ur.id IS NOT NULL AND ur.senha_hash IS NOT NULL) AS acesso_ativo,
           COUNT(c.id)::text AS total,
           COUNT(c.id) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
           COUNT(c.id) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados
      FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
      LEFT JOIN portal.usuarios ur ON ur.id = c.responsavel_id
     WHERE ${where}
     GROUP BY 1, 2, 3 ORDER BY pendentes DESC, 1`;

  const total = Number(totais?.total ?? 0);
  const avaliados = Number(totais?.avaliados ?? 0);

  return ctx.json({
    processo: contexto.processo,
    campo_soma: campoSoma ? { chave: campoSoma.chave, rotulo: campoSoma.rotulo } : null,
    totais: {
      total, avaliados,
      pendentes: Number(totais?.pendentes ?? 0),
      homologadas: Number(totais?.homologadas ?? 0),
      desligados_base: Number(totais?.desligados_base ?? 0),
      custo_total: Number(totais?.custo_total ?? 0),
      custo_reducao: Number(totais?.custo_reducao ?? 0),
      percentual: total ? Math.round((avaliados / total) * 100) : 0,
    },
    acoes: contexto.acoes.filter((a) => a.ativo).map((a) => ({
      valor: a.valor, cor: a.cor, total: Number(porAcao.find((p) => p.acao === a.valor)?.total ?? 0),
    })).concat([{ valor: 'Sem decisão', cor: 'pendente', total: Number(porAcao.find((p) => p.acao === null)?.total ?? 0) }]),
    por_diretoria: porDiretoria,
    por_divisao: porDivisao,
    por_gestor: porGestor,
    quebras: [],
  });
});

void normalizar;
void paraNumero;
