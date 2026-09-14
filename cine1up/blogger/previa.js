/* ============================================================
   CINE 1UP — blogger/previa.js
   Gera blogger/previa.html: uma página comum, com o MESMO CSS e o
   MESMO JavaScript que vão dentro do tema, e posts de mentira no
   lugar dos do Blogger.

   Serve para ver o tema (e conferir que nada quebrou) antes de
   subir para o Blogger.

   Uso:  node blogger/build.js && node blogger/previa.js
         e abra blogger/previa.html no navegador.

   Atenção: as marcações próprias do Blogger (b:if, b:loop, data:...)
   não aparecem aqui — quem valida aquilo é o próprio Blogger, no
   momento do upload.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const tema = fs.readFileSync(path.join(__dirname, 'cine1up-blogger.xml'), 'utf8');

const entre = (texto, ini, fim) => {
  const a = texto.indexOf(ini);
  const b = texto.indexOf(fim, a + ini.length);
  if (a < 0 || b < 0) throw new Error('não achei o trecho: ' + ini);
  return texto.slice(a + ini.length, b);
};

const css = entre(tema, '<b:skin><![CDATA[', ']]></b:skin>');
const js = entre(tema, '//<![CDATA[', '//]]>');

/* Posts de mentira, no mesmo formato que o tema produz */
const EXEMPLOS = [
  ['Estreias da semana nos cinemas', 'Notícia', 'O que chega às salas e o que vale o ingresso.'],
  ['O último analógico', 'Crítica', 'Filmado em película, o longa aposta no grão como personagem.'],
  ['A série que ninguém viu chegar', 'Série', 'Oito episódios que reorganizam o gênero por dentro.'],
  ['Na sala de projeção', 'Ensaio', 'Uma conversa sobre restaurar filmes que quase se perderam.'],
  ['As 10 aberturas mais elétricas', 'Lista', 'Sequências iniciais que já chegam com a tensão no talo.'],
  ['O clássico que envelheceu ao contrário', 'Crítica', 'Um fracasso de bilheteria que virou gramática visual.']
];

const cards = EXEMPLOS.map(([titulo, cat, resumo], i) => `
  <article class="card" data-tilt="7" data-reveal="true">
    <a class="card__link" href="#"><span class="sr-only">${titulo}</span></a>
    <div class="card__media">
      <img class="arte-gerada" data-seed="exemplo-${i}-${titulo}" data-cat="${cat}" alt="${titulo}"
           src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="/>
    </div>
    <div class="card__body">
      <div class="card__meta"><span>${cat}</span><span>14 de set. de 2026</span></div>
      <h3 class="card__title">${titulo}</h3>
      <p class="card__excerpt">${resumo}</p>
    </div>
  </article>`).join('');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prévia do tema — CINE 1UP</title>
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
    <a class="logo" href="#">
      <svg class="logo__bolt" viewBox="0 0 24 32"><path d="M14 0 2 18h7l-3 14 14-19h-8l2-13Z" fill="#ffd60a"/></svg>
      <span class="logo__text">CINE<b>1UP</b></span>
    </a>
    <nav class="nav">
      <a class="nav__link" href="#">Notícias</a>
      <a class="nav__link" href="#">Séries</a>
      <a class="nav__link" href="#">Críticas</a>
      <a class="nav__link" href="#">Fliperama</a>
    </nav>
    <div class="row">
      <button class="btn btn--sm btn--ghost" data-som="true"><span>Som desligado</span></button>
      <button class="burger" type="button"><span></span><span></span></button>
    </div>
  </div>
</header>

<div class="menu">
  <ul class="menu__list">
    <li><a href="#">Notícias</a></li><li><a href="#">Séries</a></li>
    <li><a href="#">Críticas</a></li><li><a href="#">Fliperama</a></li>
  </ul>
</div>

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
    <p class="sub-arcade" data-hero-sub="true">Prévia do tema do Blogger</p>
    <div class="acoes-arcade">
      <a class="btn-arcade" data-hero-cta="true" href="#">▶ Ler as matérias</a>
      <a class="btn-arcade btn-arcade--ghost" href="#">🕹 Jogar</a>
    </div>
  </div>
</section>

<div class="marquise"><div class="lampadas" data-lampadas="true"></div></div>

<div class="marquee" data-secao-tmdb="true">
  <div class="marquee__track" data-manchetes="true">
    <span class="marquee__item"><i></i> Carregando as estreias…</span>
  </div>
</div>

<div class="perseguicao">
  <div class="perseguicao__pontos"></div>
  <div class="perseguicao__trilha" data-perseguicao="true"></div>
</div>

<section class="section" data-secao-tmdb="true">
  <div class="wrap">
    <div class="vitrine-cabeca">
      <div><span class="eyebrow">Sessão de hoje</span><h2>Nos cinemas agora</h2></div>
      <div class="vitrine-setas">
        <button data-rolar="[data-vitrine-cartaz]" data-dir="tras" type="button">←</button>
        <button data-rolar="[data-vitrine-cartaz]" data-dir="frente" type="button">→</button>
      </div>
    </div>
    <div class="vitrine" data-vitrine-cartaz="true"></div>
  </div>
</section>

<section class="section section--tight" data-secao-tmdb="true">
  <div class="wrap">
    <div class="vitrine-cabeca">
      <div><span class="eyebrow">Maratona da semana</span><h2>Séries em alta</h2></div>
      <div class="vitrine-setas">
        <button data-rolar="[data-vitrine-series]" data-dir="tras" type="button">←</button>
        <button data-rolar="[data-vitrine-series]" data-dir="frente" type="button">→</button>
      </div>
    </div>
    <div class="vitrine" data-vitrine-series="true"></div>
  </div>
</section>

<div class="wrap"><aside class="anuncio anuncio--faixa" data-anuncio="lista"></aside></div>

<main class="section">
  <div class="wrap">
    <span class="eyebrow">Escrito por gente</span>
    <h2 style="margin-bottom:40px">As últimas da redação</h2>
    <div class="blogger-grid">${cards}</div>
  </div>
</main>

<footer class="footer">
  <div class="wrap">
    <div class="footer__bottom" style="margin-top:0;border-top:0">
      <span>© CINE 1UP · dados por TMDB</span>
      <span><a class="link-fx" href="#">Privacidade</a></span>
    </div>
  </div>
</footer>

<button class="totop" type="button">↑</button>

<script>
${js}
</script>
</body>
</html>
`;

const saida = path.join(__dirname, 'previa.html');
fs.writeFileSync(saida, html, 'utf8');
console.log('Prévia gerada:', saida);
console.log('Tamanho:', (html.length / 1024).toFixed(1), 'KB');
