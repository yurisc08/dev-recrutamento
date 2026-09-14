/* ============================================================
   CINE 1UP — blogger/build.js
   Monta o tema do Blogger a partir dos MESMOS arquivos do site.

   Uso:  node blogger/build.js
   Saída:
     blogger/tema-cine1up.xml       (motor clássico — tente este)
     blogger/tema-cine1up-v3.xml    (variante, se o Blogger pedir
                                     o atributo version nos widgets)

   ------------------------------------------------------------
   DECISÕES QUE EVITAM ERRO NO UPLOAD

   1. O tema pede ao Blogger só DOIS campos: data:post.title e
      data:post.body. Nada de snippet, firstImageUrl, dateHeader,
      author, .first.name — todos recusados pelo motor novo.

   2. Nenhum expr: com conta, ternário ou concatenação. Os links
      do menu são endereços comuns (/search/label/...), que
      funcionam em qualquer blog.

   3. O conteúdo é renderizado para pageType "item" E para
      "static_page". Sem o segundo, as Páginas do Blogger (como a
      do fliperama) saem vazias — foi o que quebrou o jogo.

   4. Um único b:section e um único b:widget, fora de condicional.

   5. Sem TMDB: as listas saem do feed JSON do próprio blog.
   ------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');

/* ---------- CSS e JS embutidos ---------- */
const css = [
  'assets/css/base.css',
  'assets/css/effects.css',
  'assets/css/arcade.css'
].map(ler).join('\n\n');

const js = [
  'assets/js/art.js',
  'assets/js/lightning.js',
  'assets/js/maze.js',
  'assets/js/fx.js',
  'assets/js/ads.js',
  'assets/js/game.js',
  'assets/js/blogger.js'
].map(ler).join('\n\n');

/* ---------- Bloco que o usuário edita ---------- */
const config = `
/* ============================================================
   CONFIGURE AQUI — a única coisa que você precisa mexer
   ============================================================ */
window.CINE1UP = {

  /* AdSense: preencha depois que a conta for aprovada.
     Com 'cliente' vazio, nenhum script de anúncio é carregado e os
     espaços nem aparecem na página. */
  ADSENSE: {
    cliente: '',              // 'ca-pub-0000000000000000'
    slots: { lista: '', artigo: '', rodape: '' },
    semConsentimento: 'nada', // ou 'nao-personalizado'
    semAnuncioEm: ['/p/fliperama.html']
  },

  /* Os marcadores que viram seções na capa. Precisam existir como
     rótulos nas suas postagens, escritos igualzinho. */
  SECOES: [
    { rotulo: 'Notícia', titulo: 'Últimas notícias', olho: 'Acabou de sair' },
    { rotulo: 'Série',   titulo: 'Séries',           olho: 'Maratona' }
  ],

  SITE: { nome: 'CINE 1UP', email: 'contato@exemplo.com' }
};
`;

/* ---------- CSS específico do markup do Blogger ---------- */
const cssBlogger = `
/* ---- ajustes para o markup do Blogger ---- */
.blogger-grid { display: grid; gap: clamp(18px,2.4vw,32px);
  grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); }
.status-msg-wrap, .feed-links, .blog-feeds { display: none !important; }
.post-body img { max-width: 100%; height: auto; border-radius: var(--r-md); }
.comentarios { max-width: 72ch; margin: 60px auto 0; padding-top: 30px;
  border-top: 1px solid var(--line); }
.mais-materias { display: flex; justify-content: center; margin-top: 48px; }
.secao-feed { margin-bottom: clamp(40px,6vw,74px); }

/* Páginas que pedem largura total, como a do fliperama: o corpo do
   texto normalmente é estreito (boa leitura), mas o gabinete do jogo
   fica espremido nessa medida. */
.artigo:has(.pagina-larga) { max-width: none; }
.pagina-larga { width: 100%; }
`;

/* ---------- Cola ---------- */
const cola = `
/* ---- cola do tema ---- */
(function () {
  'use strict';

  var ehCapa = !!document.querySelector('[data-capa]');

  // 1) Na capa, monta as seções a partir do feed do próprio blog
  if (ehCapa && window.BloggerFeed) {
    var alvo = document.querySelector('[data-secoes]');
    var cfg = (window.CINE1UP.SECOES || []);
    var html = '';

    cfg.forEach(function (s, i) {
      html += '<section class="secao-feed">' +
              '<span class="eyebrow">' + s.olho + '</span>' +
              '<h2 style="margin-bottom:28px">' + s.titulo + '</h2>' +
              '<div class="blogger-grid" data-feed="' + i + '">' +
              '<div class="skeleton" style="aspect-ratio:3/4"></div>'.repeat(3) +
              '</div></section>';
    });

    html += '<section class="secao-feed" id="materias">' +
            '<span class="eyebrow">Tudo</span>' +
            '<h2 style="margin-bottom:28px">As últimas da redação</h2>' +
            '<div class="blogger-grid" data-feed="tudo">' +
            '<div class="skeleton" style="aspect-ratio:3/4"></div>'.repeat(3) +
            '</div></section>';

    if (alvo) alvo.innerHTML = html;

    cfg.forEach(function (s, i) {
      window.BloggerFeed.montarLista('[data-feed="' + i + '"]', {
        quantos: 6, rotulo: s.rotulo, sumirSeVazio: true
      });
    });

    window.BloggerFeed.montarLista('[data-feed="tudo"]', { quantos: 9 })
      .then(ligarHero);
  }

  // 2) Fora da capa, a área de conteúdo pode ficar vazia: some com ela
  var areaPost = document.querySelector('[data-area-post]');
  if (areaPost && !areaPost.querySelector('article')) {
    areaPost.parentNode.removeChild(areaPost);
  }

  // 3) Lâmpadas da marquise
  var faixa = document.querySelector('[data-lampadas]');
  if (faixa) faixa.innerHTML = new Array(Math.max(12, Math.floor(innerWidth / 34)) + 1).join('<i></i>');

  // 4) Sprites da faixa de perseguição
  var trilha = document.querySelector('[data-perseguicao]');
  if (trilha) {
    var fant = function (cor) {
      return '<svg class="sprite" viewBox="0 0 32 32" style="color:' + cor + '">' +
        '<path fill="' + cor + '" d="M16 2a12 12 0 0 0-12 12v16l4-3 4 3 4-3 4 3 4-3 4 3V14A12 12 0 0 0 16 2Z"/>' +
        '<circle cx="11" cy="13" r="4.2" fill="#fff"/><circle cx="21" cy="13" r="4.2" fill="#fff"/>' +
        '<circle cx="9.6" cy="13" r="2.1" fill="#14103a"/><circle cx="19.6" cy="13" r="2.1" fill="#14103a"/></svg>';
    };
    trilha.innerHTML =
      '<svg class="sprite" viewBox="0 0 32 32" style="color:#ffd60a"><path fill="#ffd60a" d="M16 16 29 8a15 15 0 1 0 0 16Z"/></svg>' +
      ['#ff2b4e', '#ff6ad5', '#22e7ff', '#ff9d2e'].map(fant).join('');
  }

  // 5) O hero aponta para a matéria mais recente
  function ligarHero() {
    var primeiro = document.querySelector('.card');
    var alvoTitulo = document.querySelector('[data-hero-titulo]');
    if (!primeiro || !alvoTitulo) return;

    var titulo = primeiro.querySelector('.card__title').textContent.trim();
    var link = primeiro.querySelector('.card__link').getAttribute('href');
    var partes = titulo.split(' ');
    var corte = Math.ceil(partes.length / 2);
    alvoTitulo.innerHTML = partes.slice(0, corte).join(' ') + '<br><em>' + partes.slice(corte).join(' ') + '</em>';

    var sub = document.querySelector('[data-hero-sub]');
    var resumo = primeiro.querySelector('.card__excerpt');
    if (sub && resumo && resumo.textContent.trim()) sub.textContent = resumo.textContent;

    var cta = document.querySelector('[data-hero-cta]');
    if (cta && link) cta.setAttribute('href', link);
  }

  // 6) O labirinto em modo atração
  var cv = document.querySelector('.arcade-hero__maze--frente');
  if (!cv || !window.Labirinto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var placar = document.querySelector('[data-placar]');
  var recordeEl = document.querySelector('[data-recorde]');
  var dica = document.querySelector('[data-dica]');
  var recorde = Number(localStorage.getItem('cine1up:maze') || 0);
  if (recordeEl) recordeEl.textContent = String(recorde).padStart(6, '0');

  var lab = new window.Labirinto(cv, {
    canvasFundo: document.querySelector('.arcade-hero__maze--fundo'),
    aoComer: function (pts) { if (placar) placar.textContent = String(pts).padStart(6, '0'); },
    aoPilula: function () { window.FX && window.FX.flash(40 + Math.random() * 30); },
    aoMorrer: function (pts) {
      if (pts > recorde) {
        recorde = pts;
        localStorage.setItem('cine1up:maze', String(pts));
        if (recordeEl) recordeEl.textContent = String(recorde).padStart(6, '0');
      }
    },
    aoAssumir: function () {
      if (!dica) return;
      dica.textContent = '1 PLAYER · VOCÊ ESTÁ NO CONTROLE';
      dica.classList.add('is-on');
    }
  });
  lab.start();
  window.CVLabirinto = lab;
  document.addEventListener('visibilitychange', function () { lab.pausado = document.hidden; });
})();
`;

/* ---------- Markup reaproveitado ---------- */
const cabecalho = `<header class='header'>
  <div class='wrap header__inner'>
    <a class='logo' href='/'>
      <svg class='logo__bolt' viewBox='0 0 24 32'><path d='M14 0 2 18h7l-3 14 14-19h-8l2-13Z' fill='#ffd60a'/></svg>
      <span class='logo__text'>CINE<b>1UP</b></span>
    </a>
    <nav class='nav'>
      <a class='nav__link' href='/search/label/Not%C3%ADcia'>Notícias</a>
      <a class='nav__link' href='/search/label/S%C3%A9rie'>Séries</a>
      <a class='nav__link' href='/search/label/Cr%C3%ADtica'>Críticas</a>
      <a class='nav__link' href='/p/fliperama.html'>Fliperama</a>
    </nav>
    <div class='row'>
      <button class='btn btn--sm btn--ghost' data-som='true' type='button'><span>Som desligado</span></button>
      <button class='burger' type='button'><span></span><span></span></button>
    </div>
  </div>
</header>

<div class='menu'>
  <ul class='menu__list'>
    <li><a href='/search/label/Not%C3%ADcia'>Notícias</a></li>
    <li><a href='/search/label/S%C3%A9rie'>Séries</a></li>
    <li><a href='/search/label/Cr%C3%ADtica'>Críticas</a></li>
    <li><a href='/search/label/Ensaio'>Ensaios</a></li>
    <li><a href='/p/fliperama.html'>Fliperama</a></li>
  </ul>
</div>`;

/* O corpo da matéria/página. Repetido para os dois pageType porque
   condição composta (or) não é confiável no motor antigo. */
const corpoDoPost = `<b:loop values='data:posts' var='post'>
              <article>
                <h1 style='font-size:clamp(2.2rem,6vw,4.6rem);margin-bottom:26px'>
                  <data:post.title/>
                </h1>
                <div class='artigo post-body'>
                  <data:post.body/>
                </div>
                <aside class='anuncio' data-anuncio='rodape'></aside>
                <div class='mais-materias'>
                  <a class='btn-arcade' href='/'>▶ Ver todas as matérias</a>
                </div>
              </article>
            </b:loop>`;

const rodape = `<footer class='footer'>
  <div class='wrap'>
    <div class='footer__bottom' style='margin-top:0;border-top:0'>
      <span>© <data:blog.title/></span>
      <span><a class='link-fx' href='/p/privacidade.html'>Privacidade</a></span>
    </div>
  </div>
</footer>

<button class='totop' type='button'>↑</button>`;

/* ---------------------------------------------------------- */
function montar(motor) {
  const v3 = motor === 'v3';
  const attrsHtml = v3
    ? `b:version='2' b:layoutsVersion='3' class='v2' dir='ltr'`
    : `b:version='2' class='v2' dir='ltr'`;
  const attrsWidget = v3
    ? `id='Blog1' locked='true' title='Matérias' type='Blog' version='2'`
    : `id='Blog1' locked='true' title='Matérias' type='Blog'`;

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html ${attrsHtml}
      xmlns='http://www.w3.org/1999/xhtml'
      xmlns:b='http://www.google.com/2005/gml/b'
      xmlns:data='http://www.google.com/2005/gml/data'
      xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta content='width=device-width, initial-scale=1' name='viewport'/>
  <b:include data='blog' name='all-head-content'/>
  <title><data:blog.pageTitle/></title>
  <link href='https://fonts.googleapis.com/css2?family=Bungee&amp;family=Press+Start+2P&amp;family=Space+Grotesk:wght@300;400;500;700&amp;family=JetBrains+Mono:wght@300;400;500&amp;display=swap' rel='stylesheet'/>
  <b:skin><![CDATA[
${css}
${cssBlogger}
  ]]></b:skin>
</head>

<body class='is-loading'>

<div class='preloader'>
  <div class='clapper'><div class='clapper__top'></div><div class='clapper__body'>CINE 1UP</div></div>
  <div class='preloader__pct'>000%</div><div class='preloader__bar'></div>
</div>

<div class='fx-layer fx-grain'></div>
<div class='crt'></div>
<div class='crt-vinheta'></div>
<div class='fx-layer fx-flash'></div>
<div class='progress'></div>

${cabecalho}

<b:if cond='data:blog.pageType == &quot;index&quot;'>

  <!-- ===================== CAPA ===================== -->
  <div data-capa='true'>
  <section class='arcade-hero' id='palco'>
    <canvas class='arcade-hero__maze arcade-hero__maze--fundo'></canvas>
    <canvas class='arcade-hero__maze arcade-hero__maze--frente'></canvas>
    <div class='arcade-hero__veu'></div>

    <div class='hud'>
      <div class='hud__linha'>Pontos <span class='hud__valor' data-placar='true'>000000</span></div>
      <div class='hud__linha'>Recorde <span class='hud__valor' data-recorde='true'>000000</span></div>
      <div class='hud__dica' data-dica='true'>← ↑ ↓ → para jogar</div>
    </div>

    <div class='arcade-hero__conteudo'>
      <span class='insert-coin pixel'><i></i> <span>Insira uma ficha</span></span>
      <h1 class='titulo-arcade' data-hero-titulo='true'>Cinema<br/>em modo<br/><em>arcade</em></h1>
      <p class='sub-arcade' data-hero-sub='true'><data:blog.title/></p>
      <div class='acoes-arcade'>
        <a class='btn-arcade' data-hero-cta='true' href='#materias'>▶ Ler as matérias</a>
        <a class='btn-arcade btn-arcade--ghost' href='/p/fliperama.html'>🕹 Jogar</a>
      </div>
    </div>
  </section>

  <div class='marquise'><div class='lampadas' data-lampadas='true'></div></div>

  <div class='perseguicao'>
    <div class='perseguicao__pontos'></div>
    <div class='perseguicao__trilha' data-perseguicao='true'></div>
  </div>

  <div class='wrap'><aside class='anuncio anuncio--faixa' data-anuncio='lista'></aside></div>

  <section class='section'>
    <div class='wrap' data-secoes='true'></div>
  </section>
  </div>

</b:if>

<!-- ===================== MATÉRIA E PÁGINAS =====================
     Um único widget de Blog no tema, fora de condicional. Dentro
     dele, o conteúdo aparece tanto na postagem (item) quanto nas
     Páginas (static_page) — é o que faz a página do fliperama
     existir e o jogo rodar.
     ============================================================ -->
<main class='section' data-area-post='true' style='padding-top:clamp(110px,14vw,170px)'>
  <div class='wrap'>
    <b:section class='principal' id='principal' showaddelement='no'>
      <b:widget ${attrsWidget}>
        <b:includable id='main'>
          <b:if cond='data:blog.pageType == &quot;item&quot;'>
            ${corpoDoPost}
          </b:if>
          <b:if cond='data:blog.pageType == &quot;static_page&quot;'>
            ${corpoDoPost}
          </b:if>
        </b:includable>
      </b:widget>
    </b:section>
  </div>
</main>

${rodape}

<script type='text/javascript'>
//<![CDATA[
${config}

${js}

${cola}
//]]>
</script>

</body>
</html>
`;
}

[['classico', 'tema-cine1up.xml'], ['v3', 'tema-cine1up-v3.xml']].forEach(([motor, nome]) => {
  const saida = path.join(__dirname, nome);
  const conteudo = montar(motor);
  fs.writeFileSync(saida, conteudo, 'utf8');
  console.log(`${nome.padEnd(24)} ${(conteudo.length / 1024).toFixed(1)} KB  (motor ${motor})`);
});
