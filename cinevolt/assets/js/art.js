/* ============================================================
   CINEVOLT — art.js
   Gerador de ILUSTRAÇÕES EXCLUSIVAS em SVG, no clima de fliperama.
   Nenhuma imagem de banco: cada pôster é desenhado por código a
   partir de uma semente (o slug do post), então o mesmo post gera
   sempre a mesma arte e dois posts nunca geram a mesma.

   API:
     Art.poster('meu-slug', { categoria: 'Crítica' }) -> string SVG
     Art.posterURL(slug, opts) -> data URI pronto para <img src>
   ============================================================ */

(function () {
  'use strict';

  /* --------- PRNG determinístico --------- */
  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const f = n => Math.round(n * 100) / 100;

  /* --------- Paletas: cada uma é um "gabinete" --------- */
  const TEMAS = {
    'fliperama': { fundo: ['#12042a', '#07030f'], luz: '#ffd60a', acento: '#ff6ad5', quente: '#ff2b4e', frio: '#22e7ff' },
    'invasores': { fundo: ['#04120c', '#03060a'], luz: '#4dff88', acento: '#22e7ff', quente: '#ffd60a', frio: '#4dff88' },
    'neon':      { fundo: ['#1b0430', '#0a0318'], luz: '#ff6ad5', acento: '#22e7ff', quente: '#ffd60a', frio: '#b388ff' },
    'perigo':    { fundo: ['#26040c', '#0d0207'], luz: '#ff2b4e', acento: '#ff9d2e', quente: '#ffd60a', frio: '#ff6ad5' },
    'bloco':     { fundo: ['#0a1030', '#04060f'], luz: '#22e7ff', acento: '#ffd60a', quente: '#ff6ad5', frio: '#7aa8ff' },
    'sepia':     { fundo: ['#1e1204', '#0b0703'], luz: '#ff9d2e', acento: '#ffd60a', quente: '#ff2b4e', frio: '#ffe9a8' },
    'ouro':      { fundo: ['#191104', '#0a0702'], luz: '#ffd60a', acento: '#ff9d2e', quente: '#fff08a', frio: '#4dff88' },
    'gelo':      { fundo: ['#041022', '#020810'], luz: '#22e7ff', acento: '#b388ff', quente: '#ff6ad5', frio: '#ffffff' }
  };

  const NOMES = Object.keys(TEMAS);

  const POR_CATEGORIA = {
    'Crítica': 'fliperama', 'Estreia': 'perigo', 'Ensaio': 'neon',
    'Entrevista': 'sepia', 'Lista': 'bloco', 'Clássico': 'ouro',
    'Streaming': 'gelo', 'Série': 'invasores'
  };

  /* =========================================================
     SPRITES EM PIXEL — matrizes desenhadas à mão.
     1 = corpo · 2 = detalhe · 0 = vazio
     ========================================================= */
  const SPRITES = {
    invasor: [
      '0010000100',
      '0001010000',
      '0011111100',
      '0110111100',
      '1111111111',
      '1011111101',
      '1010000101',
      '0001101100'
    ],
    fantasma: [
      '00111100',
      '01111110',
      '11111111',
      '11211211',
      '11211211',
      '11111111',
      '11111111',
      '10110110'
    ],
    heroi: [
      '00111100',
      '01111110',
      '11110000',
      '11100000',
      '11100000',
      '11110000',
      '01111110',
      '00111100'
    ],
    nave: [
      '00011000',
      '00111100',
      '01111110',
      '11111111',
      '11122111',
      '10111101',
      '00100100',
      '01000010'
    ],
    caveira: [
      '00111100',
      '01111110',
      '11111111',
      '12211221',
      '12211221',
      '11111111',
      '01121110',
      '01010100'
    ],
    coracao: [
      '01100110',
      '11111111',
      '11111111',
      '11111111',
      '01111110',
      '00111100',
      '00011000',
      '00000000'
    ],
    moeda: [
      '00111100',
      '01122110',
      '11211211',
      '11211211',
      '11211211',
      '11211211',
      '01122110',
      '00111100'
    ]
  };


  /* =========================================================
     FONTE PIXEL 3x5 — desenhada à mão, só maiúsculas e números.
     É o que faz o pôster parecer tela de fliperama de verdade.
     ========================================================= */
  const FONTE = {
    A: '111101111101101', B: '110101110101110', C: '111100100100111',
    D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '111100101101111', H: '101101111101101', I: '111010010010111',
    J: '001001001101111', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '111101101101111',
    P: '111101111100100', Q: '111101101111001', R: '111101110101101',
    S: '111100111001111', T: '111010010010010', U: '101101101101111',
    V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111',
    3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
    6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
    9: '111101111001111',
    ' ': '000000000000000', '!': '010010010000010', '?': '111001010000010',
    '.': '000000000000010', '-': '000000111000000', ':': '000010000010000'
  };

  /* Escreve em pixels. `alt` é a altura da letra; a largura sai dela. */
  function texto(str, x, y, alt, cor, opacidade) {
    const p = alt / 5;
    let out = '';
    let cursor = x;
    for (const ch of String(str).toUpperCase()) {
      const g = FONTE[ch];
      if (g) {
        for (let ly = 0; ly < 5; ly++) {
          for (let lx = 0; lx < 3; lx++) {
            if (g[ly * 3 + lx] !== '1') continue;
            out += `<rect x="${f(cursor + lx * p)}" y="${f(y + ly * p)}"
                     width="${f(p + .4)}" height="${f(p + .4)}" fill="${cor}"${
                     opacidade != null ? ` opacity="${opacidade}"` : ''}/>`;
          }
        }
      }
      cursor += p * 4;
    }
    return out;
  }

  /* Largura que um texto vai ocupar, para centralizar */
  function larguraTexto(str, alt) {
    return String(str).length * (alt / 5) * 4 - (alt / 5);
  }

  function textoCentrado(str, meioX, y, alt, cor, op) {
    return texto(str, meioX - larguraTexto(str, alt) / 2, y, alt, cor, op);
  }

  /* Desenha um sprite como retângulos alinhados numa grade */
  function pixels(nome, x, y, lado, cor, detalhe, sombra) {
    const m = SPRITES[nome];
    if (!m) return '';
    const cols = m[0].length;
    const p = lado / cols;
    let out = '';
    for (let ly = 0; ly < m.length; ly++) {
      for (let lx = 0; lx < cols; lx++) {
        const c = m[ly][lx];
        if (c === '0') continue;
        const px = x + lx * p, py = y + ly * p;
        if (sombra) {
          out += `<rect x="${f(px + p * .35)}" y="${f(py + p * .35)}" width="${f(p + .5)}" height="${f(p + .5)}" fill="#000" opacity=".45"/>`;
        }
        out += `<rect x="${f(px)}" y="${f(py)}" width="${f(p + .5)}" height="${f(p + .5)}" fill="${c === '2' ? detalhe : cor}"/>`;
      }
    }
    return out;
  }

  /* =========================================================
     COMPOSIÇÕES
     ========================================================= */

  // 0. Sprite gigante centrado, com chuva de pixels
  function cenaSprite(r, W, H, p) {
    const quais = ['invasor', 'fantasma', 'nave', 'caveira', 'heroi'];
    const nome = quais[(r() * quais.length) | 0];
    const lado = W * (0.5 + r() * 0.16);
    const x = (W - lado) / 2;
    const y = H * 0.30 - lado * 0.1;

    let poeira = '';
    for (let i = 0; i < 70; i++) {
      const s = W * 0.012;
      poeira += `<rect x="${f(r() * W)}" y="${f(r() * H)}" width="${f(s)}" height="${f(s)}"
                  fill="${r() > .6 ? p.acento : p.luz}" opacity="${f(.06 + r() * .30)}"/>`;
    }
    return `${poeira}
      <ellipse cx="${f(W / 2)}" cy="${f(y + lado * .55)}" rx="${f(lado * .8)}" ry="${f(lado * .7)}"
               fill="${p.luz}" opacity=".13" filter="url(#brilho)"/>
      ${pixels(nome, x, y, lado, p.luz, p.quente, true)}`;
  }

  // 1. Gabinete de fliperama visto de frente
  function cenaGabinete(r, W, H, p) {
    const gw = W * 0.62, gx = (W - gw) / 2, gy = H * 0.12, gh = H * 0.8;
    const tw = gw * 0.78, tx = gx + (gw - tw) / 2, ty = gy + gh * 0.12, th = gh * 0.34;
    let botoes = '';
    for (let i = 0; i < 4; i++) {
      botoes += `<circle cx="${f(tx + tw * (0.34 + i * 0.16))}" cy="${f(ty + th * 1.52)}"
                  r="${f(gw * 0.035)}" fill="${[p.quente, p.luz, p.acento, p.frio][i]}"/>`;
    }
    return `
      <rect x="${f(gx)}" y="${f(gy)}" width="${f(gw)}" height="${f(gh)}" rx="${f(gw * .06)}" fill="#000"/>
      <rect x="${f(gx)}" y="${f(gy)}" width="${f(gw)}" height="${f(gh)}" rx="${f(gw * .06)}"
            fill="none" stroke="${p.acento}" stroke-width="3" opacity=".9"/>
      <!-- marquise -->
      <rect x="${f(gx + gw * .06)}" y="${f(gy + gh * .03)}" width="${f(gw * .88)}" height="${f(gh * .07)}"
            rx="3" fill="${p.luz}" opacity=".92"/>
      ${textoCentrado('CINEVOLT', gx + gw / 2, gy + gh * .043, gh * .045, '#0a0417')}
      <!-- tela -->
      <rect x="${f(tx)}" y="${f(ty)}" width="${f(tw)}" height="${f(th)}" rx="4" fill="url(#tela)"/>
      ${pixels('heroi', tx + tw * .40, ty + th * .3, th * .38, '#000', '#000', false)}
      <!-- painel de controle -->
      <path d="M${f(gx + gw * .04)},${f(ty + th * 1.25)} L${f(gx + gw * .96)},${f(ty + th * 1.25)}
               L${f(gx + gw * .90)},${f(ty + th * 1.75)} L${f(gx + gw * .10)},${f(ty + th * 1.75)} Z"
            fill="#14102e" stroke="${p.acento}" stroke-width="2" opacity=".95"/>
      <circle cx="${f(tx + tw * .14)}" cy="${f(ty + th * 1.5)}" r="${f(gw * .05)}" fill="#1c1638"/>
      <circle cx="${f(tx + tw * .14)}" cy="${f(ty + th * 1.5)}" r="${f(gw * .05)}" fill="none" stroke="${p.frio}" stroke-width="2"/>
      <rect x="${f(tx + tw * .125)}" y="${f(ty + th * 1.22)}" width="${f(gw * .028)}" height="${f(gh * .1)}" rx="3" fill="${p.quente}"/>
      <circle cx="${f(tx + tw * .14)}" cy="${f(ty + th * 1.2)}" r="${f(gw * .035)}" fill="${p.quente}"/>
      ${botoes}`;
  }

  // 2. Labirinto com pontinhos
  function cenaLabirinto(r, W, H, p) {
    const cols = 9, linhas = 12;
    const t = Math.min(W / cols, H / linhas);
    const ox = (W - t * cols) / 2, oy = (H - t * linhas) / 2;
    let blocos = '', pontinhos = '';
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const borda = x === 0 || y === 0 || x === cols - 1 || y === linhas - 1;
        const dentro = !borda && (x % 2 === 0 && y % 2 === 0 || r() > 0.82);
        if (borda || dentro) {
          blocos += `<rect x="${f(ox + x * t)}" y="${f(oy + y * t)}" width="${f(t)}" height="${f(t)}"
                      fill="none" stroke="${p.frio}" stroke-width="${f(t * .1)}" opacity=".75"/>`;
        } else {
          pontinhos += `<circle cx="${f(ox + x * t + t / 2)}" cy="${f(oy + y * t + t / 2)}"
                         r="${f(t * .09)}" fill="${p.luz}" opacity=".9"/>`;
        }
      }
    }
    const hx = ox + t * (1 + ((r() * (cols - 2)) | 0));
    const hy = oy + t * (1 + ((r() * (linhas - 2)) | 0));
    return `${blocos}${pontinhos}
      ${textoCentrado('READY!', W / 2, H * .52, H * .05, p.quente)}
      ${pixels('heroi', hx, hy, t * .9, p.luz, p.luz, false)}
      ${pixels('fantasma', ox + t * 3, oy + t * 8, t * .9, p.quente, '#fff', false)}`;
  }

  // 3. Tela de GAME OVER / CONTINUE
  function cenaTela(r, W, H, p) {
    const frases = [['GAME OVER', 'CONTINUE?', '9'], ['PLAYER ONE', 'READY', '!'],
                    ['ROUND 2', 'FIGHT', '!'], ['INSERT COIN', 'CREDIT 01', '']];
    const frase = frases[(r() * frases.length) | 0];
    const barras = [
      textoCentrado(frase[0], W / 2, H * .62, H * .07, p.luz),
      textoCentrado(frase[1], W / 2, H * .74, H * .05, p.frio, '.9'),
      textoCentrado(frase[2], W / 2, H * .83, H * .04, p.quente, '.85')
    ];
    const n = 3 + ((r() * 4) | 0);
    let creditos = '';
    for (let i = 0; i < n; i++) {
      creditos += pixels('moeda', W * (.12 + i * .1), H * .86, W * .06, p.acento, p.quente, false);
    }
    return `
      <rect x="${f(W * .08)}" y="${f(H * .1)}" width="${f(W * .84)}" height="${f(H * .44)}" rx="6"
            fill="url(#tela)" opacity=".9"/>
      <rect x="${f(W * .08)}" y="${f(H * .1)}" width="${f(W * .84)}" height="${f(H * .44)}" rx="6"
            fill="none" stroke="${p.acento}" stroke-width="2.5"/>
      ${pixels('caveira', W * .5 - W * .11, H * .18, W * .22, p.quente, '#000', false)}
      ${barras.join('')}
      ${creditos}`;
  }

  // 4. Chuva de invasores em formação
  function cenaFormacao(r, W, H, p) {
    const cols = 5, linhas = 4;
    const lado = W * 0.13;
    const gx = (W - (cols * lado * 1.35 - lado * .35)) / 2;
    const gy = H * 0.16;
    let grade = '';
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const cor = [p.luz, p.acento, p.frio, p.quente][y % 4];
        grade += pixels(y % 2 ? 'invasor' : 'fantasma',
          gx + x * lado * 1.35, gy + y * lado * 1.3, lado, cor, '#000', false);
      }
    }
    // a nave lá embaixo, resistindo
    const nx = W * (0.2 + r() * 0.6);
    let tiros = '';
    for (let i = 0; i < 3; i++) {
      tiros += `<rect x="${f(nx + W * .055)}" y="${f(H * (.62 - i * .08))}" width="${f(W * .012)}"
                 height="${f(H * .045)}" fill="${p.quente}" opacity="${f(.9 - i * .25)}"/>`;
    }
    return `
      ${texto('1UP', W * .06, H * .05, H * .045, p.quente)}
      ${texto(String(hash(String(Math.floor(r() * 9e5)))).slice(0, 5), W * .62, H * .05, H * .045, p.luz)}
      ${grade}${tiros}
      ${pixels('nave', nx, H * .76, W * .14, p.frio, p.quente, false)}
      <rect x="0" y="${f(H * .93)}" width="${W}" height="${f(H * .02)}" fill="${p.acento}" opacity=".5"/>`;
  }

  // 5. Tabela de recordes, com iniciais e pontuação
  function cenaRecordes(r, W, H, p) {
    const iniciais = ['CVT', 'PAC', 'ZOE', 'RAY', 'ANA', 'BIT', 'LUZ', 'VHS', 'JOY', 'KIM'];
    const alt = H * 0.042;
    let linhas = '';
    let pontos = 98000 + ((r() * 40000) | 0);

    for (let i = 0; i < 6; i++) {
      const y = H * (0.30 + i * 0.095);
      const op = String(f(1 - i * 0.11));
      const nome = iniciais[(r() * iniciais.length) | 0];
      const valor = String(pontos).padStart(6, '0');
      pontos = Math.max(1000, pontos - 6000 - ((r() * 12000) | 0));

      linhas += texto((i + 1) + '.', W * 0.12, y, alt, p.acento, op);
      linhas += texto(nome, W * 0.34, y, alt, p.frio, op);
      linhas += texto(valor, W * 0.56, y, alt, p.luz, op);
    }

    return `
      <rect x="${f(W * .06)}" y="${f(H * .07)}" width="${f(W * .88)}" height="${f(H * .84)}" rx="6"
            fill="#000" opacity=".5"/>
      ${textoCentrado('HIGH SCORE', W / 2, H * .15, H * .062, p.luz)}
      <rect x="${f(W * .12)}" y="${f(H * .245)}" width="${f(W * .76)}" height="2" fill="${p.acento}" opacity=".6"/>
      ${linhas}
      ${textoCentrado('INSERT COIN', W / 2, H * .88, H * .034, p.quente, '.8')}`;
  }

  // 6. Cartucho / fita de vídeo
  function cenaCartucho(r, W, H, p) {
    const cw = W * 0.66, cx = (W - cw) / 2, ch = cw * 0.82, cy = (H - ch) / 2;
    return `
      <rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch)}" rx="${f(cw * .05)}"
            fill="#18132e" stroke="${p.acento}" stroke-width="3"/>
      <rect x="${f(cx + cw * .1)}" y="${f(cy + ch * .12)}" width="${f(cw * .8)}" height="${f(ch * .34)}" rx="4"
            fill="url(#tela)"/>
      ${pixels('invasor', cx + cw * .38, cy + ch * .18, ch * .22, '#000', '#000', false)}
      <rect x="${f(cx + cw * .18)}" y="${f(cy + ch * .56)}" width="${f(cw * .64)}" height="${f(ch * .3)}" rx="3"
            fill="#0b0820" stroke="${p.frio}" stroke-width="2"/>
      <circle cx="${f(cx + cw * .34)}" cy="${f(cy + ch * .71)}" r="${f(ch * .09)}" fill="${p.luz}" opacity=".85"/>
      <circle cx="${f(cx + cw * .66)}" cy="${f(cy + ch * .71)}" r="${f(ch * .09)}" fill="${p.luz}" opacity=".85"/>
      <rect x="${f(cx + cw * .42)}" y="${f(cy + ch * .68)}" width="${f(cw * .16)}" height="${f(ch * .06)}" fill="${p.acento}"/>`;
  }

  // 7. Explosão de pixels
  function cenaExplosao(r, W, H, p) {
    const cxp = W * 0.5, cyp = H * 0.46;
    let anel = '';
    for (let camada = 1; camada <= 4; camada++) {
      const n = camada * 7;
      const raio = (W * 0.09) * camada;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 / n) * i + camada * .3;
        const s = W * (0.035 - camada * 0.004);
        anel += `<rect x="${f(cxp + Math.cos(a) * raio - s / 2)}" y="${f(cyp + Math.sin(a) * raio - s / 2)}"
                  width="${f(s)}" height="${f(s)}"
                  fill="${[p.luz, p.quente, p.acento, p.frio][camada % 4]}"
                  opacity="${f(.95 - camada * .17)}"/>`;
      }
    }
    return `
      <circle cx="${f(cxp)}" cy="${f(cyp)}" r="${f(W * .3)}" fill="${p.quente}" opacity=".16" filter="url(#brilho)"/>
      ${anel}
      ${pixels('nave', cxp - W * .07, cyp - W * .07, W * .14, '#ffffff', p.quente, false)}`;
  }

  const CENAS = [cenaSprite, cenaGabinete, cenaLabirinto, cenaTela,
                 cenaFormacao, cenaRecordes, cenaCartucho, cenaExplosao];

  const CENAS_POR_TEMA = {
    'fliperama': [1, 2, 0, 5, 7],
    'invasores': [4, 0, 7, 3, 6],
    'neon':      [0, 2, 6, 7, 1],
    'perigo':    [3, 7, 0, 4, 6],
    'bloco':     [5, 2, 1, 0, 4],
    'sepia':     [6, 1, 5, 3, 0],
    'ouro':      [5, 1, 6, 2, 7],
    'gelo':      [7, 4, 2, 6, 3]
  };

  /* =========================================================
     MONTAGEM
     ========================================================= */
  function poster(semente, opcoes) {
    const o = opcoes || {};
    const sem = String(semente || 'cinevolt');
    const r = rng(hash(sem));
    const nomeTema = TEMAS[o.tema] ? o.tema
      : (POR_CATEGORIA[o.categoria] || NOMES[hash(sem + '|tema') % NOMES.length]);
    const tema = TEMAS[nomeTema];

    const W = o.w || 800;
    const H = o.h || Math.round(W * (o.ratio === '16/9' ? 9 / 16 : o.ratio === '1/1' ? 1 : 4 / 3));

    const permitidas = CENAS_POR_TEMA[nomeTema] || [0, 1, 2, 3, 4, 5, 6, 7];
    const idx = o.cena != null
      ? Number(o.cena) % CENAS.length
      : permitidas[(hash(sem + '|cena|' + nomeTema) >>> 3) % permitidas.length];

    const conteudo = CENAS[idx](r, W, H, tema);
    const serie = String(hash(sem)).slice(0, 6);
    const pix = Math.max(2, W * 0.006);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ilustração original CINEVOLT">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0" stop-color="${tema.fundo[0]}"/>
      <stop offset="1" stop-color="${tema.fundo[1]}"/>
    </linearGradient>
    <linearGradient id="tela" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tema.luz}" stop-opacity=".95"/>
      <stop offset="1" stop-color="${tema.acento}" stop-opacity=".55"/>
    </linearGradient>
    <radialGradient id="vig" cx=".5" cy=".5" r=".75">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".75"/>
    </radialGradient>
    <filter id="brilho" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${f(W * 0.03)}"/>
    </filter>
    <pattern id="scan" width="${f(pix)}" height="${f(pix * 2)}" patternUnits="userSpaceOnUse">
      <rect width="${f(pix)}" height="${f(pix)}" fill="#fff" opacity=".05"/>
    </pattern>
    <pattern id="grade" width="${f(W / 16)}" height="${f(W / 16)}" patternUnits="userSpaceOnUse">
      <path d="M${f(W / 16)},0 L0,0 0,${f(W / 16)}" fill="none" stroke="${tema.acento}" stroke-width="1" opacity=".14"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grade)"/>
  ${conteudo}
  <rect width="${W}" height="${H}" fill="url(#scan)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect x="${f(pix)}" y="${f(pix)}" width="${f(W - pix * 2)}" height="${f(H - pix * 2)}"
        fill="none" stroke="${tema.acento}" stroke-opacity=".45" stroke-width="${f(pix)}"/>
  <g font-family="monospace" font-size="${f(W * 0.019)}" fill="#fff" opacity=".6" letter-spacing="2">
    <text x="${f(W * .05)}" y="${f(H - W * .028)}">CINEVOLT</text>
    <text x="${f(W * .95)}" y="${f(H - W * .028)}" text-anchor="end">${serie}</text>
  </g>
</svg>`;
  }

  function posterURL(semente, opcoes) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(poster(semente, opcoes));
  }

  window.Art = { poster, posterURL, TEMAS, NOMES, POR_CATEGORIA, SPRITES, rng, hash };
})();
