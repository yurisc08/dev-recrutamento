/* ============================================================
   CINEVOLT — art.js
   Gerador de ILUSTRAÇÕES EXCLUSIVAS em SVG.
   Nenhuma imagem de banco: cada pôster é desenhado por código a
   partir de uma semente (o slug do post), então o mesmo post gera
   sempre a mesma arte e dois posts nunca geram a mesma.

   API:
     Art.poster('meu-slug', { tema: 'noir', titulo: 'X', ratio: '3/4' })
       -> string SVG
     Art.posterURL(slug, opts) -> data URI pronto para <img src>
     Art.TEMAS -> lista de temas disponíveis
   ============================================================ */

(function () {
  'use strict';

  /* --------- PRNG determinístico (mulberry32 + hash de string) --------- */
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

  /* --------- Paletas por tema --------- */
  const TEMAS = {
    'sci-fi':  { fundo: ['#04050f', '#0a1030'], luz: '#00e5ff', acento: '#7b2ff7', quente: '#ff2d55' },
    'noir':    { fundo: ['#050505', '#141414'], luz: '#e8e8e8', acento: '#8a8a8a', quente: '#ffd400' },
    'terror':  { fundo: ['#0a0305', '#22060c'], luz: '#ff2d55', acento: '#7b2ff7', quente: '#ff6b00' },
    'acao':    { fundo: ['#06060c', '#171033'], luz: '#00e5ff', acento: '#ffd400', quente: '#ff2d55' },
    'drama':   { fundo: ['#0b0710', '#2a1230'], luz: '#ff8a00', acento: '#ffd400', quente: '#ff2d55' },
    'doc':     { fundo: ['#05070a', '#0c1a20'], luz: '#7df9ff', acento: '#3ddc84', quente: '#ffd400' },
    'romance': { fundo: ['#0c050c', '#2b0c24'], luz: '#ff6fa5', acento: '#ffd400', quente: '#7b2ff7' },
    'anime':   { fundo: ['#060412', '#1b0a3a'], luz: '#b47cff', acento: '#00e5ff', quente: '#ff2d55' }
  };

  const NOMES = Object.keys(TEMAS);

  /* Mapa categoria editorial -> tema visual */
  const POR_CATEGORIA = {
    'Crítica': 'noir', 'Estreia': 'acao', 'Ensaio': 'drama',
    'Entrevista': 'doc', 'Lista': 'sci-fi', 'Clássico': 'noir',
    'Streaming': 'anime', 'Série': 'terror'
  };

  /* --------- Helpers de desenho --------- */
  const f = n => Math.round(n * 100) / 100;

  function poligono(pts) {
    return pts.map(p => `${f(p[0])},${f(p[1])}`).join(' ');
  }

  /* Raio estilizado (vetorial, para compor a arte) */
  function raioPath(x, y, alt, larg, r) {
    const seg = 5;
    let d = `M${f(x)},${f(y)}`;
    let cx = x, cy = y;
    for (let i = 1; i <= seg; i++) {
      const ny = y + (alt / seg) * i;
      const nx = x + (r() - 0.5) * larg * 2;
      d += ` L${f(nx)},${f(ny)}`;
      cx = nx; cy = ny;
    }
    return d;
  }

  /* --------- Composições (uma função por tema visual) --------- */

  // Silhueta de figura num vão de porta iluminado
  function cenaPorta(r, W, H, p) {
    const px = W * (0.3 + r() * 0.4);
    const pw = W * (0.24 + r() * 0.14);
    const ph = H * (0.52 + r() * 0.18);
    const py = H - ph;
    const fh = ph * (0.72 + r() * 0.16);
    const fw = fh * 0.26;
    const fx = px + pw / 2;
    return `
      <rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(ph)}" fill="url(#luzQ)"/>
      <polygon points="${poligono([[px, py], [px + pw, py], [px + pw * 1.7, H], [px - pw * 0.7, H]])}"
               fill="url(#feixe)" opacity=".55"/>
      <g fill="#000" opacity=".93">
        <ellipse cx="${f(fx)}" cy="${f(H - fh)}" rx="${f(fw * 0.42)}" ry="${f(fw * 0.48)}"/>
        <path d="M${f(fx - fw / 2)},${f(H)} L${f(fx - fw * 0.42)},${f(H - fh * 0.82)}
                 Q${f(fx)},${f(H - fh * 0.95)} ${f(fx + fw * 0.42)},${f(H - fh * 0.82)}
                 L${f(fx + fw / 2)},${f(H)} Z"/>
      </g>
      <rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(ph)}" fill="none"
            stroke="${p.luz}" stroke-width="2" opacity=".5"/>`;
  }

  // Planeta + nave + horizonte de estrelas
  function cenaOrbita(r, W, H, p) {
    const cx = W * (0.3 + r() * 0.4);
    const cy = H * (0.62 + r() * 0.14);
    const rad = W * (0.34 + r() * 0.16);
    let estrelas = '';
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H * 0.75, s = r() * 1.7 + 0.3;
      estrelas += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="#fff" opacity="${f(0.15 + r() * 0.7)}"/>`;
    }
    const anel = `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rad * 1.55)}" ry="${f(rad * 0.3)}"
                    fill="none" stroke="${p.acento}" stroke-width="${f(rad * 0.07)}" opacity=".8"
                    transform="rotate(${f(-18 - r() * 16)} ${f(cx)} ${f(cy)})"/>`;
    const naveX = W * (0.15 + r() * 0.2), naveY = H * (0.24 + r() * 0.16);
    return `${estrelas}
      ${r() > 0.4 ? anel : ''}
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="url(#planeta)"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="none" stroke="${p.luz}" stroke-width="1.5" opacity=".65"/>
      <path d="M${f(naveX)},${f(naveY)} l22,7 -22,7 6,-7 Z" fill="${p.luz}" opacity=".95"/>
      <path d="M${f(naveX - 60)},${f(naveY + 7)} L${f(naveX)},${f(naveY + 7)}" stroke="${p.luz}"
            stroke-width="1.5" opacity=".45"/>`;
  }

  // Casa/torre na colina sob lua enorme
  function cenaColina(r, W, H, p) {
    const luaX = W * (0.25 + r() * 0.5);
    const luaY = H * (0.3 + r() * 0.12);
    const luaR = W * (0.2 + r() * 0.12);
    const hY = H * (0.72 + r() * 0.08);
    const cx = W * (0.34 + r() * 0.32);
    const cw = W * 0.13, ch = H * 0.14;
    let arvores = '';
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      const h = H * (0.05 + r() * 0.07);
      arvores += `<polygon points="${poligono([[x, hY + 12], [x - h * 0.22, hY + 12], [x, hY + 12 - h], [x + h * 0.22, hY + 12]])}" fill="#000"/>`;
    }
    return `
      <circle cx="${f(luaX)}" cy="${f(luaY)}" r="${f(luaR)}" fill="url(#lua)"/>
      <circle cx="${f(luaX)}" cy="${f(luaY)}" r="${f(luaR * 1.5)}" fill="${p.luz}" opacity=".07"/>
      <path d="M0,${f(hY + 40)} Q${f(W * 0.3)},${f(hY - 18)} ${f(W * 0.55)},${f(hY + 10)}
               T${f(W)},${f(hY + 26)} L${f(W)},${f(H)} L0,${f(H)} Z" fill="#000"/>
      ${arvores}
      <g fill="#000">
        <rect x="${f(cx)}" y="${f(hY - ch)}" width="${f(cw)}" height="${f(ch + 20)}"/>
        <polygon points="${poligono([[cx - cw * 0.18, hY - ch], [cx + cw * 1.18, hY - ch], [cx + cw / 2, hY - ch * 1.55]])}"/>
      </g>
      <rect x="${f(cx + cw * 0.3)}" y="${f(hY - ch * 0.72)}" width="${f(cw * 0.26)}" height="${f(ch * 0.3)}"
            fill="${p.quente}" opacity=".95"/>`;
  }

  // Close de rosto atravessado por um raio
  function cenaRosto(r, W, H, p) {
    const cx = W * 0.5, cy = H * 0.46;
    const rw = W * (0.26 + r() * 0.06);   // meia-largura do crânio
    const rh = rw * 1.30;                 // meia-altura
    const olhoY = cy - rh * 0.10;
    const dx = rw * 0.40;
    const queixo = cy + rh;

    // silhueta: testa larga, maçãs, queixo estreito
    const cabeca = `M${f(cx - rw)},${f(cy - rh * 0.30)}
        C${f(cx - rw)},${f(cy - rh * 1.05)} ${f(cx - rw * 0.55)},${f(cy - rh * 1.28)} ${f(cx)},${f(cy - rh * 1.28)}
        C${f(cx + rw * 0.55)},${f(cy - rh * 1.28)} ${f(cx + rw)},${f(cy - rh * 1.05)} ${f(cx + rw)},${f(cy - rh * 0.30)}
        C${f(cx + rw)},${f(cy + rh * 0.30)} ${f(cx + rw * 0.60)},${f(queixo)} ${f(cx)},${f(queixo)}
        C${f(cx - rw * 0.60)},${f(queixo)} ${f(cx - rw)},${f(cy + rh * 0.30)} ${f(cx - rw)},${f(cy - rh * 0.30)} Z`;

    // ombros, para o rosto não flutuar
    const ombroY = queixo + rh * 0.22;
    const ombros = `M${f(cx - rw * 2.1)},${f(H)} 
        C${f(cx - rw * 1.5)},${f(ombroY)} ${f(cx - rw * 0.7)},${f(ombroY - rh * 0.1)} ${f(cx)},${f(ombroY - rh * 0.12)}
        C${f(cx + rw * 0.7)},${f(ombroY - rh * 0.1)} ${f(cx + rw * 1.5)},${f(ombroY)} ${f(cx + rw * 2.1)},${f(H)} Z`;

    return `
      <path d="${ombros}" fill="#000" opacity=".92"/>
      <path d="${cabeca}" fill="url(#pele)"/>
      <path d="${cabeca}" fill="none" stroke="${p.luz}" stroke-width="1.8" opacity=".55"/>
      <!-- sombra dura de um lado: luz lateral de cinema -->
      <path d="M${f(cx)},${f(cy - rh * 1.28)}
               C${f(cx + rw * 0.55)},${f(cy - rh * 1.28)} ${f(cx + rw)},${f(cy - rh * 1.05)} ${f(cx + rw)},${f(cy - rh * 0.30)}
               C${f(cx + rw)},${f(cy + rh * 0.30)} ${f(cx + rw * 0.60)},${f(queixo)} ${f(cx)},${f(queixo)} Z"
            fill="#000" opacity=".42"/>
      <!-- olhos acesos -->
      <g>
        <ellipse cx="${f(cx - dx)}" cy="${f(olhoY)}" rx="${f(rw * 0.30)}" ry="${f(rw * 0.17)}" fill="${p.luz}" opacity=".20"/>
        <ellipse cx="${f(cx + dx)}" cy="${f(olhoY)}" rx="${f(rw * 0.30)}" ry="${f(rw * 0.17)}" fill="${p.luz}" opacity=".20"/>
        <path d="M${f(cx - dx - rw * 0.17)},${f(olhoY)} Q${f(cx - dx)},${f(olhoY - rw * 0.09)} ${f(cx - dx + rw * 0.17)},${f(olhoY)}
                 Q${f(cx - dx)},${f(olhoY + rw * 0.07)} ${f(cx - dx - rw * 0.17)},${f(olhoY)} Z" fill="${p.luz}"/>
        <path d="M${f(cx + dx - rw * 0.17)},${f(olhoY)} Q${f(cx + dx)},${f(olhoY - rw * 0.09)} ${f(cx + dx + rw * 0.17)},${f(olhoY)}
                 Q${f(cx + dx)},${f(olhoY + rw * 0.07)} ${f(cx + dx - rw * 0.17)},${f(olhoY)} Z" fill="${p.luz}"/>
      </g>
      <!-- raio cortando o quadro -->
      <path d="${raioPath(W * (0.16 + r() * 0.68), 0, H * 0.99, W * 0.055, r)}"
            stroke="${p.luz}" stroke-width="3" fill="none" stroke-linejoin="round"
            opacity=".92" filter="url(#brilho)"/>`;
  }

  // Poltronas + feixe do projetor (ensaio / documentário)
  function cenaSala(r, W, H, p) {
    const baseY = H * 0.84;
    let poltronas = '';
    const n = 5 + ((r() * 3) | 0);
    const larg = W / n;
    for (let i = 0; i < n; i++) {
      const x = i * larg + larg * 0.12;
      const w = larg * 0.76;
      const h = H * (0.1 + r() * 0.04);
      poltronas += `<path d="M${f(x)},${f(baseY + h)} L${f(x)},${f(baseY - h * 0.5)}
                    Q${f(x + w / 2)},${f(baseY - h * 1.25)} ${f(x + w)},${f(baseY - h * 0.5)}
                    L${f(x + w)},${f(baseY + h)} Z" fill="#000"/>`;
    }
    const telaY = H * 0.16, telaH = H * 0.4;
    return `
      <rect x="${f(W * 0.1)}" y="${f(telaY)}" width="${f(W * 0.8)}" height="${f(telaH)}" fill="url(#luzQ)" opacity=".92"/>
      <rect x="${f(W * 0.1)}" y="${f(telaY)}" width="${f(W * 0.8)}" height="${f(telaH)}" fill="none"
            stroke="${p.acento}" stroke-width="2" opacity=".6"/>
      <polygon points="${poligono([[W * 0.5, H], [W * 0.1, telaY], [W * 0.9, telaY]])}" fill="url(#feixe)" opacity=".3"/>
      ${poltronas}`;
  }

  // Skyline neon (cidade)
  function cenaCidade(r, W, H, p) {
    const linha = H * (0.58 + r() * 0.1);   // altura média do horizonte
    let predios = '';
    let x = -20;
    while (x < W + 20) {
      const w = W * (0.055 + r() * 0.09);
      const h = H * (0.14 + r() * 0.34);
      const y = H - h;
      predios += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#000"/>`;
      // antena ou caixa d'água no topo
      if (r() > 0.62) {
        predios += `<rect x="${f(x + w * 0.44)}" y="${f(y - H * 0.055)}" width="${f(W * 0.006)}" height="${f(H * 0.055)}" fill="#000"/>`;
        predios += `<circle cx="${f(x + w * 0.46)}" cy="${f(y - H * 0.055)}" r="${f(W * 0.007)}" fill="${p.quente}" opacity=".9"/>`;
      }
      const jan = (r() * 7) | 0;
      for (let j = 0; j < jan; j++) {
        predios += `<rect x="${f(x + w * (0.12 + r() * 0.7))}" y="${f(y + h * (0.08 + r() * 0.8))}"
                     width="${f(w * 0.1)}" height="${f(h * 0.03)}" fill="${r() > .5 ? p.luz : p.quente}" opacity="${f(.35 + r() * .6)}"/>`;
      }
      x += w * (1 + r() * 0.1);
    }

    // letreiro de neon vertical
    const lx = W * (0.12 + r() * 0.74);
    const ly = H * (0.3 + r() * 0.2);
    let letreiro = `<rect x="${f(lx)}" y="${f(ly)}" width="${f(W * 0.012)}" height="${f(H * 0.22)}"
                     fill="${p.acento}" opacity=".85" filter="url(#brilho)"/>`;

    // chuva fina
    let chuva = '';
    for (let i = 0; i < 80; i++) {
      const rx = r() * W, ry = r() * H;
      chuva += `<line x1="${f(rx)}" y1="${f(ry)}" x2="${f(rx - 5)}" y2="${f(ry + 26)}"
                 stroke="${p.luz}" stroke-width="1" opacity="${f(0.05 + r() * 0.16)}"/>`;
    }

    // lua/sol pequeno, alto no quadro
    const sx = W * (0.2 + r() * 0.6), sy = H * (0.16 + r() * 0.12), sr = W * (0.055 + r() * 0.03);

    return `
      <circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr * 3.4)}" fill="url(#sol)" opacity=".5"/>
      <circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr)}" fill="${p.quente}" opacity=".92"/>
      <rect x="0" y="${f(linha)}" width="${W}" height="${f(H * 0.09)}" fill="${p.luz}" opacity=".05"/>
      ${predios}${letreiro}${chuva}
      <rect x="0" y="${f(H * 0.92)}" width="${W}" height="${f(H * 0.08)}" fill="${p.luz}" opacity=".07"/>`;
  }

  // Rolo de filme / espiral (listas, clássicos)
  function cenaRolo(r, W, H, p) {
    const cx = W * 0.5, cy = H * 0.5;
    const R = Math.min(W, H) * 0.3;
    let furos = '';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i + r() * 0.2;
      furos += `<circle cx="${f(cx + Math.cos(a) * R * 0.62)}" cy="${f(cy + Math.sin(a) * R * 0.62)}"
                 r="${f(R * 0.13)}" fill="#000"/>`;
    }
    let fita = '';
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * R * 0.9;
      fita += `<path d="M${f(-20)},${f(cy + off + R * 1.3)} Q${f(W * 0.5)},${f(cy + off + R * (0.6 + r()))} ${f(W + 20)},${f(cy + off + R * 1.25)}"
                stroke="${p.acento}" stroke-width="${f(R * 0.14)}" fill="none" opacity=".35"/>`;
    }
    return `${fita}
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 1.6)}" fill="${p.luz}" opacity=".12" filter="url(#brilho)"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 1.18)}" fill="${p.luz}" opacity=".1"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="none" stroke="${p.luz}" stroke-width="${f(R * 0.16)}"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.2)}" fill="${p.luz}"/>
      ${furos}`;
  }

  const CENAS = [cenaPorta, cenaOrbita, cenaColina, cenaRosto, cenaSala, cenaCidade, cenaRolo];

  /* Cada tema só usa composições que combinam com ele — assim o
     resultado nunca é "planeta cinza num ensaio de drama". */
  const CENAS_POR_TEMA = {
    'sci-fi':  [1, 3, 6],
    'noir':    [0, 5, 6],
    'terror':  [2, 0, 3],
    'acao':    [3, 1, 5],
    'drama':   [0, 4, 2],
    'doc':     [4, 6, 0],
    'romance': [0, 2, 4],
    'anime':   [3, 1, 4]
  };

  /* --------- Montagem do pôster --------- */
  function poster(semente, opcoes) {
    const o = opcoes || {};
    const r = rng(hash(String(semente || 'cinevolt')));
    const tema = TEMAS[o.tema] || TEMAS[POR_CATEGORIA[o.categoria]] || TEMAS[NOMES[(r() * NOMES.length) | 0]];
    const W = o.w || 800;
    const H = o.h || Math.round(W * (o.ratio === '16/9' ? 9 / 16 : o.ratio === '1/1' ? 1 : 4 / 3));

    // hash próprio para a cena: garante variedade entre slugs parecidos
    const nomeTema = Object.keys(TEMAS).find(k => TEMAS[k] === tema) || 'noir';
    const permitidas = CENAS_POR_TEMA[nomeTema] || [0, 1, 2, 3, 4, 5, 6];
    const idx = o.cena != null
      ? Number(o.cena) % CENAS.length
      : permitidas[hash(String(semente) + '|cena') % permitidas.length];
    const cena = CENAS[idx];
    const conteudo = cena(r, W, H, tema);

    // faixas horizontais de "interferência"
    let faixas = '';
    const nf = 2 + ((r() * 4) | 0);
    for (let i = 0; i < nf; i++) {
      const y = r() * H;
      faixas += `<rect x="0" y="${f(y)}" width="${W}" height="${f(1 + r() * 3)}" fill="#fff" opacity="${f(0.02 + r() * 0.05)}"/>`;
    }

    // número de série — dá ar de material de arquivo
    const serie = String(hash(String(semente))).slice(0, 6);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ilustração original CINEVOLT">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${tema.fundo[1]}"/>
      <stop offset="1" stop-color="${tema.fundo[0]}"/>
    </linearGradient>
    <radialGradient id="luzQ" cx="0.5" cy="0.5" r="0.7">
      <stop offset="0" stop-color="${tema.luz}" stop-opacity=".95"/>
      <stop offset="1" stop-color="${tema.acento}" stop-opacity=".25"/>
    </radialGradient>
    <linearGradient id="feixe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tema.luz}" stop-opacity=".75"/>
      <stop offset="1" stop-color="${tema.luz}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="planeta" cx="0.32" cy="0.28" r="0.85">
      <stop offset="0" stop-color="${tema.luz}" stop-opacity=".85"/>
      <stop offset="0.55" stop-color="${tema.acento}" stop-opacity=".55"/>
      <stop offset="1" stop-color="#000" stop-opacity=".95"/>
    </radialGradient>
    <radialGradient id="lua" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.7" stop-color="${tema.luz}"/>
      <stop offset="1" stop-color="${tema.acento}" stop-opacity=".7"/>
    </radialGradient>
    <radialGradient id="sol" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${tema.quente}" stop-opacity=".9"/>
      <stop offset="1" stop-color="${tema.quente}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pele" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tema.acento}" stop-opacity=".65"/>
      <stop offset="0.5" stop-color="#000" stop-opacity=".9"/>
      <stop offset="1" stop-color="${tema.luz}" stop-opacity=".45"/>
    </linearGradient>
    <filter id="brilho" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="grao">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <linearGradient id="vinheta" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".32"/>
      <stop offset="0.42" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".80"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${conteudo}
  ${faixas}
  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>
  <rect width="${W}" height="${H}" filter="url(#grao)" opacity=".09" style="mix-blend-mode:overlay"/>
  <!-- billing block: aquelas linhas de crédito do rodapé de pôster -->
  <g opacity=".28" fill="#ffffff">
    ${[0, 1, 2].map(i => {
      const y = H - W * 0.085 + i * W * 0.018;
      const larg = W * (0.62 - i * 0.13);
      return `<rect x="${f((W - larg) / 2)}" y="${f(y)}" width="${f(larg)}" height="${f(W * 0.006)}" rx="${f(W * 0.003)}"/>`;
    }).join('')}
  </g>
  <g opacity=".55" font-family="monospace" font-size="${f(W * 0.018)}" fill="#fff" letter-spacing="2">
    <text x="${f(W * 0.04)}" y="${f(H - W * 0.028)}">CINEVOLT · ${serie}</text>
  </g>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${tema.luz}" stroke-opacity=".22" stroke-width="2"/>
</svg>`;
  }

  function posterURL(semente, opcoes) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(poster(semente, opcoes));
  }

  window.Art = { poster, posterURL, TEMAS, NOMES, POR_CATEGORIA, rng, hash };
})();
