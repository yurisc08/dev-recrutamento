/* Linha de Frente - tiro de arena em vista de cima.

   Ondas de inimigos convergem para o centro; você se move, mira e atira.
   Jogo de tiro genérico, com arte e mecânica próprias — sem cenário,
   personagem, arma ou marca de qualquer obra existente.

   Tela cheia fluida: a arena é a própria viewport. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 560, minH: 400 });
  const ctx = view.ctx;
  const shell = A.mountShell("linhafrente");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    wave: document.getElementById("r-wave"),
    kills: document.getElementById("r-kills"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
    hint: document.getElementById("hint"),
  };

  const SPEED = 240;
  const R = 15;              // raio do jogador
  const FIRE_RATE = 0.16;
  const BULLET_SPEED = 620;
  const BULLET_LIFE = 1.1;
  const DASH_TIME = 0.18;
  const DASH_COOL = 1.1;
  const MAX_HP = 5;

  const STATE = { MENU: "menu", PLAY: "play", OVER: "over" };
  let state = STATE.MENU;

  const you = { x: 0, y: 0, vx: 0, vy: 0, aim: 0, hp: MAX_HP, hurt: 0, dash: 0, cool: 0 };
  let bullets = [];
  let foes = [];
  let drops = [];
  let bits = [];
  let wave = 0;
  let kills = 0;
  let score = 0;
  let toSpawn = 0;
  let spawnTimer = 0;
  let waveBreak = 0;
  let cooldown = 0;
  let shake = 0;
  let aimTarget = null;   // definido pelo mouse/toque

  function reset() {
    you.x = view.w / 2;
    you.y = view.h / 2;
    you.vx = you.vy = 0;
    you.hp = MAX_HP;
    you.hurt = 0;
    you.dash = 0;
    you.cool = 0;
    bullets = [];
    foes = [];
    drops = [];
    bits = [];
    wave = 0;
    kills = 0;
    score = 0;
    shake = 0;
    aimTarget = null;
    nextWave();
  }

  function nextWave() {
    wave++;
    toSpawn = 4 + wave * 2;
    spawnTimer = 0;
    waveBreak = 1.2;
    if (wave > 1) {
      score += 200;
      A.sfx.power();
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 12); i++) {
      const a = A.rand(0, Math.PI * 2);
      const s = A.rand(60, 260);
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: A.rand(0.2, 0.5), max: 0.5, color });
    }
    if (bits.length > 300) bits.splice(0, bits.length - 300);
  }

  /** Inimigos entram por fora da tela, sempre mirando o jogador. */
  function spawnFoe() {
    const hard = Math.min(1, wave / 12);
    const lado = A.randInt(0, 3);
    const m = 40;
    let x, y;
    if (lado === 0) { x = A.rand(0, view.w); y = -m; }
    else if (lado === 1) { x = view.w + m; y = A.rand(0, view.h); }
    else if (lado === 2) { x = A.rand(0, view.w); y = view.h + m; }
    else { x = -m; y = A.rand(0, view.h); }

    // corredor rápido e frágil, ou pesado e lento
    const pesado = wave >= 3 && Math.random() < 0.25 + hard * 0.2;
    foes.push({
      x, y,
      hp: pesado ? 4 : 1,
      max: pesado ? 4 : 1,
      r: pesado ? 21 : 14,
      speed: pesado ? 52 + hard * 34 : 92 + hard * 76,
      pts: pesado ? 60 : 25,
      color: pesado ? "#c1121f" : "#ff5c39",
      hit: 0,
    });
  }

  function shoot() {
    if (cooldown > 0 || state !== STATE.PLAY) return;
    cooldown = FIRE_RATE;
    const a = you.aim + A.rand(-0.045, 0.045);
    bullets.push({
      x: you.x + Math.cos(a) * (R + 6),
      y: you.y + Math.sin(a) * (R + 6),
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    you.vx -= Math.cos(a) * 42;
    you.vy -= Math.sin(a) * 42;
    A.sfx.shoot();
  }

  function dash() {
    if (you.cool > 0 || state !== STATE.PLAY) return;
    you.dash = DASH_TIME;
    you.cool = DASH_COOL;
    A.sfx.jump();
  }

  function damage(x, y) {
    if (you.hurt > 0 || you.dash > 0) return;
    you.hp--;
    you.hurt = 1.1;
    shake = 0.4;
    burst(you.x, you.y, "#3fd8ff", 18);
    A.sfx.hit();
    if (you.hp <= 0) finish();
  }

  function finish() {
    state = STATE.OVER;
    const record = shell.submit(score);
    el.wave.textContent = String(wave);
    el.kills.textContent = String(kills);
    el.score.textContent = A.fmt(score);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // --------------------------------------------------------------- update

  function update(dt) {
    shake = Math.max(0, shake - dt * 1.8);
    for (const b of bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.94;
      b.vy *= 0.94;
      b.life -= dt;
    }
    bits = bits.filter((b) => b.life > 0);

    if (state !== STATE.PLAY) return;

    cooldown = Math.max(0, cooldown - dt);
    you.hurt = Math.max(0, you.hurt - dt);
    you.dash = Math.max(0, you.dash - dt);
    you.cool = Math.max(0, you.cool - dt);

    // movimento
    const mx = (A.keys.down("ArrowRight", "KeyD") ? 1 : 0) - (A.keys.down("ArrowLeft", "KeyA") ? 1 : 0);
    const my = (A.keys.down("ArrowDown", "KeyS") ? 1 : 0) - (A.keys.down("ArrowUp", "KeyW") ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    const boost = you.dash > 0 ? 2.9 : 1;
    you.vx = A.damp(you.vx, (mx / len) * SPEED * boost, 14, dt);
    you.vy = A.damp(you.vy, (my / len) * SPEED * boost, 14, dt);
    you.x = A.clamp(you.x + you.vx * dt, R, view.w - R);
    you.y = A.clamp(you.y + you.vy * dt, R, view.h - R);

    // mira: ponteiro tem prioridade; sem ele, segue a direção do movimento
    if (aimTarget) {
      you.aim = Math.atan2(aimTarget.y - you.y, aimTarget.x - you.x);
    } else if (mx || my) {
      you.aim = Math.atan2(my, mx);
    }
    if (A.keys.down("Space")) shoot();

    // ondas
    if (waveBreak > 0) {
      waveBreak -= dt;
    } else if (toSpawn > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = Math.max(0.18, 0.75 - wave * 0.04);
        spawnFoe();
        toSpawn--;
      }
    } else if (!foes.length) {
      nextWave();
    }

    // tiros
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    bullets = bullets.filter(
      (b) => b.life > 0 && b.x > -20 && b.x < view.w + 20 && b.y > -20 && b.y < view.h + 20
    );

    for (const f of foes) {
      f.hit = Math.max(0, f.hit - dt * 4);
      const a = Math.atan2(you.y - f.y, you.x - f.x);
      f.x += Math.cos(a) * f.speed * dt;
      f.y += Math.sin(a) * f.speed * dt;

      for (const b of bullets) {
        if (b.life <= 0) continue;
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.r + 4) {
          b.life = 0;
          f.hp--;
          f.hit = 1;
          burst(b.x, b.y, f.color, 4);
          if (f.hp <= 0) {
            f.dead = true;
            kills++;
            score += f.pts;
            burst(f.x, f.y, f.color, 16);
            A.sfx.explode();
            // eventualmente cai um reparo
            if (you.hp < MAX_HP && Math.random() < 0.12) {
              drops.push({ x: f.x, y: f.y, t: 0 });
            }
          }
          break;
        }
      }

      if (!f.dead && Math.hypot(f.x - you.x, f.y - you.y) < f.r + R) {
        f.dead = true;
        burst(f.x, f.y, f.color, 12);
        damage(f.x, f.y);
      }
    }
    bullets = bullets.filter((b) => b.life > 0);
    foes = foes.filter((f) => !f.dead);

    for (const d of drops) {
      d.t += dt;
      if (Math.hypot(d.x - you.x, d.y - you.y) < R + 14) {
        d.taken = true;
        you.hp = Math.min(MAX_HP, you.hp + 1);
        score += 40;
        A.sfx.pickup();
      }
    }
    drops = drops.filter((d) => !d.taken && d.t < 9);
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const w = view.w;
    const h = view.h;

    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-1, 1) * shake * 12, A.rand(-1, 1) * shake * 12);

    ctx.fillStyle = "#101216";
    ctx.fillRect(-16, -16, w + 32, h + 32);

    // grade do piso
    ctx.strokeStyle = "rgba(255,176,58,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 56) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 56) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    for (const d of drops) {
      const pul = 1 + Math.sin(d.t * 6) * 0.15;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(pul, pul);
      ctx.fillStyle = "#5ec9a7";
      ctx.fillRect(-4, -12, 8, 24);
      ctx.fillRect(-12, -4, 24, 8);
      ctx.restore();
    }

    for (const f of foes) drawFoe(f);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffce4d";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.4, 0, 7);
      ctx.fill();
    }
    for (const b of bits) {
      ctx.globalAlpha = A.clamp(b.life / b.max, 0, 1);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    drawYou();
    ctx.restore();

    drawHud(w, h);
  }

  function drawFoe(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.atan2(you.y - f.y, you.x - f.x));
    ctx.fillStyle = f.hit > 0 ? "#ffffff" : f.color;
    ctx.beginPath();
    ctx.moveTo(f.r, 0);
    ctx.lineTo(-f.r * 0.7, -f.r * 0.8);
    ctx.lineTo(-f.r * 0.3, 0);
    ctx.lineTo(-f.r * 0.7, f.r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (f.max > 1) {
      const p = f.hp / f.max;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(f.x - f.r, f.y - f.r - 9, f.r * 2, 4);
      ctx.fillStyle = "#ffb03a";
      ctx.fillRect(f.x - f.r, f.y - f.r - 9, f.r * 2 * p, 4);
    }
  }

  function drawYou() {
    if (you.hurt > 0 && Math.floor(you.hurt * 14) % 2 === 0) return;

    if (you.dash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(you.x, you.y, 0, you.x, you.y, R * 3);
      g.addColorStop(0, "rgba(63,216,255,0.35)");
      g.addColorStop(1, "rgba(63,216,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(you.x - R * 3, you.y - R * 3, R * 6, R * 6);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(you.x, you.y);
    ctx.rotate(you.aim);
    ctx.fillStyle = "#3fd8ff";
    ctx.beginPath();
    ctx.moveTo(R + 4, 0);
    ctx.lineTo(-R * 0.8, -R * 0.85);
    ctx.lineTo(-R * 0.35, 0);
    ctx.lineTo(-R * 0.8, R * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0f1a20";
    ctx.fillRect(R * 0.1, -3, R * 0.8, 6);
    ctx.restore();
  }

  function drawHud(w, h) {
    if (state === STATE.MENU) return;

    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(244,242,239,0.95)";
    ctx.fillText(A.fmt(score), 18, h * 0.5 - 40);

    ctx.font = "600 13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#ffb03a";
    ctx.fillText("ONDA " + wave, 18, h * 0.5 - 14);

    // vida
    for (let i = 0; i < MAX_HP; i++) {
      ctx.fillStyle = i < you.hp ? "#3fd8ff" : "rgba(255,255,255,0.14)";
      ctx.fillRect(18 + i * 16, h * 0.5 + 8, 11, 11);
    }

    // recarga do avanço
    const p = 1 - you.cool / DASH_COOL;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(18, h * 0.5 + 28, 74, 5);
    ctx.fillStyle = p >= 1 ? "#5ec9a7" : "#5a6470";
    ctx.fillRect(18, h * 0.5 + 28, 74 * A.clamp(p, 0, 1), 5);

    if (waveBreak > 0) {
      ctx.font = "800 clamp(24px, 5vw, 40px) 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,176,58,${A.clamp(waveBreak, 0, 1)})`;
      ctx.fillText("ONDA " + wave, w / 2, h * 0.34);
    }
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    state = STATE.PLAY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
    if (el.hint) {
      el.hint.classList.remove("fade");
      setTimeout(() => el.hint.classList.add("fade"), 4600);
    }
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.onPress((code) => {
    if (code === "Enter" || code === "Space") {
      if (state === STATE.MENU || state === STATE.OVER) play();
    }
    if (code === "ShiftLeft" || code === "ShiftRight" || code === "KeyK") dash();
  });

  // mouse mira e atira; no toque, arrastar mira e dispara sozinho
  canvas.addEventListener("pointermove", (e) => {
    aimTarget = A.pointerPos(view, e);
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === STATE.MENU || state === STATE.OVER) return;
    aimTarget = A.pointerPos(view, e);
    A.keys.press("Space");
  });
  canvas.addEventListener("pointerup", () => A.keys.release("Space"));
  canvas.addEventListener("pointerleave", () => A.keys.release("Space"));

  view.onResize(() => {
    you.x = A.clamp(you.x, R, view.w - R);
    you.y = A.clamp(you.y, R, view.h - R);
  });

  reset();
  state = STATE.MENU;
  A.loop(update, draw);
})();
