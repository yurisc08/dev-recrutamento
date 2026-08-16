/* Voo Rasante - o classico "bater asas entre obstaculos", em quatro mundos.
   A fisica e identica nos quatro; muda so a arte, entao a dificuldade e a
   mesma e os recordes sao comparaveis. Cada mundo guarda o seu.

   Todos os cenarios sao criacoes proprias inspiradas em generios de dominio
   publico (escola de magia, mitologia grega, alta fantasia). Nenhum nome,
   personagem, simbolo ou marca de obra registrada e usado. */
(() => {
  "use strict";

  const A = window.Arcade;
  const W = 360;
  const H = 640;
  const GROUND_H = 90;
  const SKY = H - GROUND_H;

  const GRAVITY = 1500;
  const FLAP_V = -430;
  const MAX_FALL = 620;
  const SPEED = 132;
  const OBST_W = 62;
  const GAP = 158;
  const SPACING = 205;
  const MARGIN = 70;
  const PX = 92;      // x fixo do jogador
  const PR = 13;      // raio de colisao

  // -------------------------------------------------------------- desenho

  /** Bloco de obstaculo com contorno, base de todos os mundos. */
  function block(ctx, x, y, w, h, c1, c2, edge) {
    if (h <= 0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, c2);
    g.addColorStop(0.34, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, w - 2, h);
  }

  function star(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const b = a + Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * r * 0.44, y + Math.sin(b) * r * 0.44);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------- mundos

  const THEMES = {
    classico: {
      name: "Clássico",
      sub: "O original",
      emoji: "🐤",
      tint: "#f7d51d",
      trail: "#ffffff",

      sky(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, SKY);
        g.addColorStop(0, "#4ec0ca");
        g.addColorStop(1, "#9fe3e6");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, SKY);
      },

      back(ctx, scroll) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (let i = 0; i < 4; i++) {
          const x = ((i * 120 - scroll * 0.25) % (W + 120)) - 60;
          const y = 70 + i * 63;
          ctx.beginPath();
          ctx.arc(x, y, 17, 0, 7);
          ctx.arc(x + 19, y + 5, 12, 0, 7);
          ctx.arc(x - 18, y + 6, 11, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = "#7fd8a0";
        ctx.beginPath();
        ctx.moveTo(0, SKY);
        for (let x = 0; x <= W; x += 30) {
          ctx.lineTo(x, SKY - 30 - ((x * 7919) % 21) * 0.5);
          ctx.lineTo(x + 15, SKY - 12);
        }
        ctx.lineTo(W, SKY);
        ctx.fill();
      },

      obstacle(ctx, x, top) {
        const bottom = top + GAP;
        block(ctx, x, 0, OBST_W, top - 26, "#7fd456", "#3f8a2a", "#2f6b1f");
        block(ctx, x - 4, top - 26, OBST_W + 8, 26, "#8ade5f", "#3f8a2a", "#2f6b1f");
        block(ctx, x - 4, bottom, OBST_W + 8, 26, "#8ade5f", "#3f8a2a", "#2f6b1f");
        block(ctx, x, bottom + 26, OBST_W, SKY - bottom - 26, "#7fd456", "#3f8a2a", "#2f6b1f");
      },

      ground(ctx, scroll) {
        ctx.fillStyle = "#ded895";
        ctx.fillRect(0, SKY, W, GROUND_H);
        ctx.fillStyle = "#8ec44c";
        ctx.fillRect(0, SKY, W, 13);
        ctx.fillStyle = "#6ea63a";
        for (let x = -(scroll % 24); x < W; x += 24) ctx.fillRect(x, SKY + 9, 12, 5);
      },

      player(ctx, wingUp) {
        ctx.fillStyle = "#f7d51d";
        ctx.strokeStyle = "#c8880c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, PR + 3, PR, 0, 0, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(-3, wingUp ? -5 : 3, 7, wingUp ? 5 : 4, wingUp ? -0.4 : 0.3, 0, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(7, -5, 4.5, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(8.5, -5, 2, 0, 7);
        ctx.fill();

        ctx.fillStyle = "#f4761a";
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(22, 2);
        ctx.lineTo(12, 6);
        ctx.closePath();
        ctx.fill();
      },
    },

    magia: {
      name: "Escola de Magia",
      sub: "Vassoura e torres",
      emoji: "🧹",
      tint: "#a78bfa",
      trail: "#ffd166",

      sky(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, SKY);
        g.addColorStop(0, "#140e2e");
        g.addColorStop(0.6, "#2b1e57");
        g.addColorStop(1, "#4a3374");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, SKY);
      },

      back(ctx, scroll, t) {
        // estrelas fixas
        for (let i = 0; i < 42; i++) {
          const x = (i * 97) % W;
          const y = (i * 53) % (SKY - 120);
          const tw = 0.45 + Math.sin(t / 400 + i) * 0.35;
          ctx.fillStyle = `rgba(255,255,255,${tw})`;
          ctx.fillRect(x, y, 2, 2);
        }
        // lua
        ctx.fillStyle = "#f2e9c9";
        ctx.beginPath();
        ctx.arc(276, 92, 30, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#2b1e57";
        ctx.beginPath();
        ctx.arc(263, 84, 27, 0, 7);
        ctx.fill();

        // silhueta do castelo ao fundo
        ctx.fillStyle = "#1a1338";
        const base = SKY - 40;
        for (let i = 0; i < 7; i++) {
          const x = ((i * 78 - scroll * 0.2) % (W + 160)) - 80;
          const h = 70 + ((i * 37) % 60);
          ctx.fillRect(x, base - h, 34, h);
          ctx.beginPath();
          ctx.moveTo(x - 5, base - h);
          ctx.lineTo(x + 17, base - h - 26);
          ctx.lineTo(x + 39, base - h);
          ctx.closePath();
          ctx.fill();
          // janelas acesas
          ctx.fillStyle = "#ffb703";
          ctx.fillRect(x + 13, base - h + 22, 6, 9);
          ctx.fillStyle = "#1a1338";
        }

        // velas flutuantes
        for (let i = 0; i < 5; i++) {
          const x = ((i * 96 - scroll * 0.55) % (W + 100)) - 50;
          const y = 150 + i * 68 + Math.sin(t / 620 + i) * 12;
          ctx.fillStyle = "rgba(255,209,102,0.16)";
          ctx.beginPath();
          ctx.arc(x, y, 13, 0, 7);
          ctx.fill();
          ctx.fillStyle = "#e8e2cf";
          ctx.fillRect(x - 2, y, 4, 12);
          ctx.fillStyle = "#ffd166";
          ctx.beginPath();
          ctx.ellipse(x, y - 4, 2.6, 5, 0, 0, 7);
          ctx.fill();
        }
      },

      obstacle(ctx, x, top) {
        const bottom = top + GAP;
        const stone = (y, h) => {
          block(ctx, x, y, OBST_W, h, "#6b6480", "#403a52", "#2a2538");
          ctx.strokeStyle = "rgba(0,0,0,0.28)";
          ctx.lineWidth = 1;
          for (let sy = y + 14; sy < y + h; sy += 17) {
            ctx.beginPath();
            ctx.moveTo(x + 1, sy);
            ctx.lineTo(x + OBST_W - 1, sy);
            ctx.stroke();
          }
        };
        stone(0, top - 22);
        stone(bottom + 22, SKY - bottom - 22);

        // ameias viradas para o vao
        const merlon = (y, dir) => {
          block(ctx, x - 5, y, OBST_W + 10, 22, "#7d7594", "#453e59", "#2a2538");
          ctx.fillStyle = "#453e59";
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(x - 3 + i * 17, dir > 0 ? y + 16 : y - 6, 11, 7);
          }
        };
        merlon(top - 22, 1);
        merlon(bottom, -1);

        // tocha no topo da torre de baixo
        ctx.fillStyle = "rgba(255,183,3,0.22)";
        ctx.beginPath();
        ctx.arc(x + OBST_W / 2, bottom + 30, 16, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#ffb703";
        ctx.beginPath();
        ctx.ellipse(x + OBST_W / 2, bottom + 28, 4, 8, 0, 0, 7);
        ctx.fill();
      },

      ground(ctx, scroll) {
        ctx.fillStyle = "#221b3d";
        ctx.fillRect(0, SKY, W, GROUND_H);
        ctx.fillStyle = "#3a2f5c";
        ctx.fillRect(0, SKY, W, 14);
        ctx.fillStyle = "#4b3f70";
        for (let x = -(scroll % 30); x < W; x += 30) ctx.fillRect(x, SKY + 16, 18, 6);
      },

      player(ctx, wingUp, t) {
        // rastro de faiscas
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = `rgba(255,209,102,${0.5 - i * 0.11})`;
          ctx.beginPath();
          ctx.arc(-20 - i * 8, 4 + Math.sin(t / 90 + i) * 3, 3.4 - i * 0.6, 0, 7);
          ctx.fill();
        }
        // cabo da vassoura
        ctx.strokeStyle = "#8b5a2b";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-14, 6);
        ctx.lineTo(17, -1);
        ctx.stroke();
        // palha
        ctx.strokeStyle = "#d9a441";
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(-14, 6);
          ctx.lineTo(-25, 6 + i * 3.4 + (wingUp ? -1 : 1));
          ctx.stroke();
        }
        // pequeno bruxo de capa
        ctx.fillStyle = "#3b2a63";
        ctx.beginPath();
        ctx.moveTo(-6, 2);
        ctx.lineTo(2, -14);
        ctx.lineTo(9, 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f0c9a0";
        ctx.beginPath();
        ctx.arc(3, -15, 4.4, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#3b2a63"; // chapeu pontudo
        ctx.beginPath();
        ctx.moveTo(-3, -17);
        ctx.lineTo(4, -29);
        ctx.lineTo(10, -16);
        ctx.closePath();
        ctx.fill();
        // capa esvoacante
        ctx.fillStyle = "rgba(59,42,99,0.9)";
        ctx.beginPath();
        ctx.moveTo(-5, -6);
        ctx.quadraticCurveTo(-19, wingUp ? -14 : -2, -22, 4);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();
      },
    },

    olimpo: {
      name: "Olimpo",
      sub: "Mitologia grega",
      emoji: "🏛️",
      tint: "#7dd3fc",
      trail: "#ffffff",

      sky(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, SKY);
        g.addColorStop(0, "#1a6fa8");
        g.addColorStop(0.55, "#57b6dd");
        g.addColorStop(1, "#ffd9a0");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, SKY);
      },

      back(ctx, scroll) {
        ctx.fillStyle = "rgba(255,241,200,0.9)";
        ctx.beginPath();
        ctx.arc(84, 96, 26, 0, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 4; i++) {
          const x = ((i * 128 - scroll * 0.22) % (W + 140)) - 70;
          const y = 62 + i * 58;
          ctx.beginPath();
          ctx.ellipse(x, y, 30, 11, 0, 0, 7);
          ctx.fill();
        }
        // montanha com um templo no alto
        ctx.fillStyle = "#b9a17e";
        const base = SKY - 26;
        ctx.beginPath();
        ctx.moveTo(-40 - (scroll * 0.18) % 200, base);
        ctx.lineTo(120 - (scroll * 0.18) % 200, base - 128);
        ctx.lineTo(280 - (scroll * 0.18) % 200, base);
        ctx.closePath();
        ctx.fill();
        const tx = 92 - (scroll * 0.18) % 200;
        ctx.fillStyle = "#efe6d2";
        ctx.fillRect(tx, base - 128, 56, 26);
        ctx.beginPath();
        ctx.moveTo(tx - 6, base - 128);
        ctx.lineTo(tx + 28, base - 146);
        ctx.lineTo(tx + 62, base - 128);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#cdbfa4";
        for (let i = 0; i < 4; i++) ctx.fillRect(tx + 6 + i * 14, base - 122, 5, 20);
      },

      obstacle(ctx, x, top) {
        const bottom = top + GAP;
        const column = (y, h) => {
          block(ctx, x, y, OBST_W, h, "#f4ecda", "#c9bda1", "#9c9078");
          ctx.strokeStyle = "rgba(120,108,84,0.5)";
          ctx.lineWidth = 1.5;
          for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 12, y);
            ctx.lineTo(x + i * 12, y + h);
            ctx.stroke();
          }
        };
        column(0, top - 24);
        column(bottom + 24, SKY - bottom - 24);
        // capiteis
        block(ctx, x - 6, top - 24, OBST_W + 12, 24, "#fdf6e6", "#cfc3a6", "#9c9078");
        block(ctx, x - 6, bottom, OBST_W + 12, 24, "#fdf6e6", "#cfc3a6", "#9c9078");
      },

      ground(ctx, scroll) {
        ctx.fillStyle = "#e4d3a8";
        ctx.fillRect(0, SKY, W, GROUND_H);
        ctx.fillStyle = "#8fae63";
        ctx.fillRect(0, SKY, W, 12);
        ctx.fillStyle = "#c9b98f";
        for (let x = -(scroll % 26); x < W; x += 26) ctx.fillRect(x, SKY + 20, 14, 5);
      },

      player(ctx, wingUp) {
        // sandalia alada
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#dfe6ef";
        ctx.lineWidth = 1.5;
        const spread = wingUp ? -1 : 1;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-4, -1);
          ctx.quadraticCurveTo(-20, -12 * s * spread - 4, -26, 2 * s * spread);
          ctx.quadraticCurveTo(-14, -1, -4, 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = "#c2853f";
        ctx.beginPath();
        ctx.ellipse(2, 4, 14, 5.5, -0.12, 0, 7);
        ctx.fill();
        ctx.strokeStyle = "#8c5a26";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-4, 1);
        ctx.lineTo(4, -6);
        ctx.moveTo(9, 1);
        ctx.lineTo(4, -6);
        ctx.stroke();
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(4, -7, 3, 0, 7);
        ctx.fill();
      },
    },

    fantasia: {
      name: "Reino de Pedra",
      sub: "Alta fantasia",
      emoji: "🐉",
      tint: "#6ee7b7",
      trail: "#ff9f45",

      sky(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, SKY);
        g.addColorStop(0, "#101d24");
        g.addColorStop(0.55, "#22414a");
        g.addColorStop(1, "#5c7b6a");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, SKY);
      },

      back(ctx, scroll, t) {
        // serras em tres camadas
        const ridges = [
          { o: 0.14, base: SKY - 92, amp: 52, c: "#1b2f37" },
          { o: 0.26, base: SKY - 52, amp: 40, c: "#25404a" },
          { o: 0.42, base: SKY - 20, amp: 28, c: "#2f515c" },
        ];
        for (const r of ridges) {
          ctx.fillStyle = r.c;
          ctx.beginPath();
          ctx.moveTo(0, SKY);
          for (let x = 0; x <= W; x += 10) {
            const wx = (x + scroll * r.o) * 0.02;
            ctx.lineTo(x, r.base + Math.sin(wx) * r.amp + Math.sin(wx * 2.7 + 1) * r.amp * 0.4);
          }
          ctx.lineTo(W, SKY);
          ctx.fill();
        }
        // faixas de neblina
        for (let i = 0; i < 3; i++) {
          const y = 210 + i * 96;
          ctx.fillStyle = `rgba(200,225,225,${0.06 + i * 0.02})`;
          ctx.fillRect(0, y + Math.sin(t / 1400 + i) * 6, W, 20);
        }
      },

      obstacle(ctx, x, top) {
        const bottom = top + GAP;
        const spire = (y, h, pointDown) => {
          if (h <= 0) return;
          const g = ctx.createLinearGradient(x, 0, x + OBST_W, 0);
          g.addColorStop(0, "#4a5a63");
          g.addColorStop(0.35, "#6d818b");
          g.addColorStop(1, "#38454d");
          ctx.fillStyle = g;
          ctx.beginPath();
          if (pointDown) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + OBST_W, y);
            ctx.lineTo(x + OBST_W - 6, y + h - 16);
            ctx.lineTo(x + OBST_W / 2, y + h);
            ctx.lineTo(x + 6, y + h - 16);
          } else {
            ctx.moveTo(x + OBST_W / 2, y);
            ctx.lineTo(x + OBST_W - 6, y + 16);
            ctx.lineTo(x + OBST_W, y + h);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + 6, y + 16);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#28323a";
          ctx.lineWidth = 2;
          ctx.stroke();
          // musgo na aresta
          ctx.fillStyle = "rgba(110,231,183,0.35)";
          ctx.fillRect(x + 8, pointDown ? y + 4 : y + h - 12, OBST_W - 16, 4);
        };
        spire(0, top, true);
        spire(bottom, SKY - bottom, false);
      },

      ground(ctx, scroll) {
        ctx.fillStyle = "#2b3a34";
        ctx.fillRect(0, SKY, W, GROUND_H);
        ctx.fillStyle = "#4a6b52";
        ctx.fillRect(0, SKY, W, 13);
        ctx.fillStyle = "#37503f";
        for (let x = -(scroll % 28); x < W; x += 28) ctx.fillRect(x, SKY + 15, 16, 6);
      },

      player(ctx, wingUp, t) {
        // baforada
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = `rgba(255,159,69,${0.35 - i * 0.1})`;
          ctx.beginPath();
          ctx.arc(-19 - i * 7, 3 + Math.sin(t / 100 + i) * 2, 3.2 - i * 0.7, 0, 7);
          ctx.fill();
        }
        // cauda
        ctx.strokeStyle = "#2f7d5c";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-10, 1);
        ctx.quadraticCurveTo(-22, 4, -26, -4);
        ctx.stroke();
        // corpo
        ctx.fillStyle = "#3fa06f";
        ctx.strokeStyle = "#24634a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, PR + 3, PR - 1, 0, 0, 7);
        ctx.fill();
        ctx.stroke();
        // asa membranosa
        ctx.fillStyle = "#6ee7b7";
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        if (wingUp) {
          ctx.quadraticCurveTo(-12, -22, 6, -19);
          ctx.quadraticCurveTo(4, -8, -2, -2);
        } else {
          ctx.quadraticCurveTo(-14, 6, 2, 11);
          ctx.quadraticCurveTo(2, 2, -2, -2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // focinho e chifre
        ctx.fillStyle = "#3fa06f";
        ctx.beginPath();
        ctx.moveTo(10, -3);
        ctx.lineTo(23, 1);
        ctx.lineTo(10, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e9f5ee";
        ctx.beginPath();
        ctx.moveTo(4, -11);
        ctx.lineTo(8, -20);
        ctx.lineTo(10, -10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(7, -5, 3.4, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#1a2b22";
        ctx.beginPath();
        ctx.arc(8.4, -5, 1.6, 0, 7);
        ctx.fill();
      },
    },
  };

  const ORDER = ["classico", "magia", "olimpo", "fantasia"];

  // ---------------------------------------------------------------- estado

  let themeKey = A.store.get("voo.tema", "classico");
  if (!THEMES[themeKey]) themeKey = "classico";
  let theme = THEMES[themeKey];

  const canvas = document.getElementById("c");
  // O jogo ocupa a tela toda, mas a COLUNA de jogo continua com 360x640: se
  // ela esticasse junto com a tela, o vao entre obstaculos mudaria de tamanho
  // e o recorde de um monitor nao valeria no celular. O que sobra dos lados
  // recebe um fundo ambiente do proprio mundo.
  const view = A.createView(canvas, { minW: W, minH: H });
  const ctx = view.ctx;
  const shell = A.mountShell(() => "voo." + themeKey);

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    themes: document.getElementById("themes"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    change: document.getElementById("change"),
    score: document.getElementById("r-score"),
    best: document.getElementById("r-best"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", READY: "ready", PLAY: "play", DEAD: "dead" };
  let state = STATE.MENU;

  const bird = { y: 0, v: 0, rot: 0, wing: 0 };
  let obstacles = [];
  let score = 0;
  let scroll = 0;
  let flash = 0;

  function spawn(x) {
    const min = MARGIN;
    const max = SKY - MARGIN - GAP;
    obstacles.push({ x, top: min + Math.random() * Math.max(0, max - min), passed: false });
  }

  function reset() {
    bird.y = SKY * 0.45;
    bird.v = 0;
    bird.rot = 0;
    bird.wing = 0;
    obstacles = [];
    for (let i = 0; i < 4; i++) spawn(W + 130 + i * SPACING);
    score = 0;
    flash = 0;
  }

  function flap() {
    if (state === STATE.READY) state = STATE.PLAY;
    if (state !== STATE.PLAY) return;
    bird.v = FLAP_V;
    bird.wing = 0.18;
    A.sfx.jump();
  }

  function die() {
    if (state !== STATE.PLAY) return;
    state = STATE.DEAD;
    flash = 0.8;
    A.sfx.hit();
    setTimeout(() => A.sfx.over(), 130);

    const record = shell.submit(score);
    el.score.textContent = String(score);
    el.best.textContent = A.fmt(shell.best());
    el.record.textContent = record ? "🏆 Novo recorde neste mundo!" : "";
    setTimeout(() => el.over.classList.remove("hidden"), 620);
  }

  function update(dt) {
    scroll += SPEED * dt;

    if (state === STATE.MENU || state === STATE.READY) {
      bird.y = SKY * 0.45 + Math.sin(performance.now() / 260) * 6;
      bird.rot = 0;
      return;
    }

    if (state === STATE.DEAD) {
      flash = Math.max(0, flash - dt * 2.5);
      bird.v = Math.min(bird.v + GRAVITY * dt, MAX_FALL);
      bird.y = Math.min(bird.y + bird.v * dt, SKY - PR);
      bird.rot = Math.min(Math.PI / 2, bird.rot + dt * 6);
      return;
    }

    bird.v = Math.min(bird.v + GRAVITY * dt, MAX_FALL);
    bird.y += bird.v * dt;
    bird.wing = Math.max(0, bird.wing - dt);
    bird.rot = bird.v < 0 ? -0.42 : Math.min(Math.PI / 2, bird.v / 520);

    for (const o of obstacles) {
      o.x -= SPEED * dt;
      if (!o.passed && o.x + OBST_W < PX - PR) {
        o.passed = true;
        score++;
        A.sfx.point();
      }
    }
    if (obstacles.length && obstacles[0].x < -OBST_W - 12) {
      obstacles.shift();
      spawn(obstacles[obstacles.length - 1].x + SPACING);
    }

    if (bird.y - PR <= 0) {
      bird.y = PR;
      bird.v = 0;
    }
    if (bird.y + PR >= SKY) {
      bird.y = SKY - PR;
      return die();
    }
    for (const o of obstacles) {
      if (o.x > PX + PR || o.x + OBST_W < PX - PR) continue;
      if (bird.y - PR + 2 < o.top || bird.y + PR - 2 > o.top + GAP) return die();
    }
  }

  function draw() {
    const t = performance.now();
    const ox = Math.round((view.w - W) / 2);
    const oy = Math.round((view.h - H) / 2);

    // fundo ambiente atras da coluna, com a paleta do mundo escolhido
    ctx.save();
    ctx.scale(view.w / W, view.h / H);
    theme.sky(ctx);
    ctx.restore();
    ctx.fillStyle = "rgba(5,6,15,0.55)";
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    drawWorld(t);

    ctx.restore();

    // moldura sutil separando a coluna do fundo
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, W - 1, H - 1);
  }

  function drawWorld(t) {
    theme.sky(ctx);
    theme.back(ctx, scroll, t);
    for (const o of obstacles) theme.obstacle(ctx, o.x, o.top);
    theme.ground(ctx, scroll);

    ctx.save();
    ctx.translate(PX, bird.y);
    ctx.rotate(bird.rot);
    theme.player(ctx, bird.wing > 0, t);
    ctx.restore();

    if (state === STATE.PLAY || state === STATE.DEAD) {
      ctx.font = "bold 46px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(String(score), W / 2, 76);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(score), W / 2, 76);
    }

    if (state === STATE.READY) {
      ctx.font = "bold 21px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText("Toque para começar", W / 2, SKY * 0.26);
      ctx.fillStyle = "#fff";
      ctx.fillText("Toque para começar", W / 2, SKY * 0.26);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // -------------------------------------------------------------- interface

  function buildThemeButtons() {
    el.themes.innerHTML = "";
    for (const key of ORDER) {
      const th = THEMES[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme";
      btn.style.setProperty("--tint", th.tint);
      btn.setAttribute("aria-pressed", String(key === themeKey));
      btn.innerHTML =
        `<span class="emoji">${th.emoji}</span>${th.name}<small>${th.sub}</small>`;
      btn.addEventListener("click", () => selectTheme(key));
      el.themes.appendChild(btn);
    }
  }

  function selectTheme(key) {
    themeKey = key;
    theme = THEMES[key];
    A.store.set("voo.tema", key);
    document.documentElement.style.setProperty("--accent", theme.tint);
    buildThemeButtons();
    shell.refresh();
    A.sfx.blip();
  }

  function play() {
    reset();
    state = STATE.READY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  function toMenu() {
    reset();
    state = STATE.MENU;
    el.over.classList.add("hidden");
    el.start.classList.remove("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);
  el.change.addEventListener("click", toMenu);

  function tap(e) {
    if (e.target instanceof Element && e.target.closest("button")) return;
    e.preventDefault();
    if (state === STATE.MENU) play();
    else if (state === STATE.DEAD) {
      if (!el.over.classList.contains("hidden")) play();
    } else flap();
  }

  canvas.addEventListener("pointerdown", tap);
  el.start.addEventListener("pointerdown", tap);
  el.over.addEventListener("pointerdown", tap);

  A.onPress((code) => {
    if (code !== "Space" && code !== "ArrowUp" && code !== "KeyW") return;
    if (state === STATE.MENU) play();
    else if (state === STATE.DEAD) {
      if (!el.over.classList.contains("hidden")) play();
    } else flap();
  });

  selectTheme(themeKey);
  reset();
  A.loop(update, draw);
})();
