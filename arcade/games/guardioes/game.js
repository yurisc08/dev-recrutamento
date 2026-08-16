/* Guardiões - defesa de torre.

   Você posiciona guardiões nas plataformas, eles atacam quem passa pela
   trilha, e o ouro dos abates paga melhorias. As ondas evoluem junto: mais
   vida, mais velocidade e tipos novos — inclusive o blindado, que ignora
   parte do dano, e o veloz, que atravessa antes de você reagir.

   Gênero clássico de defesa; mapa, arte, tipos e balanceamento são criações
   deste projeto. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 720, minH: 460 });
  const ctx = view.ctx;
  const shell = A.mountShell("guardioes");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    wave: document.getElementById("r-wave"),
    kills: document.getElementById("r-kills"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
  };

  // Tabuleiro lógico fixo: o tamanho da casa é que se adapta à tela, então o
  // mapa é o mesmo em qualquer aparelho e os recordes são comparáveis.
  const COLS = 15;
  const ROWS = 9;
  const BAR = 62;              // barra de compra, no rodapé

  /** Vértices da trilha, em coordenadas de casa. */
  const WAY = [
    [-1, 4], [3, 4], [3, 1], [7, 1], [7, 7], [11, 7], [11, 3], [15, 3],
  ];

  const TIPOS = {
    arqueiro: {
      nome: "Arqueiro", custo: 50, cor: "#5ec9a7", icone: "🏹",
      alcance: 2.5, dano: 11, cadencia: 0.55, tiro: 480,
      desc: "Rápido e barato",
    },
    gelo: {
      nome: "Gelo", custo: 75, cor: "#62a8ff", icone: "❄",
      alcance: 2.2, dano: 4, cadencia: 0.9, tiro: 380, lentidao: 0.45,
      desc: "Deixa lento",
    },
    canhao: {
      nome: "Canhão", custo: 110, cor: "#ff5c39", icone: "💥",
      alcance: 2.8, dano: 26, cadencia: 1.5, tiro: 300, area: 1.1,
      desc: "Dano em área",
    },
  };
  const ORDEM = ["arqueiro", "gelo", "canhao"];

  const STATE = { MENU: "menu", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  let cell = 40;
  let ox = 0;
  let oy = 0;

  let torres = [];
  let inimigos = [];
  let tiros = [];
  let bits = [];
  let caminho = [];          // casas ocupadas pela trilha
  let ouro = 0;
  let vidas = 0;
  let onda = 0;
  let abates = 0;
  let pontos = 0;
  let porNascer = 0;
  let nascerEm = 0;
  let intervalo = 1.2;
  let descanso = 0;
  let selecionado = "arqueiro";
  let selTorre = null;
  let hover = null;
  let aviso = "";
  let avisoT = 0;
  let shake = 0;

  // --------------------------------------------------------------- layout

  function layout() {
    cell = Math.min(view.w / COLS, (view.h - BAR) / ROWS);
    ox = (view.w - cell * COLS) / 2;
    oy = (view.h - BAR - cell * ROWS) / 2;
  }
  view.onResize(layout);
  layout();

  const px = (c) => ox + (c + 0.5) * cell;
  const py = (r) => oy + (r + 0.5) * cell;

  /** Marca todas as casas por onde a trilha passa. */
  function tracarCaminho() {
    caminho = [];
    for (let i = 0; i < WAY.length - 1; i++) {
      const [c1, r1] = WAY[i];
      const [c2, r2] = WAY[i + 1];
      const passos = Math.abs(c2 - c1) + Math.abs(r2 - r1);
      for (let k = 0; k <= passos; k++) {
        const c = c1 + Math.sign(c2 - c1) * Math.min(k, Math.abs(c2 - c1));
        const r = r1 + Math.sign(r2 - r1) * Math.min(k, Math.abs(r2 - r1));
        caminho.push(c + "," + r);
      }
    }
  }
  tracarCaminho();

  const naTrilha = (c, r) => caminho.includes(c + "," + r);
  const torreEm = (c, r) => torres.find((t) => t.c === c && t.r === r);

  /** Comprimento total da trilha, em casas. */
  const TRILHA_LEN = WAY.slice(1).reduce(
    (s, p, i) => s + Math.abs(p[0] - WAY[i][0]) + Math.abs(p[1] - WAY[i][1]),
    0
  );

  /** Converte progresso (0..TRILHA_LEN) em posição na tela. */
  function posNaTrilha(t) {
    let resto = t;
    for (let i = 0; i < WAY.length - 1; i++) {
      const [c1, r1] = WAY[i];
      const [c2, r2] = WAY[i + 1];
      const len = Math.abs(c2 - c1) + Math.abs(r2 - r1);
      if (resto <= len) {
        const f = len ? resto / len : 0;
        return { x: px(c1 + (c2 - c1) * f), y: py(r1 + (r2 - r1) * f) };
      }
      resto -= len;
    }
    const fim = WAY[WAY.length - 1];
    return { x: px(fim[0]), y: py(fim[1]) };
  }

  // ---------------------------------------------------------------- ondas

  /** A onda define quantos inimigos, de que tipo e com que força. */
  function comporOnda(n) {
    const dureza = 1 + (n - 1) * 0.28;
    const lista = [];
    const total = 6 + Math.floor(n * 1.6);
    for (let i = 0; i < total; i++) {
      let tipo = "normal";
      if (n >= 3 && i % 4 === 3) tipo = "veloz";
      if (n >= 5 && i % 6 === 5) tipo = "blindado";
      lista.push(tipo);
    }
    if (n % 5 === 0) lista.push("chefe");
    return { lista, dureza };
  }

  const MOLDES = {
    normal:    { hp: 42, vel: 1.5, ouro: 9, cor: "#c9a227", r: 0.28, armadura: 0 },
    veloz:     { hp: 28, vel: 3.0, ouro: 11, cor: "#5ec9a7", r: 0.24, armadura: 0 },
    blindado:  { hp: 95, vel: 1.1, ouro: 18, cor: "#8d9aa8", r: 0.32, armadura: 0.4 },
    chefe:     { hp: 420, vel: 0.85, ouro: 90, cor: "#c1121f", r: 0.44, armadura: 0.25 },
  };

  let ondaAtual = null;

  function proximaOnda() {
    onda++;
    ondaAtual = comporOnda(onda);
    porNascer = ondaAtual.lista.length;
    nascerEm = 0;
    intervalo = Math.max(0.32, 1.15 - onda * 0.045);
    descanso = onda === 1 ? 2.2 : 3.4;
    if (onda > 1) {
      ouro += 25 + onda * 4;
      pontos += 120;
      A.sfx.power();
      dizer("Onda " + onda + " chegando");
    }
  }

  function nascer() {
    const idx = ondaAtual.lista.length - porNascer;
    const tipo = ondaAtual.lista[idx];
    const m = MOLDES[tipo];
    const hp = Math.round(m.hp * ondaAtual.dureza);
    inimigos.push({
      t: 0, tipo, hp, max: hp,
      vel: m.vel * (1 + (onda - 1) * 0.03),
      ouro: m.ouro, cor: m.cor, r: m.r, armadura: m.armadura,
      lento: 0, bateu: 0,
    });
    porNascer--;
  }

  function dizer(txt) {
    aviso = txt;
    avisoT = 2.2;
  }

  // ---------------------------------------------------------------- fluxo

  function reset() {
    torres = [];
    inimigos = [];
    tiros = [];
    bits = [];
    ouro = 180;
    vidas = 20;
    onda = 0;
    abates = 0;
    pontos = 0;
    selTorre = null;
    selecionado = "arqueiro";
    aviso = "";
    avisoT = 0;
    shake = 0;
    proximaOnda();
  }

  function comprar(c, r) {
    const t = TIPOS[selecionado];
    if (ouro < t.custo) return dizer("Ouro insuficiente");
    ouro -= t.custo;
    torres.push({ c, r, tipo: selecionado, nivel: 1, cd: 0, giro: 0 });
    A.sfx.pickup();
  }

  const custoMelhoria = (t) => Math.round(TIPOS[t.tipo].custo * 0.8 * t.nivel);

  function melhorar(t) {
    if (t.nivel >= 3) return dizer("Já está no nível máximo");
    const c = custoMelhoria(t);
    if (ouro < c) return dizer("Faltam " + (c - ouro) + " de ouro");
    ouro -= c;
    t.nivel++;
    A.sfx.power();
  }

  function vender(t) {
    const vale = Math.round((TIPOS[t.tipo].custo * (0.6 + (t.nivel - 1) * 0.4)));
    ouro += vale;
    torres = torres.filter((x) => x !== t);
    selTorre = null;
    A.sfx.blip();
  }

  /** Atributos já com o nível aplicado. */
  function stats(t) {
    const b = TIPOS[t.tipo];
    const n = t.nivel;
    return {
      ...b,
      alcance: b.alcance + (n - 1) * 0.55,
      dano: b.dano * (1 + (n - 1) * 0.85),
      cadencia: b.cadencia * (1 - (n - 1) * 0.16),
    };
  }

  function fim() {
    state = STATE.OVER;
    const total = pontos + abates * 5;
    const record = shell.submit(total);
    el.overTitle.textContent = "A base caiu";
    el.wave.textContent = String(onda);
    el.kills.textContent = String(abates);
    el.score.textContent = A.fmt(total);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // --------------------------------------------------------------- update

  function estourar(x, y, cor, n) {
    for (let i = 0; i < (n || 8); i++) {
      const a = A.rand(0, Math.PI * 2);
      const s = A.rand(30, 150);
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: A.rand(0.2, 0.5), max: 0.5, cor });
    }
    if (bits.length > 260) bits.splice(0, bits.length - 260);
  }

  function danificar(e, dano, cor) {
    const real = dano * (1 - e.armadura);
    e.hp -= real;
    e.bateu = 0.15;
    if (e.hp <= 0) {
      e.morto = true;
      abates++;
      ouro += e.ouro;
      pontos += e.ouro * 2;
      estourar(posNaTrilha(e.t).x, posNaTrilha(e.t).y, cor || e.cor, 12);
      A.sfx.explode();
    }
  }

  function update(dt) {
    shake = Math.max(0, shake - dt * 2);
    avisoT = Math.max(0, avisoT - dt);
    for (const b of bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.93;
      b.vy *= 0.93;
      b.life -= dt;
    }
    bits = bits.filter((b) => b.life > 0);

    if (state !== STATE.PLAY) return;

    // nascimento
    if (descanso > 0) {
      descanso -= dt;
    } else if (porNascer > 0) {
      nascerEm -= dt;
      if (nascerEm <= 0) {
        nascerEm = intervalo;
        nascer();
      }
    } else if (!inimigos.length) {
      proximaOnda();
    }

    // inimigos andam
    for (const e of inimigos) {
      e.bateu = Math.max(0, e.bateu - dt);
      e.lento = Math.max(0, e.lento - dt);
      const v = e.vel * (e.lento > 0 ? 1 - TIPOS.gelo.lentidao : 1);
      e.t += v * dt;
      if (e.t >= TRILHA_LEN) {
        e.vazou = true;
        vidas -= e.tipo === "chefe" ? 5 : 1;
        shake = 0.4;
        A.sfx.hit();
        if (vidas <= 0) {
          inimigos = inimigos.filter((x) => !x.vazou && !x.morto);
          return fim();
        }
      }
    }
    inimigos = inimigos.filter((e) => !e.morto && !e.vazou);

    // torres miram e atiram
    for (const t of torres) {
      const s = stats(t);
      t.cd -= dt;
      const tx = px(t.c);
      const ty = py(t.r);
      const raio = s.alcance * cell;

      // mira em quem está mais adiantado na trilha e dentro do alcance
      let alvo = null;
      for (const e of inimigos) {
        const p = posNaTrilha(e.t);
        if (Math.hypot(p.x - tx, p.y - ty) <= raio && (!alvo || e.t > alvo.t)) alvo = e;
      }
      if (!alvo) continue;

      const p = posNaTrilha(alvo.t);
      t.giro = Math.atan2(p.y - ty, p.x - tx);
      if (t.cd > 0) continue;
      t.cd = s.cadencia;

      tiros.push({
        x: tx, y: ty, alvo, tipo: t.tipo, dano: s.dano,
        vel: s.tiro, cor: s.cor, area: s.area || 0, lentidao: s.lentidao || 0,
      });
      A.sfx.shoot();
    }

    // projéteis perseguem o alvo
    for (const b of tiros) {
      if (b.alvo.morto || b.alvo.vazou) {
        b.fim = true;
        continue;
      }
      const p = posNaTrilha(b.alvo.t);
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.vel * dt + 6) {
        b.fim = true;
        if (b.area) {
          // dano em área atinge todo mundo em volta do ponto de impacto
          for (const e of inimigos) {
            const q = posNaTrilha(e.t);
            if (Math.hypot(q.x - p.x, q.y - p.y) <= b.area * cell) danificar(e, b.dano, b.cor);
          }
          estourar(p.x, p.y, b.cor, 14);
        } else {
          danificar(b.alvo, b.dano, b.cor);
        }
        if (b.lentidao) b.alvo.lento = 1.4;
      } else {
        b.x += ((p.x - b.x) / d) * b.vel * dt;
        b.y += ((p.y - b.y) / d) * b.vel * dt;
      }
    }
    tiros = tiros.filter((b) => !b.fim);
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const w = view.w;
    const h = view.h;

    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-1, 1) * shake * 9, A.rand(-1, 1) * shake * 9);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#141a16");
    g.addColorStop(1, "#0d0f14");
    ctx.fillStyle = g;
    ctx.fillRect(-12, -12, w + 24, h + 24);

    desenharTabuleiro();
    desenharTrilha();
    desenharTorres();
    desenharInimigos();
    desenharTiros();
    desenharBits();

    ctx.restore();

    desenharBarra(w, h);
    desenharHud(w, h);
  }

  function desenharTabuleiro() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (naTrilha(c, r)) continue;
        const x = ox + c * cell;
        const y = oy + r * cell;
        ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.022)" : "rgba(255,255,255,0.045)";
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }

    // casa sob o ponteiro
    if (hover && state === STATE.PLAY && !naTrilha(hover.c, hover.r) && !torreEm(hover.c, hover.r)) {
      const t = TIPOS[selecionado];
      const x = ox + hover.c * cell;
      const y = oy + hover.r * cell;
      const pode = ouro >= t.custo;
      ctx.fillStyle = pode ? "rgba(94,201,167,0.16)" : "rgba(255,92,57,0.16)";
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = pode ? "#5ec9a7" : "#ff5c39";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);

      if (pode) {
        ctx.beginPath();
        ctx.arc(px(hover.c), py(hover.r), t.alcance * cell, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(94,201,167,0.35)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function desenharTrilha() {
    ctx.strokeStyle = "#2c2418";
    ctx.lineWidth = cell * 0.82;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    WAY.forEach(([c, r], i) => (i ? ctx.lineTo(px(c), py(r)) : ctx.moveTo(px(c), py(r))));
    ctx.stroke();

    ctx.strokeStyle = "#3d3222";
    ctx.lineWidth = cell * 0.66;
    ctx.stroke();

    // marcas tracejadas indicando o sentido da marcha
    ctx.strokeStyle = "rgba(255,176,58,0.22)";
    ctx.lineWidth = 2;
    ctx.setLineDash([cell * 0.18, cell * 0.3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // base a defender, no fim da trilha
    const fimP = WAY[WAY.length - 1];
    const bx = px(fimP[0] - 0.35);
    const by = py(fimP[1]);
    ctx.fillStyle = "#ffb03a";
    ctx.beginPath();
    ctx.moveTo(bx, by - cell * 0.5);
    ctx.lineTo(bx + cell * 0.42, by);
    ctx.lineTo(bx, by + cell * 0.5);
    ctx.lineTo(bx - cell * 0.42, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0d0f14";
    ctx.beginPath();
    ctx.arc(bx, by, cell * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  function desenharTorres() {
    for (const t of torres) {
      const s = stats(t);
      const x = px(t.c);
      const y = py(t.r);
      const sel = selTorre === t;

      if (sel) {
        ctx.beginPath();
        ctx.arc(x, y, s.alcance * cell, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // base
      ctx.fillStyle = "#22262e";
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = s.cor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // canhão girando para o alvo
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t.giro);
      ctx.fillStyle = s.cor;
      ctx.fillRect(0, -cell * 0.09, cell * 0.42, cell * 0.18);
      ctx.restore();

      ctx.fillStyle = s.cor;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.17, 0, Math.PI * 2);
      ctx.fill();

      // estrelas de nível
      for (let i = 0; i < t.nivel; i++) {
        ctx.fillStyle = "#ffce4d";
        ctx.beginPath();
        ctx.arc(x - cell * 0.2 + i * cell * 0.2, y + cell * 0.34, cell * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function desenharInimigos() {
    for (const e of inimigos) {
      const p = posNaTrilha(e.t);
      const r = e.r * cell;

      if (e.lento > 0) {
        ctx.fillStyle = "rgba(98,168,255,0.25)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = e.bateu > 0 ? "#ffffff" : e.cor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (e.armadura > 0) {
        ctx.strokeStyle = "#dfe6ef";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }

      // barra de vida
      const f = A.clamp(e.hp / e.max, 0, 1);
      const bw = r * 2.2;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(p.x - bw / 2, p.y - r - 9, bw, 4);
      ctx.fillStyle = f > 0.5 ? "#5ec9a7" : f > 0.25 ? "#ffb03a" : "#ff5c39";
      ctx.fillRect(p.x - bw / 2, p.y - r - 9, bw * f, 4);
    }
  }

  function desenharTiros() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of tiros) {
      ctx.fillStyle = b.cor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.area ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function desenharBits() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of bits) {
      ctx.globalAlpha = A.clamp(b.life / b.max, 0, 1);
      ctx.fillStyle = b.cor;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Barra inferior: escolha de guardião, ou painel da torre selecionada. */
  function desenharBarra(w, h) {
    const y = h - BAR;
    ctx.fillStyle = "rgba(12,14,20,0.92)";
    ctx.fillRect(0, y, w, BAR);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();

    ctx.textBaseline = "middle";

    if (selTorre) {
      const t = selTorre;
      const s = stats(t);
      ctx.textAlign = "left";
      ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = s.cor;
      ctx.fillText(`${s.nome} nível ${t.nivel}`, 18, y + 22);
      ctx.font = "12.5px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#a3a09b";
      ctx.fillText(`dano ${Math.round(s.dano)} · alcance ${s.alcance.toFixed(1)}`, 18, y + 42);

      botao(w - 320, y + 12, 150, 38, t.nivel >= 3 ? "Nível máximo" : `Melhorar (${custoMelhoria(t)})`,
        t.nivel < 3 && ouro >= custoMelhoria(t) ? "#5ec9a7" : "#4a4a52");
      botao(w - 156, y + 12, 138, 38, "Vender", "#ff5c39");
      return;
    }

    ORDEM.forEach((k, i) => {
      const t = TIPOS[k];
      const bx = 14 + i * 168;
      const ativo = selecionado === k;
      const pode = ouro >= t.custo;
      ctx.fillStyle = ativo ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.035)";
      ctx.fillRect(bx, y + 10, 158, 42);
      ctx.strokeStyle = ativo ? t.cor : "rgba(255,255,255,0.12)";
      ctx.lineWidth = ativo ? 2.5 : 1;
      ctx.strokeRect(bx, y + 10, 158, 42);

      ctx.textAlign = "left";
      ctx.font = "700 13.5px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = pode ? t.cor : "#5a5a62";
      ctx.fillText(`${t.icone} ${t.nome}`, bx + 12, y + 24);
      ctx.font = "11.5px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = pode ? "#a3a09b" : "#4a4a52";
      ctx.fillText(`${t.custo} ouro · ${t.desc}`, bx + 12, y + 41);
    });

    ctx.textAlign = "right";
    ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#6d6a66";
    ctx.fillText("toque numa plataforma para construir", w - 18, y + BAR / 2);
  }

  function botao(x, y, w, h, txt, cor) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = "center";
    ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = cor;
    ctx.fillText(txt, x + w / 2, y + h / 2);
    return { x, y, w, h };
  }

  function desenharHud(w, h) {
    if (state === STATE.MENU) return;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "700 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#ffce4d";
    ctx.fillText("◆ " + A.fmt(ouro), 16, 46);
    ctx.fillStyle = "#ff5c39";
    ctx.fillText("♥ " + vidas, 130, 46);
    ctx.fillStyle = "#5ec9a7";
    ctx.fillText("Onda " + onda, 216, 46);

    if (descanso > 0 && porNascer > 0) {
      ctx.textAlign = "center";
      ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,206,77,0.9)";
      ctx.fillText(`próxima onda em ${descanso.toFixed(1)}s`, w / 2, 48);
    }

    if (avisoT > 0) {
      ctx.textAlign = "center";
      ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = `rgba(255,176,58,${A.clamp(avisoT, 0, 1)})`;
      ctx.fillText(aviso, w / 2, h - BAR - 34);
    }
  }

  // --------------------------------------------------------------- entrada

  function casaEm(p) {
    const c = Math.floor((p.x - ox) / cell);
    const r = Math.floor((p.y - oy) / cell);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }

  function clique(p) {
    if (state !== STATE.PLAY) return;
    const y = view.h - BAR;

    // barra inferior
    if (p.y >= y) {
      if (selTorre) {
        if (p.x >= view.w - 320 && p.x <= view.w - 170) melhorar(selTorre);
        else if (p.x >= view.w - 156) vender(selTorre);
        else selTorre = null;
        return;
      }
      const i = Math.floor((p.x - 14) / 168);
      if (i >= 0 && i < ORDEM.length) {
        selecionado = ORDEM[i];
        A.sfx.blip();
      }
      return;
    }

    const casa = casaEm(p);
    if (!casa) {
      selTorre = null;
      return;
    }
    const t = torreEm(casa.c, casa.r);
    if (t) {
      selTorre = selTorre === t ? null : t;
      A.sfx.blip();
      return;
    }
    selTorre = null;
    if (naTrilha(casa.c, casa.r)) return dizer("Aqui é a trilha dos inimigos");
    comprar(casa.c, casa.r);
  }

  A.bindPointer(view, {
    down: clique,
    move(p) {
      hover = p.y < view.h - BAR ? casaEm(p) : null;
    },
  });

  A.onPress((code) => {
    if (code === "Enter" || code === "Space") {
      if (state === STATE.MENU || state === STATE.OVER) return play();
    }
    if (code === "Digit1") selecionado = ORDEM[0];
    if (code === "Digit2") selecionado = ORDEM[1];
    if (code === "Digit3") selecionado = ORDEM[2];
    if (code === "KeyU" && selTorre) melhorar(selTorre);
    if (code === "Escape") selTorre = null;
  });

  function play() {
    reset();
    state = STATE.PLAY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.loop(update, draw);
})();
