/* ============================================================
   CINE 1UP — lightning.js
   Motor de raios em canvas: bolts ramificados por deslocamento
   de ponto médio, múltiplas passadas de glow, flicker, re-strike,
   impacto no solo, faíscas, aura elétrica e arcos no cursor.

   Uso:
     const storm = new Storm(canvas, { target: () => ({x, y}) });
     storm.start();
     storm.strike();           // raio grande agora
   ============================================================ */

(function () {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  /* ---------------------------------------------------------
     Gera os pontos de um raio entre A e B por deslocamento
     recursivo do ponto médio. Retorna { pontos, galhos }.
     --------------------------------------------------------- */
  function gerarBolt(x1, y1, x2, y2, deslocamento, detalhe, nivel) {
    nivel = nivel || 0;
    let pontos = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const galhos = [];
    let desloc = deslocamento;

    while (desloc > detalhe) {
      const novos = [];
      for (let i = 0; i < pontos.length - 1; i++) {
        const a = pontos[i];
        const b = pontos[i + 1];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;

        // normal do segmento, para deslocar perpendicularmente
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const off = rnd(-desloc, desloc);

        const p = { x: mx + nx * off, y: my + ny * off };
        novos.push(a, p);

        // chance de nascer um galho
        if (nivel < 3 && Math.random() < 0.16 && len > 26) {
          const escala = rnd(0.35, 0.62);
          const ang = Math.atan2(dy, dx) + rnd(-0.95, 0.95);
          const comp = len * escala * rnd(1.4, 2.6);
          galhos.push({
            x1: p.x, y1: p.y,
            x2: p.x + Math.cos(ang) * comp,
            y2: p.y + Math.sin(ang) * comp,
            nivel: nivel + 1
          });
        }
      }
      novos.push(pontos[pontos.length - 1]);
      pontos = novos;
      desloc /= 2;
    }

    return { pontos, galhos };
  }

  /* ---------------------------------------------------------
     Um raio vivo na tela
     --------------------------------------------------------- */
  class Bolt {
    constructor(opts) {
      this.cor = opts.cor || '#ffe680';
      this.core = opts.core || '#ffffff';
      this.largura = opts.largura || 2.4;
      this.vida = opts.vida || rnd(170, 380);
      this.idade = 0;
      this.restrikes = opts.restrikes != null ? opts.restrikes : (Math.random() < 0.55 ? 1 : 0);
      this.origem = opts;
      this.regenerar();
    }

    regenerar() {
      const o = this.origem;
      const { pontos, galhos } = gerarBolt(o.x1, o.y1, o.x2, o.y2, o.desloc || 78, o.detalhe || 4);
      this.pontos = pontos;
      this.galhos = galhos.map(g =>
        gerarBolt(g.x1, g.y1, g.x2, g.y2, (o.desloc || 78) * 0.32, 4, g.nivel).pontos);
      this.semente = Math.random();
    }

    get vivo() { return this.idade < this.vida; }

    atualizar(dt) {
      this.idade += dt;
      // re-strike: o raio "pisca" e redesenha um caminho novo
      if (this.restrikes > 0 && this.idade > this.vida * 0.55) {
        this.restrikes--;
        this.idade = this.vida * 0.12;
        this.regenerar();
      }
    }

    _traco(ctx, pontos) {
      ctx.beginPath();
      ctx.moveTo(pontos[0].x, pontos[0].y);
      for (let i = 1; i < pontos.length; i++) ctx.lineTo(pontos[i].x, pontos[i].y);
      ctx.stroke();
    }

    desenhar(ctx) {
      const t = this.idade / this.vida;
      // flicker: intensidade oscila e cai no fim
      const flick = 0.55 + Math.abs(Math.sin((this.idade + this.semente * 400) * 0.08)) * 0.45;
      const fade = t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.6);
      const alpha = Math.max(0, Math.min(1, fade * flick));
      if (alpha <= 0.01) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';

      // 1) halo largo e difuso
      ctx.globalAlpha = alpha * 0.16;
      ctx.strokeStyle = this.cor;
      ctx.lineWidth = this.largura * 9;
      ctx.shadowColor = this.cor;
      ctx.shadowBlur = 42;
      this._traco(ctx, this.pontos);

      // 2) corpo colorido
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = this.largura * 3.2;
      ctx.shadowBlur = 24;
      this._traco(ctx, this.pontos);
      this.galhos.forEach(g => this._traco(ctx, g));

      // 3) núcleo branco incandescente
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = this.core;
      ctx.lineWidth = this.largura;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
      this._traco(ctx, this.pontos);

      // galhos com núcleo mais fino
      ctx.globalAlpha = alpha * 0.75;
      ctx.lineWidth = this.largura * 0.55;
      this.galhos.forEach(g => this._traco(ctx, g));

      ctx.restore();
    }
  }

  /* ---------------------------------------------------------
     Faísca / partícula de impacto
     --------------------------------------------------------- */
  class Faisca {
    constructor(x, y, cor) {
      const ang = rnd(-Math.PI, 0);
      const vel = rnd(1.6, 7.5);
      this.x = x; this.y = y;
      this.vx = Math.cos(ang) * vel;
      this.vy = Math.sin(ang) * vel;
      this.vida = rnd(420, 1100);
      this.idade = 0;
      this.cor = cor;
      this.tam = rnd(1, 2.6);
    }
    get vivo() { return this.idade < this.vida; }
    atualizar(dt) {
      const f = dt / 16.6;
      this.idade += dt;
      this.x += this.vx * f;
      this.y += this.vy * f;
      this.vy += 0.12 * f;      // gravidade
      this.vx *= 0.985;         // arrasto
    }
    desenhar(ctx) {
      const a = 1 - this.idade / this.vida;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = this.cor;
      ctx.shadowColor = this.cor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.tam, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------
     Clarão radial (impacto)
     --------------------------------------------------------- */
  class Clarao {
    constructor(x, y, raio, cor) {
      this.x = x; this.y = y;
      this.raioMax = raio;
      this.cor = cor;
      this.vida = 420; this.idade = 0;
    }
    get vivo() { return this.idade < this.vida; }
    atualizar(dt) { this.idade += dt; }
    desenhar(ctx) {
      const t = this.idade / this.vida;
      const r = this.raioMax * (0.25 + t * 0.95);
      const a = Math.pow(1 - t, 2);
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
      g.addColorStop(0, `rgba(255,255,255,${a * 0.9})`);
      g.addColorStop(0.35, `rgba(150,230,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(80,160,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------
     A tempestade
     --------------------------------------------------------- */
  class Storm {
    constructor(canvas, opcoes) {
      const o = opcoes || {};
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.bolts = [];
      this.faiscas = [];
      this.claroes = [];
      this.rodando = false;
      this.ultimo = 0;
      this.proximo = rnd(900, 2200);

      this.cores = o.cores || ['#ffe680', '#bfe4ff', '#cbb4ff'];
      this.intervalo = o.intervalo || [1400, 4200];   // ms entre raios grandes
      this.ambiente = o.ambiente !== false;            // arcos pequenos constantes
      this.alvo = o.alvo || null;                      // () => {x, y} ponto de convergência
      this.aoRaio = o.aoRaio || null;                  // callback p/ flash + trovão
      this.densidade = o.densidade || 1;

      this._resize = this._resize.bind(this);
      this._loop = this._loop.bind(this);
      this._resize();
      window.addEventListener('resize', this._resize, { passive: true });
    }

    _resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.max(1, r.width * dpr);
      this.canvas.height = Math.max(1, r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* Um raio do céu até um ponto (ou até o alvo configurado) */
    strike(opts) {
      opts = opts || {};
      const alvo = opts.para || (this.alvo && this.alvo()) || {
        x: rnd(this.w * 0.15, this.w * 0.85),
        y: rnd(this.h * 0.55, this.h * 0.92)
      };
      const origemX = opts.deX != null ? opts.deX : alvo.x + rnd(-this.w * 0.55, this.w * 0.55);

      const bolt = new Bolt({
        x1: origemX, y1: opts.deY != null ? opts.deY : -40,
        x2: alvo.x, y2: alvo.y,
        desloc: opts.desloc || Math.max(60, this.w * 0.075),
        largura: opts.largura || rnd(2, 3.4),
        cor: opts.cor || pick(this.cores),
        vida: opts.vida || rnd(220, 420),
        restrikes: opts.restrikes
      });
      this.bolts.push(bolt);

      // impacto
      this.claroes.push(new Clarao(alvo.x, alvo.y, opts.raioClarao || rnd(160, 280), bolt.cor));
      const n = (opts.faiscas != null ? opts.faiscas : 22) * this.densidade;
      for (let i = 0; i < n; i++) this.faiscas.push(new Faisca(alvo.x, alvo.y, bolt.cor));

      if (this.aoRaio && !opts.silencioso) this.aoRaio({ x: alvo.x, y: alvo.y, forca: opts.forca || 1 });
      return bolt;
    }

    /* Arco curto e discreto, sem flash — preenche o ambiente */
    arco(x1, y1, x2, y2, cor) {
      this.bolts.push(new Bolt({
        x1, y1, x2, y2,
        desloc: Math.hypot(x2 - x1, y2 - y1) * 0.16,
        detalhe: 3,
        largura: rnd(0.8, 1.6),
        cor: cor || pick(this.cores),
        vida: rnd(90, 220),
        restrikes: 0
      }));
    }

    /* Aura: arcos curtos orbitando um ponto (ex.: o martelo) */
    aura(x, y, raio) {
      const a1 = rnd(0, Math.PI * 2);
      const a2 = a1 + rnd(0.6, 2.4);
      const r1 = raio * rnd(0.35, 1);
      const r2 = raio * rnd(0.35, 1.15);
      this.arco(
        x + Math.cos(a1) * r1, y + Math.sin(a1) * r1,
        x + Math.cos(a2) * r2, y + Math.sin(a2) * r2
      );
    }

    start() {
      if (this.rodando) return;
      this.rodando = true;
      this.ultimo = performance.now();
      requestAnimationFrame(this._loop);
    }

    stop() {
      this.rodando = false;
      window.removeEventListener('resize', this._resize);
    }

    _loop(agora) {
      if (!this.rodando) return;
      const dt = Math.min(48, agora - this.ultimo);
      this.ultimo = agora;

      this.ctx.clearRect(0, 0, this.w, this.h);

      // agenda o próximo raio grande
      this.proximo -= dt;
      if (this.proximo <= 0) {
        this.strike();
        // rajada dupla ocasional
        if (Math.random() < 0.3) setTimeout(() => this.rodando && this.strike({ silencioso: true }), rnd(90, 260));
        this.proximo = rnd(this.intervalo[0], this.intervalo[1]);
      }

      // arcos ambientes no alvo
      if (this.ambiente && this.alvo && Math.random() < 0.14) {
        const a = this.alvo();
        if (a) this.aura(a.x, a.y, 90);
      }

      const passo = (lista) => {
        for (let i = lista.length - 1; i >= 0; i--) {
          lista[i].atualizar(dt);
          if (!lista[i].vivo) lista.splice(i, 1);
          else lista[i].desenhar(this.ctx);
        }
      };

      passo(this.claroes);
      passo(this.bolts);
      passo(this.faiscas);

      requestAnimationFrame(this._loop);
    }
  }

  window.Storm = Storm;
  window.gerarBolt = gerarBolt;
})();
