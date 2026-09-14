/* ============================================================
   CINE 1UP — blogger/previa.js
   Gera duas páginas locais com o MESMO CSS e o MESMO JavaScript
   que vão dentro do tema:

     blogger/previa-capa.html        → como fica a página inicial
     blogger/previa-fliperama.html   → como fica a página do jogo

   Serve para ver (e testar) antes de subir para o Blogger.

   Uso:  node blogger/build.js && node blogger/previa.js

   Atenção: as marcações próprias do Blogger (b:if, b:loop,
   data:...) não aparecem aqui — quem valida aquilo é o Blogger,
   no upload. O que a prévia testa é todo o resto: CSS, labirinto,
   jogo, listas do feed, anúncios e aviso de cookies.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const tema = fs.readFileSync(path.join(__dirname, 'tema-cine1up.xml'), 'utf8');

const entre = (texto, ini, fim) => {
  const a = texto.indexOf(ini);
  const b = texto.indexOf(fim, a + ini.length);
  if (a < 0 || b < 0) throw new Error('não achei o trecho: ' + ini);
  return texto.slice(a + ini.length, b);
};

const css = entre(tema, '<b:skin><![CDATA[', ']]></b:skin>');
const js = entre(tema, '//<![CDATA[', '//]]>');

/* ---------- Feed de mentira, no formato do Blogger ---------- */
const EXEMPLOS = [
  ['Estreias da semana nos cinemas', 'Notícia', 'O que chega às salas e o que vale o ingresso.'],
  ['O elenco da nova temporada', 'Notícia', 'Quem entra e quem sai na virada da série.'],
  ['A série que ninguém viu chegar', 'Série', 'Oito episódios que reorganizam o gênero por dentro.'],
  ['Maratona de fim de semana', 'Série', 'Quatro temporadas que cabem em dois dias.'],
  ['O último analógico', 'Crítica', 'Filmado em película, aposta no grão como personagem.'],
  ['Na sala de projeção', 'Ensaio', 'Uma conversa sobre restaurar filmes que quase se perderam.'],
  ['As 10 aberturas mais elétricas', 'Lista', 'Sequências que já chegam com a tensão no talo.'],
  ['O clássico que envelheceu ao contrário', 'Crítica', 'Um fracasso de bilheteria virou gramática visual.']
];

const entrada = ([titulo, cat, resumo], i) => ({
  title: { $t: titulo },
  summary: { $t: resumo },
  published: { $t: new Date(Date.now() - i * 864e5).toISOString() },
  category: [{ term: cat }],
  link: [{ rel: 'alternate', href: '#materia-' + i }]
});

const feedPara = rotulo => ({
  feed: {
    entry: EXEMPLOS
      .filter(e => !rotulo || e[1] === rotulo)
      .map(entrada)
  }
});

const simulador = `
<script>
// só na prévia: responde no lugar do feed do Blogger
(function () {
  var tudo = ${JSON.stringify(feedPara(null))};
  var porRotulo = ${JSON.stringify(
    [...new Set(EXEMPLOS.map(e => e[1]))]
      .reduce((acc, r) => (acc[r] = feedPara(r), acc), {})
  )};

  var original = window.fetch;
  window.fetch = function (url) {
    var u = String(url);
    if (u.indexOf('/feeds/') === 0) {
      var corpo = tudo;
      var m = u.match(/\\/feeds\\/posts\\/summary\\/default\\/-\\/([^?]+)/);
      if (m) corpo = porRotulo[decodeURIComponent(m[1])] || { feed: { entry: [] } };
      return Promise.resolve(new Response(JSON.stringify(corpo), {
        status: 200, headers: { 'content-type': 'application/json' }
      }));
    }
    return original.apply(this, arguments);
  };
})();
</script>`;

/* ---------- Molde comum ---------- */
const molde = (titulo, corpo) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} — prévia do tema CINE 1UP</title>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Press+Start+2P&family=Space+Grotesk:wght@300;400;500;700&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body class="is-loading">

<div class="preloader">
  <div class="clapper"><div class="clapper__top"></div><div class="clapper__body">CINE 1UP</div></div>
  <div class="preloader__pct">000%</div><div class="preloader__bar"></div>
</div>

<div class="fx-layer fx-grain"></div>
<div class="crt"></div>
<div class="crt-vinheta"></div>
<div class="fx-layer fx-flash"></div>
<div class="progress"></div>

<header class="header">
  <div class="wrap header__inner">
    <a class="logo" href="previa-capa.html">
      <svg class="logo__bolt" viewBox="0 0 24 32"><path d="M14 0 2 18h7l-3 14 14-19h-8l2-13Z" fill="#ffd60a"/></svg>
      <span class="logo__text">CINE<b>1UP</b></span>
    </a>
    <nav class="nav">
      <a class="nav__link" href="previa-capa.html">Notícias</a>
      <a class="nav__link" href="previa-capa.html">Séries</a>
      <a class="nav__link" href="previa-capa.html">Críticas</a>
      <a class="nav__link" href="previa-fliperama.html">Fliperama</a>
    </nav>
    <div class="row">
      <button class="btn btn--sm btn--ghost" data-som="true" type="button"><span>Som desligado</span></button>
      <button class="burger" type="button"><span></span><span></span></button>
    </div>
  </div>
</header>

<div class="menu">
  <ul class="menu__list">
    <li><a href="previa-capa.html">Notícias</a></li>
    <li><a href="previa-capa.html">Séries</a></li>
    <li><a href="previa-capa.html">Críticas</a></li>
    <li><a href="previa-fliperama.html">Fliperama</a></li>
  </ul>
</div>

${corpo}

<footer class="footer">
  <div class="wrap">
    <div class="footer__bottom" style="margin-top:0;border-top:0">
      <span>© CINE 1UP · prévia local do tema</span>
      <span><a class="link-fx" href="#">Privacidade</a></span>
    </div>
  </div>
</footer>

<button class="totop" type="button">↑</button>

${simulador}

<script>
${js}
</script>
</body>
</html>
`;

/* ---------- Capa ---------- */
const capa = `<div data-capa="true">
<section class="arcade-hero" id="palco">
  <canvas class="arcade-hero__maze arcade-hero__maze--fundo"></canvas>
  <canvas class="arcade-hero__maze arcade-hero__maze--frente"></canvas>
  <div class="arcade-hero__veu"></div>

  <div class="hud">
    <div class="hud__linha">Pontos <span class="hud__valor" data-placar="true">000000</span></div>
    <div class="hud__linha">Recorde <span class="hud__valor" data-recorde="true">000000</span></div>
    <div class="hud__dica" data-dica="true">← ↑ ↓ → para jogar</div>
  </div>

  <div class="arcade-hero__conteudo">
    <span class="insert-coin pixel"><i></i> <span>Insira uma ficha</span></span>
    <h1 class="titulo-arcade" data-hero-titulo="true">Cinema<br>em modo<br><em>arcade</em></h1>
    <p class="sub-arcade" data-hero-sub="true">Prévia local do tema</p>
    <div class="acoes-arcade">
      <a class="btn-arcade" data-hero-cta="true" href="#materias">▶ Ler as matérias</a>
      <a class="btn-arcade btn-arcade--ghost" href="previa-fliperama.html">🕹 Jogar</a>
    </div>
  </div>
</section>

<div class="marquise"><div class="lampadas" data-lampadas="true"></div></div>

<div class="perseguicao">
  <div class="perseguicao__pontos"></div>
  <div class="perseguicao__trilha" data-perseguicao="true"></div>
</div>

<div class="wrap"><aside class="anuncio anuncio--faixa" data-anuncio="lista"></aside></div>

<section class="section">
  <div class="wrap" data-secoes="true"></div>
</section>
</div>`;

/* ---------- Página do fliperama (como o Blogger renderiza uma Página) ---------- */
const conteudoJogo = fs.readFileSync(path.join(__dirname, 'fliperama.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/, '')   // tira o comentário de instruções
  .trim();

const paginaJogo = `<main class="section" data-area-post="true" style="padding-top:clamp(110px,14vw,170px)">
  <div class="wrap">
    <article>
      <h1 style="font-size:clamp(2.2rem,6vw,4.6rem);margin-bottom:26px">Fliperama</h1>
      <div class="artigo post-body">
        ${conteudoJogo}
      </div>
    </article>
  </div>
</main>`;

fs.writeFileSync(path.join(__dirname, 'previa-capa.html'), molde('Capa', capa), 'utf8');
fs.writeFileSync(path.join(__dirname, 'previa-fliperama.html'), molde('Fliperama', paginaJogo), 'utf8');

console.log('previa-capa.html e previa-fliperama.html gerados');
