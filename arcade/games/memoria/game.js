/* Memória - encontre os pares.

   Os símbolos são desenhados no canvas em código: nada de fonte de ícones
   nem imagem externa. O tabuleiro cresce a cada rodada vencida, e o placar
   premia quem erra pouco — virar carta à toa custa pontos. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 520, minH: 420 });
  const ctx = view.ctx;
  const shell = A.mountShell("memoria");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    rodada: document.getElementById("r-rodada"),
    erros: document.getElementById("r-erros"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
  };

  const VIRAR = 0.28;      // segundos de animação
  const ESPIAR = 0.85;     // tempo que o par errado fica visível

  /** Cada símbolo é uma função de desenho + uma cor. */
  const SIMBOLOS = [
    { cor: "#ffb03a", d: (s) => { estrela(0, 0, s * 0.42, s * 0.18, 5); } },
    { cor: "#ff5c39", d: (s) => { ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.17, 0, 7); ctx.fillStyle = "#141017"; ctx.fill(); } },
    { cor: "#5ec9a7", d: (s) => { ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.4, 0);
        ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.4, 0); ctx.closePath(); ctx.fill(); } },
    { cor: "#62a8ff", d: (s) => { ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.36, s * 0.28);
        ctx.lineTo(-s * 0.36, s * 0.28); ctx.closePath(); ctx.fill(); } },
    { cor: "#c77dff", d: (s) => { ctx.fillRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
        ctx.fillStyle = "#141017"; ctx.fillRect(-s * 0.14, -s * 0.14, s * 0.28, s * 0.28); } },
    { cor: "#e8dcc8", d: (s) => { ctx.lineWidth = s * 0.15; ctx.lineCap = "round"; ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.3); ctx.lineTo(s * 0.3, s * 0.3);
        ctx.moveTo(s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.3, s * 0.3); ctx.stroke(); } },
    { cor: "#4ad66d", d: (s) => { ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.2832 - 1.5708;
          ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.38); }
        ctx.closePath(); ctx.fill(); } },
    { cor: "#ffce4d", d: (s) => { ctx.lineWidth = s * 0.13; ctx.beginPath();
        ctx.arc(0, 0, s * 0.32, 0.6, 5.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.26, -s * 0.2, s * 0.08, 0, 7); ctx.fill(); } },
    { cor: "#ff8fa3", d: (s) => { ctx.beginPath();
        ctx.moveTo(0, s * 0.34);
        ctx.bezierCurveTo(-s * 0.55, -s * 0.05, -s * 0.2, -s * 0.44, 0, -s * 0.16);
        ctx.bezierCurveTo(s * 0.2, -s * 0.44, s * 0.55, -s * 0.05, 0, s * 0.34);
        ctx.fill(); } },
    { cor: "#7dd3fc", d: (s) => { ctx.lineWidth = s * 0.12; ctx.beginPath();
        ctx.moveTo(-s * 0.34, s * 0.2); ctx.lineTo(-s * 0.1, -s * 0.24);
        ctx.lineTo(s * 0.12, s * 0.06); ctx.lineTo(s * 0.34, -s * 0.3); ctx.stroke(); } },
  ];

  function estrela(x, y, re, ri, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : re;
      const a = (i / (n * 2)) * 6.2832 - 1.5708;
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  const STATE = { MENU: "menu", JOGO: "jogo", FIM: "fim" };
  let state = STATE.MENU;

  let cartas = [];
  let cols = 4;
  let rows = 3;
  let cell = 90;
  let ox = 0;
  let oy = 0;
  let viradas = [];
  let bloqueio = 0;
  let rodada = 0;
  let erros = 0;
  let pontos = 0;
  let tempo = 0;

  function layout() {
    const topo = 78;
    const larg = view.w * 0.92;
    const alt = (view.h - topo) * 0.9;
    cell = Math.min(larg / cols, alt / rows);
    ox = (view.w - cell * cols) / 2;
    oy = topo + (view.h - topo - cell * rows) / 2;
  }
  view.onResize(layout);

  function montar() {
    // o tabuleiro cresce a cada rodada, até o limite de símbolos
    const pares = Math.min(SIMBOLOS.length, 3 + rodada);
    const arranjos = [
      [3, 2], [4, 2], [4, 3], [4, 3], [5, 3], [4, 4], [5, 4], [5, 4], [6, 4], [5, 4],
    ];
    const [c, r] = arranjos[Math.min(arranjos.length - 1, pares - 3)];
    cols = c;
    rows = r;

    const ids = [];
    for (let i = 0; i < pares; i++) ids.push(i, i);
    while (ids.length < cols * rows) ids.push(ids[ids.length % (pares * 2)]);
    // embaralha
    for (let i = ids.length - 1; i > 0; i--) {
      const j = A.randInt(0, i);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    cartas = ids.slice(0, cols * rows).map((id, i) => ({
      id, c: i % cols, r: Math.floor(i / cols),
      aberta: false, casada: false, anim: 0, pulo: 0,
    }));
    viradas = [];
    bloqueio = 0.55;
    layout();
  }

  function reset() {
    rodada = 1;
    erros = 0;
    pontos = 0;
    tempo = 0;
    montar();
  }

  function virar(carta) {
    if (bloqueio > 0 || carta.aberta || carta.casada || viradas.length >= 2) return;
    carta.aberta = true;
    carta.anim = VIRAR;
    viradas.push(carta);
    A.sfx.blip();

    if (viradas.length < 2) return;
    const [a, b] = viradas;
    if (a.id === b.id) {
      a.casada = b.casada = true;
      a.pulo = b.pulo = 0.4;
      pontos += 60 + Math.max(0, 40 - erros * 5);
      viradas = [];
      A.sfx.pickup();
      if (cartas.every((k) => k.casada)) {
        pontos += 250 + rodada * 60;
        bloqueio = 1.1;
        setTimeout(() => {
          if (state !== STATE.JOGO) return;
          rodada++;
          montar();
          A.sfx.power();
        }, 900);
      }
    } else {
      erros++;
      pontos = Math.max(0, pontos - 12);
      bloqueio = ESPIAR;
      A.sfx.hit();
    }
  }

  function update(dt) {
    if (state !== STATE.JOGO) return;
    tempo += dt;
    for (const k of cartas) {
      k.anim = Math.max(0, k.anim - dt);
      k.pulo = Math.max(0, k.pulo - dt);
    }
    if (bloqueio > 0) {
      bloqueio -= dt;
      if (bloqueio <= 0 && viradas.length === 2) {
        viradas.forEach((k) => {
          k.aberta = false;
          k.anim = VIRAR;
        });
        viradas = [];
      }
    }
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, "#161219");
    g.addColorStop(1, "#0d0b11");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    for (const k of cartas) carta(k);
    hud();
  }

  function carta(k) {
    const s = cell * 0.9;
    const x = ox + k.c * cell + cell / 2;
    const y = oy + k.r * cell + cell / 2 - k.pulo * 26;
    // a animação de virar é uma escala horizontal: 1 -> 0 -> 1
    const t = k.anim / VIRAR;
    const escala = Math.abs(Math.cos(Math.PI * (1 - t) * 0.5 + (k.aberta ? 0 : 0)) * 0 + (t > 0 ? Math.abs(1 - 2 * t) : 1));
    const mostra = t > 0.5 ? !k.aberta : k.aberta;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.04, escala), 1);

    const r = s * 0.16;
    ctx.beginPath();
    ctx.moveTo(-s / 2 + r, -s / 2);
    ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, r);
    ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, r);
    ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, r);
    ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, r);
    ctx.closePath();

    if (mostra || k.casada) {
      ctx.fillStyle = k.casada ? "rgba(94,201,167,0.14)" : "rgba(255,255,255,0.07)";
      ctx.fill();
      ctx.strokeStyle = k.casada ? "#5ec9a7" : "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const sim = SIMBOLOS[k.id % SIMBOLOS.length];
      ctx.fillStyle = sim.cor;
      ctx.strokeStyle = sim.cor;
      sim.d(s);
    } else {
      const cg = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
      cg.addColorStop(0, "#2b2333");
      cg.addColorStop(1, "#1c1724");
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,176,58,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,176,58,0.5)";
      estrela(0, 0, s * 0.12, s * 0.05, 4);
    }
    ctx.restore();
  }

  function hud() {
    if (state === STATE.MENU) return;
    ctx.font = "700 16px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffce4d";
    ctx.fillText(A.fmt(pontos), 18, 46);
    ctx.fillStyle = "#5ec9a7";
    ctx.fillText("Rodada " + rodada, 128, 46);
    ctx.textAlign = "right";
    ctx.fillStyle = erros > 0 ? "#ff5c39" : "#6d6a66";
    ctx.fillText("erros " + erros, view.w - 18, 46);
  }

  // ----------------------------------------------------------------- fluxo

  function fim() {
    state = STATE.FIM;
    const record = shell.submit(pontos);
    el.overTitle.textContent = "Fim da partida";
    el.rodada.textContent = String(rodada);
    el.erros.textContent = String(erros);
    el.score.textContent = A.fmt(pontos);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  A.bindPointer(view, {
    down(p) {
      if (state !== STATE.JOGO) return;
      const c = Math.floor((p.x - ox) / cell);
      const r = Math.floor((p.y - oy) / cell);
      const k = cartas.find((x) => x.c === c && x.r === r);
      if (k) virar(k);
    },
  });

  function play() {
    reset();
    state = STATE.JOGO;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);
  A.onPress((code) => {
    if ((code === "Enter" || code === "Space") && state !== STATE.JOGO) play();
    if (code === "Escape" && state === STATE.JOGO) fim();
  });

  layout();
  A.loop(update, draw);
})();
