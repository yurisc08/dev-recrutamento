import { Hono } from 'hono';
import type { Ambiente, Variaveis } from '../tipos.js';
import { ErroApi, avaliarAlertas, carregarContexto, converter, exigirPerfil, normalizar } from '../dominio.js';
import { auditar } from '../auditoria.js';

export const rotasPlanilha = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

/**
 * A leitura do .xlsx acontece no navegador (o Worker não roda bibliotecas de
 * Excel). A API recebe as linhas já em JSON, valida, compara com a base e só
 * grava depois da confirmação — nunca perdendo as decisões já registradas.
 */
interface EntradaCarga {
  arquivo?: string;
  aba?: string;
  mapeamento?: Record<string, string>;
  linhas?: Array<Record<string, unknown>>;
  importar_decisoes?: boolean;
  criar_estrutura?: boolean;
}

interface Preparada {
  chapa: string;
  nome: string | null;
  dados: Record<string, unknown>;
  decisao: { acao?: string | null; destino?: string | null; justificativa?: string | null };
  erros: string[];
  linha: number;
}

async function prepararLinhas(sql: Variaveis['sql'], entrada: EntradaCarga): Promise<Preparada[]> {
  const { campos } = await carregarContexto(sql);
  const mapeamento = entrada.mapeamento ?? {};
  const porChave = new Map(campos.map((c) => [c.chave, c]));
  if (!mapeamento.chapa) throw new ErroApi(422, 'Indique qual coluna da planilha contém a matrícula (CHAPA).');

  return (entrada.linhas ?? []).map((registro, indice) => {
    const preparada: Preparada = { chapa: '', nome: null, dados: {}, decisao: {}, erros: [], linha: indice + 2 };
    for (const [chaveCampo, coluna] of Object.entries(mapeamento)) {
      if (!coluna) continue;
      const bruto = registro[coluna];
      const campo = porChave.get(chaveCampo);
      if (!campo) continue;
      if (campo.origem === 'avaliacao') {
        const texto = bruto === null || bruto === undefined ? '' : String(bruto).trim();
        if (chaveCampo === 'acao') preparada.decisao.acao = texto || null;
        else if (chaveCampo === 'destino') preparada.decisao.destino = texto || null;
        else if (chaveCampo === 'justificativa') preparada.decisao.justificativa = texto || null;
        continue;
      }
      const convertido = converter(bruto, campo);
      if (convertido.erro) { preparada.erros.push(convertido.erro); continue; }
      if (campo.obrigatorio && (convertido.valor === null || convertido.valor === '')) {
        preparada.erros.push(`"${campo.rotulo}" é obrigatório.`);
      }
      preparada.dados[campo.chave] = convertido.valor;
    }
    preparada.chapa = String(preparada.dados.chapa ?? '').trim();
    preparada.nome = (preparada.dados.nome as string) ?? null;
    if (!preparada.chapa) preparada.erros.push('Linha sem matrícula (CHAPA).');
    return preparada;
  });
}

async function compararComBase(sql: Variaveis['sql'], processoId: number, linhas: Preparada[]) {
  const chapas = linhas.map((l) => l.chapa).filter(Boolean);
  const existentes = chapas.length
    ? await sql<{ id: number; chapa: string; nome: string | null; dados: Record<string, unknown>; tem_avaliacao: boolean }[]>`
        SELECT c.id, c.chapa, c.nome, c.dados, (a.id IS NOT NULL AND a.acao IS NOT NULL) AS tem_avaliacao
          FROM portal.colaboradores c LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
         WHERE c.processo_id = ${processoId} AND c.chapa = ANY(${chapas}::text[])`
    : [];
  const mapa = new Map(existentes.map((e) => [e.chapa, e]));

  const resultado = {
    total: linhas.length,
    novos: [] as Array<{ linha: number; chapa: string; nome: string | null }>,
    alterados: [] as Array<{ chapa: string; nome: string | null; mudancas: Array<{ campo: string; de: unknown; para: unknown }> }>,
    inalterados: 0,
    erros: [] as Array<{ linha: number; chapa: string; erro: string }>,
    com_avaliacao: 0,
  };

  for (const linha of linhas) {
    if (linha.erros.length) {
      resultado.erros.push({ linha: linha.linha, chapa: linha.chapa, erro: linha.erros.join(' ') });
      continue;
    }
    const existente = mapa.get(linha.chapa);
    if (!existente) { resultado.novos.push({ linha: linha.linha, chapa: linha.chapa, nome: linha.nome }); continue; }
    if (existente.tem_avaliacao) resultado.com_avaliacao += 1;
    const mudancas = Object.entries(linha.dados)
      .filter(([chave, valor]) => String(existente.dados[chave] ?? '') !== String(valor ?? ''))
      .map(([chave, valor]) => ({ campo: chave, de: existente.dados[chave] ?? null, para: valor }));
    if (mudancas.length) resultado.alterados.push({ chapa: linha.chapa, nome: linha.nome, mudancas });
    else resultado.inalterados += 1;
  }
  return { resultado, mapa };
}

rotasPlanilha.post('/importacao/simular', async (ctx) => {
  const sql = ctx.get('sql');
  exigirPerfil(ctx.get('usuario'), 'admin');
  const { processo } = await carregarContexto(sql);
  const entrada = (await ctx.req.json().catch(() => ({}))) as EntradaCarga;
  const linhas = await prepararLinhas(sql, entrada);
  const { resultado } = await compararComBase(sql, processo.id, linhas);

  return ctx.json({
    total_linhas: resultado.total,
    novos: resultado.novos.length,
    alterados: resultado.alterados.length,
    inalterados: resultado.inalterados,
    erros: resultado.erros.length,
    com_avaliacao: resultado.com_avaliacao,
    amostra_novos: resultado.novos.slice(0, 20),
    amostra_alterados: resultado.alterados.slice(0, 20),
    amostra_erros: resultado.erros.slice(0, 20),
  });
});

rotasPlanilha.post('/importacao/confirmar', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const contexto = await carregarContexto(sql);
  const entrada = (await ctx.req.json().catch(() => ({}))) as EntradaCarga;
  const criarEstrutura = entrada.criar_estrutura !== false;
  const importarDecisoes = entrada.importar_decisoes === true;

  const linhas = await prepararLinhas(sql, entrada);
  const { resultado, mapa } = await compararComBase(sql, contexto.processo.id, linhas);

  const [importacao] = await sql<{ id: number }[]>`
    INSERT INTO portal.importacoes (processo_id, usuario_id, usuario_nome, arquivo, aba, data_base,
                                    linhas, novos, alterados, inalterados, erros, resumo)
    VALUES (${contexto.processo.id}, ${usuario.id}, ${usuario.nome}, ${String(entrada.arquivo ?? '').slice(0, 200)},
            ${String(entrada.aba ?? '').slice(0, 120)}, ${contexto.processo.data_base},
            ${resultado.total}, ${resultado.novos.length}, ${resultado.alterados.length},
            ${resultado.inalterados}, ${resultado.erros.length},
            ${sql.json({ erros: resultado.erros.slice(0, 200), importou_decisoes: importarDecisoes } as never)})
    RETURNING id`;

  const cacheDiretorias = new Map<string, number>();
  const cacheDivisoes = new Map<string, number>();
  const cacheGestores = new Map<string, number | null>();
  let gestoresCadastrados: Array<{ id: number; nome: string }> | null = null;

  /**
   * Gestor imediato: o nome vem da planilha e, quando esse gestor já responde
   * por alguém no portal (ou tem acesso com o mesmo nome), o vínculo é refeito
   * sozinho. Recarga nenhuma desfaz uma atribuição já existente.
   */
  const acharResponsavel = async (nomeGestor: string): Promise<number | null> => {
    const chave = normalizar(nomeGestor);
    if (!chave) return null;
    if (cacheGestores.has(chave)) return cacheGestores.get(chave)!;

    const [jaAtribuido] = await sql<{ responsavel_id: number }[]>`
      SELECT responsavel_id FROM portal.colaboradores
       WHERE processo_id = ${contexto.processo.id} AND responsavel_id IS NOT NULL
         AND lower(coalesce(gestor_nome, '')) = ${nomeGestor.trim().toLowerCase()}
       LIMIT 1`;
    let id: number | null = jaAtribuido?.responsavel_id ?? null;

    if (!id) {
      // comparação por nome sem acento/caixa é feita aqui, não no SQL
      if (!gestoresCadastrados) {
        gestoresCadastrados = await sql<{ id: number; nome: string }[]>`
          SELECT id, nome FROM portal.usuarios WHERE perfil = 'gestor' AND ativo`;
      }
      id = gestoresCadastrados.find((g) => normalizar(g.nome) === chave)?.id ?? null;
    }
    cacheGestores.set(chave, id);
    return id;
  };

  const acharDiretoria = async (nome: string): Promise<number | null> => {
    const chave = nome.trim();
    if (!chave) return null;
    if (cacheDiretorias.has(chave)) return cacheDiretorias.get(chave)!;
    const [achada] = await sql<{ id: number }[]>`
      SELECT id FROM portal.diretorias WHERE processo_id = ${contexto.processo.id} AND nome = ${chave}`;
    let id = achada?.id;
    if (!id && criarEstrutura) {
      const [criada] = await sql<{ id: number }[]>`
        INSERT INTO portal.diretorias (processo_id, nome) VALUES (${contexto.processo.id}, ${chave}) RETURNING id`;
      id = criada.id;
    }
    if (id) cacheDiretorias.set(chave, id);
    return id ?? null;
  };

  const acharDivisao = async (nome: string, diretoriaId: number | null): Promise<number | null> => {
    if (!nome.trim() || !diretoriaId) return null;
    const chave = `${diretoriaId}::${nome.trim()}`;
    if (cacheDivisoes.has(chave)) return cacheDivisoes.get(chave)!;
    const [achada] = await sql<{ id: number }[]>`
      SELECT id FROM portal.divisoes WHERE diretoria_id = ${diretoriaId} AND nome = ${nome.trim()}`;
    let id = achada?.id;
    if (!id && criarEstrutura) {
      const [criada] = await sql<{ id: number }[]>`
        INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${diretoriaId}, ${nome.trim()}) RETURNING id`;
      id = criada.id;
    }
    if (id) cacheDivisoes.set(chave, id);
    return id ?? null;
  };

  for (const linha of linhas) {
    if (linha.erros.length) continue;
    const existente = mapa.get(linha.chapa);
    const dados = { ...(existente?.dados ?? {}), ...linha.dados };
    const diretoriaId = await acharDiretoria(String(dados.diretoria ?? ''));
    const divisaoId = await acharDivisao(String(dados.divisao ?? ''), diretoriaId);
    const nome = (dados.nome as string) ?? existente?.nome ?? null;
    const situacao = (dados.situacao as string) ?? null;
    const gestorNome = String(dados.gestor_imediato ?? '').trim() || null;
    const gerenteNome = String(dados.gerente ?? '').trim() || null;
    const diretorNome = String(dados.diretor ?? '').trim() || null;
    const responsavelId = gestorNome ? await acharResponsavel(gestorNome) : null;

    let colaboradorId: number;
    if (existente) {
      await sql`
        UPDATE portal.colaboradores
           SET nome = ${nome}, situacao = ${situacao}, dados = ${sql.json(dados as never)},
               diretoria_id = coalesce(${diretoriaId}, diretoria_id),
               divisao_id = coalesce(${divisaoId}, divisao_id),
               gestor_nome = coalesce(${gestorNome}, gestor_nome),
               gerente_nome = coalesce(${gerenteNome}, gerente_nome),
               diretor_nome = coalesce(${diretorNome}, diretor_nome),
               responsavel_id = coalesce(${responsavelId}, responsavel_id),
               ativo = true, importacao_id = ${importacao.id}, atualizado_em = now()
         WHERE id = ${existente.id}`;
      colaboradorId = existente.id;
    } else {
      const [criado] = await sql<{ id: number }[]>`
        INSERT INTO portal.colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id,
                                          gestor_nome, gerente_nome, diretor_nome, responsavel_id, importacao_id)
        VALUES (${contexto.processo.id}, ${linha.chapa}, ${nome}, ${situacao}, ${sql.json(dados as never)},
                ${diretoriaId}, ${divisaoId}, ${gestorNome}, ${gerenteNome}, ${diretorNome},
                ${responsavelId}, ${importacao.id})
        RETURNING id`;
      colaboradorId = criado.id;
    }

    if (importarDecisoes && (linha.decisao.acao || linha.decisao.justificativa || linha.decisao.destino)) {
      const acaoValida = linha.decisao.acao
        ? contexto.acoes.find((a) => normalizar(a.valor) === normalizar(linha.decisao.acao))?.valor ?? null
        : null;
      await sql`
        INSERT INTO portal.avaliacoes (colaborador_id, acao, justificativa, destino_livre, status, atualizado_por, atualizado_em)
        VALUES (${colaboradorId}, ${acaoValida}, ${linha.decisao.justificativa ?? null}, ${linha.decisao.destino ?? null},
                ${acaoValida ? 'preenchida' : 'pendente'}, ${usuario.id}, now())
        ON CONFLICT (colaborador_id) DO UPDATE SET
          acao = EXCLUDED.acao, justificativa = EXCLUDED.justificativa, destino_livre = EXCLUDED.destino_livre,
          status = EXCLUDED.status, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`;
    }
  }

  // cada campo alterado entra na trilha, com origem "importacao"
  for (const alterado of resultado.alterados) {
    for (const mudanca of alterado.mudancas) {
      await auditar(sql, {
        usuario, tipo: 'importacao', entidade: 'colaborador', chapa: alterado.chapa, campo: mudanca.campo,
        valorAnterior: mudanca.de, valorNovo: mudanca.para, detalhes: { importacao_id: importacao.id }, ip: ctx.get('ip'),
      });
    }
  }
  await auditar(sql, {
    usuario, tipo: 'importacao', entidade: 'importacao', entidadeId: importacao.id,
    detalhes: { arquivo: entrada.arquivo ?? '', linhas: resultado.total, novos: resultado.novos.length,
      alterados: resultado.alterados.length, erros: resultado.erros.length, importou_decisoes: importarDecisoes },
    ip: ctx.get('ip'),
  });

  // "alterados" conta quem realmente mudou de conteúdo; quem veio igual entra em "inalterados".
  return ctx.json({
    ok: true, importacao_id: importacao.id, linhas: resultado.total,
    novos: resultado.novos.length, alterados: resultado.alterados.length, inalterados: resultado.inalterados,
    erros: resultado.erros.slice(0, 50), total_erros: resultado.erros.length,
  });
});

/** Dados para o navegador montar o .xlsx (Resumo + Base Decisões + Auditoria). */
rotasPlanilha.get('/exportacao/dados', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = ctx.get('usuario')!;
  const contexto = await carregarContexto(sql);
  const ocultos = usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave);

  const condicoes = [sql`c.processo_id = ${contexto.processo.id}`, sql`c.ativo`];
  if (usuario.perfil === 'diretor') {
    condicoes.push(usuario.diretorias.length ? sql`c.diretoria_id = ANY(${usuario.diretorias}::int[])` : sql`false`);
  } else if (usuario.perfil === 'gestor') {
    condicoes.push(usuario.divisoes.length ? sql`c.divisao_id = ANY(${usuario.divisoes}::int[])` : sql`false`);
  }

  // Os mesmos filtros da tela de colaboradores, para exportar exatamente o que está à vista.
  const query = ctx.req.query();
  if (query.busca) {
    const termo = `%${query.busca.trim().toLowerCase()}%`;
    condicoes.push(sql`(lower(coalesce(c.nome,'')) LIKE ${termo} OR lower(c.chapa) LIKE ${termo})`);
  }
  if (query.diretoria_id) condicoes.push(sql`c.diretoria_id = ${Number(query.diretoria_id)}`);
  if (query.divisao_id) condicoes.push(sql`c.divisao_id = ${Number(query.divisao_id)}`);
  if (query.acao === '__sem__') condicoes.push(sql`a.acao IS NULL`);
  else if (query.acao) condicoes.push(sql`a.acao = ${query.acao}`);
  if (query.status === 'pendente') condicoes.push(sql`coalesce(a.status,'pendente') = 'pendente'`);
  else if (query.status) condicoes.push(sql`a.status = ${query.status}`);
  const where = condicoes.reduce((a, b) => sql`${a} AND ${b}`);

  const linhas = await sql<Array<Record<string, unknown>>>`
    SELECT c.chapa, c.nome, c.situacao, c.dados,
           dir.nome AS diretoria, dvs.nome AS divisao, c.gestor_nome AS gestor_imediato,
           a.acao, a.justificativa, a.destino_livre, a.status, a.atualizado_em,
           ua.nome AS atualizado_por, uh.nome AS homologado_por, a.homologado_em
      FROM portal.colaboradores c
      LEFT JOIN portal.diretorias dir ON dir.id = c.diretoria_id
      LEFT JOIN portal.divisoes dvs ON dvs.id = c.divisao_id
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
      LEFT JOIN portal.usuarios ua ON ua.id = a.atualizado_por
      LEFT JOIN portal.usuarios uh ON uh.id = a.homologado_por
     WHERE ${where} ORDER BY dir.nome, dvs.nome, c.nome`;

  const itens = linhas.map((linha) => {
    const dados = { ...(linha.dados as Record<string, unknown>) };
    for (const chave of ocultos) delete dados[chave];
    return {
      ...linha,
      dados,
      alertas: avaliarAlertas({ ...dados, situacao: linha.situacao }, contexto.regras).map((a) => a.mensagem),
    };
  });

  const visiveis = query.com_alerta === '1' ? itens.filter((i) => i.alertas.length > 0) : itens;

  const auditoria = usuario.perfil === 'gestor' ? [] : await sql`
    SELECT criado_em, usuario_nome, perfil, tipo, chapa, campo, valor_anterior, valor_novo
      FROM portal.auditoria ORDER BY criado_em DESC LIMIT 1500`;

  await auditar(sql, {
    usuario, tipo: 'exportacao', entidade: 'planilha',
    detalhes: { registros: visiveis.length }, ip: ctx.get('ip'),
  });

  return ctx.json({
    processo: contexto.processo,
    campos: contexto.campos.filter((c) => c.ativo && c.origem === 'base' && !ocultos.includes(c.chave)),
    acoes: contexto.acoes.filter((a) => a.ativo).map((a) => a.valor),
    itens: visiveis,
    auditoria,
  });
});
