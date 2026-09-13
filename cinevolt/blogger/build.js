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
  'assets/css/hero.css'
].map(ler).join('\n\n');

const js = [
  'assets/js/art.js',
  'assets/js/lightning.js',
  'assets/js/fx.js'
].map(ler).join('\n\n');

/* Ilustração do hero, sem o cabeçalho XML */
const guardiao = ler('assets/img/guardiao.svg').trim();

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
  <link href='https://fonts.googleapis.com/css2?family=Bebas+Neue&amp;family=Space+Grotesk:wght@300;400;500;700&amp;family=JetBrains+Mono:wght@300;400;500&amp;display=swap' rel='stylesheet'/>
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
<div class='fx-layer fx-scan'></div>
<div class='fx-layer fx-vignette'></div>
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
<section class='cine-hero' id='palco'>
  <div class='ch-layer ch-sky' data-depth='14'></div>
  <div class='ch-layer ch-clouds ch-clouds--far' data-nuvens='0.005' data-depth='26'></div>
  <div class='ch-layer ch-clouds' data-nuvens='0.011' data-depth='44'></div>
  <div class='ch-layer ch-rain ch-rain--back' data-depth='18'></div>
  <div class='ch-layer ch-rain' data-depth='34'></div>
  <canvas class='ch-bolts ch-bolts--back'></canvas>
  <div class='ch-layer ch-fog'></div>

  <div class='ch-content'>
    <span class='ch-kicker'><i></i> <span>Em destaque nesta semana</span></span>
    <h1 class='ch-title' data-hero-titulo='true'>A tempestade<br/>chega aos<br/><em>cinemas</em></h1>
    <p class='ch-sub' data-hero-sub='true'><data:blog.title/></p>
    <div class='ch-actions'>
      <a class='ch-btn ch-btn--primary' data-hero-cta='true' expr:href='data:blog.homepageUrl'>Ler a matéria</a>
    </div>
  </div>

  <div class='ch-figure' data-depth='10' id='guardiao'>
${guardiao.split('\n').map(l => '    ' + l).join('\n')}
  </div>

  <canvas class='ch-bolts'></canvas>
  <div class='ch-bars'></div>
  <div class='scroll-hint'><span>Role</span><span class='scroll-hint__line'></span></div>
</section>

<div class='marquee'>
  <div class='marquee__track'>
    <span class='marquee__item'><i></i> Crítica sem spoiler</span>
    <span class='marquee__item'><i></i> Estreias da semana</span>
    <span class='marquee__item'><i></i> Ensaios de cinema</span>
    <span class='marquee__item'><i></i> Ilustração original</span>
  </div>
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

/* ---- cola do tema: capas geradas, hero e nuvens ---- */
(function () {
  'use strict';

  // 1) Posts sem imagem ganham uma ilustração exclusiva
  document.querySelectorAll('img.arte-gerada').forEach(function (img) {
    img.src = window.Art.posterURL(img.dataset.seed || img.alt, {
      categoria: img.dataset.cat, w: 700, ratio: '3/4'
    });
  });

  // 2) Nuvens por turbulência
  document.querySelectorAll('[data-nuvens]').forEach(function (el, i) {
    el.innerHTML = '<svg width="100%" height="100%" preserveAspectRatio="none">' +
      '<filter id="nv' + i + '"><feTurbulence type="fractalNoise" baseFrequency="' +
      (el.dataset.nuvens || '0.009') + '" numOctaves="5" seed="' + (3 + i * 7) + '" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.64  0 0 0 0 0.95  0 0 0 -1.5 1.05"/>' +
      '</filter><rect width="100%" height="100%" filter="url(#nv' + i + ')"/></svg>';
  });

  // 3) O hero aponta para a matéria mais recente
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

  // 4) A tempestade
  var hero = document.querySelector('.cine-hero');
  if (!hero || !window.Storm || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var frente = hero.querySelector('.ch-bolts:not(.ch-bolts--back)');
  var fundo = hero.querySelector('.ch-bolts--back');
  var figura = hero.querySelector('.ch-figure');
  var nucleo = hero.querySelector('#nucleoMartelo');

  function alvo() {
    var cr = frente.getBoundingClientRect();
    if (nucleo) {
      var nr = nucleo.getBoundingClientRect();
      if (nr.width) return { x: nr.left + nr.width / 2 - cr.left, y: nr.top + nr.height / 2 - cr.top };
    }
    return { x: cr.width * 0.66, y: cr.height * 0.3 };
  }

  var storm = new window.Storm(frente, {
    alvo: alvo, intervalo: [1700, 3900],
    cores: ['#9fe9ff', '#cfefff', '#b9a6ff'],
    aoRaio: function (e) {
      var w = frente.getBoundingClientRect().width || 1;
      window.FX.flash((e.x / w) * 100);
      window.FX.trovao(e.forca);
      if (figura) { figura.classList.remove('is-hit'); void figura.offsetWidth; figura.classList.add('is-hit'); }
    }
  });
  storm.start();

  if (fundo) {
    new window.Storm(fundo, {
      ambiente: false, densidade: .5, intervalo: [2600, 6000],
      cores: ['#6fc8ff', '#8fb6ff', '#9a7cff'],
      alvo: function () {
        var r = fundo.getBoundingClientRect();
        return { x: r.width * (0.08 + Math.random() * 0.84), y: r.height * (0.8 + Math.random() * 0.12) };
      },
      aoRaio: function (e) {
        var w = fundo.getBoundingClientRect().width || 1;
        window.FX.flash((e.x / w) * 100);
      }
    }).start();
  }

  // parallax das camadas
  var camadas = [].slice.call(hero.querySelectorAll('[data-depth]'));
  var mx = 0, my = 0, cx = 0, cy = 0;
  hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - .5;
    my = (e.clientY - r.top) / r.height - .5;
  });
  (function anim() {
    cx += (mx - cx) * .06; cy += (my - cy) * .06;
    camadas.forEach(function (c) {
      var d = parseFloat(c.dataset.depth) || 10;
      c.style.transform = 'translate3d(' + (-cx * d).toFixed(2) + 'px,' + (-cy * d * .6).toFixed(2) + 'px,0)';
    });
    requestAnimationFrame(anim);
  })();

  setTimeout(function () { storm.strike({ largura: 3.6, forca: 1.4 }); }, 900);
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
