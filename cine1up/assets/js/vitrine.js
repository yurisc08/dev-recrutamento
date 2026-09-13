/* ============================================================
   CINE 1UP — vitrine.js
   Mostra os títulos vindos do TMDB em prateleiras roláveis e abre
   a ficha completa (sinopse, nota, elenco, trailer) ao clicar.
   ============================================================ */

(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const dataBR = iso => iso
    ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  /* ---------- Cartaz de um título ---------- */
  function cartaz(item, i) {
    const nota = item.nota
      ? `<span class="cartaz__nota">${item.nota.toFixed(1)}</span>` : '';
    const capa = item.poster
      ? `<img src="${item.poster}" alt="Pôster de ${esc(item.titulo)}" loading="lazy">`
      : `<img src="${window.Art.posterURL(item.titulo, { w: 400, ratio: '3/4' })}" alt="" loading="lazy">`;

    return `
      <article class="cartaz" data-ficha="${item.tipo}:${item.id}" tabindex="0"
               style="--d:${i * 55}ms" role="button" aria-label="Ver ficha de ${esc(item.titulo)}">
        <div class="cartaz__capa">${capa}${nota}</div>
        <h3 class="cartaz__titulo">${esc(item.titulo)}</h3>
        <p class="cartaz__meta">${esc(item.ano || dataBR(item.data) || '')}</p>
      </article>`;
  }

  function esqueleto(n) {
    return new Array(n || 6).fill(
      '<div class="cartaz"><div class="cartaz__capa skeleton"></div></div>').join('');
  }

  function semChave(caixa) {
    caixa.innerHTML = `
      <div class="vitrine-aviso">
        <strong>Falta ligar o TMDB.</strong>
        As estreias, o "em cartaz" e as séries em alta vêm da API gratuita do
        TMDB. Crie a chave em <span class="mono">themoviedb.org → Configurações →
        API</span> e coloque em <span class="mono">TMDB_KEY</span> — nas variáveis
        de ambiente da Cloudflare (recomendado) ou em
        <span class="mono">assets/js/config.js</span>.
        O passo a passo está no README.
      </div>`;
  }

  /* ---------- Monta uma prateleira ---------- */
  async function montar(seletor, consulta, opcoes) {
    const caixa = typeof seletor === 'string' ? $(seletor) : seletor;
    if (!caixa) return;
    const o = opcoes || {};
    caixa.innerHTML = esqueleto(o.quantos || 6);

    try {
      const itens = (await consulta()).slice(0, o.quantos || 12);
      if (!itens.length) {
        caixa.innerHTML = '<div class="empty">Nada por aqui agora</div>';
        return;
      }
      caixa.innerHTML = itens.map(cartaz).join('');
      caixa.classList.add('is-pronta');
    } catch (e) {
      if (String(e.message).indexOf('sem-chave') >= 0) semChave(caixa);
      else caixa.innerHTML = '<div class="empty">Não consegui carregar agora</div>';
    }
  }

  /* ---------- Ficha completa ---------- */
  function abrirFicha(tipo, id) {
    let modal = $('.ficha-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'ficha-modal';
      modal.innerHTML = `
        <div class="ficha-modal__caixa" role="dialog" aria-modal="true" aria-label="Ficha do título">
          <button class="ficha-modal__fechar" aria-label="Fechar">✕</button>
          <div class="ficha-modal__corpo"></div>
        </div>`;
      document.body.appendChild(modal);

      modal.addEventListener('click', e => {
        if (e.target === modal || e.target.closest('.ficha-modal__fechar')) fecharFicha();
      });
      addEventListener('keydown', e => { if (e.key === 'Escape') fecharFicha(); });
    }

    const corpo = $('.ficha-modal__corpo', modal);
    corpo.innerHTML = '<div class="ficha-modal__carregando"><span class="spinner"></span></div>';
    modal.classList.add('is-aberta');
    document.body.classList.add('is-locked');

    window.TMDB.detalhes(tipo, id).then(d => {
      const linhas = [];
      if (d.ano) linhas.push(['Ano', d.ano]);
      if (d.duracao) linhas.push(['Duração', d.duracao + ' min']);
      if (d.temporadas) linhas.push(['Temporadas', d.temporadas]);
      if (d.episodios) linhas.push(['Episódios', d.episodios]);
      if (d.direcao && d.direcao.length) linhas.push(['Direção', d.direcao.join(', ')]);
      if (d.generos.length) linhas.push(['Gênero', d.generos.join(', ')]);

      corpo.innerHTML = `
        ${d.fundo ? `<div class="ficha-modal__fundo" style="background-image:url('${d.fundo}')"></div>` : ''}
        <div class="ficha-modal__topo">
          ${d.poster ? `<img class="ficha-modal__poster" src="${d.poster}" alt="">` : ''}
          <div>
            <span class="eyebrow">${d.tipo === 'tv' ? 'Série' : 'Filme'}${d.situacao ? ' · ' + esc(d.situacao) : ''}</span>
            <h2>${esc(d.titulo)}</h2>
            ${d.original && d.original !== d.titulo ? `<p class="ficha-modal__original">${esc(d.original)}</p>` : ''}
            <div class="ficha-modal__notas">
              ${d.nota ? `<span class="cartaz__nota cartaz__nota--grande">${d.nota.toFixed(1)}</span>` : ''}
              <span class="pixel">${d.votos ? d.votos.toLocaleString('pt-BR') + ' votos' : 'sem votos ainda'}</span>
            </div>
            <div class="acoes-arcade" style="margin-top:18px">
              ${d.trailer ? `<button class="btn-arcade" data-trailer="${d.trailer}">▶ Trailer</button>` : ''}
              <a class="btn-arcade btn-arcade--ghost" href="/admin.html">✎ Escrever crítica</a>
            </div>
          </div>
        </div>

        ${d.sinopse ? `<p class="ficha-modal__sinopse">${esc(d.sinopse)}</p>` : ''}

        ${linhas.length ? `<dl class="ficha-modal__dados">${linhas
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}

        ${d.elenco.length ? `
          <h4 class="ficha-modal__sub">Elenco</h4>
          <div class="elenco">${d.elenco.map(p => `
            <figure class="elenco__item">
              ${p.foto ? `<img src="${p.foto}" alt="" loading="lazy">`
                       : '<div class="elenco__sem"></div>'}
              <figcaption><b>${esc(p.nome)}</b><span>${esc(p.papel || '')}</span></figcaption>
            </figure>`).join('')}</div>` : ''}`;
    }).catch(() => {
      corpo.innerHTML = '<div class="empty">Não consegui carregar a ficha</div>';
    });
  }

  function fecharFicha() {
    const modal = $('.ficha-modal');
    if (!modal) return;
    modal.classList.remove('is-aberta');
    document.body.classList.remove('is-locked');
  }

  /* ---------- Ticker de manchetes ---------- */
  async function ticker(seletor) {
    const trilho = $(seletor);
    if (!trilho) return;
    try {
      const linhas = await window.TMDB.manchetes();
      if (!linhas.length) return;
      trilho.innerHTML = linhas
        .map(l => `<span class="marquee__item"><i></i> ${esc(l)}</span>`).join('');
      window.FX && window.FX.marquee();
    } catch (_) { /* deixa as manchetes de exemplo que já estão no HTML */ }
  }

  /* ---------- Liga os cliques ---------- */
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-ficha]');
    if (!alvo) return;
    const [tipo, id] = alvo.dataset.ficha.split(':');
    abrirFicha(tipo, id);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const alvo = e.target.closest && e.target.closest('[data-ficha]');
    if (!alvo) return;
    e.preventDefault();
    const [tipo, id] = alvo.dataset.ficha.split(':');
    abrirFicha(tipo, id);
  });

  /* ---------- Setas de rolagem das prateleiras ---------- */
  function ligarSetas() {
    $$('[data-rolar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trilho = $(btn.dataset.rolar);
        if (!trilho) return;
        const passo = trilho.clientWidth * 0.8;
        trilho.scrollBy({ left: btn.dataset.dir === 'tras' ? -passo : passo, behavior: 'smooth' });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarSetas);
  else ligarSetas();

  window.Vitrine = { montar, abrirFicha, fecharFicha, ticker, cartaz };
})();
