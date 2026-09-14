'use strict';
const express = require('express');
const { obter, lerConfig } = require('../db');
const { agora, ErroHttp, rota } = require('../util');
const auth = require('../auth');
const { listarColunas, podeEditarColuna } = require('../modelo');

const router = express.Router();

function perfilDescricao(perfil) {
  return { admin: 'RH / Administrador', diretor: 'Diretor', gestor: 'Gestor' }[perfil] || perfil;
}

/** Payload que o front usa para montar a interface conforme o perfil. */
function contexto(req) {
  const db = obter();
  const cfg = lerConfig(db);
  const u = req.usuario;
  const colunas = listarColunas(db, { incluirOcultas: u.perfil === 'admin' }).map((c) => ({
    ...c,
    editavel_por_mim: podeEditarColuna(u, c),
  }));
  const escoposDisponiveis = db
    .prepare(`SELECT DISTINCT escopo AS valor FROM colaboradores WHERE escopo IS NOT NULL AND escopo <> '' ORDER BY escopo`)
    .all()
    .map((l) => l.valor);
  return {
    usuario: {
      id: u.id, usuario: u.usuario, nome: u.nome, email: u.email, perfil: u.perfil,
      perfil_descricao: perfilDescricao(u.perfil), escopos: u.escopos,
    },
    permissoes: {
      ver_tudo: auth.podeVerTudo(u),
      homologar: u.perfil === 'diretor' || u.perfil === 'admin',
      administrar: u.perfil === 'admin',
      exportar: true,
    },
    config: {
      titulo: cfg.titulo,
      prazo: cfg.prazo,
      posicao_base: cfg.posicao_base,
      coluna_escopo: cfg.coluna_escopo,
      acoes: cfg.acoes,
      aviso_confidencialidade: cfg.aviso_confidencialidade,
    },
    colunas,
    escopos_disponiveis: auth.podeVerTudo(u) ? escoposDisponiveis : u.escopos,
  };
}

router.post('/login', rota((req, res) => {
  const db = obter();
  const usuario = String(req.body?.usuario || '').trim();
  const senha = String(req.body?.senha || '');
  if (!usuario || !senha) throw new ErroHttp(400, 'Informe usuário e senha.');

  if (auth.bloqueado(usuario)) {
    auth.registrarTentativa(usuario, req, false);
    throw new ErroHttp(429, 'Muitas tentativas. Aguarde alguns minutos ou procure o administrador.');
  }

  const linha = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
  const ok = linha && linha.ativo && auth.conferirSenha(senha, linha.senha_hash);
  auth.registrarTentativa(usuario, req, ok);
  if (!ok) throw new ErroHttp(401, 'Usuário ou senha inválidos.');

  const sessao = auth.criarSessao(linha.id, req);
  auth.definirCookie(res, sessao.id, sessao.expira);
  db.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').run(agora(), linha.id);
  auth.limparSessoesExpiradas();

  req.usuario = { ...linha, escopos: db.prepare('SELECT valor FROM usuario_escopos WHERE usuario_id = ?').all(linha.id).map((l) => l.valor) };
  res.json({ ok: true, trocar_senha: !!linha.trocar_senha, ...(linha.trocar_senha ? {} : contexto(req)) });
}));

router.post('/logout', rota((req, res) => {
  auth.encerrarSessao(req.sessaoId);
  auth.limparCookie(res);
  res.json({ ok: true });
}));

router.get('/eu', rota((req, res) => {
  if (!req.usuario) throw new ErroHttp(401, 'Não autenticado.');
  if (req.usuario.trocar_senha) {
    return res.json({ trocar_senha: true, usuario: { nome: req.usuario.nome, usuario: req.usuario.usuario } });
  }
  res.json(contexto(req));
}));

router.post('/senha', rota((req, res) => {
  if (!req.usuario) throw new ErroHttp(401, 'Não autenticado.');
  const db = obter();
  const atual = String(req.body?.senha_atual || '');
  const nova = String(req.body?.nova_senha || '');
  const linha = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!auth.conferirSenha(atual, linha.senha_hash)) throw new ErroHttp(401, 'Senha atual incorreta.');
  const erro = auth.validarSenha(nova);
  if (erro) throw new ErroHttp(422, erro);
  if (atual === nova) throw new ErroHttp(422, 'A nova senha deve ser diferente da atual.');

  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?').run(auth.gerarHash(nova), req.usuario.id);
  // Invalida as demais sessões do usuário.
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND id <> ?').run(req.usuario.id, req.sessaoId || '');
  req.usuario.trocar_senha = 0;
  res.json({ ok: true, ...contexto(req) });
}));

module.exports = { router, contexto };
