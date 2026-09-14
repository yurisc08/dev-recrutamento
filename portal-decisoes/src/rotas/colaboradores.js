'use strict';
const express = require('express');
const { obter, lerConfig } = require('../db');
const { agora, ErroHttp, rota } = require('../util');
const { filtroEscopo, exigirPerfil } = require('../auth');
const modelo = require('../modelo');

const router = express.Router();

/** Monta WHERE + params a partir dos filtros da tela e do escopo do usuário. */
function montarConsulta(req) {
  const db = obter();
  const colunas = modelo.listarColunas(db);
  const q = req.query;
  const where = ['c.ativo = 1'];
  const params = [];

  const escopo = filtroEscopo(req.usuario);
  if (escopo.sql) {
    where.push(escopo.sql.replace(/^ AND /, ''));
    params.push(...escopo.params);
  }
  if (q.escopo) {
    where.push('c.escopo = ?');
    params.push(String(q.escopo));
  }
  if (q.busca) {
    const termo = `%${String(q.busca).trim().toLowerCase()}%`;
    where.push('(LOWER(c.nome) LIKE ? OR LOWER(c.matricula) LIKE ? OR LOWER(c.dados) LIKE ?)');
    params.push(termo, termo, termo);
  }
  if (q.acao) {
    if (q.acao === '__sem__') where.push('c.acao IS NULL');
    else { where.push('c.acao = ?'); params.push(String(q.acao)); }
  }
  if (q.status) {
    const status = String(q.status);
    if (status === 'desligado') where.push("LOWER(COALESCE(json_extract(c.dados,'$.situacao'),'')) = 'desligado'");
    else if (status === 'pendente') where.push("c.acao IS NULL AND LOWER(COALESCE(json_extract(c.dados,'$.situacao'),'')) <> 'desligado'");
    else if (status === 'preenchido') where.push("c.acao IS NOT NULL AND c.homologado = 0 AND LOWER(COALESCE(json_extract(c.dados,'$.situacao'),'')) <> 'desligado'");
    else if (status === 'homologado') where.push('c.homologado = 1');
  }
  if (q.estabilidade === '1') {
    where.push("(COALESCE(json_extract(c.dados,'$.estabilidade_ate'),'') >= date('now') OR (COALESCE(json_extract(c.dados,'$.estabilidade'),'') <> '' AND COALESCE(json_extract(c.dados,'$.estabilidade_ate'),'') = ''))");
  }
  // Filtros por qualquer coluna: ?f_<chave>=valor
  for (const [chave, valor] of Object.entries(q)) {
    if (!chave.startsWith('f_') || valor === '') continue;
    const coluna = colunas.find((c) => c.chave === chave.slice(2));
    if (!coluna) continue;
    where.push(`COALESCE(json_extract(c.dados, '$.${coluna.chave}'), '') = ?`);
    params.push(String(valor));
  }

  const ordenaveis = new Set(['matricula', 'nome', 'escopo', 'acao', 'atualizado_em']);
  let ordem = 'c.nome COLLATE NOCASE';
  const pedido = String(q.ordenar || '');
  if (ordenaveis.has(pedido)) ordem = `c.${pedido}`;
  else if (colunas.some((c) => c.chave === pedido)) ordem = `json_extract(c.dados, '$.${pedido}')`;
  const direcao = String(q.direcao || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return { where: where.join(' AND '), params, ordem: `${ordem} ${direcao}`, colunas };
}

router.get('/', rota((req, res) => {
  const db = obter();
  const { where, params, ordem, colunas } = montarConsulta(req);
  const porPagina = Math.min(Math.max(Number(req.query.por_pagina) || 50, 1), 500);
  const pagina = Math.max(Number(req.query.pagina) || 1, 1);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM colaboradores c WHERE ${where}`).get(...params).n;
  const linhas = db.prepare(`
    SELECT c.*, u.nome AS decidido_por_nome
      FROM colaboradores c LEFT JOIN usuarios u ON u.id = c.decidido_por
     WHERE ${where} ORDER BY ${ordem} LIMIT ? OFFSET ?
  `).all(...params, porPagina, (pagina - 1) * porPagina);

  res.json({
    total,
    pagina,
    por_pagina: porPagina,
    paginas: Math.max(Math.ceil(total / porPagina), 1),
    itens: linhas.map((l) => modelo.montarLinha(l, colunas)),
  });
}));

router.get('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const linha = modelo.buscarColaborador(db, Number(req.params.id));
  modelo.garantirEscopo(req.usuario, linha);
  res.json(modelo.montarLinha(linha, modelo.listarColunas(db)));
}));

router.patch('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const item = modelo.salvarLinha(db, req.usuario, Number(req.params.id), req.body || {});
  res.json(item);
}));

router.post('/homologar', exigirPerfil('diretor', 'admin'), rota((req, res) => {
  const db = obter();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) throw new ErroHttp(400, 'Selecione ao menos um colaborador.');
  if (ids.length > 1000) throw new ErroHttp(400, 'Selecione no máximo 1000 colaboradores por vez.');
  const itens = modelo.homologar(db, req.usuario, ids, req.body?.homologado !== false);
  res.json({ ok: true, itens });
}));

router.get('/:id(\\d+)/historico', rota((req, res) => {
  const db = obter();
  const linha = modelo.buscarColaborador(db, Number(req.params.id));
  modelo.garantirEscopo(req.usuario, linha);
  const registros = db
    .prepare('SELECT * FROM historico WHERE colaborador_id = ? ORDER BY criado_em DESC, id DESC LIMIT 200')
    .all(linha.id);
  res.json({ itens: registros });
}));

router.post('/', exigirPerfil('admin'), rota((req, res) => {
  const db = obter();
  const cfg = lerConfig(db);
  const colunas = modelo.listarColunas(db);
  const corpo = req.body || {};
  const matricula = String(corpo.matricula || '').trim();
  if (!matricula) throw new ErroHttp(422, 'Informe a matrícula.');
  if (db.prepare('SELECT id FROM colaboradores WHERE matricula = ?').get(matricula)) {
    throw new ErroHttp(409, `Já existe colaborador com a matrícula ${matricula}.`);
  }
  const dados = {};
  for (const coluna of colunas) {
    if (!(coluna.chave in corpo)) continue;
    const { valor, erro } = require('../util').converterParaTipo(corpo[coluna.chave], coluna);
    if (erro) throw new ErroHttp(422, erro);
    dados[coluna.chave] = valor;
  }
  dados.matricula = matricula;
  const info = db.prepare(`
    INSERT INTO colaboradores (matricula, nome, escopo, dados, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(matricula, dados.nome || null, dados[cfg.coluna_escopo] || null, JSON.stringify(dados), agora(), agora());
  const linha = modelo.buscarColaborador(db, info.lastInsertRowid);
  modelo.registrarHistorico(db, {
    colaborador: linha, usuario: req.usuario, campo: 'cadastro', anterior: null, novo: 'incluído manualmente',
  });
  res.status(201).json(modelo.montarLinha(linha, colunas));
}));

router.delete('/:id(\\d+)', exigirPerfil('admin'), rota((req, res) => {
  const db = obter();
  const linha = modelo.buscarColaborador(db, Number(req.params.id));
  db.prepare('UPDATE colaboradores SET ativo = 0, atualizado_em = ? WHERE id = ?').run(agora(), linha.id);
  modelo.registrarHistorico(db, {
    colaborador: linha, usuario: req.usuario, campo: 'ativo', anterior: 'Sim', novo: 'Não (removido da base)',
  });
  res.json({ ok: true });
}));

module.exports = router;
