/* Serpente Neon - a cobrinha, dentro de um circuito luminoso.
   Em tela cheia o tabuleiro GANHA CASAS em vez de esticar as existentes:
   a casa tem tamanho fixo, entao a cobra nunca fica desproporcional. */
(() => {
  "use strict";

  const A = window.Arcade;
  const CELL = 24;
  const START_STEP = 0.15;
  const MIN_STEP = 0.062;

  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 420, minH: 380 });
  const ctx = view.ctx;
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

  let cols = 0;
  let rows = 0;
  let ox = 0;
  let oy = 0;

  let snake = [];
  let dir = { x: 1, y: 0 };
  let queued = [];
  let food = { x: 0, y: 0 };
  let score = 0;
  let timer = 0;
  let stepTime = START_STEP;
  let pulse = 0;
  let deathAt = 0;

  /** Recalcula o tabuleiro para o tamanho atual da tela. */
  function layout() {
    cols = Math.max(12, Math.floor(view.w / CELL));
    rows = Math.max(11, Math.floor(view.h / CELL));
    ox = Math.round((view.w - cols * CELL) / 2);
    oy = Math.round((view.h - rows * CELL) / 2);

    // se a tela encolheu, traz a cobra de volta para dentro
    for (const s of snake) {
      s.x = A.clamp(s.x, 0, cols - 1);
      s.y = A.clamp(s.y, 0, rows - 1);
    }
    if (food.x >= cols || food.y >= rows) placeFood();
  }

  view.onResize(layout);
  layout();

  function reset() {
    const cy = Math.floor(rows / 2);
    snake = [
      { x: 5, y: cy },
      { x: 4, y: cy },
      { x: 3, y: cy },
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
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
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

    if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) return die();
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
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(ox, oy);
    const w = cols * CELL;
    const h = rows * CELL;

    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(63,216,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, h);
    }
    for (let i = 1; i < rows; i++) {
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(w, i * CELL);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(63,216,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    drawFood();
    drawSnake();
    ctx.restore();

    if (state !== STATE.MENU) {
      ctx.font = "700 17px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(238,241,251,0.9)";
      ctx.fillText(A.fmt(score), ox + 12, oy + 10);
    }
  }

  function drawFood() {
    if (food.x < 0) return;
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const r = CELL * 0.32 * (1 + Math.sin(performance.now() / 200) * 0.1);
    ctx.save();
    ctx.shadowColor = "#ff2e88";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff2e88";
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
    const blink = state === STATE.DEAD && Math.floor((performance.now() - deathAt) / 90) % 2 === 0;

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const head = i === 0;
      const t = 1 - i / (snake.length + 4);
      const x = s.x * CELL;
      const y = s.y * CELL;
      const pad = head ? 1.5 : 2.5;

      ctx.save();
      if (head) {
        ctx.shadowColor = "#3fd8ff";
        ctx.shadowBlur = 16 + pulse * 14;
      }
      ctx.fillStyle = blink
        ? "#ff5c6c"
        : `rgb(${Math.round(55 + 20 * t)}, ${Math.round(150 + 70 * t)}, ${Math.round(205 + 40 * t)})`;
      roundRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, head ? 7 : 5);
      ctx.fill();
      ctx.restore();

      if (head) {
        ctx.fillStyle = "#061018";
        const ex = dir.x * 4;
        const ey = dir.y * 4;
        const px = -dir.y * 4.2;
        const py = dir.x * 4.2;
        const cx = x + CELL / 2 + ex;
        const cy = y + CELL / 2 + ey;
        ctx.beginPath();
        ctx.arc(cx + px, cy + py, 2.2, 0, Math.PI * 2);
        ctx.arc(cx - px, cy - py, 2.2, 0, Math.PI * 2);
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
    if (code !== "Space" && code !== "Enter") return;
    if (state === STATE.MENU) play();
    else if (state === STATE.DEAD && !el.over.classList.contains("hidden")) play();
  });

  // deslizar o dedo tambem vira a cobra
  // Deslizar vira a cobra. O giro sai já no meio do movimento: esperar o
  // dedo levantar deixava a virada atrasada demais para ser útil.
  let swipe = null;
  A.bindPointer(view, {
    down(p) {
      swipe = p;
    },
    move(p, e, apertado) {
      if (!apertado || !swipe) return;
      const dx = p.x - swipe.x;
      const dy = p.y - swipe.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0);
      else turn(0, Math.sign(dy));
      swipe = p;
    },
    up() {
      swipe = null;
    },
  });

  reset();
  A.loop(update, draw);
})();
