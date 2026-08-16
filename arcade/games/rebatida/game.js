/* Rebatida - duelo de raquetes contra o computador. */
(() => {
  "use strict";

  const A = window.Arcade;
  const W = 640;
  const H = 400;

  const PAD_W = 11;
  const PAD_H = 74;
  const PAD_MARGIN = 26;
  const BALL_R = 7;
  const BASE_SPEED = 300;
  const WIN_SCORE = 7;
  const PLAYER_SPEED = 400;

  const LEVELS = [
    { key: "facil", name: "Fácil", speed: 250, error: 46 },
    { key: "medio", name: "Médio", speed: 330, error: 24 },
    { key: "dificil", name: "Difícil", speed: 430, error: 9 },
  ];

  const canvas = document.getElementById("c");
  const ctx = A.fitCanvas(canvas, W, H);
  const shell = A.mountShell("rebatida");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    levels: document.getElementById("levels"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    you: document.getElementById("r-you"),
    cpu: document.getElementById("r-cpu"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", SERVE: "serve", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  let levelKey = A.store.get("rebatida.nivel", "medio");
  if (!LEVELS.some((l) => l.key === levelKey)) levelKey = "medio";
  const level = () => LEVELS.find((l) => l.key === levelKey);

  let playerY = H / 2;
  let cpuY = H / 2;
  let cpuTarget = H / 2;
  let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  let scoreYou = 0;
  let scoreCpu = 0;
  let serveTimer = 0;
  let serveDir = 1;
  let trail = [];

  function reset() {
    scoreYou = 0;
    scoreCpu = 0;
    playerY = cpuY = H / 2;
    serveDir = Math.random() < 0.5 ? -1 : 1;
    startServe();
  }

  function startServe() {
    state = STATE.SERVE;
    serveTimer = 0.85;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = 0;
    ball.vy = 0;
    trail = [];
  }

  function launch() {
    const angle = A.rand(-0.42, 0.42);
    ball.vx = Math.cos(angle) * BASE_SPEED * serveDir;
    ball.vy = Math.sin(angle) * BASE_SPEED;
    state = STATE.PLAY;
    A.sfx.blip();
  }

  function point(toPlayer) {
    if (toPlayer) scoreYou++;
    else scoreCpu++;
    A.sfx.hit();
    serveDir = toPlayer ? 1 : -1;

    if (scoreYou >= WIN_SCORE || scoreCpu >= WIN_SCORE) return finish();
    startServe();
  }

  function finish() {
    state = STATE.OVER;
    const won = scoreYou > scoreCpu;
    el.overTitle.textContent = won ? "Você venceu! 🏆" : "O computador venceu";
    el.you.textContent = String(scoreYou);
    el.cpu.textContent = String(scoreCpu);

    let record = false;
    if (won) {
      // o "recorde" aqui e o total de vitorias acumuladas
      const wins = A.getBest("rebatida") + 1;
      A.store.set("arcade.best.rebatida", wins);
      shell.refresh();
      record = true;
    }
    el.record.textContent = record ? `Vitórias acumuladas: ${A.getBest("rebatida")}` : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  /** Reflete a bola numa raquete, usando o ponto de contato como ângulo. */
  function bounce(padY, fromLeft) {
    const rel = A.clamp((ball.y - padY) / (PAD_H / 2), -1, 1);
    const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05, 640);
    const angle = rel * 0.92;
    ball.vx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
    ball.vy = Math.sin(angle) * speed;
    ball.x = fromLeft ? PAD_MARGIN + PAD_W + BALL_R : W - PAD_MARGIN - PAD_W - BALL_R;
    A.sfx.bounce();
  }

  function update(dt) {
    if (state === STATE.MENU || state === STATE.OVER) return;

    const move = (A.keys.down("ArrowDown", "KeyS") ? 1 : 0) - (A.keys.down("ArrowUp", "KeyW") ? 1 : 0);
    if (move) playerY += move * PLAYER_SPEED * dt;
    playerY = A.clamp(playerY, PAD_H / 2, H - PAD_H / 2);

    // a CPU mira num ponto com erro proprio do nivel, e so reage quando a
    // bola vem na direcao dela
    const L = level();
    if (ball.vx > 0) {
      const travel = (W - PAD_MARGIN - ball.x) / Math.max(ball.vx, 1);
      cpuTarget = ball.y + ball.vy * travel * 0.55;
      cpuTarget = A.clamp(cpuTarget, PAD_H / 2, H - PAD_H / 2);
    } else {
      cpuTarget = A.lerp(cpuTarget, H / 2, dt * 0.8);
    }
    const diff = cpuTarget - cpuY;
    if (Math.abs(diff) > L.error * 0.35) {
      cpuY += A.clamp(diff, -L.speed * dt, L.speed * dt);
    }
    cpuY = A.clamp(cpuY, PAD_H / 2, H - PAD_H / 2);

    if (state === STATE.SERVE) {
      serveTimer -= dt;
      ball.x = W / 2;
      ball.y = H / 2;
      if (serveTimer <= 0) launch();
      return;
    }

    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        A.sfx.blip();
      } else if (ball.y + BALL_R > H) {
        ball.y = H - BALL_R;
        ball.vy = -Math.abs(ball.vy);
        A.sfx.blip();
      }

      if (
        ball.vx < 0 &&
        ball.x - BALL_R <= PAD_MARGIN + PAD_W &&
        ball.x > PAD_MARGIN &&
        Math.abs(ball.y - playerY) < PAD_H / 2 + BALL_R
      ) {
        bounce(playerY, true);
      }

      if (
        ball.vx > 0 &&
        ball.x + BALL_R >= W - PAD_MARGIN - PAD_W &&
        ball.x < W - PAD_MARGIN &&
        Math.abs(ball.y - cpuY) < PAD_H / 2 + BALL_R
      ) {
        bounce(cpuY, false);
      }

      if (ball.x < -20) return point(false);
      if (ball.x > W + 20) return point(true);
    }

    trail.unshift({ x: ball.x, y: ball.y });
    if (trail.length > 10) trail.pop();
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1330");
    g.addColorStop(1, "#060a18");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // rede central
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (let y = 8; y < H; y += 26) ctx.fillRect(W / 2 - 2, y, 4, 14);

    ctx.strokeStyle = "rgba(76,201,240,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // placar
    ctx.font = "bold 46px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(232,236,248,0.2)";
    ctx.fillText(String(scoreYou), W / 2 - 62, 22);
    ctx.fillText(String(scoreCpu), W / 2 + 62, 22);

    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(148,160,192,0.6)";
    ctx.fillText("VOCÊ", W / 2 - 62, 74);
    ctx.fillText("CPU", W / 2 + 62, 74);

    for (let i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (1 - i / trail.length) * 0.35;
      ctx.fillStyle = "#4cc9f0";
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, BALL_R * (1 - i / trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    paddle(PAD_MARGIN, playerY, "#4cc9f0");
    paddle(W - PAD_MARGIN - PAD_W, cpuY, "#f72585");

    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state === STATE.SERVE) {
      ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "rgba(232,236,248,0.75)";
      ctx.textAlign = "center";
      ctx.fillText("Preparar…", W / 2, H - 46);
    }
  }

  function paddle(x, cy, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    const y = cy - PAD_H / 2;
    const r = 5;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + PAD_W, y, x + PAD_W, y + PAD_H, r);
    ctx.arcTo(x + PAD_W, y + PAD_H, x, y + PAD_H, r);
    ctx.arcTo(x, y + PAD_H, x, y, r);
    ctx.arcTo(x, y, x + PAD_W, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ----------------------------------------------------------------- fluxo

  function buildLevels() {
    el.levels.innerHTML = "";
    for (const L of LEVELS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "back";
      b.textContent = L.name;
      b.setAttribute("aria-pressed", String(L.key === levelKey));
      if (L.key === levelKey) {
        b.style.borderColor = "#4cc9f0";
        b.style.background = "rgba(76,201,240,0.2)";
      }
      b.addEventListener("click", () => {
        levelKey = L.key;
        A.store.set("rebatida.nivel", L.key);
        buildLevels();
        A.sfx.blip();
      });
      el.levels.appendChild(b);
    }
  }

  function play() {
    reset();
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.onPress((code) => {
    if (code !== "Space" && code !== "Enter") return;
    if (state === STATE.MENU || state === STATE.OVER) play();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (state === STATE.MENU || state === STATE.OVER) return;
    if (e.pointerType === "mouse" && !e.buttons && !e.isPrimary) return;
    playerY = A.clamp(A.pointerPos(canvas, e, W, H).y, PAD_H / 2, H - PAD_H / 2);
  });

  buildLevels();
  A.loop(update, draw);
})();
