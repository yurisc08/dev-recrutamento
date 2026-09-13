/* ============================================================
   CINEVOLT — home.js
   Preenche o hero com o post em destaque, monta a grade de
   últimas matérias, a tira de filme, o spotlight e a prévia
   animada do jogo.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------- Hero a partir do destaque ---------- */
  async function montarHero() {
    let post;
    try { post = await window.CV.destaque(); } catch (_) { return; }
    if (!post) return;

    const kicker = $('[data-hero-kicker]');
    const titulo = $('[data-hero-titulo]');
    const sub = $('[data-hero-sub]');
    const cta = $('[data-hero-cta]');
    const trailer = $('[data-hero-trailer]');
    const meta = $('[data-hero-meta]');

    if (kicker) kicker.textContent = (post.categoria || 'Destaque') + ' · em destaque';

    if (titulo) {
      // quebra o título em até 3 linhas, destacando a última
      const palavras = String(post.titulo).split(' ');
      const partes = [[], [], []];
      palavras.forEach((p, i) => partes[Math.min(2, Math.floor(i / Math.ceil(palavras.length / 3)))].push(p));
      const linhas = partes.filter(p => p.length).map(p => p.join(' '));
      titulo.innerHTML = linhas
        .map((l, i) => (i === linhas.length - 1 ? `<em>${window.UI.esc(l)}</em>` : window.UI.esc(l)))
        .join('<br>');
    }

    if (sub) sub.textContent = post.subtitulo || window.MD.resumo(post.corpo, 190);

    if (cta) {
      cta.setAttribute('href', '/post.html?p=' + encodeURIComponent(post.slug));
      cta.lastChild.textContent = ' Ler a matéria';
    }

    if (trailer) {
      if (post.trailer_url) trailer.dataset.trailer = post.trailer_url;
      else trailer.style.display = 'none';
    }

    if (meta) {
      const itens = [];
      if (post.nota != null && post.nota !== '') itens.push(`<span>Nota <b>${Number(post.nota).toFixed(1)}</b></span>`);
      if (post.ano) itens.push(`<span>Ano <b>${post.ano}</b></span>`);
      if (post.duracao) itens.push(`<span>Duração <b>${post.duracao} min</b></span>`);
      itens.push(`<span>Leitura <b>${window.CV.tempoLeitura(post.corpo)} min</b></span>`);
      itens.push(`<span>Publicado <b>${window.CV.dataBR(post.publicado_em)}</b></span>`);
      meta.innerHTML = itens.join('');
    }
  }

  /* ---------- Grade de últimas ---------- */
  async function montarLista() {
    const alvo = $('[data-lista-posts]');
    if (!alvo) return;
    try {
      const { dados } = await window.CV.listarPosts({ tamanho: 6 });
      window.UI.listar(alvo, dados);
    } catch (e) {
      alvo.innerHTML = '<div class="empty" style="grid-column:1/-1">Não consegui carregar as matérias</div>';
    }
  }

  /* ---------- Spotlight (leitura longa) ---------- */
  async function montarSpotlight() {
    const box = $('[data-spotlight]');
    if (!box) return;
    try {
      const { dados } = await window.CV.listarPosts({ categoria: 'Ensaio', tamanho: 1 });
      const post = dados[0] || (await window.CV.listarPosts({ tamanho: 3 })).dados[2];
      if (!post) { box.remove(); return; }

      box.querySelector('.spotlight__img').innerHTML =
        `<img src="${window.CV.capaDe(post, { w: 1400, ratio: '16/9' })}" alt="Ilustração para ${window.UI.esc(post.titulo)}">`;
      const h2 = box.querySelector('h2');
      h2.textContent = post.titulo;
      h2.dataset.text = post.titulo;
      box.querySelector('.lead').textContent = post.subtitulo || window.MD.resumo(post.corpo, 180);
      box.querySelector('.btn').setAttribute('href', '/post.html?p=' + encodeURIComponent(post.slug));
    } catch (_) { box.remove(); }
  }

  /* ---------- Tira de filme com arte gerada ---------- */
  async function montarFilmstrip() {
    const track = $('[data-filmstrip]');
    if (!track) return;
    try {
      const { dados } = await window.CV.listarPosts({ tamanho: 8 });
      const fonte = dados.length ? dados : window.CV.DEMO_POSTS;
      track.innerHTML = fonte.concat(fonte).slice(0, 12).map(p => `
        <a class="filmstrip__cell" href="/post.html?p=${encodeURIComponent(p.slug)}" title="${window.UI.esc(p.titulo)}">
          <img src="${window.CV.capaDe(p, { w: 400, ratio: '16/9' })}" alt="" loading="lazy">
        </a>`).join('');
      window.FX && window.FX.marquee();
    } catch (_) { /* silencioso */ }
  }

  /* ---------- Prévia animada do jogo ---------- */
  function previaJogo() {
    const cv = document.getElementById('previaJogo');
    if (!cv || (window.FX && window.FX.reduzido)) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const chao = H - 40;
    let t = 0;
    let obstaculos = [{ x: W + 60 }, { x: W + 320 }];

    (function loop() {
      t += 1;
      ctx.clearRect(0, 0, W, H);

      // chão
      ctx.strokeStyle = 'rgba(0,229,255,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, chao); ctx.lineTo(W, chao); ctx.stroke();

      // marcas correndo
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const x = ((i * 60) - (t * 3.4) % 60 + 60) % (W + 60);
        ctx.beginPath(); ctx.moveTo(x, chao + 10); ctx.lineTo(x + 22, chao + 10); ctx.stroke();
      }

      // herói: rolo de filme girando e pulando
      const salto = Math.max(0, Math.sin(t * 0.05) * 54);
      const hx = 80, hy = chao - 22 - salto;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(t * 0.09);
      ctx.strokeStyle = '#7df9ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#00e5ff';
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // obstáculos
      ctx.fillStyle = '#ffd400';
      ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 10;
      obstaculos.forEach(o => {
        o.x -= 3.4;
        if (o.x < -50) o.x = W + 120 + Math.random() * 200;
        ctx.fillRect(o.x, chao - 26, 16, 26);
      });
      ctx.shadowBlur = 0;

      requestAnimationFrame(loop);
    })();
  }

  async function init() {
    document.getElementById('ano') && (document.getElementById('ano').textContent = new Date().getFullYear());
    window.UI.avisoDemo();
    previaJogo();
    await Promise.all([montarHero(), montarLista(), montarSpotlight(), montarFilmstrip()]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
