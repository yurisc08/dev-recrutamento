import { Hono } from 'hono';
import type { Ambiente, UsuarioSessao, Variaveis } from '../tipos.js';
import { ErroApi, carregarContexto } from '../dominio.js';
import { conferirSenha, gerarHash, novoIdSessao, validarSenha } from '../senha.js';
import { auditar } from '../auditoria.js';

const COOKIE = 'portal_sessao';

export async function carregarUsuario(sql: Variaveis['sql'], id: number): Promise<UsuarioSessao | null> {
  const [usuario] = await sql<UsuarioSessao[]>`
    SELECT id, usuario, nome, email, perfil, trocar_senha
      FROM portal.usuarios WHERE id = ${id} AND ativo`;
  if (!usuario) return null;
  const diretorias = await sql<{ diretoria_id: number }[]>`
    SELECT diretoria_id FROM portal.usuario_diretorias WHERE usuario_id = ${id}`;
  const divisoes = await sql<{ divisao_id: number }[]>`
    SELECT divisao_id FROM portal.usuario_divisoes WHERE usuario_id = ${id}`;
  return {
    ...usuario,
    diretorias: diretorias.map((d) => d.diretoria_id),
    divisoes: divisoes.map((d) => d.divisao_id),
  };
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  for (const parte of String(cabecalho ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function montarCookie(valor: string, expira: Date, seguro: boolean): string {
  const partes = [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expira.toUTCString()}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

export const cookieVazio = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
export const NOME_COOKIE = COOKIE;

const DESCRICAO: Record<string, string> = { admin: 'RH / Administrador', diretor: 'Diretor', gestor: 'Gestor' };

/** Payload que a interface usa para montar menus, filtros e permissões. */
export async function contextoDoUsuario(sql: Variaveis['sql'], usuario: UsuarioSessao) {
  const { processo, campos, acoes, regras } = await carregarContexto(sql);

  const diretorias = await sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM portal.diretorias WHERE processo_id = ${processo.id} AND ativo ORDER BY nome`;
  const divisoes = await sql<{ id: number; nome: string; diretoria_id: number }[]>`
    SELECT d.id, d.nome, d.diretoria_id FROM portal.divisoes d
      JOIN portal.diretorias dir ON dir.id = d.diretoria_id
     WHERE dir.processo_id = ${processo.id} AND d.ativo ORDER BY d.nome`;

  const minhasDiretorias = usuario.perfil === 'admin' ? diretorias
    : usuario.perfil === 'diretor' ? diretorias.filter((d) => usuario.diretorias.includes(d.id))
    : diretorias.filter((d) => divisoes.some((v) => usuario.divisoes.includes(v.id) && v.diretoria_id === d.id));
  const minhasDivisoes = usuario.perfil === 'gestor' ? divisoes.filter((d) => usuario.divisoes.includes(d.id))
    : usuario.perfil === 'diretor' ? divisoes.filter((d) => usuario.diretorias.includes(d.diretoria_id))
    : divisoes;

  // Campos sensíveis (CPF, nascimento) não saem da API para ninguém além do RH.
  const camposVisiveis = usuario.perfil === 'admin' ? campos : campos.filter((c) => !c.sensivel);

  return {
    usuario: {
      id: usuario.id, usuario: usuario.usuario, nome: usuario.nome, email: usuario.email,
      perfil: usuario.perfil, perfil_descricao: DESCRICAO[usuario.perfil] ?? usuario.perfil,
    },
    permissoes: {
      administrar: usuario.perfil === 'admin',
      homologar: usuario.perfil !== 'gestor',
      avaliar: true,
      importar: usuario.perfil === 'admin',
      exportar: true,
      ver_auditoria: usuario.perfil !== 'gestor',
    },
    processo,
    campos: camposVisiveis,
    acoes: acoes.filter((a) => a.ativo),
    regras: usuario.perfil === 'admin' ? regras : [],
    diretorias: minhasDiretorias,
    divisoes: minhasDivisoes,
    todas_diretorias: minhasDiretorias,
    todas_divisoes: minhasDivisoes,
  };
}

export const rotasSessao = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

rotasSessao.post('/login', async (contexto) => {
  const sql = contexto.get('sql');
  const corpo = await contexto.req.json().catch(() => ({}));
  const login = String(corpo.usuario ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  if (!login || !senha) throw new ErroApi(400, 'Informe usuário e senha.');

  const [tentativas] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total FROM portal.tentativas_login
     WHERE usuario = ${login} AND NOT sucesso AND criado_em > now() - interval '15 minutes'`;
  if (Number(tentativas?.total ?? 0) >= 5) {
    await sql`INSERT INTO portal.tentativas_login (usuario, ip, sucesso) VALUES (${login}, ${contexto.get('ip')}, false)`;
    throw new ErroApi(429, 'Muitas tentativas. Aguarde alguns minutos ou procure o administrador.');
  }

  const [linha] = await sql<{ id: number; senha_hash: string; ativo: boolean; trocar_senha: boolean }[]>`
    SELECT id, senha_hash, ativo, trocar_senha FROM portal.usuarios WHERE lower(usuario) = ${login}`;
  const valido = Boolean(linha?.ativo) && !!linha && (await conferirSenha(senha, linha.senha_hash));
  await sql`INSERT INTO portal.tentativas_login (usuario, ip, sucesso) VALUES (${login}, ${contexto.get('ip')}, ${valido})`;

  if (!valido || !linha) {
    await auditar(sql, { tipo: 'login_falha', detalhes: { usuario: login }, ip: contexto.get('ip') });
    throw new ErroApi(401, 'Usuário ou senha inválidos.');
  }

  const usuario = await carregarUsuario(sql, linha.id);
  if (!usuario) throw new ErroApi(500, 'Falha ao carregar o usuário.');

  const horas = Number(contexto.env.SESSAO_HORAS ?? 8);
  const expira = new Date(Date.now() + horas * 3600 * 1000);
  const id = novoIdSessao();
  await sql`
    INSERT INTO portal.sessoes (id, usuario_id, expira_em, ip, navegador)
    VALUES (${id}, ${usuario.id}, ${expira}, ${contexto.get('ip')}, ${contexto.req.header('user-agent')?.slice(0, 200) ?? ''})`;
  await sql`UPDATE portal.usuarios SET ultimo_acesso = now() WHERE id = ${usuario.id}`;
  await sql`DELETE FROM portal.sessoes WHERE expira_em < now()`;
  await auditar(sql, { usuario, tipo: 'login', entidade: 'usuario', entidadeId: usuario.id, ip: contexto.get('ip') });

  contexto.header('Set-Cookie', montarCookie(id, expira, contexto.env.COOKIE_SEGURO !== 'false'));
  if (usuario.trocar_senha) {
    return contexto.json({ trocar_senha: true, usuario: { nome: usuario.nome, usuario: usuario.usuario } });
  }
  return contexto.json(await contextoDoUsuario(sql, usuario));
});

rotasSessao.post('/logout', async (contexto) => {
  const sql = contexto.get('sql');
  const usuario = contexto.get('usuario');
  if (usuario) await auditar(sql, { usuario, tipo: 'logout', entidade: 'usuario', entidadeId: usuario.id, ip: contexto.get('ip') });
  const sessaoId = contexto.get('sessaoId');
  if (sessaoId) await sql`DELETE FROM portal.sessoes WHERE id = ${sessaoId}`;
  contexto.header('Set-Cookie', cookieVazio);
  return contexto.json({ ok: true });
});

rotasSessao.get('/eu', async (contexto) => {
  const usuario = contexto.get('usuario');
  if (!usuario) throw new ErroApi(401, 'Não autenticado.');
  if (usuario.trocar_senha) {
    return contexto.json({ trocar_senha: true, usuario: { nome: usuario.nome, usuario: usuario.usuario } });
  }
  return contexto.json(await contextoDoUsuario(contexto.get('sql'), usuario));
});

rotasSessao.post('/senha', async (contexto) => {
  const sql = contexto.get('sql');
  const usuario = contexto.get('usuario');
  if (!usuario) throw new ErroApi(401, 'Não autenticado.');
  const corpo = await contexto.req.json().catch(() => ({}));
  const atual = String(corpo.senha_atual ?? '');
  const nova = String(corpo.nova_senha ?? '');

  const [linha] = await sql<{ senha_hash: string }[]>`SELECT senha_hash FROM portal.usuarios WHERE id = ${usuario.id}`;
  if (!linha || !(await conferirSenha(atual, linha.senha_hash))) throw new ErroApi(401, 'Senha atual incorreta.');
  const problema = validarSenha(nova);
  if (problema) throw new ErroApi(422, problema);
  if (atual === nova) throw new ErroApi(422, 'A nova senha deve ser diferente da atual.');

  await sql`UPDATE portal.usuarios SET senha_hash = ${await gerarHash(nova)}, trocar_senha = false WHERE id = ${usuario.id}`;
  await sql`DELETE FROM portal.sessoes WHERE usuario_id = ${usuario.id} AND id <> ${contexto.get('sessaoId') ?? ''}`;
  await auditar(sql, { usuario, tipo: 'senha', entidade: 'usuario', entidadeId: usuario.id, ip: contexto.get('ip') });

  usuario.trocar_senha = false;
  return contexto.json(await contextoDoUsuario(sql, usuario));
});
