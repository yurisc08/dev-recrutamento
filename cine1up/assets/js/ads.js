/* ============================================================
   CINE 1UP — ads.js
   Google AdSense com as regras do programa respeitadas:

   · nada é carregado antes da pessoa aceitar os cookies
   · nenhum anúncio em página sem conteúdo próprio (404) nem na
     área interna (/admin.html)
   · nenhum anúncio no fliperama: bloco de anúncio colado em
     controle de jogo gera clique sem querer, e clique acidental
     é violação de política
   · cada espaço já nasce com altura reservada, para o anúncio não
     empurrar o texto quando chega (isso também protege o CLS)
   · o rótulo é "Publicidade", uma das palavras que o Google
     permite; nada de "clique aqui" ou seta apontando para o bloco
   · no máximo 3 blocos por página

   Configuração em assets/js/config.js → ADSENSE
   ============================================================ */

(function () {
  'use strict';

  const CFG = (window.CINE1UP && window.CINE1UP.ADSENSE) || {};
  const CHAVE_CONSENT = 'cine1up:cookies';
  const MAX_POR_PAGINA = 3;

  const PAGINAS_SEM_ANUNCIO = ['/admin.html', '/404.html', '/jogo.html'];

  let carregado = false;
  let quantos = 0;

  /* ---------------------------------------------------------
     Consentimento
     --------------------------------------------------------- */
  function decisao() {
    try { return localStorage.getItem(CHAVE_CONSENT); } catch (_) { return null; }
  }

  function guardarDecisao(valor) {
    try { localStorage.setItem(CHAVE_CONSENT, valor); } catch (_) {}
  }

  function podeAnunciar() {
    const d = decisao();
    if (d === 'aceito') return true;
    if (d === 'recusado') return CFG.semConsentimento === 'nao-personalizado';
    return false;                       // ainda não decidiu
  }

  function paginaPermitida() {
    const aqui = location.pathname;
    return !PAGINAS_SEM_ANUNCIO.some(p => aqui === p || aqui.endsWith(p));
  }

  /* ---------------------------------------------------------
     Banner de cookies
     --------------------------------------------------------- */
  function banner() {
    // o aviso é sobre cookies, então aparece até onde não há anúncio —
    // só não aparece na área interna da redação
    const interno = location.pathname.endsWith('/admin.html');
    if (decisao() || !CFG.cliente || interno) return;

    const el = document.createElement('div');
    el.className = 'consentimento';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Aviso de cookies');
    el.innerHTML = `
      <div class="consentimento__texto">
        <strong>Este site usa cookies.</strong>
        Uns são necessários para o site funcionar; outros são do Google AdSense,
        que usa cookies para exibir anúncios. Você escolhe.
        <a class="link-fx" href="/privacidade.html">Ler a política de privacidade</a>
      </div>
      <div class="consentimento__acoes">
        <button class="btn-arcade btn-arcade--ghost" data-cookies="recusado">Só o essencial</button>
        <button class="btn-arcade" data-cookies="aceito">Aceitar tudo</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visivel'));

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cookies]');
      if (!b) return;
      guardarDecisao(b.dataset.cookies);
      el.classList.remove('is-visivel');
      setTimeout(() => el.remove(), 400);
      if (podeAnunciar()) ligar();
    });
  }

  /* ---------------------------------------------------------
     Carrega o script do AdSense (uma vez só)
     --------------------------------------------------------- */
  function carregarScript() {
    if (carregado || !CFG.cliente) return;
    carregado = true;

    window.adsbygoogle = window.adsbygoogle || [];
    if (decisao() === 'recusado') {
      // anúncios sem personalização, conforme a opção escolhida
      window.adsbygoogle.requestNonPersonalizedAds = 1;
    }

    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
            encodeURIComponent(CFG.cliente);
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------
     Preenche um espaço reservado
     --------------------------------------------------------- */
  function preencher(caixa) {
    if (quantos >= MAX_POR_PAGINA) { caixa.remove(); return; }
    const slot = CFG.slots && CFG.slots[caixa.dataset.anuncio];
    if (!slot) { caixa.remove(); return; }

    quantos++;
    caixa.innerHTML = `
      <span class="anuncio__rotulo">Publicidade</span>
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${CFG.cliente}"
           data-ad-slot="${slot}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>`;
    caixa.classList.add('is-ativo');

    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
    catch (_) { caixa.remove(); }
  }

  /* ---------------------------------------------------------
     Insere um espaço no meio do texto da matéria, depois de N
     parágrafos — nunca colado no título nem no fim abrupto.
     --------------------------------------------------------- */
  function noArtigo(seletor, depoisDe) {
    const artigo = document.querySelector(seletor || '.artigo');
    if (!artigo) return;
    const paragrafos = Array.from(artigo.children)
      .filter(el => el.tagName === 'P');
    const n = depoisDe || 3;
    if (paragrafos.length < n + 2) return;       // texto curto: não vale

    const caixa = document.createElement('aside');
    caixa.className = 'anuncio anuncio--artigo';
    caixa.dataset.anuncio = 'artigo';
    paragrafos[n - 1].insertAdjacentElement('afterend', caixa);
    if (podeAnunciar()) preencher(caixa);
  }

  /* ---------------------------------------------------------
     Liga tudo
     --------------------------------------------------------- */
  function ligar() {
    if (!CFG.cliente || !paginaPermitida() || !podeAnunciar()) return;
    carregarScript();
    document.querySelectorAll('.anuncio[data-anuncio]:not(.is-ativo)')
      .forEach(preencher);
  }

  function init() {
    // sem conta configurada: nem espaço vazio fica na página
    if (!CFG.cliente) {
      document.querySelectorAll('.anuncio').forEach(el => el.remove());
      return;
    }

    // a escolha de cookies vale para o site inteiro, então o aviso
    // aparece mesmo onde não há anúncio (o fliperama, por exemplo)
    banner();

    if (!paginaPermitida()) {
      document.querySelectorAll('.anuncio').forEach(el => el.remove());
      return;
    }
    ligar();
  }

  window.Ads = { ligar, noArtigo, podeAnunciar, decisao, MAX_POR_PAGINA };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
