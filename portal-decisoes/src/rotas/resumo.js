'use strict';
const express = require('express');
const { obter, lerConfig } = require('../db');
const { rota } = require('../util');
const { filtroEscopo } = require('../auth');
const modelo = require('../modelo');

const router = express.Router();

const EXPR_DESLIGADO = "LOWER(COALESCE(json_extract(c.dados,'$.situacao'),'')) = 'desligado'";
const EXPR_ESTABILIDADE =
  "(COALESCE(json_extract(c.dados,'$.estabilidade_ate'),'') >= date('now') " +
  "OR (COALESCE(json_extract(c.dados,'$.estabilidade'),'') <> '' AND COALESCE(json_extract(c.dados,'$.estabilidade_ate'),'') = ''))";

/**
 * Consolidado equivalente à aba "1. Resumo" da planilha, respeitando o escopo do usuário.
 * Quem é gestor vê apenas as suas divisões; diretoria e RH veem a base inteira.
 */
function calcular(usuario, filtroEscopoSelecionado) {
  const db = obter();
  const cfg = lerConfig(db);
  const colunas = modelo.listarColunas(db);
  const colunaSoma = colunas.find((c) => c.somar);

  const where = ['c.ativo = 1'];
  const params = [];
  const escopo = filtroEscopo(usuario);
  if (escopo.sql) {
    where.push(escopo.sql.replace(/^ AND /, ''));
    params.push(...escopo.params);
  }
  if (filtroEscopoSelecionado) {
    where.push('c.escopo = ?');
    params.push(filtroEscopoSelecionado);
  }
  const W = where.join(' AND ');
  const soma = colunaSoma ? `COALESCE(json_extract(c.dados,'$.${colunaSoma.chave}'), 0)` : '0';

  const totais = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN ${EXPR_DESLIGADO} THEN 1 ELSE 0 END) AS desligados_base,
      SUM(CASE WHEN NOT ${EXPR_DESLIGADO} THEN 1 ELSE 0 END) AS elegiveis,
      SUM(CASE WHEN NOT ${EXPR_DESLIGADO} AND c.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN NOT ${EXPR_DESLIGADO} AND c.acao IS NOT NULL AND c.homologado = 0 THEN 1 ELSE 0 END) AS preenchidos,
      SUM(CASE WHEN c.homologado = 1 THEN 1 ELSE 0 END) AS homologados,
      SUM(CASE WHEN ${EXPR_ESTABILIDADE} THEN 1 ELSE 0 END) AS com_estabilidade,
      SUM(CASE WHEN ${EXPR_ESTABILIDADE} AND c.acao = 'Desligamento' THEN 1 ELSE 0 END) AS estabilidade_com_desligamento,
      SUM(${soma}) AS custo_total,
      SUM(CASE WHEN c.acao = 'Desligamento' THEN ${soma} ELSE 0 END) AS custo_desligamentos
    FROM colaboradores c WHERE ${W}
  `).get(...params);

  const porAcao = db.prepare(`
    SELECT COALESCE(c.acao, '__sem__') AS acao, COUNT(*) AS total, SUM(${soma}) AS custo
      FROM colaboradores c WHERE ${W} AND NOT ${EXPR_DESLIGADO}
     GROUP BY COALESCE(c.acao, '__sem__')
  `).all(...params);

  const porEscopo = db.prepare(`
    SELECT COALESCE(NULLIF(c.escopo, ''), '(sem divisão)') AS escopo,
           COUNT(*) AS total,
           SUM(CASE WHEN ${EXPR_DESLIGADO} THEN 1 ELSE 0 END) AS desligados_base,
           SUM(CASE WHEN NOT ${EXPR_DESLIGADO} AND c.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
           SUM(CASE WHEN c.acao = 'Desligamento' THEN 1 ELSE 0 END) AS desligamentos,
           SUM(CASE WHEN c.acao LIKE 'Transfer%' THEN 1 ELSE 0 END) AS transferencias,
           SUM(CASE WHEN c.acao = 'Manter' THEN 1 ELSE 0 END) AS manter,
           SUM(CASE WHEN c.homologado = 1 THEN 1 ELSE 0 END) AS homologados,
           SUM(CASE WHEN c.acao = 'Desligamento' THEN ${soma} ELSE 0 END) AS custo_desligamentos
      FROM colaboradores c WHERE ${W}
     GROUP BY COALESCE(NULLIF(c.escopo, ''), '(sem divisão)')
     ORDER BY escopo
  `).all(...params);

  // Quebras extras por colunas marcadas como "agrupar" (ex.: Diretoria, Área).
  const quebras = colunas
    .filter((c) => c.agrupar && c.chave !== cfg.coluna_escopo)
    .map((coluna) => ({
      chave: coluna.chave,
      rotulo: coluna.rotulo,
      linhas: db.prepare(`
        SELECT COALESCE(NULLIF(json_extract(c.dados,'$.${coluna.chave}'), ''), '(não informado)') AS valor,
               COUNT(*) AS total,
               SUM(CASE WHEN NOT ${EXPR_DESLIGADO} AND c.acao IS NULL THEN 1 ELSE 0 END) AS pendentes,
               SUM(CASE WHEN c.acao = 'Desligamento' THEN 1 ELSE 0 END) AS desligamentos
          FROM colaboradores c WHERE ${W}
         GROUP BY valor ORDER BY total DESC LIMIT 30
      `).all(...params),
    }));

  const acoes = cfg.acoes.map((a) => {
    const linha = porAcao.find((p) => p.acao === a.valor);
    return { valor: a.valor, cor: a.cor, total: linha?.total || 0, custo: linha?.custo || 0 };
  });
  const semAcao = porAcao.find((p) => p.acao === '__sem__');
  acoes.push({ valor: 'Sem indicação', cor: 'pendente', total: semAcao?.total || 0, custo: semAcao?.custo || 0 });

  const elegiveis = totais.elegiveis || 0;
  const decididos = elegiveis - (totais.pendentes || 0);
  return {
    atualizado_em: new Date().toISOString(),
    prazo: cfg.prazo,
    posicao_base: cfg.posicao_base,
    coluna_soma: colunaSoma ? { chave: colunaSoma.chave, rotulo: colunaSoma.rotulo, tipo: colunaSoma.tipo } : null,
    totais: { ...totais, decididos, percentual: elegiveis ? Math.round((decididos / elegiveis) * 100) : 0 },
    acoes,
    por_escopo: porEscopo,
    quebras,
  };
}

router.get('/', rota((req, res) => {
  res.json(calcular(req.usuario, req.query.escopo ? String(req.query.escopo) : null));
}));

module.exports = { router, calcular };
