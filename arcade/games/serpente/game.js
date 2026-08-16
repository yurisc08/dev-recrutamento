/* Serpente Neon - o jogo da cobrinha com visual de circuito. */
(() => {
  "use strict";

  const A = window.Arcade;
  const CELL = 20;
  const COLS = 21;
  const ROWS = 21;
  const W = COLS * CELL;
  const H = ROWS * CELL;

  const START_STEP = 0.15;   // segundos por movimento
  const MIN_STEP = 0.062;

  const canvas = document.getElementById("c");
  const ctx = A.fitCanvas(canvas, W, H);
  const shell = A.mountShell("serpente");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    score: document.getElementById("r-score"),
    len: document.getElementById("r-len"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", PLAY: "play", DEAD: "dead" };
  let state = STATE.MENU;

  let snake = [];
  let dir = { x: 1, y: 0 };
  let queued = [];           // viradas pedidas antes do proximo passo
  let food = { x: 0, y: 0 };
  let score = 0;
  let timer = 0;
  let stepTime = START_STEP;
  let pulse = 0;
  let deathAt = 0;

  function reset() {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    queued = [];
    score = 0;
    timer = 0;
    stepTime = START_STEP;
    placeFood();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free.length ? free[A.randInt(0, free.length - 1)] : { x: -1, y: -1 };
  }

  /** Enfileira uma virada, ignorando a inversao de 180 graus. */
  function turn(x, y) {
    const last = queued.length ? queued[queued.length - 1] : dir;
    if (last.x === -x && last.y === -y) return;
    if (last.x === x && last.y === y) return;
    if (queued.length < 2) queued.push({ x, y });
  }

  function step() {
    if (queued.length) dir = queued.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return die();
    // a cauda sai no mesmo passo, entao bater nela nao mata
    if (snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      stepTime = Math.max(MIN_STEP, START_STEP - snake.length * 0.0032);
      A.sfx.pickup();
      pulse = 1;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    state = STATE.DEAD;
    deathAt = performance.now();
    A.sfx.hit();
    setTimeout(() => A.sfx.over(), 140);

    const record = shell.submit(score);
    el.score.textContent = A.fmt(score);
    el.len.textContent = String(snake.length);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    setTimeout(() => el.over.classList.remove("hidden"), 520);
  }

  function update(dt) {
    pulse = Math.max(0, pulse - dt * 2.2);
    if (state !== STATE.PLAY) return;

    if (A.keys.down("ArrowUp", "KeyW")) turn(0, -1);
    if (A.keys.down("ArrowDown", "KeyS")) turn(0, 1);
    if (A.keys.down("ArrowLeft", "KeyA")) turn(-1, 0);
    if (A.keys.down("ArrowRight", "KeyD")) turn(1, 0);

    timer += dt;
    while (timer >= stepTime) {
      timer -= stepTime;
      if (state === STATE.PLAY) step();
    }
  }

  // ---------------------------------------------------------------- desenho

  function draw() {
    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, W, H);

    // grade de circuito
    ctx.strokeStyle = "rgba(76,201,240,0.09)";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, H);
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(W, i * CELL);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(76,201,240,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    drawFood();
    drawSnake();

    if (state === STATE.PLAY || state === STATE.DEAD) {
      ctx.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(232,236,248,0.85)";
      ctx.fillText(A.fmt(score), 12, 10);
    }
  }

  function drawFood() {
    if (food.x < 0) return;
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const r = CELL * 0.34 * (1 + Math.sin(performance.now() / 200) * 0.1);
    ctx.save();
    ctx.shadowColor = "#f72585";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#f72585";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake() {
    const dying = state === STATE.DEAD;
    const blink = dying && Math.floor((performance.now() - deathAt) / 90) % 2 === 0;

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const head = i === 0;
      const t = 1 - i / (snake.length + 4);
      const x = s.x * CELL;
      const y = s.y * CELL;
      const pad = head ? 1.5 : 2.5;

      ctx.save();
      if (head) {
        ctx.shadowColor = "#4cc9f0";
        ctx.shadowBlur = 14 + pulse * 12;
      }
      ctx.fillStyle = blink
        ? "#ff5c6c"
        : `rgb(${Math.round(60 + 20 * t)}, ${Math.round(150 + 70 * t)}, ${Math.round(200 + 40 * t)})`;
      roundRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, head ? 6 : 4);
      ctx.fill();
      ctx.restore();

      if (head) {
        // olhos apontando para onde a cobra vai
        ctx.fillStyle = "#061018";
        const ex = dir.x * 3.4;
        const ey = dir.y * 3.4;
        const px = -dir.y * 3.6;
        const py = dir.x * 3.6;
        const cx = x + CELL / 2 + ex;
        const cy = y + CELL / 2 + ey;
        ctx.beginPath();
        ctx.arc(cx + px, cy + py, 2, 0, Math.PI * 2);
        ctx.arc(cx - px, cy - py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    state = STATE.PLAY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.onPress((code) => {
    if (state !== STATE.MENU && state !== STATE.DEAD) return;
    if (code === "Space" || code === "Enter") {
      if (state === STATE.MENU || !el.over.classList.contains("hidden")) play();
    }
  });

  // deslizar o dedo tambem vira a cobra
  let swipe = null;
  canvas.addEventListener("pointerdown", (e) => {
    swipe = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0);
    else turn(0, Math.sign(dy));
  });

  reset();
  A.loop(update, draw);
})();
