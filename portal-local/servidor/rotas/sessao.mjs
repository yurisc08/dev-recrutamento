/** Login, logout, primeiro acesso e troca de senha. */
import { agora } from '../banco.mjs';
import { ErroApi } from '../dominio.mjs';
import { auditar, carregarUsuario, contextoDoUsuario } from '../contexto.mjs';
import { conferirSenha, gerarHash, novoIdSessao, resumoConvite, validarSenha } from '../senha.mjs';

export const COOKIE = 'portal_sessao';

export function montarCookie(valor, expira, seguro) {
  const partes = [`${COOKIE}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    `Expires=${expira.toUTCString()}`];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

export const cookieVazio = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

function abrirSessao(ctx, usuarioId) {
  const horas = Number(ctx.config.sessaoHoras ?? 8);
  const expira = new Date(Date.now() + horas * 3600 * 1000);
  const id = novoIdSessao();
  ctx.acesso.executar(
    'INSERT INTO sessoes (id, usuario_id, criado_em, expira_em, ip, navegador) VALUES (?, ?, ?, ?, ?, ?)',
    id, usuarioId, agora(), expira.toISOString(), ctx.ip, String(ctx.req.headers['user-agent'] ?? '').slice(0, 200));
  ctx.acesso.executar('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', agora(), usuarioId);
  ctx.acesso.executar('DELETE FROM sessoes WHERE expira_em < ?', agora());
  ctx.cabecalho('Set-Cookie', montarCookie(id, expira, ctx.config.seguro));
}

export const rotasSessao = [
  ['POST', '/api/auth/login', async (ctx) => {
    const corpo = await ctx.corpo();
    const login = String(corpo.usuario ?? '').trim().toLowerCase();
    const senha = String(corpo.senha ?? '');
    if (!login || !senha) throw new ErroApi(400, 'Informe usuário e senha.');

    const limite = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const tentativas = ctx.acesso.primeiro(
      'SELECT COUNT(*) AS total FROM tentativas_login WHERE usuario = ? AND sucesso = 0 AND criado_em > ?',
      login, limite);
    if (Number(tentativas?.total ?? 0) >= 5) {
      ctx.acesso.executar('INSERT INTO tentativas_login (usuario, ip, sucesso, criado_em) VALUES (?, ?, 0, ?)',
        login, ctx.ip, agora());
      throw new ErroApi(429, 'Muitas tentativas. Aguarde alguns minutos ou procure o administrador.');
    }

    const linha = ctx.acesso.primeiro(
      'SELECT id, senha_hash, ativo, trocar_senha FROM usuarios WHERE lower(usuario) = ?', login);

    // Acesso criado e ainda não ativado: não existe senha para ele, nem o RH tem.
    if (linha && linha.ativo && !linha.senha_hash) {
      ctx.acesso.executar('INSERT INTO tentativas_login (usuario, ip, sucesso, criado_em) VALUES (?, ?, 0, ?)',
        login, ctx.ip, agora());
      throw new ErroApi(409, 'Este acesso ainda não foi ativado. Abra o link de primeiro acesso que o RH ou a Diretoria enviou para definir a sua senha.');
    }

    const valido = Boolean(linha?.ativo) && Boolean(linha?.senha_hash) && conferirSenha(senha, linha.senha_hash);
    ctx.acesso.executar('INSERT INTO tentativas_login (usuario, ip, sucesso, criado_em) VALUES (?, ?, ?, ?)',
      login, ctx.ip, valido ? 1 : 0, agora());

    if (!valido) {
      auditar(ctx.acesso, { tipo: 'login_falha', detalhes: { usuario: login }, ip: ctx.ip });
      throw new ErroApi(401, 'Usuário ou senha inválidos.');
    }

    const usuario = carregarUsuario(ctx.acesso, linha.id);
    if (!usuario) throw new ErroApi(500, 'Falha ao carregar o usuário.');
    abrirSessao(ctx, usuario.id);
    auditar(ctx.acesso, { usuario, tipo: 'login', entidade: 'usuario', entidadeId: usuario.id, ip: ctx.ip });

    if (usuario.trocar_senha) return { trocar_senha: true, usuario: { nome: usuario.nome, usuario: usuario.usuario } };
    return contextoDoUsuario(ctx.acesso, usuario);
  }],

  ['POST', '/api/auth/logout', async (ctx) => {
    if (ctx.usuario) {
      auditar(ctx.acesso, { usuario: ctx.usuario, tipo: 'logout', entidade: 'usuario', entidadeId: ctx.usuario.id, ip: ctx.ip });
    }
    if (ctx.sessaoId) ctx.acesso.executar('DELETE FROM sessoes WHERE id = ?', ctx.sessaoId);
    ctx.cabecalho('Set-Cookie', cookieVazio);
    return { ok: true };
  }],

  ['GET', '/api/auth/eu', async (ctx) => {
    if (!ctx.usuario) throw new ErroApi(401, 'Não autenticado.');
    if (ctx.usuario.trocar_senha) {
      return { trocar_senha: true, usuario: { nome: ctx.usuario.nome, usuario: ctx.usuario.usuario } };
    }
    return contextoDoUsuario(ctx.acesso, ctx.usuario);
  }],

  /* Primeiro acesso: quem define a senha é a própria pessoa. */
  ['GET', /^\/api\/auth\/ativacao\/([a-f0-9]{32,128})$/, async (ctx) => {
    const linha = buscarConvite(ctx, ctx.params[0]);
    return { nome: linha.nome, usuario: linha.usuario, perfil: linha.perfil };
  }],

  ['POST', /^\/api\/auth\/ativacao\/([a-f0-9]{32,128})$/, async (ctx) => {
    const linha = buscarConvite(ctx, ctx.params[0]);
    const corpo = await ctx.corpo();
    const senha = String(corpo.senha ?? '');
    const problema = validarSenha(senha);
    if (problema) throw new ErroApi(422, problema);
    if (String(corpo.confirmacao ?? senha) !== senha) throw new ErroApi(422, 'A confirmação não confere com a senha digitada.');

    ctx.acesso.executar(`
      UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, ativacao_hash = NULL,
                          ativacao_expira_em = NULL, senha_definida_em = ?
       WHERE id = ?`, gerarHash(senha), agora(), linha.id);

    const usuario = carregarUsuario(ctx.acesso, linha.id);
    abrirSessao(ctx, usuario.id);
    auditar(ctx.acesso, { usuario, tipo: 'ativacao', entidade: 'usuario', entidadeId: usuario.id, ip: ctx.ip });
    return contextoDoUsuario(ctx.acesso, usuario);
  }],

  ['POST', '/api/auth/senha', async (ctx) => {
    if (!ctx.usuario) throw new ErroApi(401, 'Não autenticado.');
    const corpo = await ctx.corpo();
    const atual = String(corpo.senha_atual ?? '');
    const nova = String(corpo.nova_senha ?? '');

    const linha = ctx.acesso.primeiro('SELECT senha_hash FROM usuarios WHERE id = ?', ctx.usuario.id);
    if (!linha?.senha_hash || !conferirSenha(atual, linha.senha_hash)) throw new ErroApi(401, 'Senha atual incorreta.');
    const problema = validarSenha(nova);
    if (problema) throw new ErroApi(422, problema);
    if (atual === nova) throw new ErroApi(422, 'A nova senha deve ser diferente da atual.');

    ctx.acesso.executar('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, senha_definida_em = ? WHERE id = ?',
      gerarHash(nova), agora(), ctx.usuario.id);
    ctx.acesso.executar('DELETE FROM sessoes WHERE usuario_id = ? AND id <> ?', ctx.usuario.id, ctx.sessaoId ?? '');
    auditar(ctx.acesso, { usuario: ctx.usuario, tipo: 'senha', entidade: 'usuario', entidadeId: ctx.usuario.id, ip: ctx.ip });

    ctx.usuario.trocar_senha = false;
    return contextoDoUsuario(ctx.acesso, ctx.usuario);
  }],
];

function buscarConvite(ctx, convite) {
  const linha = ctx.acesso.primeiro(
    'SELECT id, nome, usuario, perfil, ativo, ativacao_expira_em FROM usuarios WHERE ativacao_hash = ?',
    resumoConvite(convite));
  if (!linha || !linha.ativo) {
    throw new ErroApi(404, 'Link de primeiro acesso inválido ou já utilizado. Peça um novo ao RH ou à sua Diretoria.');
  }
  if (linha.ativacao_expira_em && linha.ativacao_expira_em < agora()) {
    throw new ErroApi(410, 'Este link de primeiro acesso venceu. Peça um novo ao RH ou à sua Diretoria.');
  }
  return linha;
}
