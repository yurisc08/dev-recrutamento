/* ============================================================
   CINE 1UP — blogger/build.js
   Monta o tema do Blogger a partir dos MESMOS arquivos do site.

   Uso:  node blogger/build.js
   Saída: blogger/cine1up-blogger.xml

   ------------------------------------------------------------
   REGRA DE OURO DESTE ARQUIVO
   O interpretador de temas do Blogger é rígido e recusa muita
   coisa que parece inofensiva. Então o tema pede a ele o MÍNIMO:

     · só data:post.title e data:post.body, e só na página da
       matéria — são os dois campos que existem em toda versão
     · nenhum expr: com conta, ternário ou concatenação
     · nada de data:post.snippet, firstImageUrl, dateHeader,
       data:post.author nem acessos tipo .first.name
     · links do menu são endereços comuns (/search/label/...),
       que funcionam em qualquer blog
     · b:widget com version='2', como o Blogger exige hoje

   A lista de matérias da capa não vem do tema: é montada no
   navegador a partir do feed JSON do próprio blog (blogger.js).
   Menos coisa para o Blogger interpretar, menos erro no upload.
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
  'assets/js/tmdb.js',
  'assets/js/vitrine.js',
  'assets/js/ads.js',
  'assets/js/game.js',
  'assets/js/blogger.js'
].map(ler).join('\n\n');

/* ---------- Bloco que o usuário edita ---------- */
const config = `
/* ============================================================
   CONFIGURE AQUI — as duas únicas coisas que você precisa mexer
   ============================================================ */
window.CINE1UP = {

  /* 1. TMDB — alimenta "nos cinemas agora" e "séries em alta".
        Chave grátis em themoviedb.org → Configurações → API.
        Deixando vazio, essas seções somem e o resto funciona igual. */
  TMDB_KEY: '',
  TMDB_PROXY: false,          // no Blogger não existe /api/tmdb

  /* 2. AdSense — preencha depois que a conta for aprovada.
        Com 'cliente' vazio, nenhum script de anúncio carrega. */
  ADSENSE: {
    cliente: '',              // 'ca-pub-0000000000000000'
    slots: { lista: '', artigo: '', rodape: '' },
    semConsentimento: 'nada', // ou 'nao-personalizado'
    semAnuncioEm: ['/p/fliperama.html']
  },

  SITE: { nome: 'CINE 1UP', email: 'contato@exemplo.com' },
  CATEGORIAS: ['Notícia', 'Crítica', 'Estreia', 'Série', 'Ensaio', 'Lista']
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
`;

/* ---------- Cola: liga as peças ---------- */
const cola = `
/* ---- cola do tema ---- */
(function () {
  'use strict';

  // 1) Lista de matérias da capa, vinda do feed do blog
  if (window.BloggerFeed && document.querySelector('[data-lista-blogger]')) {
    window.BloggerFeed.montarLista('[data-lista-blogger]', { quantos: 9 })
      .then(ligarHero);
  } else {
    ligarHero();
  }

  // 2) Na capa, a área reservada à matéria fica vazia: some com ela
  var areaPost = document.querySelector('[data-area-post]');
  if (areaPost && !areaPost.querySelector('article')) areaPost.parentNode.removeChild(areaPost);

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

  // 5) Prateleiras do TMDB (somem se a chave não estiver preenchida)
  if (window.TMDB && window.Vitrine && window.CINE1UP.TMDB_KEY) {
    window.Vitrine.montar('[data-vitrine-cartaz]', function () { return window.TMDB.emCartaz(); }, { quantos: 12 });
    window.Vitrine.montar('[data-vitrine-series]', function () { return window.TMDB.seriesEmAlta(); }, { quantos: 12 });
    window.Vitrine.ticker('[data-manchetes]');
  } else {
    var secoes = document.querySelectorAll('[data-secao-tmdb]');
    for (var i = 0; i < secoes.length; i++) secoes[i].parentNode.removeChild(secoes[i]);
  }

  // 6) O hero aponta para a matéria mais recente
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

  // 7) O labirinto em modo atração
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

/* ---------- Markup ---------- */
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

const rodape = `<footer class='footer'>
  <div class='wrap'>
    <div class='footer__bottom' style='margin-top:0;border-top:0'>
      <span>© <data:blog.title/> · dados de filmes e séries por
        <a class='link-fx' href='https://www.themoviedb.org' rel='noopener' target='_blank'>TMDB</a></span>
      <span><a class='link-fx' href='/p/privacidade.html'>Privacidade</a></span>
    </div>
  </div>
</footer>

<button class='totop' type='button'>↑</button>`;

/* ---------------------------------------------------------- */
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' b:layoutsVersion='3' class='v2' dir='ltr'
      xmlns='http://www.w3.org/1999/xhtml'
      xmlns:b='http://www.google.com/2005/gml/b'
      xmlns:data='http://www.google.com/2005/gml/data'
      xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta content='width=device-width, initial-scale=1' name='viewport'/>
  <b:include data='blog' name='all-head-content'/>
  <title><data:blog.pageTitle/></title>
  <link href='https://fonts.googleapis.com/css2?family=Bungee&amp;family=Press+Start+2P&amp;family=Space+Grotesk:wght@300;400;500;700&amp;family=JetBrains+Mono:wght@300;400;500&amp;display=swap' rel='stylesheet'/>
  <link href='https://image.tmdb.org' rel='preconnect'/>
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

<b:if cond='data:blog.pageType == &quot;item&quot;'>
  <b:else/>

  <!-- ===================== CAPA ===================== -->
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

  <div class='marquee' data-secao-tmdb='true'>
    <div class='marquee__track' data-manchetes='true'>
      <span class='marquee__item'><i></i> Carregando as estreias…</span>
    </div>
  </div>

  <div class='perseguicao'>
    <div class='perseguicao__pontos'></div>
    <div class='perseguicao__trilha' data-perseguicao='true'></div>
  </div>

  <section class='section' data-secao-tmdb='true'>
    <div class='wrap'>
      <div class='vitrine-cabeca'>
        <div>
          <span class='eyebrow'>Sessão de hoje</span>
          <h2>Nos cinemas agora</h2>
        </div>
        <div class='vitrine-setas'>
          <button data-dir='tras' data-rolar='[data-vitrine-cartaz]' type='button'>←</button>
          <button data-dir='frente' data-rolar='[data-vitrine-cartaz]' type='button'>→</button>
        </div>
      </div>
      <div class='vitrine' data-vitrine-cartaz='true'></div>
    </div>
  </section>

  <section class='section section--tight' data-secao-tmdb='true'>
    <div class='wrap'>
      <div class='vitrine-cabeca'>
        <div>
          <span class='eyebrow'>Maratona da semana</span>
          <h2>Séries em alta</h2>
        </div>
        <div class='vitrine-setas'>
          <button data-dir='tras' data-rolar='[data-vitrine-series]' type='button'>←</button>
          <button data-dir='frente' data-rolar='[data-vitrine-series]' type='button'>→</button>
        </div>
      </div>
      <div class='vitrine' data-vitrine-series='true'></div>
    </div>
  </section>

  <div class='wrap'><aside class='anuncio anuncio--faixa' data-anuncio='lista'></aside></div>

  <section class='section' id='materias'>
    <div class='wrap'>
      <span class='eyebrow'>Escrito por gente</span>
      <h2 style='margin-bottom:40px'>As últimas da redação</h2>

      <!-- montado a partir do feed do próprio blog, em blogger.js -->
      <div class='blogger-grid' data-lista-blogger='true'>
        <div class='skeleton' style='aspect-ratio:3/4'></div>
        <div class='skeleton' style='aspect-ratio:3/4'></div>
        <div class='skeleton' style='aspect-ratio:3/4'></div>
      </div>
    </div>
  </section>

</b:if>

<!-- ===================== MATÉRIA =====================
     Um único widget de Blog no tema inteiro, fora de qualquer
     condicional — é assim que o Blogger espera. Na capa ele não
     imprime nada, e o JS remove esta área vazia.
     ===================================================== -->
<main class='section' data-area-post='true' style='padding-top:clamp(110px,14vw,170px)'>
  <div class='wrap'>
    <b:section class='principal' id='principal' showaddelement='no'>
      <b:widget id='Blog1' locked='true' title='Matérias' type='Blog' version='2'>
        <b:includable id='main'>
          <b:if cond='data:blog.pageType == &quot;item&quot;'>
            <b:loop values='data:posts' var='post'>
              <article>
                <h1 style='font-size:clamp(2.2rem,6vw,4.6rem);margin-bottom:26px'>
                  <data:post.title/>
                </h1>
                <div class='artigo post-body'>
                  <data:post.body/>
                </div>

                <aside class='anuncio' data-anuncio='rodape'></aside>

                <div class='post-rodape'>
                  <div class='tag-row'>
                    <b:loop values='data:post.labels' var='label'>
                      <a class='pill' expr:href='data:label.url'>#<data:label.name/></a>
                    </b:loop>
                  </div>
                </div>

                <div class='mais-materias'>
                  <a class='btn-arcade' href='/'>▶ Ver todas as matérias</a>
                </div>
              </article>
            </b:loop>
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

const saida = path.join(__dirname, 'cine1up-blogger.xml');
fs.writeFileSync(saida, xml, 'utf8');
console.log('Tema gerado:', saida);
console.log('Tamanho:', (xml.length / 1024).toFixed(1), 'KB');
