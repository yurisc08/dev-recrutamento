/* ============================================================
   CINE 1UP — ui.js
   Componentes de interface reaproveitados entre as páginas.
   ============================================================ */

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Card de post — usado na home e na listagem */
  function card(post, opcoes) {
    const o = opcoes || {};
    const capa = window.CV.capaDe(post, { w: 700, ratio: '3/4' });
    const resumo = post.subtitulo || window.MD.resumo(post.corpo, 110);
    const nota = post.nota != null && post.nota !== ''
      ? `<div class="card__score" title="Nota da redação">${Number(post.nota).toFixed(1)}</div>` : '';
    const rascunho = post.status !== 'publicado'
      ? '<span class="card__flag">rascunho</span>' : '';

    return `
      <article class="card" data-tilt="7" data-reveal${o.delay ? ` style="--d:${o.delay}ms"` : ''}>
        <a class="card__link" href="/post.html?p=${encodeURIComponent(post.slug)}"
           aria-label="${esc(post.titulo)}"></a>
        <div class="card__media">
          <img src="${capa}" alt="Ilustração original para ${esc(post.titulo)}" loading="lazy">
          ${nota}${rascunho}
        </div>
        <div class="card__body">
          <div class="card__meta">
            <span>${esc(post.categoria || 'Cinema')}</span>
            <span>${esc(window.CV.dataBR(post.publicado_em))}</span>
          </div>
          <h3 class="card__title">${esc(post.titulo)}</h3>
          <p class="card__excerpt">${esc(resumo)}</p>
        </div>
      </article>`;
  }

  /* Renderiza uma lista de posts dentro de um container */
  function listar(container, posts, opcoes) {
    if (!container) return;
    if (!posts || !posts.length) {
      container.innerHTML = `<div class="empty" style="grid-column:1/-1">Nada por aqui ainda</div>`;
      return;
    }
    container.innerHTML = posts.map((p, i) => card(p, { delay: i * 70 })).join('');
    if (window.FX) { window.FX.reveal(); window.FX.tilt(); }
  }

  /* Aviso de modo demonstração */
  function avisoDemo() {
    if (!window.CV.modoDemo || sessionStorage.getItem('cv:aviso-demo')) return;
    sessionStorage.setItem('cv:aviso-demo', '1');
    setTimeout(() => {
      window.FX && window.FX.toast('Modo demonstração: preencha assets/js/config.js com o Supabase para usar conteúdo real.');
    }, 2200);
  }

  window.UI = { card, listar, esc, avisoDemo };
})();
