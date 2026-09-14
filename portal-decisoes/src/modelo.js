'use strict';
const { obter, lerConfig } = require('./db');
const { agora, hoje, converterParaTipo, ErroHttp } = require('./util');

const CAMPOS_DECISAO = ['acao', 'justificativa'];
const NIVEL = { nao: 0, gestor: 1, diretor: 2, admin: 3 };
const NIVEL_PERFIL = { gestor: 1, diretor: 2, admin: 3 };

function listarColunas(db = obter(), { incluirOcultas = true } = {}) {
  const sql = `SELECT * FROM colunas ${incluirOcultas ? '' : 'WHERE visivel = 1'} ORDER BY ordem, id`;
  return db.prepare(sql).all().map((c) => ({
    ...c,
    opcoes: c.opcoes ? JSON.parse(c.opcoes) : null,
    sistema: !!c.sistema,
    visivel: !!c.visivel,
    fixada: !!c.fixada,
    somar: !!c.somar,
    agrupar: !!c.agrupar,
  }));
}

function colunaPorChave(chave, db = obter()) {
  return listarColunas(db).find((c) => c.chave === chave) || null;
}

/** O usuário pode editar esta coluna? (colunas de decisão têm regra própria) */
function podeEditarColuna(usuario, coluna) {
  if (coluna.editavel === 'nao') return false;
  return (NIVEL_PERFIL[usuario.perfil] || 0) >= NIVEL[coluna.editavel];
}

/** Situação do colaborador no fluxo: desligado | pendente | preenchido | homologado. */
function statusDe(linha, dados) {
  if (String(dados.situacao || '').toLowerCase() === 'desligado') return 'desligado';
  if (linha.homologado) return 'homologado';
  return linha.acao ? 'preenchido' : 'pendente';
}

/** Estabilidade/afastamento ainda vigente na data de referência. */
function estabilidadeVigente(dados, referencia = hoje()) {
  const ate = dados.estabilidade_ate;
  if (ate && String(ate) >= referencia) return true;
  // Sem data final, mas com estabilidade declarada: trata como vigente (exige checagem do RH).
  return !!dados.estabilidade && !ate;
}

function montarLinha(linha, colunas) {
  const dados = JSON.parse(linha.dados || '{}');
  const item = {
    id: linha.id,
    matricula: linha.matricula,
    nome: linha.nome,
    escopo: linha.escopo,
    acao: linha.acao,
    justificativa: linha.justificativa,
    homologado: !!linha.homologado,
    homologado_em: linha.homologado_em,
    decidido_em: linha.decidido_em,
    decidido_por_nome: linha.decidido_por_nome || null,
    atualizado_em: linha.atualizado_em,
    dados,
    alertas: [],
  };
  item.status = statusDe(linha, dados);
  if (item.status === 'desligado') {
    item.alertas.push({ tipo: 'info', texto: 'Desligado na posição base — não requer decisão.' });
  }
  if (estabilidadeVigente(dados)) {
    const ate = dados.estabilidade_ate;
    item.alertas.push({
      tipo: 'atencao',
      texto: ate
        ? `Estabilidade/afastamento vigente até ${ate.split('-').reverse().join('/')}.`
        : 'Estabilidade/afastamento declarado sem data final.',
    });
    if (item.acao === 'Desligamento') {
      item.alertas.push({
        tipo: 'bloqueio',
        texto: 'Desligamento não pode ocorrer antes do término da estabilidade/afastamento.',
      });
    }
  }
  void colunas;
  return item;
}

function registrarHistorico(db, { colaborador, usuario, campo, anterior, novo, origem = 'portal' }) {
  if (String(anterior ?? '') === String(novo ?? '')) return;
  db.prepare(`
    INSERT INTO historico (colaborador_id, matricula, usuario_id, usuario_nome, campo, valor_anterior, valor_novo, origem, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    colaborador.id, colaborador.matricula, usuario?.id ?? null, usuario?.nome ?? 'sistema',
    campo, anterior === null || anterior === undefined ? null : String(anterior),
    novo === null || novo === undefined ? null : String(novo), origem, agora()
  );
}

function buscarColaborador(db, id) {
  const linha = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(id);
  if (!linha) throw new ErroHttp(404, 'Colaborador não encontrado.');
  return linha;
}

/** Gestor só enxerga/edita colaboradores dos escopos atribuídos a ele. */
function garantirEscopo(usuario, linha) {
  if (usuario.perfil === 'admin' || usuario.perfil === 'diretor') return;
  if (!usuario.escopos.includes(linha.escopo)) {
    throw new ErroHttp(403, 'Este colaborador não pertence à sua divisão.');
  }
}

/**
 * Grava ação/justificativa e demais colunas editáveis de uma linha.
 * Devolve { item, alertas } — erros de regra sobem como ErroHttp 422.
 */
function salvarLinha(db, usuario, id, alteracoes) {
  const cfg = lerConfig(db);
  const colunas = listarColunas(db);
  const linha = buscarColaborador(db, id);
  garantirEscopo(usuario, linha);

  const dados = JSON.parse(linha.dados || '{}');
  const statusAtual = statusDe(linha, dados);

  if (linha.homologado && usuario.perfil === 'gestor') {
    throw new ErroHttp(409, 'Decisão já homologada pela diretoria — procure o RH para reabrir.');
  }
  if (statusAtual === 'desligado' && usuario.perfil !== 'admin' && 'acao' in alteracoes) {
    throw new ErroHttp(409, 'Colaborador já desligado na posição base — não recebe decisão.');
  }

  const acoesValidas = cfg.acoes.map((a) => a.valor);
  const mudancas = [];

  if ('acao' in alteracoes) {
    const valor = alteracoes.acao === null || alteracoes.acao === '' ? null : String(alteracoes.acao);
    if (valor !== null && !acoesValidas.includes(valor)) {
      throw new ErroHttp(422, `Ação inválida. Use uma das opções: ${acoesValidas.join(', ')}.`);
    }
    mudancas.push(['acao', valor]);
  }
  if ('justificativa' in alteracoes) {
    const texto = String(alteracoes.justificativa ?? '').trim().slice(0, 4000);
    mudancas.push(['justificativa', texto || null]);
  }

  const acaoFinal = 'acao' in alteracoes ? mudancas.find((m) => m[0] === 'acao')[1] : linha.acao;
  const justFinal =
    'justificativa' in alteracoes
      ? mudancas.find((m) => m[0] === 'justificativa')[1]
      : linha.justificativa;

  const regraAcao = cfg.acoes.find((a) => a.valor === acaoFinal);
  if (regraAcao && regraAcao.exige_justificativa && !justFinal) {
    throw new ErroHttp(422, `A ação "${acaoFinal}" exige o preenchimento da justificativa.`);
  }
  if (acaoFinal === 'Desligamento' && estabilidadeVigente(dados) && !justFinal) {
    throw new ErroHttp(
      422,
      'Colaborador com estabilidade/afastamento vigente: descreva na justificativa como o prazo será observado.'
    );
  }

  // Demais colunas (cadastrais/personalizadas), conforme a permissão de cada uma.
  const dadosNovos = { ...dados };
  const mudancasDados = [];
  for (const [chave, valor] of Object.entries(alteracoes)) {
    if (CAMPOS_DECISAO.includes(chave)) continue;
    const coluna = colunas.find((c) => c.chave === chave);
    if (!coluna) throw new ErroHttp(422, `Coluna desconhecida: ${chave}`);
    if (!podeEditarColuna(usuario, coluna)) {
      throw new ErroHttp(403, `Você não pode editar a coluna "${coluna.rotulo}".`);
    }
    const { valor: convertido, erro } = converterParaTipo(valor, coluna);
    if (erro) throw new ErroHttp(422, erro);
    mudancasDados.push([coluna, convertido]);
    dadosNovos[chave] = convertido;
  }

  const cfgEscopo = cfg.coluna_escopo;
  const transacao = db.transaction(() => {
    for (const [campo, valor] of mudancas) {
      registrarHistorico(db, { colaborador: linha, usuario, campo, anterior: linha[campo], novo: valor });
    }
    for (const [coluna, valor] of mudancasDados) {
      registrarHistorico(db, {
        colaborador: linha, usuario, campo: coluna.chave, anterior: dados[coluna.chave], novo: valor,
      });
    }
    const houveDecisao = mudancas.length > 0;
    db.prepare(`
      UPDATE colaboradores
         SET acao = ?, justificativa = ?, dados = ?,
             nome = COALESCE(?, nome),
             escopo = ?,
             decidido_por = CASE WHEN ? THEN ? ELSE decidido_por END,
             decidido_em  = CASE WHEN ? THEN ? ELSE decidido_em END,
             atualizado_em = ?
       WHERE id = ?
    `).run(
      acaoFinal, justFinal, JSON.stringify(dadosNovos),
      dadosNovos.nome ?? null,
      dadosNovos[cfgEscopo] ?? linha.escopo,
      houveDecisao ? 1 : 0, usuario.id,
      houveDecisao ? 1 : 0, agora(),
      agora(), id
    );
  });
  transacao();

  const atualizado = db
    .prepare(`SELECT c.*, u.nome AS decidido_por_nome FROM colaboradores c
              LEFT JOIN usuarios u ON u.id = c.decidido_por WHERE c.id = ?`)
    .get(id);
  return montarLinha(atualizado, colunas);
}

function homologar(db, usuario, ids, homologado) {
  const colunas = listarColunas(db);
  const resultado = [];
  const transacao = db.transaction(() => {
    for (const id of ids) {
      const linha = buscarColaborador(db, id);
      if (!linha.acao && homologado) {
        throw new ErroHttp(422, `Matrícula ${linha.matricula} ainda não tem ação indicada.`);
      }
      registrarHistorico(db, {
        colaborador: linha, usuario, campo: 'homologado',
        anterior: linha.homologado ? 'Sim' : 'Não', novo: homologado ? 'Sim' : 'Não',
      });
      db.prepare(
        'UPDATE colaboradores SET homologado = ?, homologado_por = ?, homologado_em = ?, atualizado_em = ? WHERE id = ?'
      ).run(homologado ? 1 : 0, homologado ? usuario.id : null, homologado ? agora() : null, agora(), id);
      resultado.push(montarLinha(buscarColaborador(db, id), colunas));
    }
  });
  transacao();
  return resultado;
}

module.exports = {
  listarColunas, colunaPorChave, podeEditarColuna, montarLinha, statusDe, estabilidadeVigente,
  registrarHistorico, salvarLinha, homologar, buscarColaborador, garantirEscopo, CAMPOS_DECISAO,
};
