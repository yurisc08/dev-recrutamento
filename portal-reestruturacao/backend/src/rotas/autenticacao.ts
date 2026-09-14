import { Router } from 'express';
import { consultar, consultarUm, pool } from '../db/pool.js';
import { ErroHttp, rota } from '../http/erros.js';
import { auditar } from '../http/auditoria.js';
import * as auth from '../http/auth.js';
import { carregarContexto } from '../servicos/processo.js';
import type { UsuarioSessao } from '../dominio/tipos.js';

export const rotasAutenticacao = Router();

const DESCRICAO_PERFIL: Record<string, string> = {
  admin: 'RH / Administrador',
  diretor: 'Diretor',
  gestor: 'Gestor',
};

/** Tudo o que o front precisa para montar a interface conforme o perfil. */
export async function contexto(usuario: UsuarioSessao) {
  const { processo, campos, acoes, regras } = await carregarContexto();

  const diretorias = await consultar<{ id: number; nome: string }>(
    'SELECT id, nome FROM diretorias WHERE processo_id = $1 AND ativo = true ORDER BY nome',
    [processo.id],
  );
  const divisoes = await consultar<{ id: number; nome: string; diretoria_id: number }>(
    `SELECT d.id, d.nome, d.diretoria_id FROM divisoes d
       JOIN diretorias dir ON dir.id = d.diretoria_id
      WHERE dir.processo_id = $1 AND d.ativo = true
      ORDER BY d.nome`,
    [processo.id],
  );

  const minhasDiretorias =
    usuario.perfil === 'admin' ? diretorias
      : usuario.perfil === 'diretor' ? diretorias.filter((d) => usuario.diretorias.includes(d.id))
      : diretorias.filter((d) => divisoes.some((div) => usuario.divisoes.includes(div.id) && div.diretoria_id === d.id));

  const minhasDivisoes =
    usuario.perfil === 'gestor'
      ? divisoes.filter((d) => usuario.divisoes.includes(d.id))
      : usuario.perfil === 'diretor'
        ? divisoes.filter((d) => usuario.diretorias.includes(d.diretoria_id))
        : divisoes;

  return {
    usuario: {
      id: usuario.id,
      usuario: usuario.usuario,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      perfil_descricao: DESCRICAO_PERFIL[usuario.perfil] ?? usuario.perfil,
    },
    permissoes: {
      administrar: usuario.perfil === 'admin',
      homologar: usuario.perfil === 'admin' || usuario.perfil === 'diretor',
      avaliar: true,
      importar: usuario.perfil === 'admin',
      exportar: true,
      ver_auditoria: usuario.perfil === 'admin' || usuario.perfil === 'diretor',
    },
    processo,
    campos,
    acoes: acoes.filter((acao) => acao.ativo),
    regras: usuario.perfil === 'admin' ? regras : [],
    diretorias: minhasDiretorias,
    divisoes: minhasDivisoes,
    todas_diretorias: usuario.perfil === 'admin' ? diretorias : minhasDiretorias,
    todas_divisoes: usuario.perfil === 'admin' ? divisoes : minhasDivisoes,
  };
}

rotasAutenticacao.post('/login', rota(async (req, res) => {
  const usuario = String(req.body?.usuario ?? '').trim().toLowerCase();
  const senha = String(req.body?.senha ?? '');
  if (!usuario || !senha) throw new ErroHttp(400, 'Informe usuário e senha.');

  if (await auth.loginBloqueado(usuario)) {
    await auth.registrarTentativa(usuario, req, false);
    throw new ErroHttp(429, 'Muitas tentativas. Aguarde alguns minutos ou procure o administrador.');
  }

  const linha = await consultarUm<{ id: number; senha_hash: string; ativo: boolean; trocar_senha: boolean }>(
    'SELECT id, senha_hash, ativo, trocar_senha FROM usuarios WHERE lower(usuario) = $1',
    [usuario],
  );
  const valido = Boolean(linha?.ativo) && linha !== null && auth.conferirSenha(senha, linha.senha_hash);
  await auth.registrarTentativa(usuario, req, valido);

  if (!valido || !linha) {
    await auditar(req, { tipo: 'login_falha', entidade: 'usuario', detalhes: { usuario } });
    throw new ErroHttp(401, 'Usuário ou senha inválidos.');
  }

  const sessaoCriada = await auth.criarSessao(linha.id, req);
  auth.definirCookie(res, sessaoCriada.id, sessaoCriada.expira);
  await pool.query('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [linha.id]);
  await auth.limparSessoesExpiradas();

  const carregado = await auth.carregarUsuario(linha.id);
  if (!carregado) throw new ErroHttp(500, 'Falha ao carregar o usuário.');
  req.usuario = carregado;
  await auditar(req, { tipo: 'login', entidade: 'usuario', entidadeId: linha.id });

  if (carregado.trocar_senha) {
    res.json({ trocar_senha: true, usuario: { nome: carregado.nome, usuario: carregado.usuario } });
    return;
  }
  res.json(await contexto(carregado));
}));

rotasAutenticacao.post('/logout', rota(async (req, res) => {
  if (req.usuario) await auditar(req, { tipo: 'logout', entidade: 'usuario', entidadeId: req.usuario.id });
  await auth.encerrarSessao(req.sessaoId);
  auth.limparCookie(res);
  res.json({ ok: true });
}));

rotasAutenticacao.get('/eu', rota(async (req, res) => {
  if (!req.usuario) throw new ErroHttp(401, 'Não autenticado.');
  if (req.usuario.trocar_senha) {
    res.json({ trocar_senha: true, usuario: { nome: req.usuario.nome, usuario: req.usuario.usuario } });
    return;
  }
  res.json(await contexto(req.usuario));
}));

rotasAutenticacao.post('/senha', rota(async (req, res) => {
  if (!req.usuario) throw new ErroHttp(401, 'Não autenticado.');
  const atual = String(req.body?.senha_atual ?? '');
  const nova = String(req.body?.nova_senha ?? '');

  const linha = await consultarUm<{ senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
  if (!linha || !auth.conferirSenha(atual, linha.senha_hash)) throw new ErroHttp(401, 'Senha atual incorreta.');
  const problema = auth.validarSenha(nova);
  if (problema) throw new ErroHttp(422, problema);
  if (atual === nova) throw new ErroHttp(422, 'A nova senha deve ser diferente da atual.');

  await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = false WHERE id = $2', [auth.gerarHash(nova), req.usuario.id]);
  await pool.query('DELETE FROM sessoes WHERE usuario_id = $1 AND id <> $2', [req.usuario.id, req.sessaoId ?? '']);
  await auditar(req, { tipo: 'senha', entidade: 'usuario', entidadeId: req.usuario.id });

  req.usuario.trocar_senha = false;
  res.json(await contexto(req.usuario));
}));
