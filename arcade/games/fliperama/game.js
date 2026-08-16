/* Fliperama - pinball com física de verdade.

   A mesa tem tamanho fixo (420x720) e fica centralizada na tela, com fundo
   ambiente ao redor: esticar a mesa mudaria os ângulos de rebatida e os
   recordes deixariam de ser comparáveis entre aparelhos.

   A física é toda de colisão contra segmentos e círculos — o mesmo par de
   testes resolve paredes, rampas, defletores e as palhetas. */
(() => {
  "use strict";

  const A = window.Arcade;
  const TW = 420;   // largura da mesa
  const TH = 720;   // altura da mesa

  const GRAV = 980;
  const BALL_R = 9;
  const MAX_SPEED = 1150;
  const WALL_BOUNCE = 0.42;
  const BUMPER_BOUNCE = 340;
  const FLIP_LEN = 64;
  const FLIP_UP = -0.52;
  const FLIP_DOWN = 0.42;
  const FLIP_SPEED = 15;

  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: TW, minH: TH });
  const ctx = view.ctx;
  const shell = A.mountShell("fliperama");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    score: document.getElementById("r-score"),
    best: document.getElementById("r-best"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", READY: "ready", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  // ------------------------------------------------------------- geometria

  /** Paredes da mesa: pares de pontos. */
  const LANE_TOP = 300;   // altura onde o corredor desemboca na mesa

  const WALLS = [
    // laterais
    [18, 90, 18, 560], [402, 90, 402, 700],
    // topo arredondado — a diagonal da direita é o que joga a bola
    // lançada de volta para dentro da mesa
    [18, 90, 60, 40], [60, 40, 360, 40], [360, 40, 402, 90],
    // parede interna do corredor: sobe até LANE_TOP e ali termina
    [370, LANE_TOP, 370, 700],
    // funis inferiores até as palhetas
    [18, 560, 126, 640], [370, 470, 348, 520], [348, 520, 294, 640],
    // paredes curtas ao lado das palhetas
    [126, 640, 126, 672], [294, 640, 294, 672],
    // defletores superiores
    [96, 176, 150, 138], [324, 176, 270, 138],
  ];

  /**
   * Slingshots: os defletores inclinados logo acima das palhetas. Sem eles a
   * metade de baixo da mesa ficava morta — a bola descia reto para o ralo.
   */
  const SLINGS = [
    { a: [92, 512], b: [140, 590], push: 300, pts: 60, hit: 0 },
    { a: [328, 512], b: [280, 590], push: 300, pts: 60, hit: 0 },
  ];

  /** Bumpers: x, y, raio. Empurram a bola e valem pontos. */
  const BUMPERS = [
    { x: 138, y: 236, r: 22, pts: 100, hit: 0 },
    { x: 282, y: 236, r: 22, pts: 100, hit: 0 },
    { x: 210, y: 176, r: 26, pts: 150, hit: 0 },
    { x: 210, y: 330, r: 18, pts: 75, hit: 0 },
  ];

  /** Alvos que apagam ao serem atingidos e reacendem quando todos caem. */
  let targets = [];
  function resetTargets() {
    targets = [
      { x: 74, y: 300, on: true }, { x: 74, y: 336, on: true }, { x: 74, y: 372, on: true },
      { x: 346, y: 300, on: true }, { x: 346, y: 336, on: true }, { x: 346, y: 372, on: true },
    ];
  }

  const flippers = [
    { pivot: { x: 140, y: 648 }, dir: 1, angle: FLIP_DOWN, av: 0, key: ["ArrowLeft", "KeyA", "KeyZ"] },
    { pivot: { x: 280, y: 648 }, dir: -1, angle: FLIP_DOWN, av: 0, key: ["ArrowRight", "KeyD", "KeyM"] },
  ];

  const ball = { x: 386, y: 640, vx: 0, vy: 0, stuck: true };
  let trail = [];
  let plunger = 0;      // 0..1, força acumulada
  let score = 0;
  let balls = 3;
  let combo = 0;
  let flash = 0;
  let sparks = [];

  function reset() {
    score = 0;
    balls = 3;
    combo = 0;
    sparks = [];
    resetTargets();
    for (const b of BUMPERS) b.hit = 0;
    newBall();
  }

  function newBall() {
    ball.x = 386;
    ball.y = 640;
    ball.vx = 0;
    ball.vy = 0;
    ball.stuck = true;
    trail = [];
    plunger = 0;
    state = STATE.READY;
  }

  // -------------------------------------------------------------- colisão

  /** Ponto do segmento AB mais próximo de P. */
  function closest(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = A.clamp(t, 0, 1);
    return { x: x1 + dx * t, y: y1 + dy * t, t };
  }

  /**
   * Resolve a bola contra um segmento. `push` adiciona velocidade extra na
   * normal (usado pelas palhetas em movimento e pelos bumpers).
   */
  function hitSegment(x1, y1, x2, y2, push, restitution) {
    const c = closest(ball.x, ball.y, x1, y1, x2, y2);
    let nx = ball.x - c.x;
    let ny = ball.y - c.y;
    const d = Math.hypot(nx, ny);
    if (d > BALL_R || d === 0) return false;

    nx /= d;
    ny /= d;
    ball.x = c.x + nx * BALL_R;
    ball.y = c.y + ny * BALL_R;

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      const r = restitution === undefined ? WALL_BOUNCE : restitution;
      ball.vx -= nx * vn * (1 + r);
      ball.vy -= ny * vn * (1 + r);
    }
    if (push) {
      ball.vx += nx * push;
      ball.vy += ny * push;
    }
    return true;
  }

  function flipperEnd(f) {
    return {
      x: f.pivot.x + Math.cos(f.angle) * FLIP_LEN * f.dir,
      y: f.pivot.y + Math.sin(f.angle) * FLIP_LEN,
    };
  }

  // --------------------------------------------------------------- update

  function addScore(n) {
    score += n * (1 + Math.floor(combo / 5));
    combo++;
  }

  function spark(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = A.rand(0, Math.PI * 2);
      sparks.push({
        x, y, vx: Math.cos(a) * A.rand(40, 190), vy: Math.sin(a) * A.rand(40, 190),
        life: A.rand(0.2, 0.5), max: 0.5, color,
      });
    }
    if (sparks.length > 200) sparks.splice(0, sparks.length - 200);
  }

  function update(dt) {
    flash = Math.max(0, flash - dt * 2);
    for (const s of sparks) {
      s.vy += 500 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    sparks = sparks.filter((s) => s.life > 0);

    // palhetas respondem mesmo com a bola presa, dá sensação de vida
    for (const f of flippers) {
      const want = A.keys.down(...f.key) ? FLIP_UP : FLIP_DOWN;
      const prev = f.angle;
      f.angle = A.damp(f.angle, want, FLIP_SPEED, dt);
      f.av = (f.angle - prev) / Math.max(dt, 1e-4);
    }

    if (state === STATE.READY) {
      if (A.keys.down("Space", "ArrowDown", "KeyS")) {
        plunger = Math.min(1, plunger + dt * 1.3);
      } else if (plunger > 0.05) {
        ball.stuck = false;
        ball.vy = -A.lerp(900, 1320, plunger);
        state = STATE.PLAY;
        A.sfx.power();
        plunger = 0;
      }
      ball.y = 640 + plunger * 34;
      return;
    }
    if (state !== STATE.PLAY) return;

    // Subpassos: a bola chega a mil px/s e atravessaria as paredes finas.
    const steps = 6;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) step(h);
  }

  function step(dt) {
    ball.vy += GRAV * dt;

    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > MAX_SPEED) {
      ball.vx *= MAX_SPEED / sp;
      ball.vy *= MAX_SPEED / sp;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    for (const w of WALLS) {
      if (hitSegment(w[0], w[1], w[2], w[3])) A.sfx.bounce();
    }

    for (const b of BUMPERS) {
      const d = Math.hypot(ball.x - b.x, ball.y - b.y);
      if (d < b.r + BALL_R && d > 0) {
        const nx = (ball.x - b.x) / d;
        const ny = (ball.y - b.y) / d;
        ball.x = b.x + nx * (b.r + BALL_R);
        ball.y = b.y + ny * (b.r + BALL_R);
        const vn = ball.vx * nx + ball.vy * ny;
        ball.vx -= nx * vn * 1.6;
        ball.vy -= ny * vn * 1.6;
        ball.vx += nx * BUMPER_BOUNCE;
        ball.vy += ny * BUMPER_BOUNCE;
        b.hit = 0.22;
        addScore(b.pts);
        A.sfx.blip();
        spark(b.x + nx * b.r, b.y + ny * b.r, "#ffb03a");
      }
    }

    // Portão de mão única: a bola sobe o corredor e sai para a mesa, mas não
    // consegue voltar por ali — cair no corredor seria um ralo sem defesa.
    if (ball.vy > 0) hitSegment(370, LANE_TOP, 402, LANE_TOP, 0, 0.15);

    for (const sl of SLINGS) {
      if (hitSegment(sl.a[0], sl.a[1], sl.b[0], sl.b[1], sl.push, 0.3)) {
        sl.hit = 0.2;
        addScore(sl.pts);
        A.sfx.blip();
        spark((sl.a[0] + sl.b[0]) / 2, (sl.a[1] + sl.b[1]) / 2, "#ff5c39");
      }
    }

    for (const t of targets) {
      if (!t.on) continue;
      if (Math.abs(ball.x - t.x) < 12 + BALL_R && Math.abs(ball.y - t.y) < 9 + BALL_R) {
        t.on = false;
        addScore(250);
        A.sfx.pickup();
        spark(t.x, t.y, "#5ec9a7");
        if (!targets.some((k) => k.on)) {
          addScore(1500);
          flash = 1;
          A.sfx.power();
          setTimeout(resetTargets, 400);
        }
      }
    }

    for (const f of flippers) {
      const e = flipperEnd(f);
      // a velocidade da ponta vira empurrão: bater com a palheta subindo
      // arremessa a bola, parada apenas segura
      const push = Math.max(0, -f.av * f.dir * 26);
      if (hitSegment(f.pivot.x, f.pivot.y, e.x, e.y, push, 0.32)) {
        if (push > 40) {
          A.sfx.jump();
          combo = 0;
        } else A.sfx.bounce();
      }
    }

    trail.unshift({ x: ball.x, y: ball.y });
    if (trail.length > 8) trail.pop();

    // ralo
    if (ball.y > TH + 30) {
      balls--;
      combo = 0;
      A.sfx.hit();
      if (balls <= 0) return finish();
      newBall();
    }
  }

  function finish() {
    state = STATE.OVER;
    const record = shell.submit(score);
    el.score.textContent = A.fmt(score);
    el.best.textContent = A.fmt(shell.best());
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const ox = Math.round((view.w - TW) / 2);
    const oy = Math.round((view.h - TH) / 2);

    // fundo ambiente
    const amb = ctx.createLinearGradient(0, 0, view.w, view.h);
    amb.addColorStop(0, "#1a1208");
    amb.addColorStop(1, "#0c0c10");
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, TW, TH);
    ctx.clip();

    drawTable();

    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, TW - 1, TH - 1);
  }

  function drawTable() {
    const g = ctx.createLinearGradient(0, 0, 0, TH);
    g.addColorStop(0, "#191430");
    g.addColorStop(0.6, "#141026");
    g.addColorStop(1, "#0d0a18");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TW, TH);

    // brilho de fundo sob os bumpers
    for (const b of BUMPERS) {
      const gl = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.4);
      gl.addColorStop(0, `rgba(255,176,58,${0.12 + b.hit})`);
      gl.addColorStop(1, "rgba(255,176,58,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(b.x - b.r * 3.4, b.y - b.r * 3.4, b.r * 6.8, b.r * 6.8);
    }

    ctx.strokeStyle = "#4a3a5c";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const w of WALLS) {
      ctx.beginPath();
      ctx.moveTo(w[0], w[1]);
      ctx.lineTo(w[2], w[3]);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(94,201,167,0.5)";
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(370, LANE_TOP);
    ctx.lineTo(402, LANE_TOP);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const sl of SLINGS) {
      ctx.strokeStyle = sl.hit > 0 ? "#fff3d0" : "#ff5c39";
      ctx.lineWidth = sl.hit > 0 ? 13 : 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sl.a[0], sl.a[1]);
      ctx.lineTo(sl.b[0], sl.b[1]);
      ctx.stroke();
      sl.hit = Math.max(0, sl.hit - 0.02);
    }

    for (const t of targets) {
      ctx.fillStyle = t.on ? "#5ec9a7" : "#2c3540";
      ctx.fillRect(t.x - 12, t.y - 5, 24, 10);
      if (t.on) {
        ctx.fillStyle = "rgba(94,201,167,0.35)";
        ctx.fillRect(t.x - 15, t.y - 8, 30, 16);
      }
    }

    for (const b of BUMPERS) {
      ctx.fillStyle = "#2a2038";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.hit > 0 ? "#fff3d0" : "#ffb03a";
      ctx.lineWidth = b.hit > 0 ? 6 : 3.5;
      ctx.stroke();
      ctx.fillStyle = b.hit > 0 ? "#ffd98a" : "#ff5c39";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      b.hit = Math.max(0, b.hit - 0.02);
    }

    for (const f of flippers) {
      const e = flipperEnd(f);
      ctx.strokeStyle = "#ff5c39";
      ctx.lineWidth = 15;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(f.pivot.x, f.pivot.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.strokeStyle = "#ffb03a";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#2a2038";
      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // lançador
    if (state === STATE.READY) {
      ctx.fillStyle = "#5ec9a7";
      ctx.fillRect(378, 668 + plunger * 34, 16, 40);
      ctx.fillStyle = "rgba(94,201,167,0.35)";
      ctx.fillRect(378, 700, 16, 6);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of sparks) {
      ctx.globalAlpha = A.clamp(s.life / s.max, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // rastro da bola
    for (let i = trail.length - 1; i >= 0; i--) {
      ctx.globalAlpha = (1 - i / trail.length) * 0.28;
      ctx.fillStyle = "#9fb0c8";
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, BALL_R * (1 - i / trail.length) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // bola
    const bg = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#8b93a6");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // placar
    ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(244,242,239,0.95)";
    ctx.fillText(A.fmt(score), 24, 54);
    ctx.font = "600 13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#ff5c39";
    ctx.fillText("●".repeat(Math.max(0, balls)), 24, 86);
    if (combo >= 5) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffb03a";
      ctx.fillText("x" + (1 + Math.floor(combo / 5)), TW - 24, 86);
    }

    if (state === STATE.READY) {
      ctx.font = "600 15px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(244,242,239,0.8)";
      ctx.fillText("Segure espaço para carregar e solte para lançar", TW / 2, TH * 0.66);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,220,150,${flash * 0.35})`;
      ctx.fillRect(0, 0, TW, TH);
    }
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.onPress((code) => {
    if (code !== "Enter") return;
    if (state === STATE.MENU || state === STATE.OVER) play();
  });

  // Cada metade da tela aciona uma palheta. Com captura, soltar o dedo
  // fora do canvas ainda solta a palheta — antes ela ficava travada em cima.
  A.bindPointer(view, {
    down(p) {
      if (state === STATE.MENU || state === STATE.OVER) return;
      if (state === STATE.READY) return A.keys.press("Space");
      A.keys.press(p.x < view.w / 2 ? "ArrowLeft" : "ArrowRight");
    },
    up() {
      A.keys.release("Space");
      A.keys.release("ArrowLeft");
      A.keys.release("ArrowRight");
    },
  });

  resetTargets();
  A.loop(update, draw);
})();
