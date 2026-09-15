/**
 * Importação e exportação.
 *
 * O .xlsx é lido e montado no navegador de quem opera; por aqui trafega só JSON.
 * A carga casa pela matrícula, mostra o que vai mudar antes de gravar e nunca
 * apaga decisão já registrada no portal.
 */
import { agora } from '../banco.mjs';
import { ErroApi, avaliarAlertas, converter, escopoSql, exigirPerfil, semAcento } from '../dominio.mjs';
import { auditar, carregarContexto } from '../contexto.mjs';

function prepararLinhas(ctx, entrada) {
  const { campos } = carregarContexto(ctx.acesso);
  const mapeamento = entrada.mapeamento ?? {};
  const porChave = new Map(campos.map((c) => [c.chave, c]));
  if (!mapeamento.chapa) throw new ErroApi(422, 'Indique qual coluna da planilha contém a matrícula (CHAPA).');

  return (entrada.linhas ?? []).map((registro, indice) => {
    const preparada = { chapa: '', nome: null, dados: {}, decisao: {}, erros: [], linha: indice + 2 };
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
    preparada.nome = preparada.dados.nome ?? null;
    if (!preparada.chapa) preparada.erros.push('Linha sem matrícula (CHAPA).');
    return preparada;
  });
}

function compararComBase(ctx, processoId, linhas) {
  const chapas = linhas.map((l) => l.chapa).filter(Boolean);
  const existentes = chapas.length
    ? ctx.acesso.consultar(`
        SELECT c.id, c.chapa, c.nome, c.dados,
               (CASE WHEN a.id IS NOT NULL AND a.acao IS NOT NULL THEN 1 ELSE 0 END) AS tem_avaliacao
          FROM colaboradores c LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
         WHERE c.processo_id = ? AND c.chapa IN (${chapas.map(() => '?').join(', ')})`, processoId, ...chapas)
    : [];
  const mapa = new Map(existentes.map((e) => [e.chapa, e]));

  const resultado = { total: linhas.length, novos: [], alterados: [], inalterados: 0, erros: [], com_avaliacao: 0 };
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

export const rotasPlanilha = [
  ['POST', '/api/importacao/simular', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin');
    const { processo } = carregarContexto(ctx.acesso);
    const entrada = await ctx.corpo();
    const linhas = prepararLinhas(ctx, entrada);
    const { resultado } = compararComBase(ctx, processo.id, linhas);

    return {
      total_linhas: resultado.total,
      novos: resultado.novos.length,
      alterados: resultado.alterados.length,
      inalterados: resultado.inalterados,
      erros: resultado.erros.length,
      com_avaliacao: resultado.com_avaliacao,
      amostra_novos: resultado.novos.slice(0, 20),
      amostra_alterados: resultado.alterados.slice(0, 20),
      amostra_erros: resultado.erros.slice(0, 20),
    };
  }],

  ['POST', '/api/importacao/confirmar', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const contexto = carregarContexto(ctx.acesso);
    const entrada = await ctx.corpo();
    const criarEstrutura = entrada.criar_estrutura !== false;
    const importarDecisoes = entrada.importar_decisoes === true;

    const linhas = prepararLinhas(ctx, entrada);
    const { resultado, mapa } = compararComBase(ctx, contexto.processo.id, linhas);

    const importacao = ctx.acesso.executar(`
      INSERT INTO importacoes (processo_id, usuario_id, usuario_nome, arquivo, aba, data_base,
                               linhas, novos, alterados, inalterados, erros, resumo, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contexto.processo.id, usuario.id, usuario.nome, String(entrada.arquivo ?? '').slice(0, 200),
      String(entrada.aba ?? '').slice(0, 120), contexto.processo.data_base,
      resultado.total, resultado.novos.length, resultado.alterados.length, resultado.inalterados,
      resultado.erros.length,
      JSON.stringify({ erros: resultado.erros.slice(0, 200), importou_decisoes: importarDecisoes }), agora());
    const importacaoId = Number(importacao.lastInsertRowid);

    const cacheDiretorias = new Map();
    const cacheDivisoes = new Map();
    const cacheGestores = new Map();
    let gestoresCadastrados = null;

    const acharDiretoria = (nome) => {
      const chave = String(nome ?? '').trim();
      if (!chave) return null;
      if (cacheDiretorias.has(chave)) return cacheDiretorias.get(chave);
      let linha = ctx.acesso.primeiro('SELECT id FROM diretorias WHERE processo_id = ? AND nome = ?',
        contexto.processo.id, chave);
      if (!linha && criarEstrutura) {
        const criada = ctx.acesso.executar('INSERT INTO diretorias (processo_id, nome) VALUES (?, ?)',
          contexto.processo.id, chave);
        linha = { id: Number(criada.lastInsertRowid) };
      }
      if (linha) cacheDiretorias.set(chave, linha.id);
      return linha?.id ?? null;
    };

    const acharDivisao = (nome, diretoriaId) => {
      const limpo = String(nome ?? '').trim();
      if (!limpo || !diretoriaId) return null;
      const chave = `${diretoriaId}::${limpo}`;
      if (cacheDivisoes.has(chave)) return cacheDivisoes.get(chave);
      let linha = ctx.acesso.primeiro('SELECT id FROM divisoes WHERE diretoria_id = ? AND nome = ?', diretoriaId, limpo);
      if (!linha && criarEstrutura) {
        const criada = ctx.acesso.executar('INSERT INTO divisoes (diretoria_id, nome) VALUES (?, ?)', diretoriaId, limpo);
        linha = { id: Number(criada.lastInsertRowid) };
      }
      if (linha) cacheDivisoes.set(chave, linha.id);
      return linha?.id ?? null;
    };

    /**
     * Gestor imediato: se ele já responde por alguém, ou tem acesso com o mesmo
     * nome, o vínculo é refeito sozinho. Recarga não desfaz o que já existe.
     */
    const acharResponsavel = (nomeGestor) => {
      const chave = semAcento(nomeGestor);
      if (!chave) return null;
      if (cacheGestores.has(chave)) return cacheGestores.get(chave);

      let id = ctx.acesso.primeiro(`
        SELECT responsavel_id FROM colaboradores
         WHERE processo_id = ? AND responsavel_id IS NOT NULL AND lower(coalesce(gestor_nome, '')) = ?
         LIMIT 1`, contexto.processo.id, String(nomeGestor).trim().toLowerCase())?.responsavel_id ?? null;

      if (!id) {
        if (!gestoresCadastrados) {
          gestoresCadastrados = ctx.acesso.consultar("SELECT id, nome FROM usuarios WHERE perfil = 'gestor' AND ativo = 1");
        }
        id = gestoresCadastrados.find((g) => semAcento(g.nome) === chave)?.id ?? null;
      }
      cacheGestores.set(chave, id);
      return id;
    };

    for (const linha of linhas) {
      if (linha.erros.length) continue;
      const existente = mapa.get(linha.chapa);
      const dados = { ...(existente?.dados ?? {}), ...linha.dados };
      const diretoriaId = acharDiretoria(dados.diretoria);
      const divisaoId = acharDivisao(dados.divisao, diretoriaId);
      const nome = dados.nome ?? existente?.nome ?? null;
      const situacao = dados.situacao ?? null;
      const gestorNome = String(dados.gestor_imediato ?? '').trim() || null;
      const responsavelId = gestorNome ? acharResponsavel(gestorNome) : null;

      let colaboradorId;
      if (existente) {
        ctx.acesso.executar(`
          UPDATE colaboradores
             SET nome = ?, situacao = ?, dados = ?,
                 diretoria_id = coalesce(?, diretoria_id), divisao_id = coalesce(?, divisao_id),
                 gestor_nome = coalesce(?, gestor_nome), responsavel_id = coalesce(?, responsavel_id),
                 ativo = 1, importacao_id = ?, atualizado_em = ?
           WHERE id = ?`,
          nome, situacao, JSON.stringify(dados), diretoriaId, divisaoId, gestorNome, responsavelId,
          importacaoId, agora(), existente.id);
        colaboradorId = existente.id;
      } else {
        const criado = ctx.acesso.executar(`
          INSERT INTO colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id,
                                     gestor_nome, responsavel_id, importacao_id, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          contexto.processo.id, linha.chapa, nome, situacao, JSON.stringify(dados), diretoriaId, divisaoId,
          gestorNome, responsavelId, importacaoId, agora(), agora());
        colaboradorId = Number(criado.lastInsertRowid);
      }

      if (importarDecisoes && (linha.decisao.acao || linha.decisao.justificativa || linha.decisao.destino)) {
        const acaoValida = linha.decisao.acao
          ? contexto.acoes.find((a) => semAcento(a.valor) === semAcento(linha.decisao.acao))?.valor ?? null
          : null;
        ctx.acesso.executar(`
          INSERT INTO avaliacoes (colaborador_id, acao, justificativa, destino_livre, status, atualizado_por, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (colaborador_id) DO UPDATE SET
            acao = excluded.acao, justificativa = excluded.justificativa, destino_livre = excluded.destino_livre,
            status = excluded.status, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em`,
          colaboradorId, acaoValida, linha.decisao.justificativa ?? null, linha.decisao.destino ?? null,
          acaoValida ? 'preenchida' : 'pendente', usuario.id, agora());
      }
    }

    for (const alterado of resultado.alterados) {
      for (const mudanca of alterado.mudancas) {
        auditar(ctx.acesso, {
          usuario, tipo: 'importacao', entidade: 'colaborador', chapa: alterado.chapa, campo: mudanca.campo,
          valorAnterior: mudanca.de, valorNovo: mudanca.para, detalhes: { importacao_id: importacaoId }, ip: ctx.ip,
        });
      }
    }
    auditar(ctx.acesso, {
      usuario, tipo: 'importacao', entidade: 'importacao', entidadeId: importacaoId,
      detalhes: {
        arquivo: entrada.arquivo ?? '', linhas: resultado.total, novos: resultado.novos.length,
        alterados: resultado.alterados.length, erros: resultado.erros.length, importou_decisoes: importarDecisoes,
      },
      ip: ctx.ip,
    });

    return {
      ok: true, importacao_id: importacaoId, linhas: resultado.total,
      novos: resultado.novos.length, alterados: resultado.alterados.length, inalterados: resultado.inalterados,
      erros: resultado.erros.slice(0, 50), total_erros: resultado.erros.length,
    };
  }],

  ['GET', '/api/exportacao/dados', async (ctx) => {
    const usuario = ctx.usuario;
    const contexto = carregarContexto(ctx.acesso);
    const ocultos = usuario.perfil === 'admin' ? [] : contexto.campos.filter((c) => c.sensivel).map((c) => c.chave);

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
    if (q.acao === '__sem__') condicoes.push('a.acao IS NULL');
    else if (q.acao) { condicoes.push('a.acao = ?'); params.push(q.acao); }
    if (q.status === 'pendente') condicoes.push("coalesce(a.status,'pendente') = 'pendente'");
    else if (q.status) { condicoes.push('a.status = ?'); params.push(q.status); }

    const linhas = ctx.acesso.consultar(`
      SELECT c.chapa, c.nome, c.situacao, c.dados, c.gestor_nome AS gestor_imediato,
             dir.nome AS diretoria, dvs.nome AS divisao,
             a.acao, a.justificativa, a.destino_livre, a.status, a.atualizado_em,
             ua.nome AS atualizado_por, uh.nome AS homologado_por, a.homologado_em
        FROM colaboradores c
        LEFT JOIN diretorias dir ON dir.id = c.diretoria_id
        LEFT JOIN divisoes dvs ON dvs.id = c.divisao_id
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
        LEFT JOIN usuarios ua ON ua.id = a.atualizado_por
        LEFT JOIN usuarios uh ON uh.id = a.homologado_por
       WHERE ${condicoes.join(' AND ')}
       ORDER BY dir.nome, dvs.nome, c.nome`, ...params);

    let itens = linhas.map((linha) => {
      const dados = { ...linha.dados };
      for (const chave of ocultos) delete dados[chave];
      return {
        ...linha,
        dados,
        alertas: avaliarAlertas({ ...dados, situacao: linha.situacao }, contexto.regras).map((a) => a.mensagem),
      };
    });
    if (q.com_alerta === '1') itens = itens.filter((i) => i.alertas.length > 0);

    const auditoria = usuario.perfil === 'gestor' ? [] : ctx.acesso.consultar(`
      SELECT criado_em, usuario_nome, perfil, tipo, chapa, campo, valor_anterior, valor_novo
        FROM auditoria ORDER BY criado_em DESC LIMIT 1500`);

    auditar(ctx.acesso, {
      usuario, tipo: 'exportacao', entidade: 'planilha', detalhes: { registros: itens.length }, ip: ctx.ip,
    });

    return {
      processo: contexto.processo,
      campos: contexto.campos.filter((c) => c.ativo && c.origem === 'base' && !ocultos.includes(c.chave)),
      acoes: contexto.acoes.filter((a) => a.ativo).map((a) => a.valor),
      itens,
      auditoria,
    };
  }],
];
