/* ============================================================
   CINE 1UP — maze.js
   O labirinto do hero. Roda sozinho em MODO ATRAÇÃO, como um
   fliperama esperando ficha; se o visitante apertar as setas
   (ou arrastar no celular), ele assume o controle.

   Duas decisões que importam:

   1. MOVIMENTO POR TILE EXATO. Nada de "está perto do centro?":
      cada entidade guarda o tile em que está e o progresso de 0 a 1
      até o próximo. Assim nenhuma delas atravessa parede quando o
      quadro demora (celular fraco, aba em segundo plano, tela 144Hz).

   2. DUAS CAMADAS DE CANVAS. Paredes e pontinhos são desenhados
      UMA vez numa camada de fundo; o quadro a quadro só redesenha
      as cinco entidades e as faíscas. Desenhar 180 paredes com
      sombra a cada quadro derrubava a página para 1 fps.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Mapa (28 x 17). # parede · . ponto · o pílula ---------- */
  const MAPA = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##          ##.#     ',
    '######.##  ##  ##  ##.######',
    '     #.##  #    #  ##.#     ',
    '######.##  ######  ##.######',
    '     #.##          ##.#     ',
    '######.##### ## #####.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '############################'
  ];

  const COLS = 28, LINHAS = MAPA.length;

  const DIRS = {
    dir: { x: 1, y: 0 }, esq: { x: -1, y: 0 },
    cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 }
  };
  const NOMES_DIR = Object.keys(DIRS);
  const OPOSTA = { dir: 'esq', esq: 'dir', cima: 'baixo', baixo: 'cima' };

  const envolve = x => (x % COLS + COLS) % COLS;

  class Labirinto {
    constructor(canvas, opcoes) {
      const o = opcoes || {};
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.cvFundo = o.canvasFundo || null;
      this.ctxFundo = this.cvFundo ? this.cvFundo.getContext('2d') : null;

      this.aoComer = o.aoComer || null;
      this.aoPilula = o.aoPilula || null;
      this.aoMorrer = o.aoMorrer || null;
      this.aoAssumir = o.aoAssumir || null;

      this.pontos = 0;
      this.modoJogador = false;
      this.pausado = false;
      this.t = 0;
      this.assustadoAte = -1;
      this.particulas = [];

      this.reiniciarMapa();
      this.criarEntidades();

      this._resize = this._resize.bind(this);
      this._loop = this._loop.bind(this);
      this._resize();
      addEventListener('resize', this._resize, { passive: true });
      this._ligarControles();
    }

    /* =======================================================
       MAPA
       ======================================================= */
    reiniciarMapa() {
      this.grade = MAPA.map(l => l.padEnd(COLS, ' ').slice(0, COLS).split(''));
      this.restantes = this.grade.reduce(
        (n, linha) => n + linha.filter(c => c === '.' || c === 'o').length, 0);
    }

    parede(cx, cy) {
      if (cy < 0 || cy >= LINHAS) return true;
      return this.grade[cy][envolve(cx)] === '#';
    }

    /* =======================================================
       ENTIDADES
       ======================================================= */
    novaEntidade(tx, ty, dir, vel, extra) {
      return Object.assign({
        tx, ty, dir, prox: dir, prog: 0, vel,
        cx: tx, cy: ty, parado: false
      }, extra || {});
    }

    criarEntidades() {
      this.heroi = this.novaEntidade(21, 5, 'baixo', 0.09, { boca: 0 });

      const cores = ['#ff2b4e', '#ff6ad5', '#22e7ff', '#ff9d2e'];
      const personas = ['direto', 'emboscada', 'errante', 'medroso'];
      const cantos = [{ x: 1, y: 1 }, { x: 26, y: 1 }, { x: 1, y: 15 }, { x: 26, y: 15 }];

      this.fantasmas = cores.map((cor, i) =>
        this.novaEntidade(12 + i, 12, 'cima', 0.062 + i * 0.004, {
          cor, persona: personas[i], casa: cantos[i], assustado: false, olhos: DIRS.cima
        }));
    }

    /* =======================================================
       DIMENSÕES E CAMADA DE FUNDO
       ======================================================= */
    _resize() {
      const r = this.cv.getBoundingClientRect();
      /* O labirinto é cenário: fica atrás de um véu e da textura de CRT.
         Renderizar em retina cheia dobra o custo sem ganho visível, então
         o limite aqui é menor que o da interface. */
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      this.w = r.width; this.h = r.height; this.dpr = dpr;

      [this.cv, this.cvFundo].forEach(c => {
        if (!c) return;
        c.width = Math.max(1, r.width * dpr);
        c.height = Math.max(1, r.height * dpr);
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      });

      /* Em tela larga o labirinto inteiro aparece ("contain"), como a
         tela de um gabinete. Em celular, caber inteiro deixaria uma
         faixa minúscula no meio, então ele preenche e sobra para fora. */
      this.tile = r.width < 760
        ? Math.max(r.width / COLS, r.height / LINHAS) * 0.62
        : Math.min(r.width / COLS, r.height / LINHAS);
      this.offX = (r.width - this.tile * COLS) / 2;
      this.offY = (r.height - this.tile * LINHAS) / 2;

      this.pintarFundo();
      this.prepararBrilhos();
    }

    /* Um borrão radial pronto por cor. Desenhar sombra (shadowBlur)
       em cinco entidades a cada quadro é caro demais; colar uma imagem
       pronta atrás da forma custa quase nada e fica igual. */
    prepararBrilhos() {
      const raio = Math.max(8, this.tile * 1.05);
      const fazer = cor => {
        const lado = Math.ceil(raio * 2);
        const c = document.createElement('canvas');
        c.width = c.height = lado;
        const cx = c.getContext('2d');
        const g = cx.createRadialGradient(raio, raio, 0, raio, raio, raio);
        g.addColorStop(0, cor + 'cc');
        g.addColorStop(.35, cor + '55');
        g.addColorStop(1, cor + '00');
        cx.fillStyle = g;
        cx.fillRect(0, 0, lado, lado);
        return c;
      };

      this.brilhos = {};
      ['#ffd60a', '#ff6ad5', '#ff2b4e', '#22e7ff', '#ff9d2e', '#4b2bff', '#ffffff']
        .forEach(c => { this.brilhos[c] = fazer(c); });
      this.raioBrilho = raio;
    }

    brilho(cor, x, y, escala) {
      const img = this.brilhos && this.brilhos[cor];
      if (!img) return;
      const lado = this.raioBrilho * 2 * (escala || 1);
      this.ctx.drawImage(img, x - lado / 2, y - lado / 2, lado, lado);
    }

    px(cx) { return this.offX + (cx + 0.5) * this.tile; }
    py(cy) { return this.offY + (cy + 0.5) * this.tile; }

    /* Paredes e pontinhos: pintados uma vez só */
    pintarFundo() {
      const ctx = this.ctxFundo;
      if (!ctx) return;
      const t = this.tile;
      ctx.clearRect(0, 0, this.w, this.h);

      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.grade[y][x] !== '#') continue;
          const px = this.offX + x * t, py = this.offY + y * t;

          // preenchimento tile a tile, SEM folga: paredes vizinhas
          // se encostam e viram um bloco só, como no fliperama
          const g = ctx.createLinearGradient(px, py, px, py + t);
          g.addColorStop(0, 'rgba(58, 38, 170, .55)');
          g.addColorStop(1, 'rgba(26, 12, 96, .40)');
          ctx.fillStyle = g;
          ctx.fillRect(px, py, t + .5, t + .5);
        }
      }

      /* Contorno de neon: uma linha só nas faces que dão para o
         corredor. Desenhar depois de todos os preenchimentos evita
         que o bloco vizinho cubra o traço. */
      ctx.strokeStyle = 'rgba(150, 132, 255, .95)';
      ctx.lineWidth = Math.max(1.5, t * .055);
      ctx.lineCap = 'square';
      ctx.shadowColor = '#6a4bff';
      ctx.shadowBlur = Math.max(6, t * .3);
      ctx.beginPath();
      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.grade[y][x] !== '#') continue;
          const px = this.offX + x * t, py = this.offY + y * t;
          const m = ctx.lineWidth / 2;
          if (!this.parede(x, y - 1)) { ctx.moveTo(px, py + m); ctx.lineTo(px + t, py + m); }
          if (!this.parede(x, y + 1)) { ctx.moveTo(px, py + t - m); ctx.lineTo(px + t, py + t - m); }
          if (!this.parede(x - 1, y)) { ctx.moveTo(px + m, py); ctx.lineTo(px + m, py + t); }
          if (!this.parede(x + 1, y)) { ctx.moveTo(px + t - m, py); ctx.lineTo(px + t - m, py + t); }
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // pontinhos (as pílulas ficam na camada de cima, pulsando)
      ctx.fillStyle = '#ffe9a8';
      ctx.shadowColor = '#ffd60a';
      ctx.shadowBlur = t * .24;
      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.grade[y][x] !== '.') continue;
          ctx.beginPath();
          ctx.arc(this.px(x), this.py(y), Math.max(1.4, t * .07), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
    }

    /* Apaga um pontinho da camada de fundo, sem repintar tudo */
    apagarDoFundo(x, y) {
      if (!this.ctxFundo) return;
      const t = this.tile;
      this.ctxFundo.clearRect(this.offX + x * t, this.offY + y * t, t, t);
    }

    /* =======================================================
       CONTROLES
       ======================================================= */
    _ligarControles() {
      const mapa = {
        ArrowRight: 'dir', ArrowLeft: 'esq', ArrowUp: 'cima', ArrowDown: 'baixo',
        KeyD: 'dir', KeyA: 'esq', KeyW: 'cima', KeyS: 'baixo'
      };

      addEventListener('keydown', e => {
        const d = mapa[e.code];
        if (!d) return;
        // não rouba a seta de quem está rolando a página lá embaixo
        if (this.cv.getBoundingClientRect().bottom < 120) return;
        e.preventDefault();
        this.heroi.prox = d;
        this.assumir();
      });

      let ini = null;
      this.cv.addEventListener('touchstart', e => {
        ini = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });

      this.cv.addEventListener('touchmove', e => {
        if (!ini) return;
        const dx = e.touches[0].clientX - ini.x;
        const dy = e.touches[0].clientY - ini.y;
        if (Math.hypot(dx, dy) < 26) return;
        this.heroi.prox = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'dir' : 'esq') : (dy > 0 ? 'baixo' : 'cima');
        this.assumir();
        ini = null;
      }, { passive: true });
    }

    assumir() {
      if (this.modoJogador) return;
      this.modoJogador = true;
      this.aoAssumir && this.aoAssumir();
    }

    /* =======================================================
       BUSCA EM LARGURA
       ======================================================= */
    rota(de, para, evitar) {
      const chave = (x, y) => y * COLS + x;
      const alvoK = chave(envolve(para.x), Math.max(0, Math.min(LINHAS - 1, para.y)));
      const fila = [{ x: envolve(de.x), y: de.y, primeiro: null }];
      const visto = new Set([chave(envolve(de.x), de.y)]);
      const bloqueado = new Set((evitar || []).map(p => chave(envolve(p.x), p.y)));

      let cabeca = 0;
      while (cabeca < fila.length) {
        const no = fila[cabeca++];
        if (chave(no.x, no.y) === alvoK && no.primeiro) return no.primeiro;

        for (const nome of NOMES_DIR) {
          const d = DIRS[nome];
          const nx = envolve(no.x + d.x);
          const ny = no.y + d.y;
          if (ny < 0 || ny >= LINHAS || this.parede(nx, ny)) continue;
          const k = chave(nx, ny);
          if (visto.has(k) || bloqueado.has(k)) continue;
          visto.add(k);
          fila.push({ x: nx, y: ny, primeiro: no.primeiro || nome });
        }
      }
      return null;
    }

    pontoMaisPerto(de) {
      let melhor = null, dist = 1e9;
      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = this.grade[y][x];
          if (c !== '.' && c !== 'o') continue;
          const dx = Math.min(Math.abs(x - de.x), COLS - Math.abs(x - de.x));
          const d = dx + Math.abs(y - de.y) - (c === 'o' ? 6 : 0);
          if (d < dist) { dist = d; melhor = { x, y }; }
        }
      }
      return melhor;
    }

    /* =======================================================
       MOVIMENTO — passo exato, um tile por vez
       ======================================================= */
    mover(e, dt) {
      const passo = Math.min(0.5, e.vel * dt / 16.6);

      if (e.parado) {
        this.decidir(e);              // tenta destravar (virar) a cada quadro
        if (e.parado) { this.posicionar(e); return; }
      }

      e.prog += passo;
      while (e.prog >= 1) {
        e.prog -= 1;
        const d = DIRS[e.dir];
        e.tx = envolve(e.tx + d.x);
        e.ty += d.y;
        e.chegou = true;              // entrou num tile novo
        this.decidir(e);
        if (e.parado) { e.prog = 0; break; }
      }
      this.posicionar(e);
    }

    posicionar(e) {
      const d = DIRS[e.dir];
      e.cx = e.tx + d.x * e.prog;
      e.cy = e.ty + d.y * e.prog;
      if (e.cx < -0.5) e.cx += COLS;
      if (e.cx > COLS - 0.5) e.cx -= COLS;
    }

    /* Decide direção no centro do tile: o cérebro escolhe, aqui só valida */
    decidir(e) {
      if (e.cerebro) e.cerebro(e);

      if (e.prox && e.prox !== e.dir) {
        const d = DIRS[e.prox];
        if (!this.parede(e.tx + d.x, e.ty + d.y)) e.dir = e.prox;
      }
      const d = DIRS[e.dir];
      e.parado = this.parede(e.tx + d.x, e.ty + d.y);
    }

    /* =======================================================
       CÉREBROS
       ======================================================= */
    cerebroHeroi(h) {
      if (this.modoJogador) return;    // quem manda é o teclado
      const alvo = this.pontoMaisPerto({ x: h.tx, y: h.ty });
      if (!alvo) return;

      const assustado = this.t < this.assustadoAte;
      const perigo = assustado ? [] : this.fantasmas.flatMap(f => [
        { x: f.tx, y: f.ty },
        { x: f.tx + 1, y: f.ty }, { x: f.tx - 1, y: f.ty },
        { x: f.tx, y: f.ty + 1 }, { x: f.tx, y: f.ty - 1 }
      ]);

      h.prox = this.rota({ x: h.tx, y: h.ty }, alvo, perigo)
            || this.rota({ x: h.tx, y: h.ty }, alvo)
            || h.dir;
    }

    cerebroFantasma(f) {
      const h = this.heroi;
      const assustado = this.t < this.assustadoAte;
      let alvo;

      if (assustado) {
        alvo = f.casa;                                       // foge para o canto
      } else if (f.persona === 'direto') {
        alvo = { x: h.tx, y: h.ty };                         // vai em cima
      } else if (f.persona === 'emboscada') {
        const d = DIRS[h.dir];                               // corta o caminho
        alvo = { x: h.tx + d.x * 4, y: h.ty + d.y * 4 };
      } else if (f.persona === 'errante') {
        alvo = (this.t % 9000) < 4500 ? f.casa : { x: h.tx, y: h.ty };
      } else {
        const dist = Math.hypot(f.tx - h.tx, f.ty - h.ty);   // se aproxima e recua
        alvo = dist > 7 ? { x: h.tx, y: h.ty } : f.casa;
      }

      const nova = this.rota({ x: f.tx, y: f.ty }, alvo);
      // fantasma não dá meia-volta no corredor, como no original
      f.prox = (nova && nova !== OPOSTA[f.dir]) ? nova : (nova || f.dir);
      f.vel = assustado ? 0.045 : f.velBase;
    }

    /* =======================================================
       ATUALIZAÇÃO
       ======================================================= */
    atualizar(dt) {
      this.t += dt;
      const h = this.heroi;

      if (!h.cerebro) {
        h.cerebro = e => this.cerebroHeroi(e);
        this.fantasmas.forEach(f => {
          f.velBase = f.vel;
          f.cerebro = e => this.cerebroFantasma(e);
        });
      }

      h.chegou = false;
      this.mover(h, dt);
      h.boca += dt * 0.014;
      if (h.chegou) this.comer(h.tx, h.ty);

      this.fantasmas.forEach((f, i) => {
        f.assustado = this.t < this.assustadoAte;
        this.mover(f, dt);
        f.olhos = DIRS[f.dir];
        this.encontro(f, i);
      });

      this.particulas.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.vida -= 0.02;
      });
      this.particulas = this.particulas.filter(p => p.vida > 0);
    }

    comer(x, y) {
      const c = this.grade[y][envolve(x)];
      if (c !== '.' && c !== 'o') return;

      this.grade[y][envolve(x)] = ' ';
      this.restantes--;
      this.pontos += c === 'o' ? 50 : 10;
      this.apagarDoFundo(envolve(x), y);
      this.faiscas(this.px(x), this.py(y), c === 'o' ? 16 : 4, '#ffd60a');

      if (c === 'o') {
        this.assustadoAte = this.t + 6500;
        this.aoPilula && this.aoPilula(this.pontos);
      } else {
        this.aoComer && this.aoComer(this.pontos);
      }

      if (this.restantes <= 0) {
        this.reiniciarMapa();
        this.pintarFundo();
        this.faiscas(this.px(x), this.py(y), 44, '#ff6ad5');
      }
    }

    encontro(f, i) {
      const h = this.heroi;
      const dx = Math.abs(f.cx - h.cx);
      const dist = Math.hypot(Math.min(dx, COLS - dx), f.cy - h.cy);
      if (dist > 0.7) return;

      if (f.assustado) {
        this.pontos += 200;
        this.faiscas(this.px(f.cx), this.py(f.cy), 26, f.cor);
        Object.assign(f, { tx: 13, ty: 12, prog: 0, dir: 'cima', prox: 'cima', parado: false });
      } else {
        this.faiscas(this.px(h.cx), this.py(h.cy), 32, '#ffd60a');
        this.aoMorrer && this.aoMorrer(this.pontos);
        Object.assign(h, { tx: 21, ty: 5, prog: 0, dir: 'baixo', prox: 'baixo', parado: false });
        this.modoJogador = false;
        this.fantasmas.forEach((g, j) =>
          Object.assign(g, { tx: 12 + j, ty: 12, prog: 0, dir: 'cima', prox: 'cima', parado: false }));
      }
    }

    faiscas(x, y, n, cor) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = Math.random() * 3.4 + .6;
        this.particulas.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          vida: 1, cor, r: Math.random() * 2.4 + 1
        });
      }
    }

    /* =======================================================
       DESENHO (só o que se move)
       ======================================================= */
    desenharPilulas() {
      const ctx = this.ctx, t = this.tile;
      const pulso = 0.78 + Math.sin(this.t * 0.005) * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.grade[y][x] !== 'o') continue;
          const px = this.px(x), py = this.py(y);
          this.brilho('#ff6ad5', px, py, .85 * pulso);
          ctx.fillStyle = '#ffd7f4';
          ctx.beginPath();
          ctx.arc(px, py, t * .17 * pulso, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    desenharHeroi() {
      const ctx = this.ctx, t = this.tile, h = this.heroi;
      const x = this.px(h.cx), y = this.py(h.cy);
      const r = t * .42;
      const abertura = (Math.abs(Math.sin(h.boca)) * 0.32 + 0.03) * Math.PI;
      const ang = { dir: 0, esq: Math.PI, cima: -Math.PI / 2, baixo: Math.PI / 2 }[h.dir];

      this.brilho('#ffd60a', x, y, 1.15);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);

      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, abertura, Math.PI * 2 - abertura);
      ctx.closePath();
      ctx.fill();

      // furos de rolo de filme: é cinema, não só fliperama
      ctx.fillStyle = 'rgba(28, 14, 0, .45)';
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + this.t * 0.0014;
        const norm = Math.abs(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
        if (norm > Math.PI - abertura) continue;   // não fura a boca
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * .6, Math.sin(a) * r * .6, r * .12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    desenharFantasma(f) {
      const ctx = this.ctx, t = this.tile;
      const x = this.px(f.cx), y = this.py(f.cy);
      const r = t * .40;
      const piscando = f.assustado && this.assustadoAte - this.t < 1800 &&
                       Math.floor(this.t / 220) % 2 === 0;
      const cor = f.assustado ? (piscando ? '#ffffff' : '#4b2bff') : f.cor;

      this.brilho(cor, x, y, 1);

      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = cor;

      ctx.beginPath();
      ctx.arc(0, -r * .12, r, Math.PI, 0);
      ctx.lineTo(r, r * .72);
      const ondas = 4, larg = (r * 2) / ondas;
      for (let i = 0; i < ondas; i++) {
        const x0 = r - i * larg;
        const fase = Math.sin(this.t * 0.008 + i) * r * .1;
        ctx.quadraticCurveTo(x0 - larg / 2, r * (i % 2 ? .5 : .95) + fase, x0 - larg, r * .72);
      }
      ctx.closePath();
      ctx.fill();

      if (f.assustado && !piscando) {
        ctx.fillStyle = '#fff';
        [-r * .35, r * .35].forEach(ox => {
          ctx.beginPath(); ctx.arc(ox, -r * .16, r * .12, 0, Math.PI * 2); ctx.fill();
        });
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1, r * .1);
        ctx.beginPath();
        ctx.moveTo(-r * .45, r * .28);
        for (let i = 0; i < 4; i++) ctx.lineTo(-r * .45 + (i + 1) * r * .22, r * (i % 2 ? .28 : .1));
        ctx.stroke();
      } else {
        [-r * .38, r * .38].forEach(ox => {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(ox, -r * .2, r * .27, r * .32, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#14103a';
          ctx.beginPath();
          ctx.arc(ox + f.olhos.x * r * .12, -r * .2 + f.olhos.y * r * .14, r * .13, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.restore();
    }

    desenhar() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      this.desenharPilulas();
      this.fantasmas.forEach(f => this.desenharFantasma(f));
      this.desenharHeroi();

      if (this.particulas.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.particulas.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.vida);
          ctx.fillStyle = p.cor;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }
    }

    /* =======================================================
       CICLO
       ======================================================= */
    start() {
      if (this.rodando) return;
      this.rodando = true;
      this.ultimo = performance.now();
      requestAnimationFrame(this._loop);
    }

    stop() { this.rodando = false; }

    _loop(agora) {
      if (!this.rodando) return;
      const dt = Math.min(48, agora - this.ultimo);
      this.ultimo = agora;
      if (!this.pausado) { this.atualizar(dt); this.desenhar(); }
      requestAnimationFrame(this._loop);
    }
  }

  window.Labirinto = Labirinto;
})();
