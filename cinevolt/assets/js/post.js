/* ============================================================
   CINEVOLT — post.js
   Monta a matéria a partir de ?p=slug: capa com raios, ficha
   técnica, corpo em markdown, tags, compartilhamento e relacionados.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const slug = new URLSearchParams(location.search).get('p');

  function naoEncontrado() {
    $('[data-post-titulo]').textContent = 'Matéria não encontrada';
    $('[data-post-sub]').innerHTML =
      'O link pode ter mudado. <a class="link-fx" href="/arquivo.html">Ver o arquivo</a>.';
    $('[data-post-corpo]').innerHTML = '';
  }

  function fichaTecnica(post) {
    const box = $('[data-ficha]');
    const campos = [
      ['Direção', post.diretor],
      ['Ano', post.ano],
      ['Duração', post.duracao ? post.duracao + ' min' : null],
      ['Nota', post.nota != null && post.nota !== '' ? Number(post.nota).toFixed(1) : null]
    ].filter(c => c[1]);

    if (!campos.length) return;
    box.hidden = false;
    box.innerHTML = campos.map(([k, v]) => `
      <div class="ficha__item">
        <span class="ficha__label">${k}</span>
        <span class="ficha__valor">${window.UI.esc(v)}</span>
      </div>`).join('') +
      (post.trailer_url
        ? `<button class="btn btn--sm" data-trailer="${window.UI.esc(post.trailer_url)}">▶ Trailer</button>`
        : '');
  }

  function capaComRaios(post) {
    const img = $('.post-capa__img');
    img.style.backgroundImage = `url("${window.CV.capaDe(post, { w: 1600, ratio: '16/9' })}")`;

    const cv = $('.post-capa__bolts');
    if (!cv || !window.Storm || (window.FX && window.FX.reduzido)) return;
    const storm = new window.Storm(cv, {
      ambiente: false,
      intervalo: [3800, 8000],
      aoRaio: ({ x }) => {
        const w = cv.getBoundingClientRect().width || 1;
        window.FX && window.FX.flash((x / w) * 100);
      }
    });
    storm.start();
  }

  function compartilhar(post) {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-share]');
      if (!b) return;
      const url = location.href;
      const txt = `${post.titulo} — CINEVOLT`;
      if (b.dataset.share === 'x') {
        open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
      } else if (b.dataset.share === 'wpp') {
        open(`https://wa.me/?text=${encodeURIComponent(txt + ' ' + url)}`, '_blank', 'noopener');
      } else {
        navigator.clipboard.writeText(url)
          .then(() => window.FX.toast('Link copiado ⚡', 'ok'))
          .catch(() => window.FX.toast('Não consegui copiar', 'err'));
      }
    });
  }

  async function init() {
    const ano = document.getElementById('ano');
    if (ano) ano.textContent = new Date().getFullYear();
    window.UI.avisoDemo();

    if (!slug) return naoEncontrado();

    let post;
    try { post = await window.CV.postPorSlug(slug); }
    catch (_) { return naoEncontrado(); }
    if (!post) return naoEncontrado();

    /* --- cabeçalho --- */
    document.title = post.titulo + ' — CINEVOLT';
    const desc = document.querySelector('meta[name=description]');
    if (desc) desc.setAttribute('content', post.subtitulo || window.MD.resumo(post.corpo, 150));

    $('[data-post-cat]').textContent = post.categoria || 'Cinema';
    $('[data-post-titulo]').textContent = post.titulo;
    $('[data-post-sub]').textContent = post.subtitulo || '';

    $('[data-post-meta]').innerHTML = [
      post.autor ? `<span>Por <b>${window.UI.esc(post.autor)}</b></span>` : '',
      `<span>${window.CV.dataBR(post.publicado_em)}</span>`,
      `<span>${window.CV.tempoLeitura(post.corpo)} min de leitura</span>`
    ].filter(Boolean).join('');

    capaComRaios(post);
    fichaTecnica(post);

    /* --- corpo --- */
    $('[data-post-corpo]').innerHTML = window.MD.render(post.corpo);

    /* --- tags --- */
    const tags = post.tags || [];
    $('[data-post-tags]').innerHTML = tags
      .map(t => `<a class="pill" href="/arquivo.html?q=${encodeURIComponent(t)}">#${window.UI.esc(t)}</a>`).join('');

    compartilhar(post);
    window.CV.registrarView(post.slug);

    /* --- relacionados --- */
    const rel = await window.CV.relacionados(post, 3);
    const box = document.querySelector('[data-relacionados]');
    if (rel.length) window.UI.listar(box, rel);
    else box.closest('section').remove();

    window.FX && window.FX.reveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
