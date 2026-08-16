/* Quebra-Blocos - raquete, bola e paredes de blocos. */
(() => {
  "use strict";

  const A = window.Arcade;
  const W = 480;
  const H = 360;

  const COLS = 10;
  const ROWS = 6;
  const BRICK_W = 42;
  const BRICK_H = 15;
  const BRICK_TOP = 46;
  const BRICK_LEFT = (W - COLS * (BRICK_W + 2)) / 2;

  const PADDLE_W = 76;
  const PADDLE_H = 11;
  const PADDLE_Y = H - 28;
  const BALL_R = 5.5;
  const BASE_SPEED = 210;

  const COLORS = ["#f72585", "#b5179e", "#7209b7", "#4361ee", "#4cc9f0", "#4ad66d"];

  const canvas = document.getElementById("c");
  const ctx = A.fitCanvas(canvas, W, H);
  const shell = A.mountShell("blocos");

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

  let paddleX = W / 2;
  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let bricks = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  let shake = 0;

  function buildLevel() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // a partir da fase 2 aparecem buracos, mudando o desenho da parede
        if (level > 1 && (r * COLS + c + level) % 11 === 0) continue;
        bricks.push({
          x: BRICK_LEFT + c * (BRICK_W + 2),
          y: BRICK_TOP + r * (BRICK_H + 4),
          color: COLORS[r % COLORS.length],
          points: (ROWS - r) * 5,
          alive: true,
        });
      }
    }
  }

  function serve() {
    state = STATE.SERVE;
    ball.x = paddleX;
    ball.y = PADDLE_Y - BALL_R - 2;
    ball.vx = 0;
    ball.vy = 0;
  }

  function launch() {
    if (state !== STATE.SERVE) return;
    const speed = BASE_SPEED + (level - 1) * 22;
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
    paddleX = W / 2;
    particles = [];
    buildLevel();
    serve();
  }

  // --------------------------------------------------------------- colisao

  function bounceOffPaddle() {
    // o ponto da raquete define o angulo de saida
    const rel = A.clamp((ball.x - paddleX) / (PADDLE_W / 2), -1, 1);
    const speed = Math.max(Math.hypot(ball.vx, ball.vy), BASE_SPEED);
    const angle = -Math.PI / 2 + rel * 1.05;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.y = PADDLE_Y - BALL_R - 0.1;
    A.sfx.bounce();
  }

  function hitBrick(b) {
    b.alive = false;
    score += b.points;
    shake = 0.12;
    A.sfx.blip();
    for (let i = 0; i < 7; i++) {
      particles.push({
        x: b.x + BRICK_W / 2,
        y: b.y + BRICK_H / 2,
        vx: A.rand(-90, 90),
        vy: A.rand(-90, 40),
        life: A.rand(0.25, 0.55),
        max: 0.55,
        color: b.color,
      });
    }
    if (!bricks.some((k) => k.alive)) nextLevel();
  }

  function nextLevel() {
    level++;
    score += 100;
    A.sfx.power();
    buildLevel();
    serve();
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

  // --------------------------------------------------------------- update

  function update(dt) {
    shake = Math.max(0, shake - dt);

    for (const p of particles) {
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (state === STATE.MENU || state === STATE.OVER) return;

    // teclado move a raquete; o ponteiro e tratado no evento
    const kb = (A.keys.down("ArrowRight", "KeyD") ? 1 : 0) - (A.keys.down("ArrowLeft", "KeyA") ? 1 : 0);
    if (kb) paddleX += kb * 340 * dt;
    paddleX = A.clamp(paddleX, PADDLE_W / 2, W - PADDLE_W / 2);

    if (state === STATE.SERVE) {
      ball.x = paddleX;
      ball.y = PADDLE_Y - BALL_R - 2;
      return;
    }

    // passos menores evitam que a bola atravesse um bloco em alta velocidade
    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
        A.sfx.bounce();
      } else if (ball.x + BALL_R > W) {
        ball.x = W - BALL_R;
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
        ball.y + BALL_R >= PADDLE_Y &&
        ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
        ball.x >= paddleX - PADDLE_W / 2 - BALL_R &&
        ball.x <= paddleX + PADDLE_W / 2 + BALL_R
      ) {
        bounceOffPaddle();
      }

      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + BALL_R < b.x ||
          ball.x - BALL_R > b.x + BRICK_W ||
          ball.y + BALL_R < b.y ||
          ball.y - BALL_R > b.y + BRICK_H
        ) continue;

        // reflete pelo lado de menor sobreposicao
        const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + BRICK_W - (ball.x - BALL_R));
        const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + BRICK_H - (ball.y - BALL_R));
        if (overlapX < overlapY) {
          ball.vx = -ball.vx;
          ball.x += ball.vx > 0 ? overlapX : -overlapX;
        } else {
          ball.vy = -ball.vy;
          ball.y += ball.vy > 0 ? overlapY : -overlapY;
        }
        hitBrick(b);
        break;
      }

      if (ball.y - BALL_R > H) {
        loseLife();
        return;
      }
    }
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-2, 2) * shake * 8, A.rand(-2, 2) * shake * 8);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0d1430");
    g.addColorStop(1, "#070a18");
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, W + 20, H + 20);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(b.x, b.y, BRICK_W, 3);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(b.x, b.y + BRICK_H - 3, BRICK_W, 3);
    }

    for (const p of particles) {
      ctx.globalAlpha = A.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // raquete
    const pg = ctx.createLinearGradient(paddleX - PADDLE_W / 2, 0, paddleX + PADDLE_W / 2, 0);
    pg.addColorStop(0, "#4cc9f0");
    pg.addColorStop(1, "#f72585");
    ctx.fillStyle = pg;
    ctx.fillRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H);

    // bola
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // hud
    ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(232,236,248,0.9)";
    ctx.fillText(A.fmt(score), 12, 12);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(148,160,192,0.9)";
    ctx.fillText("FASE " + level, W / 2, 12);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f72585";
    ctx.fillText("♥".repeat(Math.max(0, lives)), W - 12, 12);

    if (state === STATE.SERVE) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(232,236,248,0.85)";
      ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("Clique, toque ou aperte espaço para lançar", W / 2, PADDLE_Y - 34);
    }

    ctx.restore();
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  function movePaddle(e) {
    if (state === STATE.MENU || state === STATE.OVER) return;
    paddleX = A.clamp(A.pointerPos(canvas, e, W, H).x, PADDLE_W / 2, W - PADDLE_W / 2);
  }

  canvas.addEventListener("pointermove", movePaddle);
  canvas.addEventListener("pointerdown", (e) => {
    movePaddle(e);
    launch();
  });

  A.onPress((code) => {
    if (code !== "Space" && code !== "Enter") return;
    if (state === STATE.MENU) play();
    else if (state === STATE.OVER) play();
    else launch();
  });

  serve();
  A.loop(update, draw);
})();
