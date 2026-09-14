'use strict';
const express = require('express');
const { obter } = require('../db');
const { rota } = require('../util');
const { exigirPerfil } = require('../auth');

const router = express.Router();

router.get('/', exigirPerfil('admin', 'diretor'), rota((req, res) => {
  const db = obter();
  const limite = Math.min(Number(req.query.limite) || 200, 2000);
  const where = [];
  const params = [];
  if (req.query.matricula) { where.push('h.matricula = ?'); params.push(String(req.query.matricula)); }
  if (req.query.usuario_id) { where.push('h.usuario_id = ?'); params.push(Number(req.query.usuario_id)); }
  if (req.query.campo) { where.push('h.campo = ?'); params.push(String(req.query.campo)); }
  const sql = `
    SELECT h.*, c.nome AS colaborador_nome
      FROM historico h LEFT JOIN colaboradores c ON c.id = h.colaborador_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY h.criado_em DESC, h.id DESC LIMIT ?`;
  res.json({ itens: db.prepare(sql).all(...params, limite) });
}));

router.get('/importacoes', exigirPerfil('admin'), rota((req, res) => {
  const db = obter();
  res.json({
    itens: db.prepare('SELECT * FROM importacoes ORDER BY criado_em DESC LIMIT 50').all()
      .map((l) => ({ ...l, resumo: l.resumo ? JSON.parse(l.resumo) : null })),
  });
}));

router.get('/acessos', exigirPerfil('admin'), rota((req, res) => {
  const db = obter();
  res.json({
    itens: db.prepare('SELECT usuario, ip, sucesso, criado_em FROM tentativas_login ORDER BY criado_em DESC LIMIT 200').all(),
  });
}));

module.exports = router;
