/* Quebra-Blocos - raquete, bola e paredes de blocos, em tela cheia.
   A parede GANHA COLUNAS em telas largas em vez de esticar os blocos. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 520, minH: 340 });
  const ctx = view.ctx;
  const shell = A.mountShell("blocos");

  const ROWS = 6;
  const BRICK_H = 17;
  const BRICK_GAP = 3;
  const TARGET_BRICK_W = 62;
  const PADDLE_H = 12;
  const BALL_R = 6;
  const BASE_SPEED = 235;
  const COLORS = ["#ff2e88", "#b5179e", "#7209b7", "#4361ee", "#3fd8ff", "#4ad66d"];

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    score: document.getElementById("r-score"),
    level: document.getElementById("r-level"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", SERVE: "serve", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  let cols = 8;
  let brickW = TARGET_BRICK_W;
  let brickLeft = 0;
  let paddleW = 96;
  let paddleY = 0;

  let paddleX = 0;
  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let bricks = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  let shake = 0;

  function layout() {
    cols = A.clamp(Math.round(view.w / TARGET_BRICK_W), 6, 16);
    const usable = view.w * 0.92;
    brickW = usable / cols - BRICK_GAP;
    brickLeft = (view.w - cols * (brickW + BRICK_GAP)) / 2;
    paddleW = A.clamp(view.w * 0.16, 70, 150);
    paddleY = view.h - 34;
    paddleX = A.clamp(paddleX || view.w / 2, paddleW / 2, view.w - paddleW / 2);
    if (bricks.length) positionBricks();
  }

  /** Recoloca a parede quando a tela muda de tamanho no meio da partida. */
  function positionBricks() {
    for (const b of bricks) {
      b.x = brickLeft + b.col * (brickW + BRICK_GAP);
      b.y = view.h * 0.12 + b.row * (BRICK_H + 5);
      b.w = brickW;
    }
  }

  view.onResize(layout);
  layout();

  function buildLevel() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        if (level > 1 && (r * cols + c + level) % 11 === 0) continue;
        bricks.push({
          col: c, row: r, x: 0, y: 0, w: brickW,
          color: COLORS[r % COLORS.length],
          points: (ROWS - r) * 5,
          alive: true,
        });
      }
    }
    positionBricks();
  }

  function serve() {
    state = STATE.SERVE;
    ball.x = paddleX;
    ball.y = paddleY - BALL_R - 2;
    ball.vx = 0;
    ball.vy = 0;
  }

  function launch() {
    if (state !== STATE.SERVE) return;
    const speed = BASE_SPEED + (level - 1) * 24;
    const angle = -Math.PI / 2 + A.rand(-0.5, 0.5);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    state = STATE.PLAY;
    A.sfx.blip();
  }

  function reset() {
    score = 0;
    lives = 3;
    level = 1;
    particles = [];
    layout();
    buildLevel();
    serve();
  }

  function bounceOffPaddle() {
    const rel = A.clamp((ball.x - paddleX) / (paddleW / 2), -1, 1);
    const speed = Math.max(Math.hypot(ball.vx, ball.vy), BASE_SPEED);
    const angle = -Math.PI / 2 + rel * 1.05;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.y = paddleY - BALL_R - 0.1;
    A.sfx.bounce();
  }

  function hitBrick(b) {
    b.alive = false;
    score += b.points;
    shake = 0.12;
    A.sfx.blip();
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: b.x + b.w / 2, y: b.y + BRICK_H / 2,
        vx: A.rand(-100, 100), vy: A.rand(-100, 40),
        life: A.rand(0.25, 0.55), max: 0.55, color: b.color,
      });
    }
    if (!bricks.some((k) => k.alive)) {
      level++;
      score += 100;
      A.sfx.power();
      buildLevel();
      serve();
    }
  }

  function loseLife() {
    lives--;
    A.sfx.hit();
    if (lives <= 0) return finish("Fim de jogo");
    shake = 0.25;
    serve();
  }

  function finish(title) {
    state = STATE.OVER;
    const record = shell.submit(score);
    el.overTitle.textContent = title;
    el.score.textContent = A.fmt(score);
    el.level.textContent = String(level);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  function update(dt) {
    shake = Math.max(0, shake - dt);
    for (const p of particles) {
      p.vy += 440 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (state === STATE.MENU || state === STATE.OVER) return;

    const kb = (A.keys.down("ArrowRight", "KeyD") ? 1 : 0) - (A.keys.down("ArrowLeft", "KeyA") ? 1 : 0);
    if (kb) paddleX += kb * 420 * dt;
    paddleX = A.clamp(paddleX, paddleW / 2, view.w - paddleW / 2);

    if (state === STATE.SERVE) {
      ball.x = paddleX;
      ball.y = paddleY - BALL_R - 2;
      return;
    }

    // passos menores evitam a bola atravessar um bloco em alta velocidade
    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
        A.sfx.bounce();
      } else if (ball.x + BALL_R > view.w) {
        ball.x = view.w - BALL_R;
        ball.vx = -Math.abs(ball.vx);
        A.sfx.bounce();
      }
      if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        A.sfx.bounce();
      }

      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= paddleY &&
        ball.y - BALL_R <= paddleY + PADDLE_H &&
        ball.x >= paddleX - paddleW / 2 - BALL_R &&
        ball.x <= paddleX + paddleW / 2 + BALL_R
      ) bounceOffPaddle();

      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + BALL_R < b.x || ball.x - BALL_R > b.x + b.w ||
          ball.y + BALL_R < b.y || ball.y - BALL_R > b.y + BRICK_H
        ) continue;

        const ox = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
        const oy = Math.min(ball.y + BALL_R - b.y, b.y + BRICK_H - (ball.y - BALL_R));
        if (ox < oy) {
          ball.vx = -ball.vx;
          ball.x += ball.vx > 0 ? ox : -ox;
        } else {
          ball.vy = -ball.vy;
          ball.y += ball.vy > 0 ? oy : -oy;
        }
        hitBrick(b);
        break;
      }

      if (ball.y - BALL_R > view.h) return loseLife();
    }
  }

  function draw() {
    const w = view.w;
    const h = view.h;

    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-2, 2) * shake * 8, A.rand(-2, 2) * shake * 8);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0d1430");
    g.addColorStop(1, "#05070f");
    ctx.fillStyle = g;
    ctx.fillRect(-14, -14, w + 28, h + 28);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, BRICK_H);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(b.x, b.y, b.w, 3);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(b.x, b.y + BRICK_H - 3, b.w, 3);
    }

    for (const p of particles) {
      ctx.globalAlpha = A.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    const pg = ctx.createLinearGradient(paddleX - paddleW / 2, 0, paddleX + paddleW / 2, 0);
    pg.addColorStop(0, "#3fd8ff");
    pg.addColorStop(1, "#ff2e88");
    ctx.fillStyle = pg;
    ctx.fillRect(paddleX - paddleW / 2, paddleY, paddleW, PADDLE_H);

    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(238,241,251,0.9)";
    ctx.fillText(A.fmt(score), 16, h * 0.055);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(148,160,192,0.9)";
    ctx.fillText("FASE " + level, w / 2, h * 0.055);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff2e88";
    ctx.fillText("♥".repeat(Math.max(0, lives)), w - 16, h * 0.055);

    if (state === STATE.SERVE) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(238,241,251,0.85)";
      ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("Clique, toque ou aperte espaço para lançar", w / 2, paddleY - 40);
    }

    ctx.restore();
  }

  function play() {
    reset();
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  function movePaddle(p) {
    if (state === STATE.MENU || state === STATE.OVER) return;
    paddleX = A.clamp(p.x, paddleW / 2, view.w - paddleW / 2);
  }

  A.bindPointer(view, {
    down(p) {
      movePaddle(p);
      launch();
    },
    move: movePaddle,
  });

  A.onPress((code) => {
    if (code !== "Space" && code !== "Enter") return;
    if (state === STATE.MENU || state === STATE.OVER) play();
    else launch();
  });

  serve();
  A.loop(update, draw);
})();
