'use strict';
const express = require('express');
const { obter, lerConfig, gravarConfig } = require('../db');
const { agora, ErroHttp, rota } = require('../util');
const { exigirPerfil } = require('../auth');
const modelo = require('../modelo');

const router = express.Router();

router.get('/', rota((req, res) => res.json(lerConfig(obter()))));

router.patch('/', exigirPerfil('admin'), rota((req, res) => {
  const db = obter();
  const cfg = lerConfig(db);
  const corpo = req.body || {};

  if (corpo.titulo !== undefined) gravarConfig('titulo', String(corpo.titulo).slice(0, 120), db);
  if (corpo.prazo !== undefined) gravarConfig('prazo', String(corpo.prazo).slice(0, 10), db);
  if (corpo.posicao_base !== undefined) gravarConfig('posicao_base', String(corpo.posicao_base).slice(0, 10), db);
  if (corpo.aviso_confidencialidade !== undefined) {
    gravarConfig('aviso_confidencialidade', String(corpo.aviso_confidencialidade).slice(0, 400), db);
  }

  if (corpo.acoes !== undefined) {
    const acoes = (Array.isArray(corpo.acoes) ? corpo.acoes : []).map((a) => ({
      valor: String(a.valor || '').trim(),
      cor: String(a.cor || 'neutra'),
      exige_justificativa: !!a.exige_justificativa,
    })).filter((a) => a.valor);
    if (acoes.length === 0) throw new ErroHttp(422, 'Mantenha ao menos uma ação disponível.');
    const emUso = db.prepare('SELECT DISTINCT acao FROM colaboradores WHERE acao IS NOT NULL').all().map((l) => l.acao);
    const removidas = emUso.filter((v) => !acoes.some((a) => a.valor === v));
    if (removidas.length > 0) {
      throw new ErroHttp(409, `Ações já utilizadas na base não podem ser removidas: ${removidas.join(', ')}.`);
    }
    gravarConfig('acoes', JSON.stringify(acoes), db);
  }

  if (corpo.coluna_escopo !== undefined && corpo.coluna_escopo !== cfg.coluna_escopo) {
    const coluna = modelo.listarColunas(db).find((c) => c.chave === String(corpo.coluna_escopo));
    if (!coluna) throw new ErroHttp(422, 'Coluna de divisão inexistente.');
    gravarConfig('coluna_escopo', coluna.chave, db);
    db.prepare(
      `UPDATE colaboradores SET escopo = json_extract(dados, '$.${coluna.chave}'), atualizado_em = ?`
    ).run(agora());
  }

  res.json(lerConfig(db));
}));

module.exports = router;
