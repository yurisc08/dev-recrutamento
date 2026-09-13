/* ============================================================
   CINE 1UP — functions/api/tmdb.js
   Função da Cloudflare Pages que fala com o TMDB no servidor,
   para a chave nunca aparecer no navegador.

   Configure em: Pages → Settings → Environment variables
     TMDB_KEY = sua chave v3 do TMDB

   Uso pelo site: /api/tmdb?path=/movie/now_playing&region=BR
   ============================================================ */

/* Só estes caminhos são aceitos — evita virar proxy aberto */
const PERMITIDOS = [
  /^\/movie\/now_playing$/,
  /^\/movie\/upcoming$/,
  /^\/movie\/popular$/,
  /^\/tv\/popular$/,
  /^\/trending\/(movie|tv)\/(day|week)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/search\/(movie|tv|multi)$/
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';

  if (!PERMITIDOS.some(re => re.test(path))) {
    return json({ erro: 'caminho não permitido' }, 400);
  }

  if (!env.TMDB_KEY) {
    return json({ erro: 'TMDB_KEY não configurada nas variáveis de ambiente' }, 501);
  }

  const alvo = new URL('https://api.themoviedb.org/3' + path);
  alvo.searchParams.set('api_key', env.TMDB_KEY);
  url.searchParams.forEach((v, k) => {
    if (k !== 'path' && k !== 'api_key') alvo.searchParams.set(k, v);
  });
  if (!alvo.searchParams.get('language')) alvo.searchParams.set('language', 'pt-BR');

  try {
    const r = await fetch(alvo.toString(), {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const corpo = await r.text();
    return new Response(corpo, {
      status: r.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=1800, s-maxage=3600',
        'access-control-allow-origin': url.origin
      }
    });
  } catch (e) {
    return json({ erro: 'falha ao falar com o TMDB' }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
