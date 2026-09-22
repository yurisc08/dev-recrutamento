/** Colaboradores: lista, detalhe, decisão na linha, lote, homologação e painel. */
import { agora } from '../banco.mjs';
import {
  ErroApi, avaliarAlertas, converter, dentroDoEscopo, escopoSql, exigirPerfil, podeEditarCampo, validarAvaliacao,
} from '../dominio.mjs';
import { auditar, carregarContexto } from '../contexto.mjs';

const SELECT_BASE = `
  SELECT c.id, c.chapa, c.nome, c.situacao, c.dados, c.diretoria_id, c.divisao_id,
         c.gestor_nome, c.responsavel_id, ur.nome AS responsavel_nome,
         dir.nome AS diretoria_nome, dvs.nome AS divisao_nome,
         a.acao, a.justificativa, a.destino_livre, a.nova_diretoria_id, a.nova_divisao_id,
         ndir.nome AS nova_diretoria_nome, ndvs.nome AS nova_divisao_nome,
         a.status, a.atualizado_em, a.homologado_em,
         ua.nome AS atualizado_por_nome, uh.nome AS homologado_por_nome
    FROM colaboradores c
    LEFT JOIN diretorias dir  ON dir.id = c.diretoria_id
    LEFT JOIN divisoes   dvs  ON dvs.id = c.divisao_id
    LEFT JOIN avaliacoes a    ON a.colaborador_id = c.id
    LEFT JOIN diretorias ndir ON ndir.id = a.nova_diretoria_id
    LEFT JOIN divisoes   ndvs ON ndvs.id = a.nova_divisao_id
    LEFT JOIN usuarios   ua   ON ua.id = a.atualizado_por
    LEFT JOIN usuarios   uh   ON uh.id = a.homologado_por
    LEFT JOIN usuarios   ur   ON ur.id = c.responsavel_id`;

function montarItem(linha, regras, ocultos) {
  const dados = { ...linha.dados };
  for (const chave of ocultos) delete dados[chave];
  return {
    id: linha.id,
    chapa: linha.chapa,
    nome: linha.nome,
    situacao: linha.situacao,
    diretoria: linha.diretoria_id ? { id: linha.diretoria_id, nome: linha.diretoria_nome } : null,
    divisao: linha.divisao_id ? { id: linha.divisao_id, nome: linha.divisao_nome } : null,
    gestor: {
      nome: linha.gestor_nome ?? linha.dados.gestor_imediato ?? null,
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

/** Filtros da tela (busca, diretoria, divisão, gestor, status, ação) + escopo. */
export function filtros(ctx, contexto, usuario) {
  const escopo = escopoSql(usuario);
  const condicoes = ['c.processo_id = ?', 'c.ativo = 1', escopo.sql];
  const params = [contexto.processo.id, ...escopo.params];
  const q = ctx.query;

  if (q.busca) {
    const termo = `%${q.busca.trim().toLowerCase()}%`;
    condicoes.push("(lower(coalesce(c.nome,'')) LIKE ? OR lower(c.chapa) LIKE ?)");
    params.push(termo, termo);
  }
  if (q.diretoria_id) { condicoes.push('c.diretoria_id = ?'); params.push(Number(q.diretoria_id)); }
  if (q.divisao_id) { condicoes.push('c.divisao_id = ?'); params.push(Number(q.divisao_id)); }
  if (q.gestor === '__sem__') condicoes.push("coalesce(c.gestor_nome, '') = ''");
  else if (q.gestor) { condicoes.push('lower(c.gestor_nome) = ?'); params.push(q.gestor.trim().toLowerCase()); }
  if (q.responsavel_id) { condicoes.push('c.responsavel_id = ?'); params.push(Number(q.responsavel_id)); }
  if (q.acao === '__sem__') condicoes.push('a.acao IS NULL');
  else if (q.acao) { condicoes.push('a.acao = ?'); params.push(q.acao); }
  if (q.status === 'pendente') condicoes.push("coalesce(a.status,'pendente') = 'pendente'");
  else if (q.status) { condicoes.push('a.status = ?'); params.push(q.status); }

  return { onde: condicoes.join(' AND '), params };
}

const ocultosPara = (usuario, contexto) =>
  (usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave));

function buscarLinha(ctx, usuario, id, processoId) {
  const linha = ctx.acesso.primeiro(`${SELECT_BASE} WHERE c.id = ? AND c.processo_id = ?`, id, processoId);
  if (!linha) throw new ErroApi(404, 'Colaborador não encontrado.');
  if (!dentroDoEscopo(usuario, linha)) throw new ErroApi(403, 'Este colaborador está fora da sua área de responsabilidade.');
  return linha;
}

/** Teto por gravação, para uma colada gigante não virar uma transação eterna. */
const LIMITE_PLANILHA = 500;

function salvarAvaliacao(ctx, id, entrada) {
  const usuario = ctx.usuario;
  const contexto = carregarContexto(ctx.acesso);
  const linha = buscarLinha(ctx, usuario, id, contexto.processo.id);

  if (usuario.perfil === 'gestor' && linha.status === 'homologada') {
    throw new ErroApi(409, 'Avaliação já homologada. Procure a Diretoria ou o RH para reabrir.');
  }

  const tem = (chave) => Object.prototype.hasOwnProperty.call(entrada, chave);
  const tocaAvaliacao = ['acao', 'justificativa', 'destino', 'nova_diretoria_id', 'nova_divisao_id'].some(tem);

  const acao = tem('acao') ? (entrada.acao || null) : linha.acao;
  const justificativa = tem('justificativa')
    ? (String(entrada.justificativa ?? '').trim().slice(0, 4000) || null) : linha.justificativa;
  const destino = tem('destino')
    ? (String(entrada.destino ?? '').trim().slice(0, 500) || null) : linha.destino_livre;
  const novaDiretoria = tem('nova_diretoria_id') ? (entrada.nova_diretoria_id ?? null) : linha.nova_diretoria_id;
  const novaDivisao = tem('nova_divisao_id') ? (entrada.nova_divisao_id ?? null) : linha.nova_divisao_id;

  const alertas = avaliarAlertas({ ...linha.dados, situacao: linha.situacao }, contexto.regras);
  if (tocaAvaliacao) {
    validarAvaliacao({ acao, justificativa, destino, nova_diretoria_id: novaDiretoria ?? null },
      { acoes: contexto.acoes, campos: contexto.campos, alertas });
  }

  // Campos da base: só quem pode pelo catálogo, e nunca campo sensível fora do RH.
  const dadosNovos = { ...linha.dados };
  const mudancas = [];
  for (const [chave, valor] of Object.entries(entrada.dados ?? {})) {
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
    ctx.acesso.executar(`
      INSERT INTO avaliacoes (colaborador_id, acao, justificativa, destino_livre, nova_diretoria_id,
                              nova_divisao_id, status, atualizado_por, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (colaborador_id) DO UPDATE SET
        acao = excluded.acao, justificativa = excluded.justificativa, destino_livre = excluded.destino_livre,
        nova_diretoria_id = excluded.nova_diretoria_id, nova_divisao_id = excluded.nova_divisao_id,
        status = excluded.status, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em`,
      id, acao, justificativa, destino, novaDiretoria ?? null, novaDivisao ?? null, status, usuario.id, agora());

    const antes = { acao: linha.acao, justificativa: linha.justificativa, destino: linha.destino_livre };
    const depois = { acao, justificativa, destino };
    for (const campo of ['acao', 'justificativa', 'destino']) {
      if (String(antes[campo] ?? '') === String(depois[campo] ?? '')) continue;
      auditar(ctx.acesso, {
        usuario, tipo: 'avaliacao', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa, campo,
        valorAnterior: antes[campo] ?? 'Sem decisão', valorNovo: depois[campo] ?? 'Sem decisão', ip: ctx.ip,
      });
    }
  }

  if (mudancas.length) {
    ctx.acesso.executar(
      'UPDATE colaboradores SET dados = ?, nome = coalesce(?, nome), atualizado_em = ? WHERE id = ?',
      JSON.stringify(dadosNovos), dadosNovos.nome ?? null, agora(), id);
    for (const mudanca of mudancas) {
      auditar(ctx.acesso, {
        usuario, tipo: 'dado', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa,
        campo: mudanca.chave, valorAnterior: mudanca.anterior, valorNovo: mudanca.novo, ip: ctx.ip,
      });
    }
  }

  return montarItem(buscarLinha(ctx, usuario, id, contexto.processo.id), contexto.regras, ocultosPara(usuario, contexto));
}

export const rotasDados = [
  ['GET', '/api/colaboradores', async (ctx) => {
    const usuario = ctx.usuario;
    const contexto = carregarContexto(ctx.acesso);
    const { onde, params } = filtros(ctx, contexto, usuario);

    const porPagina = Math.min(Math.max(Number(ctx.query.por_pagina) || 50, 1), 500);
    const pagina = Math.max(Number(ctx.query.pagina) || 1, 1);

    const total = Number(ctx.acesso.primeiro(`
      SELECT COUNT(*) AS total FROM colaboradores c
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       WHERE ${onde}`, ...params)?.total ?? 0);

    const linhas = ctx.acesso.consultar(`
      ${SELECT_BASE} WHERE ${onde}
       ORDER BY c.nome IS NULL, c.nome, c.chapa
       LIMIT ? OFFSET ?`, ...params, porPagina, (pagina - 1) * porPagina);

    let itens = linhas.map((l) => montarItem(l, contexto.regras, ocultosPara(usuario, contexto)));
    if (ctx.query.com_alerta === '1') itens = itens.filter((i) => i.alertas.length > 0);

    return { total, pagina, por_pagina: porPagina, paginas: Math.max(Math.ceil(total / porPagina), 1), itens };
  }],

  ['GET', /^\/api\/colaboradores\/(\d+)$/, async (ctx) => {
    const contexto = carregarContexto(ctx.acesso);
    const linha = buscarLinha(ctx, ctx.usuario, Number(ctx.params[0]), contexto.processo.id);
    return montarItem(linha, contexto.regras, ocultosPara(ctx.usuario, contexto));
  }],

  ['GET', /^\/api\/colaboradores\/(\d+)\/historico$/, async (ctx) => {
    const contexto = carregarContexto(ctx.acesso);
    const linha = buscarLinha(ctx, ctx.usuario, Number(ctx.params[0]), contexto.processo.id);
    const itens = ctx.acesso.consultar(`
      SELECT id, usuario_nome, perfil, tipo, campo, valor_anterior, valor_novo, criado_em
        FROM auditoria WHERE entidade = 'colaborador' AND entidade_id = ?
       ORDER BY criado_em DESC, id DESC LIMIT 200`, String(linha.id));
    return { itens };
  }],

  ['PATCH', /^\/api\/colaboradores\/(\d+)$/, async (ctx) => salvarAvaliacao(ctx, Number(ctx.params[0]), await ctx.corpo())],

  ['POST', '/api/colaboradores/avaliar-lote', async (ctx) => {
    const corpo = await ctx.corpo();
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map(Number) : [];
    if (!ids.length) throw new ErroApi(422, 'Selecione ao menos um colaborador.');
    const atualizados = [];
    const erros = [];
    for (const id of ids) {
      try {
        atualizados.push(salvarAvaliacao(ctx, id, {
          acao: corpo.acao ?? null,
          justificativa: corpo.justificativa ?? null,
          destino: corpo.destino ?? null,
        }));
      } catch (erro) {
        erros.push({ id, erro: erro.message });
      }
    }
    return { ok: true, atualizados: atualizados.length, itens: atualizados, erros };
  }],

  /**
   * Gravação da tela Planilha: várias linhas, vários campos, de uma vez.
   *
   * Cada linha passa pela MESMA validação de sempre (salvarAvaliacao), então a
   * grade não é um atalho para escrever onde o perfil não pode. Uma linha com
   * erro não derruba as outras: volta na lista de erros para a célula acender.
   */
  ['POST', '/api/colaboradores/planilha', async (ctx) => {
    const corpo = await ctx.corpo();
    const alteracoes = Array.isArray(corpo.alteracoes) ? corpo.alteracoes : [];
    if (!alteracoes.length) throw new ErroApi(422, 'Nada para salvar.');
    if (alteracoes.length > LIMITE_PLANILHA) {
      throw new ErroApi(422, `São ${alteracoes.length} linhas de uma vez. Salve em blocos de até ${LIMITE_PLANILHA}.`);
    }

    const itens = [];
    const erros = [];
    for (const alteracao of alteracoes) {
      const id = Number(alteracao?.id);
      if (!Number.isInteger(id) || id <= 0) {
        erros.push({ id: alteracao?.id ?? null, erro: 'Linha sem identificador.' });
        continue;
      }
      try {
        itens.push(salvarAvaliacao(ctx, id, {
          ...(alteracao.dados && typeof alteracao.dados === 'object' ? { dados: alteracao.dados } : {}),
          ...('acao' in alteracao ? { acao: alteracao.acao } : {}),
          ...('justificativa' in alteracao ? { justificativa: alteracao.justificativa } : {}),
          ...('destino' in alteracao ? { destino: alteracao.destino } : {}),
        }));
      } catch (erro) {
        erros.push({ id, erro: erro.message });
      }
    }
    return { ok: erros.length === 0, salvos: itens.length, itens, erros };
  }],

  ['POST', '/api/colaboradores/homologar', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const corpo = await ctx.corpo();
    const contexto = carregarContexto(ctx.acesso);
    const homologado = corpo.homologado !== false;
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map(Number) : [];
    const itens = [];

    for (const id of ids) {
      const linha = buscarLinha(ctx, usuario, id, contexto.processo.id);
      if (homologado && !linha.acao) throw new ErroApi(422, `A matrícula ${linha.chapa} ainda não tem ação indicada.`);
      ctx.acesso.executar(`
        INSERT INTO avaliacoes (colaborador_id, status, homologado_por, homologado_em)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (colaborador_id) DO UPDATE SET
          status = excluded.status, homologado_por = excluded.homologado_por, homologado_em = excluded.homologado_em`,
        id, homologado ? 'homologada' : 'preenchida', homologado ? usuario.id : null, homologado ? agora() : null);
      auditar(ctx.acesso, {
        usuario, tipo: 'homologacao', entidade: 'colaborador', entidadeId: id, chapa: linha.chapa, campo: 'status',
        valorAnterior: linha.status ?? 'pendente', valorNovo: homologado ? 'homologada' : 'preenchida', ip: ctx.ip,
      });
      itens.push(montarItem(buscarLinha(ctx, usuario, id, contexto.processo.id), contexto.regras, []));
    }
    return { ok: true, itens };
  }],

  ['GET', '/api/dashboard', async (ctx) => {
    const usuario = ctx.usuario;
    const contexto = carregarContexto(ctx.acesso);
    const campoSoma = contexto.campos.find((c) => c.somar && c.ativo);
    const { onde, params } = filtros(ctx, contexto, usuario);
    const soma = campoSoma
      ? `coalesce(CAST(json_extract(c.dados, '$.${campoSoma.chave}') AS REAL), 0)`
      : '0';

    const totais = ctx.acesso.primeiro(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN upper(coalesce(c.situacao,'')) = 'DESLIGADO' THEN 1 ELSE 0 END) AS desligados_base,
             SUM(CASE WHEN a.acao IS NOT NULL THEN 1 ELSE 0 END) AS avaliados,
             SUM(CASE WHEN a.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
             SUM(CASE WHEN a.status = 'homologada' THEN 1 ELSE 0 END) AS homologadas,
             coalesce(SUM(${soma}), 0) AS custo_total,
             coalesce(SUM(CASE WHEN ac.considera_desligamento = 1 THEN ${soma} ELSE 0 END), 0) AS custo_reducao
        FROM colaboradores c
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
        LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
       WHERE ${onde}`, ...params);

    const porAcao = ctx.acesso.consultar(`
      SELECT a.acao AS acao, COUNT(*) AS total
        FROM colaboradores c LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       WHERE ${onde} GROUP BY a.acao`, ...params);

    const agrupar = (coluna) => ctx.acesso.consultar(`
      SELECT alvo.id AS id, alvo.nome AS nome,
             ${coluna === 'divisao' ? 'dir.nome AS diretoria,' : ''}
             COUNT(*) AS total,
             SUM(CASE WHEN a.acao IS NOT NULL THEN 1 ELSE 0 END) AS avaliados,
             SUM(CASE WHEN a.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
             SUM(CASE WHEN ac.considera_desligamento = 1 THEN 1 ELSE 0 END) AS desligamentos,
             SUM(CASE WHEN ac.exige_destino = 1 THEN 1 ELSE 0 END) AS transferencias
        FROM colaboradores c
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
        LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
        ${coluna === 'divisao'
          ? 'JOIN divisoes alvo ON alvo.id = c.divisao_id JOIN diretorias dir ON dir.id = alvo.diretoria_id'
          : 'JOIN diretorias alvo ON alvo.id = c.diretoria_id'}
       WHERE ${onde}
       GROUP BY alvo.id, alvo.nome${coluna === 'divisao' ? ', dir.nome' : ''}
       ORDER BY alvo.nome`, ...params);

    const porGestor = usuario.perfil === 'gestor' ? [] : ctx.acesso.consultar(`
      SELECT coalesce(nullif(c.gestor_nome, ''), ur.nome, '(sem gestor informado)') AS nome,
             ur.id AS usuario_id,
             (CASE WHEN ur.id IS NOT NULL AND ur.senha_hash IS NOT NULL THEN 1 ELSE 0 END) AS acesso_ativo,
             COUNT(c.id) AS total,
             SUM(CASE WHEN a.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
             SUM(CASE WHEN a.acao IS NOT NULL THEN 1 ELSE 0 END) AS avaliados
        FROM colaboradores c
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
        LEFT JOIN usuarios ur ON ur.id = c.responsavel_id
       WHERE ${onde}
       GROUP BY 1, 2, 3 ORDER BY pendentes DESC, 1`, ...params);

    const total = Number(totais?.total ?? 0);
    const avaliados = Number(totais?.avaliados ?? 0);

    return {
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
      por_diretoria: agrupar('diretoria'),
      por_divisao: agrupar('divisao'),
      por_gestor: porGestor,
      quebras: [],
    };
  }],
];

export { SELECT_BASE, montarItem, ocultosPara };
