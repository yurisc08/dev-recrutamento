/* ============================================================
   CINEVOLT — blogger/build.js
   Monta o tema do Blogger a partir dos MESMOS arquivos do site,
   para as duas versões nunca ficarem diferentes.

   Uso:  node blogger/build.js
   Saída: blogger/cinevolt-blogger.xml
   ============================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');

/* CSS e JS que o tema leva embutido (o Blogger não serve arquivos nossos) */
const css = [
  'assets/css/base.css',
  'assets/css/effects.css',
  'assets/css/arcade.css'
].map(ler).join('\n\n');

const js = [
  'assets/js/art.js',
  'assets/js/lightning.js',
  'assets/js/maze.js',
  'assets/js/fx.js'
].map(ler).join('\n\n');

/* CSS específico do tema (o Blogger tem markup próprio) */
const cssBlogger = `
/* ---- ajustes para o markup do Blogger ---- */
.blogger-grid { display: grid; gap: clamp(18px,2.4vw,32px);
  grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); }
.status-msg-wrap, .feed-links { display: none !important; }
.blog-pager { display: flex; justify-content: center; gap: 12px; margin-top: 54px; }
.blog-pager a { padding: 12px 24px; border: 1px solid var(--line-2); border-radius: 999px;
  font-family: var(--font-mono); font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; }
.blog-pager a:hover { background: var(--bolt); color: #04040a; }
.post-body img { max-width: 100%; height: auto; border-radius: var(--r-md); }
.comentarios { max-width: 72ch; margin: 60px auto 0; padding-top: 30px; border-top: 1px solid var(--line); }
`;

/* ---------------------------------------------------------- */
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' class='v2' expr:dir='data:blog.languageDirection'
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
  <div class='clapper'><div class='clapper__top'></div><div class='clapper__body'>CINEVOLT</div></div>
  <div class='preloader__pct'>000%</div><div class='preloader__bar'></div>
</div>

<div class='fx-layer fx-grain'></div>
<div class='crt'></div>
<div class='crt-vinheta'></div>
<div class='fx-layer fx-flash'></div>
<div class='progress'></div>

<!-- ================= CABEÇALHO ================= -->
<header class='header'>
  <div class='wrap header__inner'>
    <a class='logo' expr:href='data:blog.homepageUrl'>
      <svg class='logo__bolt' viewBox='0 0 24 32'><path d='M14 0 2 18h7l-3 14 14-19h-8l2-13Z' fill='#00e5ff'/></svg>
      <span class='logo__text'>CINE<b>VOLT</b></span>
    </a>
    <nav class='nav'>
      <a class='nav__link' expr:href='data:blog.homepageUrl'>Início</a>
      <a class='nav__link' expr:href='data:blog.homepageUrl + &quot;search/label/Crítica&quot;'>Críticas</a>
      <a class='nav__link' expr:href='data:blog.homepageUrl + &quot;search/label/Ensaio&quot;'>Ensaios</a>
      <a class='nav__link' expr:href='data:blog.homepageUrl + &quot;p/jogo.html&quot;'>Jogo</a>
    </nav>
    <div class='row'>
      <button class='btn btn--sm btn--ghost' data-som='true'><span>Som desligado</span></button>
      <button class='burger' type='button'><span></span><span></span></button>
    </div>
  </div>
</header>

<div class='menu'>
  <ul class='menu__list'>
    <li><a expr:href='data:blog.homepageUrl'>Início</a></li>
    <li><a expr:href='data:blog.homepageUrl + &quot;search/label/Crítica&quot;'>Críticas</a></li>
    <li><a expr:href='data:blog.homepageUrl + &quot;search/label/Ensaio&quot;'>Ensaios</a></li>
    <li><a expr:href='data:blog.homepageUrl + &quot;p/jogo.html&quot;'>Jogo</a></li>
  </ul>
</div>

<!-- ================= HERO (só na home) ================= -->
<b:if cond='data:blog.url == data:blog.homepageUrl'>
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
      <a class='btn-arcade' data-hero-cta='true' expr:href='data:blog.homepageUrl'>▶ Ler as matérias</a>
    </div>
  </div>
</section>

<div class='marquise'><div class='lampadas' data-lampadas='true'></div></div>

<div class='perseguicao'>
  <div class='perseguicao__pontos'></div>
  <div class='perseguicao__trilha' data-perseguicao='true'></div>
</div>
</b:if>

<!-- ================= CONTEÚDO ================= -->
<main class='section'>
  <div class='wrap'>
    <b:section class='principal' id='principal' showaddelement='no'>
      <b:widget id='Blog1' locked='true' title='Matérias' type='Blog'>
        <b:includable id='main'>

          <b:if cond='data:blog.pageType == &quot;item&quot;'>
            <!-- MATÉRIA -->
            <b:loop values='data:posts' var='post'>
              <article>
                <span class='eyebrow'>
                  <b:if cond='data:post.labels'>
                    <b:loop values='data:post.labels' var='label'><data:label.name/> </b:loop>
                  <b:else/>Cinema</b:if>
                </span>
                <h1 style='font-size:clamp(2.6rem,7vw,5.4rem);margin-bottom:20px'><data:post.title/></h1>
                <div class='post-meta'>
                  <span>Por <b><data:post.author/></b></span>
                  <span><data:post.dateHeader/></span>
                </div>
                <div class='artigo post-body' style='margin-top:44px'>
                  <data:post.body/>
                </div>
                <div class='post-rodape'>
                  <div class='tag-row'>
                    <b:loop values='data:post.labels' var='label'>
                      <a class='pill' expr:href='data:label.url'>#<data:label.name/></a>
                    </b:loop>
                  </div>
                </div>
                <b:if cond='data:post.allowComments'>
                  <div class='comentarios'><b:include data='post' name='comments'/></div>
                </b:if>
              </article>
            </b:loop>

          <b:else/>
            <!-- LISTA -->
            <span class='eyebrow'>Em cartaz</span>
            <h2 style='margin-bottom:40px'>As últimas da redação</h2>
            <div class='blogger-grid'>
              <b:loop values='data:posts' var='post'>
                <article class='card' data-tilt='7' data-reveal='true'>
                  <a class='card__link' expr:href='data:post.url'><span class='sr-only'><data:post.title/></span></a>
                  <div class='card__media'>
                    <b:if cond='data:post.firstImageUrl'>
                      <img expr:src='data:post.firstImageUrl' expr:alt='data:post.title' loading='lazy'/>
                    <b:else/>
                      <img class='arte-gerada' expr:data-seed='data:post.url'
                           expr:data-cat='data:post.labels ? data:post.labels.first.name : &quot;Crítica&quot;'
                           expr:alt='data:post.title' src='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='/>
                    </b:if>
                  </div>
                  <div class='card__body'>
                    <div class='card__meta'>
                      <span><b:if cond='data:post.labels'><data:post.labels.first.name/><b:else/>Cinema</b:if></span>
                      <span><data:post.dateHeader/></span>
                    </div>
                    <h3 class='card__title'><data:post.title/></h3>
                    <p class='card__excerpt'><data:post.snippet/></p>
                  </div>
                </article>
              </b:loop>
            </div>
            <div class='blog-pager' id='blog-pager'>
              <b:if cond='data:olderPageUrl'>
                <a expr:href='data:olderPageUrl'>Matérias anteriores →</a>
              </b:if>
              <b:if cond='data:newerPageUrl'>
                <a expr:href='data:newerPageUrl'>← Mais recentes</a>
              </b:if>
            </div>
          </b:if>

        </b:includable>
      </b:widget>
    </b:section>
  </div>
</main>

<!-- ================= RODAPÉ ================= -->
<footer class='footer'>
  <div class='wrap'>
    <div class='footer__bottom' style='margin-top:0;border-top:0'>
      <span>© <data:blog.title/></span>
      <span>Feito com raio, café e sala escura</span>
    </div>
  </div>
</footer>

<button class='totop'>↑</button>

<script type='text/javascript'>
//<![CDATA[
${js}

/* ---- cola do tema: capas geradas, sprites, hero e labirinto ---- */
(function () {
  'use strict';

  // 1) Posts sem imagem ganham uma ilustração exclusiva
  document.querySelectorAll('img.arte-gerada').forEach(function (img) {
    img.src = window.Art.posterURL(img.dataset.seed || img.alt, {
      categoria: img.dataset.cat, w: 700, ratio: '3/4'
    });
  });

  // 2) Lâmpadas da marquise
  var faixa = document.querySelector('[data-lampadas]');
  if (faixa) faixa.innerHTML = new Array(Math.max(12, Math.floor(innerWidth / 34)) + 1).join('<i></i>');

  // 3) Sprites da faixa de perseguição
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

  // 4) O hero aponta para a matéria mais recente
  var primeiro = document.querySelector('.card');
  var alvoTitulo = document.querySelector('[data-hero-titulo]');
  if (primeiro && alvoTitulo) {
    var titulo = primeiro.querySelector('.card__title').textContent.trim();
    var link = primeiro.querySelector('.card__link').getAttribute('href');
    var partes = titulo.split(' ');
    var corte = Math.ceil(partes.length / 2);
    alvoTitulo.innerHTML = partes.slice(0, corte).join(' ') + '<br><em>' + partes.slice(corte).join(' ') + '</em>';
    var sub = document.querySelector('[data-hero-sub]');
    var resumo = primeiro.querySelector('.card__excerpt');
    if (sub && resumo) sub.textContent = resumo.textContent;
    var cta = document.querySelector('[data-hero-cta]');
    if (cta && link) cta.setAttribute('href', link);
  }

  // 5) O labirinto em modo atração
  var cv = document.querySelector('.arcade-hero__maze--frente');
  if (!cv || !window.Labirinto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var placar = document.querySelector('[data-placar]');
  var recordeEl = document.querySelector('[data-recorde]');
  var dica = document.querySelector('[data-dica]');
  var recorde = Number(localStorage.getItem('cinevolt:maze') || 0);
  if (recordeEl) recordeEl.textContent = String(recorde).padStart(6, '0');

  var lab = new window.Labirinto(cv, {
    canvasFundo: document.querySelector('.arcade-hero__maze--fundo'),
    aoComer: function (pts) { if (placar) placar.textContent = String(pts).padStart(6, '0'); },
    aoPilula: function () { window.FX && window.FX.flash(40 + Math.random() * 30); },
    aoMorrer: function (pts) {
      if (pts > recorde) {
        recorde = pts;
        localStorage.setItem('cinevolt:maze', String(pts));
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
  document.addEventListener('visibilitychange', function () { lab.pausado = document.hidden; });
})();
//]]>
</script>

</body>
</html>
`;

const saida = path.join(__dirname, 'cinevolt-blogger.xml');
fs.writeFileSync(saida, xml, 'utf8');
console.log('Tema gerado:', saida);
console.log('Tamanho:', (xml.length / 1024).toFixed(1), 'KB');
