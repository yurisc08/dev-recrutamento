'use strict';
const crypto = require('crypto');
const express = require('express');
const { obter } = require('../db');
const { agora, ErroHttp, rota } = require('../util');
const auth = require('../auth');

const router = express.Router();
const PERFIS = ['admin', 'diretor', 'gestor'];

router.use(auth.exigirPerfil('admin'));

function comEscopos(db, linha) {
  return {
    ...linha,
    escopos: db.prepare('SELECT valor FROM usuario_escopos WHERE usuario_id = ? ORDER BY valor').all(linha.id).map((l) => l.valor),
  };
}

/** Senha provisória legível, trocada obrigatoriamente no primeiro acesso. */
function senhaProvisoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numeros = '23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alfabeto[crypto.randomInt(alfabeto.length)];
  for (let i = 0; i < 4; i++) s += numeros[crypto.randomInt(numeros.length)];
  return s;
}

function gravarEscopos(db, usuarioId, escopos) {
  db.prepare('DELETE FROM usuario_escopos WHERE usuario_id = ?').run(usuarioId);
  const inserir = db.prepare('INSERT OR IGNORE INTO usuario_escopos (usuario_id, valor) VALUES (?, ?)');
  for (const valor of escopos) {
    const v = String(valor).trim();
    if (v) inserir.run(usuarioId, v);
  }
}

router.get('/', rota((req, res) => {
  const db = obter();
  const linhas = db.prepare(`
    SELECT id, usuario, nome, email, perfil, ativo, trocar_senha, criado_em, ultimo_acesso
      FROM usuarios ORDER BY nome COLLATE NOCASE
  `).all();
  res.json({ itens: linhas.map((l) => comEscopos(db, l)) });
}));

router.post('/', rota((req, res) => {
  const db = obter();
  const corpo = req.body || {};
  const usuario = String(corpo.usuario || '').trim().toLowerCase();
  const nome = String(corpo.nome || '').trim();
  const perfil = String(corpo.perfil || 'gestor');
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    throw new ErroHttp(422, 'Usuário deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
  }
  if (!nome) throw new ErroHttp(422, 'Informe o nome completo.');
  if (!PERFIS.includes(perfil)) throw new ErroHttp(422, 'Perfil inválido.');
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(usuario)) {
    throw new ErroHttp(409, 'Já existe um usuário com este login.');
  }

  const provisoria = corpo.senha ? String(corpo.senha) : senhaProvisoria();
  const erro = auth.validarSenha(provisoria);
  if (erro) throw new ErroHttp(422, erro);

  const info = db.prepare(`
    INSERT INTO usuarios (usuario, nome, email, senha_hash, perfil, ativo, trocar_senha, criado_em)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?)
  `).run(usuario, nome, String(corpo.email || '').trim() || null, auth.gerarHash(provisoria), perfil, agora());

  gravarEscopos(db, info.lastInsertRowid, Array.isArray(corpo.escopos) ? corpo.escopos : []);
  const linha = db.prepare('SELECT id, usuario, nome, email, perfil, ativo, trocar_senha, criado_em, ultimo_acesso FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...comEscopos(db, linha), senha_provisoria: provisoria });
}));

router.patch('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!atual) throw new ErroHttp(404, 'Usuário não encontrado.');
  const corpo = req.body || {};

  const perfil = corpo.perfil !== undefined ? String(corpo.perfil) : atual.perfil;
  if (!PERFIS.includes(perfil)) throw new ErroHttp(422, 'Perfil inválido.');
  const ativo = corpo.ativo === undefined ? atual.ativo : corpo.ativo ? 1 : 0;
  if (id === req.usuario.id && (!ativo || perfil !== 'admin')) {
    throw new ErroHttp(409, 'Você não pode remover o próprio acesso de administrador.');
  }
  if (!ativo && atual.ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);

  db.prepare('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?').run(
    corpo.nome !== undefined ? String(corpo.nome).trim() : atual.nome,
    corpo.email !== undefined ? String(corpo.email).trim() || null : atual.email,
    perfil, ativo, id
  );
  if (corpo.escopos !== undefined) gravarEscopos(db, id, Array.isArray(corpo.escopos) ? corpo.escopos : []);

  const linha = db.prepare('SELECT id, usuario, nome, email, perfil, ativo, trocar_senha, criado_em, ultimo_acesso FROM usuarios WHERE id = ?').get(id);
  res.json(comEscopos(db, linha));
}));

router.post('/:id(\\d+)/senha', rota((req, res) => {
  const db = obter();
  const id = Number(req.params.id);
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  const provisoria = senhaProvisoria();
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(auth.gerarHash(provisoria), id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);
  res.json({ ok: true, senha_provisoria: provisoria });
}));

router.delete('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const id = Number(req.params.id);
  if (id === req.usuario.id) throw new ErroHttp(409, 'Você não pode excluir o próprio usuário.');
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  res.json({ ok: true });
}));

module.exports = router;
