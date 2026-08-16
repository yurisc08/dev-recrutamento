/* Flappy Bird - HTML5 Canvas, sem dependencias. */
(() => {
  "use strict";

  // Mundo em unidades fixas; o canvas escala para caber na tela.
  const W = 360;
  const H = 640;
  const GROUND_H = 96;
  const SKY_H = H - GROUND_H;

  const GRAVITY = 1500;      // px/s^2
  const FLAP_V = -430;       // px/s
  const MAX_FALL = 620;      // px/s
  const SPEED = 130;         // px/s (rolagem do cenario)
  const PIPE_W = 62;
  const PIPE_GAP = 158;
  const PIPE_SPACING = 200;  // distancia horizontal entre canos
  const PIPE_MARGIN = 70;    // folga minima do topo/chao
  const BIRD_X = 96;
  const BIRD_R = 13;

  const STATE = { MENU: "menu", READY: "ready", PLAY: "play", DEAD: "dead" };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const el = {
    overlay: document.getElementById("overlay"),
    gameover: document.getElementById("gameover"),
    startBtn: document.getElementById("start-btn"),
    restartBtn: document.getElementById("restart-btn"),
    soundBtn: document.getElementById("sound-btn"),
    menuBest: document.getElementById("menu-best"),
    finalScore: document.getElementById("final-score"),
    finalBest: document.getElementById("final-best"),
    medal: document.getElementById("medal"),
  };

  // --- Persistencia -------------------------------------------------------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* modo privado / storage cheio: ignora */
      }
    },
  };

  let best = Number(store.get("flappy.best", 0)) || 0;
  let soundOn = store.get("flappy.sound", true) !== false;

  // --- Audio (WebAudio, sem arquivos) -------------------------------------

  let audioCtx = null;

  function beep(freq, duration, type = "square", gain = 0.05) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const vol = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      vol.gain.setValueAtTime(gain, audioCtx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(vol).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {
      /* audio indisponivel: o jogo segue mudo */
    }
  }

  const sfx = {
    flap: () => beep(620, 0.09, "square", 0.04),
    score: () => beep(880, 0.12, "triangle", 0.05),
    hit: () => beep(180, 0.22, "sawtooth", 0.06),
    die: () => beep(110, 0.35, "sawtooth", 0.05),
  };

  // --- Estado do jogo -----------------------------------------------------

  const bird = { y: 0, v: 0, rot: 0, wing: 0 };
  let pipes = [];
  let clouds = [];
  let state = STATE.MENU;
  let score = 0;
  let groundX = 0;
  let flashAlpha = 0;

  function makeClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * (SKY_H * 0.45),
        s: 0.55 + Math.random() * 0.5,
      });
    }
  }

  function spawnPipe(x) {
    const min = PIPE_MARGIN;
    const max = SKY_H - PIPE_MARGIN - PIPE_GAP;
    const top = min + Math.random() * Math.max(0, max - min);
    pipes.push({ x, top, passed: false });
  }

  function reset() {
    bird.y = SKY_H * 0.45;
    bird.v = 0;
    bird.rot = 0;
    pipes = [];
    for (let i = 0; i < 4; i++) spawnPipe(W + 120 + i * PIPE_SPACING);
    score = 0;
    flashAlpha = 0;
  }

  function startGame() {
    reset();
    state = STATE.READY;
    el.overlay.classList.add("hidden");
    el.gameover.classList.add("hidden");
  }

  function flap() {
    if (state === STATE.READY) state = STATE.PLAY;
    if (state !== STATE.PLAY) return;
    bird.v = FLAP_V;
    bird.wing = 0.18;
    sfx.flap();
  }

  function die() {
    if (state !== STATE.PLAY) return;
    state = STATE.DEAD;
    flashAlpha = 0.8;
    sfx.hit();
    setTimeout(sfx.die, 120);

    if (score > best) {
      best = score;
      store.set("flappy.best", best);
    }

    el.finalScore.textContent = String(score);
    el.finalBest.textContent = String(best);
    el.menuBest.textContent = String(best);
    el.medal.textContent = medalFor(score);

    setTimeout(() => el.gameover.classList.remove("hidden"), 650);
  }

  function medalFor(n) {
    if (n >= 40) return "🏆 Medalha de platina";
    if (n >= 25) return "🥇 Medalha de ouro";
    if (n >= 15) return "🥈 Medalha de prata";
    if (n >= 5) return "🥉 Medalha de bronze";
    return "Continue tentando!";
  }

  // --- Atualizacao --------------------------------------------------------

  function update(dt) {
    if (state === STATE.MENU || state === STATE.READY) {
      groundX = (groundX + SPEED * dt) % 24;
      driftClouds(dt);
      // flutua parado esperando o primeiro toque
      bird.y = SKY_H * 0.45 + Math.sin(performance.now() / 260) * 6;
      bird.rot = 0;
      return;
    }

    if (state === STATE.DEAD) {
      flashAlpha = Math.max(0, flashAlpha - dt * 2.5);
      // queda final ate o chao
      bird.v = Math.min(bird.v + GRAVITY * dt, MAX_FALL);
      bird.y = Math.min(bird.y + bird.v * dt, SKY_H - BIRD_R);
      bird.rot = Math.min(Math.PI / 2, bird.rot + dt * 6);
      return;
    }

    // STATE.PLAY
    groundX = (groundX + SPEED * dt) % 24;
    driftClouds(dt);

    bird.v = Math.min(bird.v + GRAVITY * dt, MAX_FALL);
    bird.y += bird.v * dt;
    bird.wing = Math.max(0, bird.wing - dt);
    bird.rot = bird.v < 0 ? -0.42 : Math.min(Math.PI / 2, bird.v / 520);

    for (const p of pipes) {
      p.x -= SPEED * dt;
      if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true;
        score++;
        sfx.score();
      }
    }

    if (pipes.length && pipes[0].x < -PIPE_W) {
      pipes.shift();
      spawnPipe(pipes[pipes.length - 1].x + PIPE_SPACING);
    }

    if (bird.y - BIRD_R <= 0) {
      bird.y = BIRD_R;
      bird.v = 0;
    }
    if (bird.y + BIRD_R >= SKY_H) {
      bird.y = SKY_H - BIRD_R;
      die();
      return;
    }
    if (hitsPipe()) die();
  }

  function driftClouds(dt) {
    for (const c of clouds) {
      c.x -= SPEED * 0.25 * c.s * dt;
      if (c.x < -70) {
        c.x = W + 40;
        c.y = 40 + Math.random() * (SKY_H * 0.45);
      }
    }
  }

  function hitsPipe() {
    for (const p of pipes) {
      if (p.x > BIRD_X + BIRD_R || p.x + PIPE_W < BIRD_X - BIRD_R) continue;
      const gapTop = p.top;
      const gapBottom = p.top + PIPE_GAP;
      // caixa do passaro levemente menor que o circulo, mais tolerante
      if (bird.y - BIRD_R + 2 < gapTop || bird.y + BIRD_R - 2 > gapBottom) return true;
    }
    return false;
  }

  // --- Desenho ------------------------------------------------------------

  function draw() {
    // ceu
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, "#4ec0ca");
    sky.addColorStop(1, "#94e0e4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, SKY_H);

    for (const c of clouds) drawCloud(c.x, c.y, c.s);
    drawSkyline();

    for (const p of pipes) drawPipe(p);

    drawGround();
    drawBird();

    if (state === STATE.PLAY || state === STATE.DEAD) drawScore();
    if (state === STATE.READY) drawGetReady();

    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 18 * s, y + 4 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(x - 18 * s, y + 5 * s, 11 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSkyline() {
    ctx.fillStyle = "#7fd8a0";
    const baseY = SKY_H - 34;
    ctx.beginPath();
    ctx.moveTo(0, SKY_H);
    for (let x = 0; x <= W; x += 30) {
      const h = 18 + ((x * 7919) % 23);
      ctx.lineTo(x, baseY - h * 0.5);
      ctx.lineTo(x + 15, baseY);
    }
    ctx.lineTo(W, SKY_H);
    ctx.closePath();
    ctx.fill();
  }

  function drawPipe(p) {
    const gapBottom = p.top + PIPE_GAP;
    pipeBody(p.x, 0, PIPE_W, p.top);
    pipeLip(p.x, p.top - 26);
    pipeBody(p.x, gapBottom, PIPE_W, SKY_H - gapBottom);
    pipeLip(p.x, gapBottom);
  }

  function pipeBody(x, y, w, h) {
    if (h <= 0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#4a9b32");
    g.addColorStop(0.35, "#7fd456");
    g.addColorStop(1, "#3f8a2a");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2f6b1f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, w - 2, h);
  }

  function pipeLip(x, y) {
    const w = PIPE_W + 8;
    const g = ctx.createLinearGradient(x - 4, 0, x - 4 + w, 0);
    g.addColorStop(0, "#4a9b32");
    g.addColorStop(0.35, "#8ade5f");
    g.addColorStop(1, "#3f8a2a");
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, y, w, 26);
    ctx.strokeStyle = "#2f6b1f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y + 1, w - 2, 24);
  }

  function drawGround() {
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, SKY_H, W, GROUND_H);
    ctx.fillStyle = "#8ec44c";
    ctx.fillRect(0, SKY_H, W, 14);
    ctx.fillStyle = "#6ea63a";
    for (let x = -groundX; x < W; x += 24) {
      ctx.fillRect(x, SKY_H + 10, 12, 5);
    }
    ctx.fillStyle = "#c9c179";
    for (let x = -groundX; x < W; x += 24) {
      ctx.fillRect(x + 6, SKY_H + 28, 10, 4);
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    // corpo
    ctx.fillStyle = "#f7d51d";
    ctx.strokeStyle = "#c8880c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // asa
    const wingUp = bird.wing > 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-3, wingUp ? -5 : 3, 7, wingUp ? 5 : 4, wingUp ? -0.4 : 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // olho
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(8.5, -5, 2, 0, Math.PI * 2);
    ctx.fill();

    // bico
    ctx.fillStyle = "#f4761a";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(22, 2);
    ctx.lineTo(12, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawScore() {
    const text = String(score);
    ctx.font = "bold 44px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(text, W / 2, 78);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, W / 2, 78);
  }

  function drawGetReady() {
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText("Toque para começar", W / 2, SKY_H * 0.28);
    ctx.fillStyle = "#fff";
    ctx.fillText("Toque para começar", W / 2, SKY_H * 0.28);
  }

  // --- Loop com passo fixo ------------------------------------------------

  const STEP = 1 / 120;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    // dt limitado: evita "teleporte" ao voltar de uma aba em segundo plano
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  // --- Escala do canvas ---------------------------------------------------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  // --- Entrada ------------------------------------------------------------

  function press(e) {
    // cliques nos botoes da interface sao tratados pelo proprio botao
    if (e.target instanceof Element && e.target.closest("button")) return;
    e.preventDefault();

    if (state === STATE.MENU) {
      startGame();
    } else if (state === STATE.DEAD) {
      // so reinicia depois que a tela de fim de jogo aparece
      if (!el.gameover.classList.contains("hidden")) startGame();
    } else {
      flap();
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (state === STATE.MENU) startGame();
      else if (state === STATE.DEAD) {
        if (!el.gameover.classList.contains("hidden")) startGame();
      } else flap();
    }
  });

  canvas.addEventListener("pointerdown", press);
  el.overlay.addEventListener("pointerdown", press);
  el.gameover.addEventListener("pointerdown", press);

  el.startBtn.addEventListener("click", startGame);
  el.restartBtn.addEventListener("click", startGame);

  el.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    store.set("flappy.sound", soundOn);
    el.soundBtn.textContent = soundOn ? "🔊" : "🔇";
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 150));

  // --- Boot ---------------------------------------------------------------

  el.soundBtn.textContent = soundOn ? "🔊" : "🔇";
  el.menuBest.textContent = String(best);
  makeClouds();
  reset();
  resize();
  requestAnimationFrame(frame);
})();
