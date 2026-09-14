import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { consultar, consultarUm, pool } from '../db/pool.js';
import { ErroHttp } from './erros.js';
import { ipDe } from './auditoria.js';
import type { Perfil, UsuarioSessao } from '../dominio/tipos.js';

const COOKIE = 'portal_sessao';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function gerarHash(senha: string): string {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(senha, sal, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('hex')}$${chave.toString('hex')}`;
}

export function conferirSenha(senha: string, hash: string): boolean {
  try {
    const [algoritmo, n, r, p, salHex, chaveHex] = String(hash).split('$');
    if (algoritmo !== 'scrypt') return false;
    const esperado = Buffer.from(chaveHex, 'hex');
    const obtido = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(esperado, obtido);
  } catch {
    return false;
  }
}

export function validarSenha(senha: string): string | null {
  const valor = String(senha ?? '');
  if (valor.length < 10) return 'A senha deve ter ao menos 10 caracteres.';
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) return 'A senha deve conter letras e números.';
  return null;
}

export function senhaProvisoria(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numeros = '23456789';
  let senha = '';
  for (let i = 0; i < 8; i += 1) senha += letras[crypto.randomInt(letras.length)];
  for (let i = 0; i < 4; i += 1) senha += numeros[crypto.randomInt(numeros.length)];
  return senha;
}

export async function criarSessao(usuarioId: number, req: Request): Promise<{ id: string; expira: Date }> {
  const id = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + config.horasSessao * 3600 * 1000);
  await pool.query(
    'INSERT INTO sessoes (id, usuario_id, expira_em, ip, navegador) VALUES ($1, $2, $3, $4, $5)',
    [id, usuarioId, expira, ipDe(req), String(req.headers['user-agent'] ?? '').slice(0, 200)],
  );
  return { id, expira };
}

export async function encerrarSessao(id?: string | null): Promise<void> {
  if (id) await pool.query('DELETE FROM sessoes WHERE id = $1', [id]);
}

export function definirCookie(res: Response, valor: string, expira: Date): void {
  const partes = [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expira.toUTCString()}`,
  ];
  if (config.cookieSeguro) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function limparCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function lerCookie(req: Request, nome: string): string | null {
  for (const parte of String(req.headers.cookie ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export async function carregarUsuario(id: number): Promise<UsuarioSessao | null> {
  const usuario = await consultarUm<{
    id: number; usuario: string; nome: string; email: string | null; perfil: Perfil; trocar_senha: boolean;
  }>('SELECT id, usuario, nome, email, perfil, trocar_senha FROM usuarios WHERE id = $1 AND ativo = true', [id]);
  if (!usuario) return null;

  const diretorias = await consultar<{ diretoria_id: number }>(
    'SELECT diretoria_id FROM usuario_diretorias WHERE usuario_id = $1', [id],
  );
  const divisoes = await consultar<{ divisao_id: number }>(
    'SELECT divisao_id FROM usuario_divisoes WHERE usuario_id = $1', [id],
  );
  return {
    ...usuario,
    diretorias: diretorias.map((linha) => linha.diretoria_id),
    divisoes: divisoes.map((linha) => linha.divisao_id),
  };
}

/** Carrega a sessão em req.usuario (sem bloquear requisições anônimas). */
export async function sessao(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const id = lerCookie(req, COOKIE);
    if (id) {
      const registro = await consultarUm<{ usuario_id: number; expira_em: Date }>(
        'SELECT usuario_id, expira_em FROM sessoes WHERE id = $1', [id],
      );
      if (registro && new Date(registro.expira_em) > new Date()) {
        const usuario = await carregarUsuario(registro.usuario_id);
        if (usuario) {
          req.usuario = usuario;
          req.sessaoId = id;
        }
      } else if (registro) {
        await encerrarSessao(id);
      }
    }
    next();
  } catch (erro) {
    next(erro);
  }
}

export function exigirLogin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.usuario) return next(new ErroHttp(401, 'Sessão expirada. Faça login novamente.'));
  if (req.usuario.trocar_senha && !req.path.startsWith('/auth/')) {
    return next(new ErroHttp(403, 'Troque a senha provisória antes de continuar.', { trocar_senha: true }));
  }
  next();
}

/** Autorização por perfil — sempre validada aqui, no backend. */
export function exigirPerfil(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) return next(new ErroHttp(401, 'Sessão expirada. Faça login novamente.'));
    if (!perfis.includes(req.usuario.perfil)) {
      return next(new ErroHttp(403, 'Seu perfil não tem permissão para esta operação.'));
    }
    next();
  };
}

/** Como o cookie é SameSite=Strict, o cabeçalho próprio já barra requisições de terceiros. */
export function exigirCabecalhoPortal(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-portal') !== '1') return next(new ErroHttp(403, 'Requisição inválida.'));
  next();
}

export async function registrarTentativa(usuario: string, req: Request, sucesso: boolean): Promise<void> {
  await pool.query('INSERT INTO tentativas_login (usuario, ip, sucesso) VALUES ($1, $2, $3)', [
    String(usuario ?? '').slice(0, 80), ipDe(req), sucesso,
  ]);
}

export async function loginBloqueado(usuario: string): Promise<boolean> {
  const linha = await consultarUm<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM tentativas_login
      WHERE usuario = $1 AND sucesso = false AND criado_em > now() - ($2 || ' minutes')::interval`,
    [usuario, String(config.loginJanelaMin)],
  );
  return Number(linha?.total ?? 0) >= config.loginMaxTentativas;
}

export async function limparSessoesExpiradas(): Promise<void> {
  await pool.query('DELETE FROM sessoes WHERE expira_em < now()');
}
