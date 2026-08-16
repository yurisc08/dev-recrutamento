/* Invasores - nave contra uma formacao que desce em ondas. */
(() => {
  "use strict";

  const A = window.Arcade;

  const COLS = 7;
  const ROWS = 4;
  const E_W = 26;
  const E_H = 18;
  const GAP_X = 40;
  const GAP_Y = 32;

  const SHIP_W = 30;
  const SHIP_H = 16;
  const SHIP_SPEED = 240;
  const SHOT_SPEED = 420;
  const COOLDOWN = 0.32;

  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 420, minH: 480 });
  const ctx = view.ctx;
  const shell = A.mountShell("invasores");

  // O mundo acompanha a tela: tudo abaixo le view.w / view.h a cada quadro.
  const W = () => view.w;
  const H = () => view.h;
  const SHIP_Y = () => view.h - view.h * 0.09;

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    score: document.getElementById("r-score"),
    wave: document.getElementById("r-wave"),
    record: document.getElementById("record"),
  };

  const STATE = { MENU: "menu", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  let shipX = W() / 2;
  let enemies = [];
  let shots = [];
  let bombs = [];
  let particles = [];
  let stars = [];
  let score = 0;
  let lives = 3;
  let wave = 1;
  let dir = 1;
  let cooldown = 0;
  let bombTimer = 0;
  let hurt = 0;

  function makeStars() {
    stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({ x: A.rand(0, W()), y: A.rand(0, H()), s: A.rand(0.25, 1), r: A.rand(0.6, 1.6) });
    }
  }

  function buildWave() {
    enemies = [];
    const left = (W() - (COLS - 1) * GAP_X) / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        enemies.push({
          x: left + c * GAP_X,
          y: 62 + r * GAP_Y,
          kind: r === 0 ? 2 : r === 1 ? 1 : 0,
          points: r === 0 ? 30 : r === 1 ? 20 : 10,
          alive: true,
        });
      }
    }
    dir = 1;
  }

  function reset() {
    shipX = W() / 2;
    shots = [];
    bombs = [];
    particles = [];
    score = 0;
    lives = 3;
    wave = 1;
    cooldown = 0;
    bombTimer = 0;
    hurt = 0;
    buildWave();
  }

  /** Velocidade horizontal cresce conforme a formacao diminui e a onda sobe. */
  function marchSpeed() {
    const alive = enemies.filter((e) => e.alive).length;
    const total = COLS * ROWS;
    return 22 + (1 - alive / total) * 66 + (wave - 1) * 9;
  }

  function shoot() {
    if (state !== STATE.PLAY || cooldown > 0) return;
    shots.push({ x: shipX, y: SHIP_Y() - 10 });
    cooldown = COOLDOWN;
    A.sfx.shoot();
  }

  function boom(x, y, color, n) {
    for (let i = 0; i < (n || 12); i++) {
      const a = A.rand(0, Math.PI * 2);
      const sp = A.rand(30, 150);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: A.rand(0.25, 0.6),
        max: 0.6,
        color,
      });
    }
  }

  function hitShip() {
    lives--;
    hurt = 0.6;
    boom(shipX, SHIP_Y(), "#3fd8ff", 20);
    A.sfx.explode();
    bombs = [];
    if (lives <= 0) finish("Nave destruída");
  }

  function finish(title) {
    state = STATE.OVER;
    const record = shell.submit(score);
    el.overTitle.textContent = title;
    el.score.textContent = A.fmt(score);
    el.wave.textContent = String(wave);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // --------------------------------------------------------------- update

  function update(dt) {
    for (const s of stars) {
      s.y += s.s * 22 * dt;
      if (s.y > H()) {
        s.y = 0;
        s.x = A.rand(0, W());
      }
    }

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (state !== STATE.PLAY) return;

    hurt = Math.max(0, hurt - dt);
    cooldown = Math.max(0, cooldown - dt);

    const move = (A.keys.down("ArrowRight", "KeyD") ? 1 : 0) - (A.keys.down("ArrowLeft", "KeyA") ? 1 : 0);
    shipX = A.clamp(shipX + move * SHIP_SPEED * dt, SHIP_W / 2, W() - SHIP_W / 2);
    if (A.keys.down("Space")) shoot();

    // formacao anda de lado e desce ao encostar na borda
    const alive = enemies.filter((e) => e.alive);
    if (!alive.length) {
      wave++;
      score += 150;
      A.sfx.power();
      buildWave();
      return;
    }

    const speed = marchSpeed();
    let bumped = false;
    for (const e of alive) {
      e.x += dir * speed * dt;
      if (e.x < 16 || e.x > W() - 16) bumped = true;
    }
    if (bumped) {
      dir *= -1;
      for (const e of alive) {
        e.x += dir * speed * dt * 2;
        e.y += 15;
      }
      A.sfx.blip();
    }

    // quem chega embaixo encerra a partida
    if (alive.some((e) => e.y + E_H / 2 >= SHIP_Y() - 6)) return finish("Eles chegaram!");

    // tiros do jogador
    for (const s of shots) s.y -= SHOT_SPEED * dt;
    shots = shots.filter((s) => s.y > -10);
    for (const s of shots) {
      for (const e of alive) {
        if (Math.abs(s.x - e.x) < E_W / 2 + 2 && Math.abs(s.y - e.y) < E_H / 2 + 3) {
          e.alive = false;
          s.y = -99;
          score += e.points;
          boom(e.x, e.y, ["#ff2e88", "#b5179e", "#4ad66d"][e.kind]);
          A.sfx.explode();
          break;
        }
      }
    }
    shots = shots.filter((s) => s.y > -10);

    // bombas inimigas
    bombTimer -= dt;
    if (bombTimer <= 0) {
      bombTimer = Math.max(0.32, 1.5 - wave * 0.1) * A.rand(0.6, 1.5);
      // so a fileira de baixo de cada coluna atira
      const shooters = {};
      for (const e of alive) {
        const key = Math.round(e.x);
        if (!shooters[key] || e.y > shooters[key].y) shooters[key] = e;
      }
      const list = Object.values(shooters);
      if (list.length) {
        const from = list[A.randInt(0, list.length - 1)];
        bombs.push({ x: from.x, y: from.y + E_H / 2 });
      }
    }
    const bombSpeed = 150 + wave * 12;
    for (const b of bombs) b.y += bombSpeed * dt;
    bombs = bombs.filter((b) => b.y < H() + 10);

    if (hurt <= 0) {
      for (const b of bombs) {
        if (Math.abs(b.x - shipX) < SHIP_W / 2 && Math.abs(b.y - SHIP_Y()) < SHIP_H) {
          b.y = H() + 99;
          hitShip();
          break;
        }
      }
      bombs = bombs.filter((b) => b.y < H() + 10);
    }
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, W(), H());

    for (const s of stars) {
      ctx.fillStyle = `rgba(200,220,255,${0.25 + s.s * 0.5})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // superficie a defender
    ctx.fillStyle = "#14204a";
    ctx.fillRect(0, H() - 16, W(), 16);
    ctx.fillStyle = "#1d2c63";
    for (let x = 0; x < W(); x += 18) ctx.fillRect(x, H() - 20, 10, 5);

    for (const e of enemies) {
      if (e.alive) drawEnemy(e);
    }

    ctx.fillStyle = "#ffd166";
    for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 10);

    ctx.fillStyle = "#ff2e88";
    for (const b of bombs) {
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of particles) {
      ctx.globalAlpha = A.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    if (state === STATE.PLAY && (hurt <= 0 || Math.floor(hurt * 12) % 2 === 0)) drawShip();

    // hud
    ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(238,241,251,0.9)";
    ctx.fillText(A.fmt(score), 12, 12);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(148,160,192,0.9)";
    ctx.fillText("ONDA " + wave, W() / 2, 12);
    ctx.textAlign = "right";
    ctx.fillStyle = "#3fd8ff";
    ctx.fillText("▲".repeat(Math.max(0, lives)), W() - 12, 12);
  }

  function drawEnemy(e) {
    const wob = Math.floor(performance.now() / 340) % 2 === 0 ? 1 : -1;
    const colors = ["#4ad66d", "#b5179e", "#ff2e88"];
    ctx.fillStyle = colors[e.kind];
    const x = e.x - E_W / 2;
    const y = e.y - E_H / 2;

    ctx.fillRect(x + 5, y + 2, E_W - 10, E_H - 7);
    ctx.fillRect(x + 2, y + 6, E_W - 4, 6);
    // antenas / pernas alternando, dando a animacao de marcha
    ctx.fillRect(x, y + 9 + wob, 3, 5);
    ctx.fillRect(x + E_W - 3, y + 9 - wob, 3, 5);
    ctx.fillRect(x + 6, y + E_H - 5, 4, 4);
    ctx.fillRect(x + E_W - 10, y + E_H - 5, 4, 4);

    ctx.fillStyle = "#05070f";
    ctx.fillRect(x + 8, y + 5, 3.5, 3.5);
    ctx.fillRect(x + E_W - 11.5, y + 5, 3.5, 3.5);
  }

  function drawShip() {
    const x = shipX;
    const y = SHIP_Y();
    ctx.fillStyle = "#3fd8ff";
    ctx.beginPath();
    ctx.moveTo(x, y - SHIP_H / 2 - 4);
    ctx.lineTo(x + SHIP_W / 2, y + SHIP_H / 2);
    ctx.lineTo(x + SHIP_W / 2 - 7, y + SHIP_H / 2);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - SHIP_W / 2 + 7, y + SHIP_H / 2);
    ctx.lineTo(x - SHIP_W / 2, y + SHIP_H / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8ecf8";
    ctx.fillRect(x - 2, y - SHIP_H / 2 - 2, 4, 8);

    // chama do motor
    const f = 4 + Math.sin(performance.now() / 55) * 3;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(x - 4, y + SHIP_H / 2);
    ctx.lineTo(x, y + SHIP_H / 2 + f);
    ctx.lineTo(x + 4, y + SHIP_H / 2);
    ctx.closePath();
    ctx.fill();
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
    if (state === STATE.MENU || state === STATE.OVER) play();
  });

  // O ponteiro move a nave e o toque também atira. Antes o mouse só
  // funcionava com o botão apertado, e no desktop parecia que a nave
  // tinha travado.
  const aim = (p) => {
    if (state !== STATE.PLAY) return;
    shipX = A.clamp(p.x, SHIP_W / 2, W() - SHIP_W / 2);
  };

  A.bindPointer(view, {
    down(p) {
      aim(p);
      A.keys.press("Space");
    },
    move: aim,
    up() {
      A.keys.release("Space");
    },
  });

  makeStars();
  reset();
  A.loop(update, draw);
})();
