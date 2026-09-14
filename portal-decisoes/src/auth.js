'use strict';
const crypto = require('crypto');
const config = require('./config');
const { obter } = require('./db');
const { agora, ErroHttp } = require('./util');

const COOKIE = 'pd_sessao';
const PARAMS_SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(senha, sal, PARAMS_SCRYPT.keylen, PARAMS_SCRYPT);
  return `scrypt$${PARAMS_SCRYPT.N}$${PARAMS_SCRYPT.r}$${PARAMS_SCRYPT.p}$${sal.toString('hex')}$${chave.toString('hex')}`;
}

function conferirSenha(senha, hash) {
  try {
    const [algoritmo, N, r, p, salHex, chaveHex] = String(hash).split('$');
    if (algoritmo !== 'scrypt') return false;
    const esperado = Buffer.from(chaveHex, 'hex');
    const obtido = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(esperado, obtido);
  } catch {
    return false;
  }
}

/** Exigências mínimas de senha — validadas na criação e na troca. */
function validarSenha(senha) {
  const s = String(senha || '');
  if (s.length < 10) return 'A senha deve ter ao menos 10 caracteres.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'A senha deve conter letras e números.';
  return null;
}

function criarSessao(usuarioId, req) {
  const db = obter();
  const id = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + config.horasSessao * 3600 * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessoes (id, usuario_id, criado_em, expira_em, ip, navegador) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, usuarioId, agora(), expira, ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200));
  return { id, expira };
}

function encerrarSessao(id) {
  if (id) obter().prepare('DELETE FROM sessoes WHERE id = ?').run(id);
}

function limparSessoesExpiradas() {
  obter().prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora());
}

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

function definirCookie(res, valor, expira) {
  const partes = [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${new Date(expira).toUTCString()}`,
  ];
  if (config.cookieSeguro) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

function limparCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

/** Carrega o usuário da sessão em req.usuario (com seus escopos). Não bloqueia. */
function carregarSessao(req, res, next) {
  const db = obter();
  const id = lerCookie(req, COOKIE);
  req.sessaoId = null;
  req.usuario = null;
  if (id) {
    const sessao = db.prepare('SELECT * FROM sessoes WHERE id = ?').get(id);
    if (sessao && sessao.expira_em > agora()) {
      const usuario = db
        .prepare('SELECT id, usuario, nome, email, perfil, ativo, trocar_senha FROM usuarios WHERE id = ?')
        .get(sessao.usuario_id);
      if (usuario && usuario.ativo) {
        usuario.escopos = db
          .prepare('SELECT valor FROM usuario_escopos WHERE usuario_id = ? ORDER BY valor')
          .all(usuario.id)
          .map((l) => l.valor);
        req.usuario = usuario;
        req.sessaoId = id;
      }
    } else if (sessao) {
      encerrarSessao(id);
    }
  }
  next();
}

function exigirLogin(req, res, next) {
  if (!req.usuario) return next(new ErroHttp(401, 'Sessão expirada. Faça login novamente.'));
  if (req.usuario.trocar_senha && !req.path.startsWith('/api/auth/')) {
    return next(new ErroHttp(403, 'Troque a senha provisória antes de continuar.', { trocar_senha: true }));
  }
  next();
}

function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario) return next(new ErroHttp(401, 'Sessão expirada. Faça login novamente.'));
    if (!perfis.includes(req.usuario.perfil)) {
      return next(new ErroHttp(403, 'Seu perfil não tem permissão para esta operação.'));
    }
    next();
  };
}

/**
 * Proteção CSRF para APIs que alteram estado: como o cookie é SameSite=Strict,
 * basta exigir um cabeçalho que um formulário cross-site não consegue enviar.
 */
function exigirCabecalhoAjax(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-portal') !== '1') return next(new ErroHttp(403, 'Requisição inválida.'));
  next();
}

function podeVerTudo(usuario) {
  return usuario.perfil === 'admin' || usuario.perfil === 'diretor';
}

/** Cláusula SQL que restringe o gestor aos escopos (divisões) atribuídos a ele. */
function filtroEscopo(usuario) {
  if (podeVerTudo(usuario)) return { sql: '', params: [] };
  if (!usuario.escopos || usuario.escopos.length === 0) return { sql: ' AND 1 = 0', params: [] };
  const marcas = usuario.escopos.map(() => '?').join(', ');
  return { sql: ` AND c.escopo IN (${marcas})`, params: [...usuario.escopos] };
}

function registrarTentativa(usuario, req, sucesso) {
  obter()
    .prepare('INSERT INTO tentativas_login (usuario, ip, sucesso, criado_em) VALUES (?, ?, ?, ?)')
    .run(String(usuario || '').slice(0, 80), ipDe(req), sucesso ? 1 : 0, agora());
}

/** Bloqueio temporário por usuário após N falhas na janela configurada. */
function bloqueado(usuario) {
  const desde = new Date(Date.now() - config.janelaLoginMin * 60 * 1000).toISOString();
  const n = obter()
    .prepare('SELECT COUNT(*) AS n FROM tentativas_login WHERE usuario = ? AND sucesso = 0 AND criado_em > ?')
    .get(String(usuario || ''), desde).n;
  return n >= config.tentativasLogin;
}

module.exports = {
  COOKIE, gerarHash, conferirSenha, validarSenha, criarSessao, encerrarSessao, limparSessoesExpiradas,
  definirCookie, limparCookie, carregarSessao, exigirLogin, exigirPerfil, exigirCabecalhoAjax,
  podeVerTudo, filtroEscopo, registrarTentativa, bloqueado, ipDe,
};
