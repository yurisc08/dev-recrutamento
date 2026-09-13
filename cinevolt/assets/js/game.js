/* ============================================================
   CINEVOLT — game.js
   "CINE RUNNER": corredor infinito no espírito do dinossauro do
   navegador. Você é um rolo de filme fugindo da tempestade.

   Controles: Espaço / ↑ / clique = pular · ↓ = deslizar
   Toda a arte é desenhada no canvas — nenhuma imagem externa.
   ============================================================ */

(function () {
  'use strict';

  const cv = document.getElementById('jogo');
  if (!cv) return;
  const ctx = cv.getContext('2d');

  /* ---------- Dimensões lógicas (escalam com o CSS) ---------- */
  const L = 900, A = 300;
  const CHAO = A - 54;

  function ajustar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = L * dpr;
    cv.height = A * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  ajustar();
  addEventListener('resize', ajustar);

  /* ---------- Estado ---------- */
  const G = {
    fase: 'pronto',           // pronto | jogando | fim
    t: 0,
    vel: 5.6,
    pontos: 0,
    recorde: Number(localStorage.getItem('cinevolt:recorde') || 0),
    obstaculos: [],
    itens: [],
    particulas: [],
    raios: [],
    proximoObst: 60,
    proximoItem: 400,
    flash: 0,
    tremor: 0,
    combo: 0
  };

  const jogador = {
    x: 110, y: CHAO, vy: 0, r: 22,
    noChao: true, deslizando: false, giro: 0, coyote: 0, buffer: 0
  };

  const GRAV = 0.78;
  const PULO = -14.6;

  /* ---------- Cenário: prédios gerados uma vez ---------- */
  const camadas = [
    { vel: 0.18, cor: '#080c18', predios: gerarSkyline(28, 40, 110) },
    { vel: 0.38, cor: '#0b1224', predios: gerarSkyline(22, 60, 150) },
    { vel: 0.70, cor: '#101a33', predios: gerarSkyline(16, 30, 80) }
  ];

  function gerarSkyline(n, hMin, hMax) {
    const arr = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const w = 40 + Math.random() * 70;
      arr.push({ x, w, h: hMin + Math.random() * (hMax - hMin), luzes: Math.random() });
      x += w + Math.random() * 26;
    }
    return { itens: arr, largura: x };
  }

  /* ---------- Áudio simples (sem arquivos) ---------- */
  let ac = null;
  function bip(freq, dur, tipo, vol) {
    if (!window.FX || !window.FX.somLigado) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = tipo || 'square';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (dur || 0.12));
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + (dur || 0.12));
    } catch (_) {}
  }

  /* ---------- Entradas ---------- */
  function pular() {
    if (G.fase === 'pronto') return iniciar();
    if (G.fase === 'fim') return reiniciar();
    if (jogador.noChao || jogador.coyote > 0) {
      jogador.vy = PULO;
      jogador.noChao = false;
      jogador.coyote = 0;
      jogador.deslizando = false;
      bip(520, .09, 'square', .05);
      for (let i = 0; i < 8; i++) poeira(jogador.x - 8, CHAO + 4);
    } else {
      jogador.buffer = 8; // pulo bufferizado: aperta um pouco antes de tocar o chão
    }
  }

  function deslizar(ativo) {
    if (G.fase !== 'jogando') return;
    jogador.deslizando = ativo && jogador.noChao;
    if (ativo && !jogador.noChao) jogador.vy += 2.4; // desce mais rápido
  }

  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault(); pular();
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); deslizar(true); }
    if (e.code === 'Enter' && G.fase !== 'jogando') reiniciar();
  });

  addEventListener('keyup', e => {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') deslizar(false);
  });

  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    if ((e.clientY - r.top) / r.height > 0.72) { deslizar(true); setTimeout(() => deslizar(false), 420); }
    else pular();
  });

  /* ---------- Ciclo de vida ---------- */
  function iniciar() {
    G.fase = 'jogando';
    document.querySelector('[data-jogo-ui]') && document.querySelector('[data-jogo-ui]').classList.add('is-jogando');
  }

  function reiniciar() {
    Object.assign(G, {
      fase: 'jogando', t: 0, vel: 5.6, pontos: 0,
      obstaculos: [], itens: [], particulas: [], raios: [],
      proximoObst: 60, proximoItem: 400, flash: 0, tremor: 0, combo: 0
    });
    Object.assign(jogador, { y: CHAO, vy: 0, noChao: true, deslizando: false });
    const painel = document.querySelector('[data-fim]');
    if (painel) painel.hidden = true;
  }

  function morrer() {
    G.fase = 'fim';
    G.tremor = 16;
    bip(120, .5, 'sawtooth', .09);
    for (let i = 0; i < 34; i++) poeira(jogador.x, jogador.y - 10, true);

    const pts = Math.floor(G.pontos);
    if (pts > G.recorde) {
      G.recorde = pts;
      localStorage.setItem('cinevolt:recorde', String(pts));
    }
    document.dispatchEvent(new CustomEvent('jogo:fim', { detail: { pontos: pts, recorde: G.recorde } }));
  }

  /* ---------- Partículas ---------- */
  function poeira(x, y, forte) {
    G.particulas.push({
      x, y,
      vx: (Math.random() - 0.5) * (forte ? 9 : 3) - G.vel * 0.3,
      vy: -Math.random() * (forte ? 8 : 2.6),
      vida: 1,
      cor: forte ? (Math.random() > .5 ? '#00e5ff' : '#ffd400') : 'rgba(150,200,255,.7)',
      r: 1 + Math.random() * (forte ? 3.4 : 2)
    });
  }

  /* ---------- Obstáculos ---------- */
  const TIPOS = [
    { nome: 'pipoca',   w: 30, h: 40, voa: false },
    { nome: 'tripe',    w: 34, h: 56, voa: false },
    { nome: 'claquete', w: 44, h: 34, voa: false },
    { nome: 'drone',    w: 46, h: 26, voa: true  },
    { nome: 'duplo',    w: 66, h: 40, voa: false }
  ];

  function novoObstaculo() {
    const permitidos = G.pontos < 180 ? TIPOS.slice(0, 3) : TIPOS;
    const t = permitidos[(Math.random() * permitidos.length) | 0];
    G.obstaculos.push({
      tipo: t.nome, w: t.w, h: t.h,
      x: L + 40,
      y: t.voa ? CHAO - 66 - Math.random() * 22 : CHAO - t.h
    });
    G.proximoObst = Math.max(46, 118 - G.vel * 5) + Math.random() * 90;
  }

  function novoItem() {
    G.itens.push({
      x: L + 30,
      y: CHAO - 70 - Math.random() * 80,
      r: 13, giro: 0
    });
    G.proximoItem = 520 + Math.random() * 700;
  }

  /* ---------- Colisão ---------- */
  function caixaJogador() {
    return jogador.deslizando
      ? { x: jogador.x - 24, y: jogador.y - 14, w: 46, h: 26 }
      : { x: jogador.x - 17, y: jogador.y - 36, w: 34, h: 38 };
  }

  function bate(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ---------- Desenho ---------- */
  function desenharFundo() {
    // céu
    const g = ctx.createLinearGradient(0, 0, 0, A);
    g.addColorStop(0, '#050914');
    g.addColorStop(.55, '#0a1730');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, A);

    // lua com halo
    ctx.save();
    const halo = ctx.createRadialGradient(L - 120, 62, 4, L - 120, 62, 76);
    halo.addColorStop(0, 'rgba(230,248,255,.95)');
    halo.addColorStop(.28, 'rgba(160,225,255,.45)');
    halo.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(L - 120, 62, 76, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(236,250,255,.9)';
    ctx.beginPath(); ctx.arc(L - 120, 62, 24, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // prédios em camadas
    camadas.forEach(c => {
      const off = (G.t * G.vel * c.vel) % c.predios.largura;
      ctx.fillStyle = c.cor;
      for (let rep = 0; rep < 2; rep++) {
        c.predios.itens.forEach(p => {
          const x = p.x - off + rep * c.predios.largura;
          if (x > L + 60 || x < -140) return;
          ctx.fillRect(x, CHAO - p.h, p.w, p.h);
          if (c.vel > .3 && p.luzes > .35) {
            ctx.fillStyle = 'rgba(0,229,255,.30)';
            for (let j = 0; j < 3; j++) {
              ctx.fillRect(x + 8 + j * 13, CHAO - p.h + 12 + (j % 2) * 16, 5, 7);
            }
            ctx.fillStyle = c.cor;
          }
        });
      }
    });

    // chuva
    ctx.strokeStyle = 'rgba(160,220,255,.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = (i * 61 + G.t * 15) % (L + 60) - 30;
      const y = (i * 37 + G.t * 26) % A;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); ctx.stroke();
    }
  }

  function desenharChao() {
    ctx.strokeStyle = 'rgba(0,229,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, CHAO + 2); ctx.lineTo(L, CHAO + 2); ctx.stroke();

    ctx.fillStyle = 'rgba(0,229,255,.07)';
    ctx.fillRect(0, CHAO + 4, L, A - CHAO);

    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    const off = (G.t * G.vel * 1.0) % 70;
    for (let i = -1; i < L / 70 + 1; i++) {
      const x = i * 70 - off;
      ctx.beginPath(); ctx.moveTo(x, CHAO + 14); ctx.lineTo(x + 26, CHAO + 14); ctx.stroke();
    }
  }

  function desenharJogador() {
    const desl = jogador.deslizando;
    ctx.save();
    ctx.translate(jogador.x, jogador.y - (desl ? 12 : 20));
    if (desl) ctx.scale(1.25, .62);
    ctx.rotate(jogador.giro);

    // rolo de filme
    ctx.strokeStyle = '#7df9ff';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(0, 0, jogador.r, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = '#04101c';
    ctx.beginPath(); ctx.arc(0, 0, jogador.r - 3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#00e5ff';
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 / 6) * i;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (jogador.r * .58), Math.sin(a) * (jogador.r * .58), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // sombra no chão
    const alt = Math.max(0, CHAO - jogador.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, .34 - alt / 420);
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.ellipse(jogador.x, CHAO + 4, 22 + alt * .04, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function desenharObstaculo(o) {
    ctx.save();
    ctx.shadowBlur = 12;

    if (o.tipo === 'pipoca') {
      ctx.fillStyle = '#ff2d55'; ctx.shadowColor = '#ff2d55';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + 5, o.y + 12);
      ctx.lineTo(o.x + o.w - 5, o.y + 12); ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff8e0';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(o.x + 6 + i * 5, o.y + 8 - (i % 2) * 5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.tipo === 'tripe') {
      ctx.strokeStyle = '#ffd400'; ctx.shadowColor = '#ffd400'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w / 2, o.y + 14); ctx.lineTo(o.x, o.y + o.h);
      ctx.moveTo(o.x + o.w / 2, o.y + 14); ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.moveTo(o.x + o.w / 2, o.y + 14); ctx.lineTo(o.x + o.w / 2, o.y + o.h);
      ctx.stroke();
      ctx.fillStyle = '#ffd400';
      ctx.fillRect(o.x + 4, o.y, o.w - 8, 15);
    } else if (o.tipo === 'claquete') {
      ctx.fillStyle = '#e9e9f2'; ctx.shadowColor = '#ffffff';
      ctx.fillRect(o.x, o.y + 10, o.w, o.h - 10);
      ctx.fillStyle = '#12121c';
      ctx.fillRect(o.x, o.y, o.w, 10);
      ctx.fillStyle = '#e9e9f2';
      for (let i = 0; i < 4; i++) ctx.fillRect(o.x + 2 + i * 11, o.y, 5, 10);
    } else if (o.tipo === 'drone') {
      ctx.strokeStyle = '#b47cff'; ctx.shadowColor = '#7b2ff7'; ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 10, o.y + 8, o.w - 20, o.h - 12);
      const bat = Math.sin(G.t * .6) * 4;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y + bat); ctx.lineTo(o.x + 16, o.y + 8);
      ctx.moveTo(o.x + o.w, o.y - bat); ctx.lineTo(o.x + o.w - 16, o.y + 8);
      ctx.stroke();
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + o.h - 6, 3.5, 0, Math.PI * 2); ctx.fill();
    } else { // duplo
      ctx.fillStyle = '#ff2d55'; ctx.shadowColor = '#ff2d55';
      ctx.fillRect(o.x, o.y + 8, 26, o.h - 8);
      ctx.fillRect(o.x + 38, o.y, 26, o.h);
    }
    ctx.restore();
  }

  function desenharItem(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.giro);
    ctx.fillStyle = '#ffd400';
    ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(4, -14); ctx.lineTo(-8, 2); ctx.lineTo(-1, 2);
    ctx.lineTo(-4, 14); ctx.lineTo(9, -3); ctx.lineTo(1, -3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function desenharRaios() {
    G.raios.forEach(r => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = r.vida;
      ctx.strokeStyle = '#cfefff';
      ctx.shadowColor = '#9fe9ff';
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(r.pontos[0].x, r.pontos[0].y);
      r.pontos.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    });
  }

  function desenharHUD() {
    ctx.save();
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('REC ' + String(G.recorde).padStart(5, '0'), L - 22, 34);
    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(String(Math.floor(G.pontos)).padStart(5, '0'), L - 22, 62);
    ctx.restore();
  }

  function desenharMensagem() {
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,12,.72)';
    ctx.fillRect(0, 0, L, A);
    ctx.textAlign = 'center';

    if (G.fase === 'pronto') {
      ctx.fillStyle = '#fff';
      ctx.font = '400 54px "Bebas Neue", Impact, sans-serif';
      ctx.fillText('CINE RUNNER', L / 2, A / 2 - 14);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '400 14px "JetBrains Mono", monospace';
      ctx.fillText('ESPAÇO PARA PULAR  ·  ↓ PARA DESLIZAR', L / 2, A / 2 + 22);
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('CLIQUE OU APERTE ESPAÇO PARA COMEÇAR', L / 2, A / 2 + 50);
    } else {
      ctx.fillStyle = '#ff2d55';
      ctx.font = '400 54px "Bebas Neue", Impact, sans-serif';
      ctx.fillText('CORTA!', L / 2, A / 2 - 16);
      ctx.fillStyle = '#fff';
      ctx.font = '400 20px "JetBrains Mono", monospace';
      ctx.fillText(Math.floor(G.pontos) + ' PONTOS', L / 2, A / 2 + 16);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '400 13px "JetBrains Mono", monospace';
      ctx.fillText('ENTER OU CLIQUE PARA JOGAR DE NOVO', L / 2, A / 2 + 46);
    }
    ctx.restore();
  }

  /* ---------- Atualização ---------- */
  function atualizar() {
    G.t += 1;

    if (G.fase === 'jogando') {
      G.pontos += G.vel * 0.09;
      G.vel = Math.min(15.5, 5.6 + G.pontos * 0.0042);

      // jogador
      jogador.vy += GRAV;
      jogador.y += jogador.vy;
      jogador.giro += G.vel * 0.016;

      if (jogador.y >= CHAO) {
        if (!jogador.noChao) for (let i = 0; i < 5; i++) poeira(jogador.x - 6, CHAO + 3);
        jogador.y = CHAO;
        jogador.vy = 0;
        jogador.noChao = true;
        jogador.coyote = 6;
        if (jogador.buffer > 0) { jogador.buffer = 0; pular(); }
      } else {
        jogador.noChao = false;
        if (jogador.coyote > 0) jogador.coyote--;
      }
      if (jogador.buffer > 0) jogador.buffer--;

      // obstáculos
      if (--G.proximoObst <= 0) novoObstaculo();
      if (--G.proximoItem <= 0) novoItem();

      const cx = caixaJogador();

      G.obstaculos.forEach(o => { o.x -= G.vel; });
      G.obstaculos = G.obstaculos.filter(o => o.x > -90);
      for (const o of G.obstaculos) {
        if (bate(cx, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 })) { morrer(); break; }
      }

      G.itens.forEach(it => { it.x -= G.vel; it.giro += .12; });
      G.itens = G.itens.filter(it => {
        if (it.x < -40) return false;
        if (bate(cx, { x: it.x - it.r, y: it.y - it.r, w: it.r * 2, h: it.r * 2 })) {
          G.pontos += 50;
          G.combo++;
          bip(880, .1, 'triangle', .05);
          for (let i = 0; i < 12; i++) poeira(it.x, it.y, true);
          return false;
        }
        return true;
      });

      // raio de fundo esporádico
      if (Math.random() < 0.006 && window.gerarBolt) {
        const x = 100 + Math.random() * (L - 200);
        const { pontos } = window.gerarBolt(x, -10, x + (Math.random() - .5) * 160, CHAO - 40, 46, 4);
        G.raios.push({ pontos, vida: 1 });
        G.flash = .5;
      }
    }

    // partículas
    G.particulas.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .32; p.vida -= .022;
    });
    G.particulas = G.particulas.filter(p => p.vida > 0);

    G.raios.forEach(r => { r.vida -= .05; });
    G.raios = G.raios.filter(r => r.vida > 0);

    if (G.flash > 0) G.flash -= .05;
    if (G.tremor > 0) G.tremor *= .86;
  }

  /* ---------- Render ---------- */
  function render() {
    ctx.save();
    if (G.tremor > .4) {
      ctx.translate((Math.random() - .5) * G.tremor, (Math.random() - .5) * G.tremor);
    }

    desenharFundo();
    desenharRaios();
    desenharChao();
    G.obstaculos.forEach(desenharObstaculo);
    G.itens.forEach(desenharItem);
    desenharJogador();

    G.particulas.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.vida);
      ctx.fillStyle = p.cor;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    if (G.flash > 0) {
      ctx.fillStyle = `rgba(190,235,255,${G.flash * .35})`;
      ctx.fillRect(0, 0, L, A);
    }

    desenharHUD();
    if (G.fase !== 'jogando') desenharMensagem();

    // vinheta
    const vg = ctx.createRadialGradient(L / 2, A / 2, A * .3, L / 2, A / 2, A);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, L, A);

    ctx.restore();
  }

  function loop() {
    atualizar();
    render();
    requestAnimationFrame(loop);
  }

  loop();

  window.CineRunner = { G, reiniciar, iniciar };
})();
