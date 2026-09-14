import { Router } from 'express';
import { consultar, consultarUm, emTransacao, pool } from '../db/pool.js';
import { ErroHttp, rota } from '../http/erros.js';
import { exigirPerfil, gerarHash, senhaProvisoria, validarSenha } from '../http/auth.js';
import { auditar } from '../http/auditoria.js';
import type { Perfil } from '../dominio/tipos.js';

export const rotasUsuarios = Router();
const PERFIS: Perfil[] = ['admin', 'diretor', 'gestor'];

rotasUsuarios.use(exigirPerfil('admin'));

const SELECT_USUARIO = `
  SELECT u.id, u.usuario, u.nome, u.email, u.perfil, u.ativo, u.trocar_senha, u.criado_em, u.ultimo_acesso,
         coalesce(array_remove(array_agg(DISTINCT ud.diretoria_id), NULL), '{}') AS diretorias,
         coalesce(array_remove(array_agg(DISTINCT uv.divisao_id), NULL), '{}') AS divisoes
    FROM usuarios u
    LEFT JOIN usuario_diretorias ud ON ud.usuario_id = u.id
    LEFT JOIN usuario_divisoes  uv ON uv.usuario_id = u.id
`;

rotasUsuarios.get('/', rota(async (_req, res) => {
  const itens = await consultar(`${SELECT_USUARIO} GROUP BY u.id ORDER BY u.nome`);
  res.json({ itens });
}));

async function gravarVinculos(
  usuarioId: number,
  diretorias: number[] | undefined,
  divisoes: number[] | undefined,
): Promise<void> {
  await emTransacao(async (cliente) => {
    if (diretorias) {
      await cliente.query('DELETE FROM usuario_diretorias WHERE usuario_id = $1', [usuarioId]);
      for (const id of diretorias) {
        // eslint-disable-next-line no-await-in-loop
        await cliente.query(
          'INSERT INTO usuario_diretorias (usuario_id, diretoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [usuarioId, id],
        );
      }
    }
    if (divisoes) {
      await cliente.query('DELETE FROM usuario_divisoes WHERE usuario_id = $1', [usuarioId]);
      for (const id of divisoes) {
        // eslint-disable-next-line no-await-in-loop
        await cliente.query(
          'INSERT INTO usuario_divisoes (usuario_id, divisao_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [usuarioId, id],
        );
      }
    }
  });
}

rotasUsuarios.post('/', rota(async (req, res) => {
  const corpo = req.body ?? {};
  const usuario = String(corpo.usuario ?? '').trim().toLowerCase();
  const nome = String(corpo.nome ?? '').trim();
  const perfil = String(corpo.perfil ?? 'gestor') as Perfil;

  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    throw new ErroHttp(422, 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
  }
  if (!nome) throw new ErroHttp(422, 'Informe o nome completo.');
  if (!PERFIS.includes(perfil)) throw new ErroHttp(422, 'Perfil inválido.');
  if (await consultarUm('SELECT 1 FROM usuarios WHERE lower(usuario) = $1', [usuario])) {
    throw new ErroHttp(409, 'Já existe um usuário com este login.');
  }

  const senha = corpo.senha ? String(corpo.senha) : senhaProvisoria();
  const problema = validarSenha(senha);
  if (problema) throw new ErroHttp(422, problema);

  const criado = await consultarUm<{ id: number }>(
    `INSERT INTO usuarios (usuario, nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [usuario, nome, String(corpo.email ?? '').trim() || null, gerarHash(senha), perfil],
  );
  await gravarVinculos(criado!.id, corpo.diretorias ?? [], corpo.divisoes ?? []);
  await auditar(req, { tipo: 'usuario', entidade: 'usuario', entidadeId: criado!.id, valorNovo: { usuario, perfil } });

  const completo = await consultarUm(`${SELECT_USUARIO} WHERE u.id = $1 GROUP BY u.id`, [criado!.id]);
  res.status(201).json({ ...completo, senha_provisoria: senha });
}));

rotasUsuarios.patch('/:id', rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<{ perfil: Perfil; ativo: boolean; nome: string }>(
    'SELECT perfil, ativo, nome FROM usuarios WHERE id = $1', [id],
  );
  if (!atual) throw new ErroHttp(404, 'Usuário não encontrado.');
  const corpo = req.body ?? {};

  const perfil = (corpo.perfil !== undefined ? String(corpo.perfil) : atual.perfil) as Perfil;
  if (!PERFIS.includes(perfil)) throw new ErroHttp(422, 'Perfil inválido.');
  const ativo = corpo.ativo !== undefined ? Boolean(corpo.ativo) : atual.ativo;
  if (id === req.usuario!.id && (!ativo || perfil !== 'admin')) {
    throw new ErroHttp(409, 'Você não pode remover o próprio acesso de administrador.');
  }

  await pool.query(
    'UPDATE usuarios SET nome = coalesce($1, nome), email = $2, perfil = $3, ativo = $4 WHERE id = $5',
    [
      corpo.nome !== undefined ? String(corpo.nome).trim() : null,
      corpo.email !== undefined ? String(corpo.email).trim() || null : null,
      perfil, ativo, id,
    ],
  );
  if (!ativo) await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
  if (corpo.diretorias !== undefined || corpo.divisoes !== undefined) {
    await gravarVinculos(id, corpo.diretorias, corpo.divisoes);
    await auditar(req, {
      tipo: 'permissao', entidade: 'usuario', entidadeId: id,
      valorNovo: { diretorias: corpo.diretorias, divisoes: corpo.divisoes },
    });
  }
  await auditar(req, {
    tipo: 'usuario', entidade: 'usuario', entidadeId: id,
    valorAnterior: { perfil: atual.perfil, ativo: atual.ativo },
    valorNovo: { perfil, ativo },
  });

  res.json(await consultarUm(`${SELECT_USUARIO} WHERE u.id = $1 GROUP BY u.id`, [id]));
}));

rotasUsuarios.post('/:id/senha', rota(async (req, res) => {
  const id = Number(req.params.id);
  const alvo = await consultarUm<{ nome: string }>('SELECT nome FROM usuarios WHERE id = $1', [id]);
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  const senha = senhaProvisoria();
  await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = true WHERE id = $2', [gerarHash(senha), id]);
  await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
  await auditar(req, { tipo: 'usuario', entidade: 'usuario', entidadeId: id, valorNovo: 'senha redefinida' });
  res.json({ ok: true, senha_provisoria: senha, nome: alvo.nome });
}));
