import { Hono } from 'hono';
import type { Ambiente, Variaveis } from './tipos.js';
import { conectar } from './db.js';
import { ErroApi } from './dominio.js';
import { criarFiltroIp } from './rede.js';
import { validarAccess } from './access.js';
import { NOME_COOKIE, carregarUsuario, lerCookie, rotasSessao } from './rotas/sessao.js';
import { rotasDados } from './rotas/dados.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasPlanilha } from './rotas/planilha.js';

export const app = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

/* 1. cabeçalhos de segurança + IP de origem ---------------------------- */
app.use('*', async (ctx, proximo) => {
  ctx.set('ip', ctx.req.header('cf-connecting-ip') ?? ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '');
  await proximo();
  ctx.header('X-Content-Type-Options', 'nosniff');
  ctx.header('Referrer-Policy', 'no-referrer');
  ctx.header('X-Frame-Options', 'DENY');
  ctx.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  ctx.header('Cache-Control', 'no-store');
});

/* 2. teste de saúde (sem trava, para o monitoramento) ------------------- */
app.get('/api/saude', (ctx) => ctx.json({ ok: true, agora: new Date().toISOString() }));

/* 3. trava de rede: faixas de IP e crachá do Cloudflare Access ---------- */
app.use('/api/*', async (ctx, proximo) => {
  const filtro = criarFiltroIp(ctx.env.IPS_PERMITIDOS);
  if (filtro.ativo && !filtro.permitido(ctx.get('ip'))) {
    return ctx.json({ erro: 'Acesso permitido apenas pela rede da empresa. Conecte-se à VPN corporativa e tente novamente.' }, 403);
  }
  if (ctx.env.ACCESS_DOMINIO) {
    const resultado = await validarAccess(
      ctx.req.header('cf-access-jwt-assertion') ?? null,
      ctx.env.ACCESS_DOMINIO,
      ctx.env.ACCESS_AUD ?? '',
    );
    if (!resultado.valido) {
      return ctx.json({ erro: 'Acesso corporativo não confirmado. Entre novamente pelo endereço do portal.', detalhe: resultado.motivo }, 403);
    }
  }
  await proximo();
});

/* 4. proteção contra envio a partir de outro site ---------------------- */
app.use('/api/*', async (ctx, proximo) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(ctx.req.method) && ctx.req.header('x-portal') !== '1') {
    return ctx.json({ erro: 'Requisição inválida.' }, 403);
  }
  await proximo();
});

/* 5. conexão com o Supabase, aberta e fechada por requisição ------------ */
app.use('/api/*', async (ctx, proximo) => {
  const sql = conectar(ctx.env);
  ctx.set('sql', sql);
  try {
    await proximo();
  } finally {
    const encerrar = sql.end({ timeout: 5 });
    // No Workers a conexão fecha em segundo plano; fora dele (testes) aguarda.
    let emSegundoPlano = false;
    try {
      ctx.executionCtx.waitUntil(encerrar);
      emSegundoPlano = true;
    } catch {
      emSegundoPlano = false;
    }
    if (!emSegundoPlano) await encerrar;
  }
});

/* 6. sessão ------------------------------------------------------------ */
app.use('/api/*', async (ctx, proximo) => {
  const id = lerCookie(ctx.req.header('cookie'), NOME_COOKIE);
  if (id) {
    const sql = ctx.get('sql');
    const [sessao] = await sql<{ usuario_id: number; expira_em: Date }[]>`
      SELECT usuario_id, expira_em FROM portal.sessoes WHERE id = ${id}`;
    if (sessao && new Date(sessao.expira_em) > new Date()) {
      const usuario = await carregarUsuario(sql, sessao.usuario_id);
      if (usuario) {
        ctx.set('usuario', usuario);
        ctx.set('sessaoId', id);
      }
    } else if (sessao) {
      await sql`DELETE FROM portal.sessoes WHERE id = ${id}`;
    }
  }
  await proximo();
});

/* 7. login obrigatório fora de /api/auth ------------------------------- */
app.use('/api/*', async (ctx, proximo) => {
  const caminho = new URL(ctx.req.url).pathname;
  if (caminho.startsWith('/api/auth/') || caminho === '/api/saude') return proximo();
  const usuario = ctx.get('usuario');
  if (!usuario) return ctx.json({ erro: 'Sessão expirada. Faça login novamente.' }, 401);
  if (usuario.trocar_senha) {
    return ctx.json({ erro: 'Troque a senha provisória antes de continuar.', detalhes: { trocar_senha: true } }, 403);
  }
  await proximo();
});

/* 8. rotas ------------------------------------------------------------- */
app.route('/api/auth', rotasSessao);
app.route('/api', rotasDados);
app.route('/api', rotasAdmin);
app.route('/api', rotasPlanilha);

app.all('/api/*', (ctx) => ctx.json({ erro: 'Recurso não encontrado.' }, 404));

app.onError((erro, ctx) => {
  const http = erro as ErroApi;
  const status = typeof http?.status === 'number' ? http.status : 500;
  if (status >= 500) console.error('[erro]', ctx.req.method, ctx.req.url, erro);
  return ctx.json({
    erro: status >= 500 ? 'Erro interno. Procure o administrador do portal.' : erro.message,
    ...(http?.detalhes ? { detalhes: http.detalhes } : {}),
  }, status as 400);
});

export default app;
