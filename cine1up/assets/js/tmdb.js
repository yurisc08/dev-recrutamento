/* ============================================================
   CINE 1UP — tmdb.js
   Busca filmes e séries de verdade no TMDB: em cartaz, estreias,
   séries em alta e detalhes de cada título.

   Dois caminhos, nessa ordem:
     1. /api/tmdb  → função da Cloudflare que guarda a chave no
        servidor (recomendado: a chave não aparece no navegador)
     2. chamada direta com a chave de assets/js/config.js

   Tudo fica em cache no navegador por algumas horas, para não
   bater na API a cada visita.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.CINE1UP;
  const BASE = 'https://api.themoviedb.org/3';
  const IMG = 'https://image.tmdb.org/t/p/';
  const CACHE_PREFIX = 'cine1up:tmdb:';
  const VALIDADE = 6 * 60 * 60 * 1000;   // 6 horas

  let proxyFuncionou = null;             // null = ainda não sei

  /* ---------- Cache ---------- */
  function doCache(chave) {
    try {
      const bruto = localStorage.getItem(CACHE_PREFIX + chave);
      if (!bruto) return null;
      const { quando, dados } = JSON.parse(bruto);
      if (Date.now() - quando > VALIDADE) return null;
      return dados;
    } catch (_) { return null; }
  }

  function guardar(chave, dados) {
    try {
      localStorage.setItem(CACHE_PREFIX + chave,
        JSON.stringify({ quando: Date.now(), dados }));
    } catch (_) { /* cota cheia: segue sem cache */ }
  }

  /* ---------- Requisição ---------- */
  async function buscar(caminho, params) {
    const chave = caminho + JSON.stringify(params || {});
    const cacheado = doCache(chave);
    if (cacheado) return cacheado;

    const query = Object.assign({ language: 'pt-BR' }, params || {});

    /* 1. proxy da Cloudflare */
    if (proxyFuncionou !== false) {
      try {
        const u = new URL('/api/tmdb', location.origin);
        u.searchParams.set('path', caminho);
        Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
        const r = await fetch(u, { headers: { accept: 'application/json' } });
        if (r.ok) {
          const dados = await r.json();
          proxyFuncionou = true;
          guardar(chave, dados);
          return dados;
        }
        proxyFuncionou = false;
      } catch (_) { proxyFuncionou = false; }
    }

    /* 2. chamada direta com a chave pública */
    if (!CFG.TMDB_KEY) throw new Error('sem-chave');
    const u = new URL(BASE + caminho);
    u.searchParams.set('api_key', CFG.TMDB_KEY);
    Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u);
    if (!r.ok) throw new Error('tmdb-' + r.status);
    const dados = await r.json();
    guardar(chave, dados);
    return dados;
  }

  /* ---------- Normaliza filme e série no mesmo formato ---------- */
  function normalizar(item, tipo) {
    const t = tipo || item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const data = item.release_date || item.first_air_date || '';
    return {
      id: item.id,
      tipo: t,
      titulo: item.title || item.name || 'Sem título',
      original: item.original_title || item.original_name || '',
      sinopse: item.overview || '',
      poster: item.poster_path ? IMG + 'w500' + item.poster_path : null,
      fundo: item.backdrop_path ? IMG + 'w1280' + item.backdrop_path : null,
      nota: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
      votos: item.vote_count || 0,
      data,
      ano: data ? data.slice(0, 4) : '',
      popularidade: item.popularity || 0
    };
  }

  function lista(resposta, tipo) {
    return (resposta.results || [])
      .filter(i => i.poster_path || i.backdrop_path)
      .map(i => normalizar(i, tipo));
  }

  /* ---------- Consultas prontas ---------- */
  const emCartaz = () =>
    buscar('/movie/now_playing', { region: 'BR', page: 1 }).then(r => lista(r, 'movie'));

  const estreias = () =>
    buscar('/movie/upcoming', { region: 'BR', page: 1 })
      .then(r => lista(r, 'movie')
        .filter(f => !f.data || new Date(f.data) >= new Date(Date.now() - 864e5))
        .sort((a, b) => new Date(a.data) - new Date(b.data)));

  const seriesEmAlta = () =>
    buscar('/trending/tv/week').then(r => lista(r, 'tv'));

  const filmesEmAlta = () =>
    buscar('/trending/movie/week').then(r => lista(r, 'movie'));

  const populares = tipo =>
    buscar(`/${tipo === 'tv' ? 'tv' : 'movie'}/popular`, { region: 'BR' })
      .then(r => lista(r, tipo));

  async function detalhes(tipo, id) {
    const d = await buscar(`/${tipo}/${id}`, { append_to_response: 'videos,credits' });
    const base = normalizar(d, tipo);
    const trailer = (d.videos && d.videos.results || [])
      .filter(v => v.site === 'YouTube' && /trailer|teaser/i.test(v.type))
      .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

    return Object.assign(base, {
      generos: (d.genres || []).map(g => g.name),
      duracao: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
      temporadas: d.number_of_seasons || null,
      episodios: d.number_of_episodes || null,
      situacao: d.status || '',
      elenco: (d.credits && d.credits.cast || []).slice(0, 6).map(p => ({
        nome: p.name, papel: p.character,
        foto: p.profile_path ? IMG + 'w185' + p.profile_path : null
      })),
      direcao: (d.credits && d.credits.crew || [])
        .filter(p => p.job === 'Director' || p.job === 'Creator')
        .map(p => p.name),
      trailer: trailer ? 'https://www.youtube.com/watch?v=' + trailer.key : null
    });
  }

  /* ---------- Manchetes para o ticker, montadas com dados reais ---------- */
  async function manchetes() {
    const [cartaz, novas, series] = await Promise.all([
      emCartaz().catch(() => []),
      estreias().catch(() => []),
      seriesEmAlta().catch(() => [])
    ]);

    const linhas = [];

    cartaz.slice(0, 4).forEach(f => {
      linhas.push(`EM CARTAZ · ${f.titulo}${f.nota ? ` · nota ${f.nota}` : ''}`);
    });

    novas.slice(0, 4).forEach(f => {
      const d = f.data ? new Date(f.data + 'T12:00:00')
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
      linhas.push(`ESTREIA${d ? ' ' + d : ''} · ${f.titulo}`);
    });

    series.slice(0, 4).forEach(s => {
      linhas.push(`SÉRIE EM ALTA · ${s.titulo}${s.ano ? ` (${s.ano})` : ''}`);
    });

    return linhas;
  }

  function limparCache() {
    try {
      Object.keys(localStorage)
        .filter(k => k.indexOf(CACHE_PREFIX) === 0)
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  const configurado = () => !!CFG.TMDB_KEY || proxyFuncionou !== false;

  window.TMDB = {
    emCartaz, estreias, seriesEmAlta, filmesEmAlta, populares,
    detalhes, manchetes, limparCache, configurado, normalizar, IMG
  };
})();
