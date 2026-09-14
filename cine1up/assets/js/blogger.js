/* ============================================================
   CINE 1UP — blogger.js
   Só entra na versão do Blogger.

   Por que este arquivo existe: o interpretador de temas do Blogger
   recusa boa parte dos campos antigos (data:post.snippet,
   firstImageUrl, dateHeader) e não aceita expressão complicada
   dentro de expr:. Cada um desses já basta para o upload do tema
   falhar com uma lista de erros.

   A saída é não pedir quase nada a ele: o tema só usa título e
   corpo na página da matéria, e a lista da capa é montada aqui,
   lendo o feed JSON do próprio blog — que é público, estável e
   está na mesma origem (sem CORS).

   Feed usado: /feeds/posts/summary/default?alt=json
   ============================================================ */

(function () {
  'use strict';

  /* A miniatura do feed vem em 72px. Trocando o trecho do tamanho
     na URL, o mesmo arquivo volta grande. */
  function imagemGrande(url) {
    if (!url) return null;
    return url
      .replace(/\/s\d+(-c)?\//, '/w700/')
      .replace(/=s\d+(-c)?$/, '=w700');
  }

  function limpar(txt) {
    return String(txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function dataBR(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR',
      { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function normalizar(entrada) {
    const link = (entrada.link || []).filter(l => l.rel === 'alternate')[0];
    const texto = (entrada.summary && entrada.summary.$t) ||
                  (entrada.content && entrada.content.$t) || '';
    return {
      titulo: (entrada.title && entrada.title.$t) || 'Sem título',
      resumo: limpar(texto).slice(0, 130),
      url: link ? link.href : '#',
      categoria: (entrada.category && entrada.category[0] && entrada.category[0].term) || 'Cinema',
      data: (entrada.published && entrada.published.$t) || '',
      imagem: imagemGrande(entrada['media$thumbnail'] && entrada['media$thumbnail'].url)
    };
  }

  async function buscar(quantos, rotulo) {
    let url = '/feeds/posts/summary/default';
    if (rotulo) url += '/-/' + encodeURIComponent(rotulo);
    url += '?alt=json&max-results=' + (quantos || 12);

    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('feed-' + r.status);
    const j = await r.json();
    return ((j.feed && j.feed.entry) || []).map(normalizar);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function card(post, i) {
    const capa = post.imagem
      ? `<img src="${esc(post.imagem)}" alt="" loading="lazy">`
      : `<img src="${window.Art.posterURL(post.url || post.titulo, {
            categoria: post.categoria, w: 700, ratio: '3/4' })}" alt="" loading="lazy">`;

    return `
      <article class="card" data-tilt="7" data-reveal="true" style="--d:${i * 70}ms">
        <a class="card__link" href="${esc(post.url)}"><span class="sr-only">${esc(post.titulo)}</span></a>
        <div class="card__media">${capa}</div>
        <div class="card__body">
          <div class="card__meta">
            <span>${esc(post.categoria)}</span><span>${esc(dataBR(post.data))}</span>
          </div>
          <h3 class="card__title">${esc(post.titulo)}</h3>
          <p class="card__excerpt">${esc(post.resumo)}</p>
        </div>
      </article>`;
  }

  async function montarLista(seletor, opcoes) {
    const caixa = document.querySelector(seletor);
    if (!caixa) return;
    const o = opcoes || {};
    try {
      const posts = await buscar(o.quantos || 12, o.rotulo);

      if (!posts.length) {
        /* Seção de marcador sem nenhum post ainda: em vez de mostrar
           um vazio triste, a seção inteira sai da página. */
        if (o.sumirSeVazio) {
          const secao = caixa.closest('.secao-feed');
          (secao || caixa).remove();
        } else {
          caixa.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
            'Nenhuma matéria publicada ainda</div>';
        }
        return;
      }
      caixa.innerHTML = posts.map(card).join('');
      if (window.FX) { window.FX.reveal(); window.FX.tilt(); }
    } catch (e) {
      if (o.sumirSeVazio) {
        const secao = caixa.closest('.secao-feed');
        (secao || caixa).remove();
      } else {
        caixa.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
          'Não consegui carregar as matérias</div>';
      }
    }
  }

  window.BloggerFeed = { buscar, montarLista, card, imagemGrande, dataBR };
})();
