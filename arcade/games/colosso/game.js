/* Colosso - o gorila gigante escalando a torre.

   Arquétipo de domínio público (macaco gigante em arranha-céu, aviões
   rondando). Nome, arte e mecânica são criações deste projeto.

   Tela cheia fluida: a torre acompanha a largura disponível e a altura de
   jogo sai de view.h, então nada aqui usa medida fixa. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 460, minH: 420 });
  const ctx = view.ctx;
  const shell = A.mountShell("colosso");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    height: document.getElementById("r-height"),
    planes: document.getElementById("r-planes"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
    hint: document.getElementById("hint"),
  };

  const CLIMB_BASE = 62;     // px/s de subida
  const CLIMB_MAX = 190;
  const MOVE_SPEED = 300;
  const SWAT_TIME = 0.26;
  const SWAT_RANGE = 92;

  const STATE = { MENU: "menu", PLAY: "play", DEAD: "dead" };
  let state = STATE.MENU;

  const ape = { x: 0.5, y: 0, swat: 0, face: 1, hurt: 0, sway: 0 };
  let height = 0;
  let climb = CLIMB_BASE;
  let debris = [];
  let planes = [];
  let bits = [];
  let lives = 3;
  let downed = 0;
  let shake = 0;
  let spawnD = 0;
  let spawnP = 0;
  let deadTimer = 0;

  // A torre ocupa a faixa central; as bordas ficam para o céu e os aviões.
  const towerW = () => Math.min(view.w * 0.62, 520);
  const towerX = () => (view.w - towerW()) / 2;
  const apeY = () => view.h * 0.62;
  const apeSize = () => Math.max(34, Math.min(view.w, view.h) * 0.1);

  function reset() {
    ape.x = 0.5;
    ape.swat = 0;
    ape.hurt = 0;
    ape.sway = 0;
    height = 0;
    climb = CLIMB_BASE;
    debris = [];
    planes = [];
    bits = [];
    lives = 3;
    downed = 0;
    shake = 0;
    spawnD = 0.9;
    spawnP = 2.4;
    deadTimer = 0;
  }

  const score = () => Math.floor(height) + downed * 120;

  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 10); i++) {
      const a = A.rand(0, Math.PI * 2);
      const s = A.rand(50, 230);
      bits.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: A.rand(0.25, 0.6), max: 0.6, color,
      });
    }
    if (bits.length > 260) bits.splice(0, bits.length - 260);
  }

  function swat() {
    if (state !== STATE.PLAY || ape.swat > 0) return;
    ape.swat = SWAT_TIME;
    A.sfx.jump();

    const ax = towerX() + ape.x * towerW();
    const ay = apeY();
    let acertou = false;

    for (const p of planes) {
      if (p.dead) continue;
      if (Math.hypot(p.x - ax, p.y - ay) < SWAT_RANGE + apeSize() * 0.4) {
        p.dead = true;
        downed++;
        acertou = true;
        burst(p.x, p.y, "#ffb03a", 16);
        A.sfx.explode();
      }
    }
    for (const d of debris) {
      if (d.dead) continue;
      if (Math.hypot(d.x - ax, d.y - ay) < SWAT_RANGE) {
        d.dead = true;
        acertou = true;
        burst(d.x, d.y, "#8d7f70", 8);
      }
    }
    if (acertou) shake = Math.max(shake, 0.18);
  }

  function hit(x, y) {
    if (ape.hurt > 0) return;
    lives--;
    ape.hurt = 1.4;
    shake = 0.45;
    climb = CLIMB_BASE;
    burst(x, y, "#ff5c39", 20);
    A.sfx.crash();
    if (lives <= 0) die();
  }

  function die() {
    state = STATE.DEAD;
    deadTimer = 0;
    const total = score();
    const record = shell.submit(total);
    el.height.textContent = Math.floor(height) + " m";
    el.planes.textContent = String(downed);
    el.score.textContent = A.fmt(total);
    el.overTitle.textContent = "O colosso caiu";
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    setTimeout(() => el.over.classList.remove("hidden"), 800);
    A.sfx.over();
  }

  // --------------------------------------------------------------- update

  function update(dt) {
    shake = Math.max(0, shake - dt * 1.8);
    for (const b of bits) {
      b.vy += 700 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    bits = bits.filter((b) => b.life > 0);

    if (state === STATE.MENU) {
      height += 12 * dt;
      ape.sway += dt * 2;
      return;
    }
    if (state === STATE.DEAD) {
      deadTimer += dt;
      return;
    }

    ape.hurt = Math.max(0, ape.hurt - dt);
    ape.swat = Math.max(0, ape.swat - dt);
    ape.sway += dt * 6;

    const mv = (A.keys.down("ArrowRight", "KeyD") ? 1 : 0) - (A.keys.down("ArrowLeft", "KeyA") ? 1 : 0);
    if (mv) ape.face = mv;
    ape.x = A.clamp(ape.x + (mv * MOVE_SPEED * dt) / towerW(), 0.08, 0.92);

    climb = Math.min(CLIMB_MAX, climb + 5 * dt);
    height += (climb * dt) / 6;

    const hard = Math.min(1, height / 500);
    const ax = towerX() + ape.x * towerW();
    const ay = apeY();
    const r = apeSize() * 0.42;

    // entulho caindo pela face da torre
    spawnD -= dt;
    if (spawnD <= 0) {
      spawnD = A.rand(0.5, 1.1) - hard * 0.32;
      debris.push({
        x: towerX() + A.rand(0.08, 0.92) * towerW(),
        y: -30,
        vy: A.rand(190, 300) + hard * 150,
        spin: A.rand(-4, 4),
        rot: 0,
        s: A.rand(11, 19),
        dead: false,
      });
    }
    for (const d of debris) {
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      if (!d.dead && Math.hypot(d.x - ax, d.y - ay) < r + d.s * 0.6) {
        d.dead = true;
        hit(d.x, d.y);
      }
    }
    debris = debris.filter((d) => !d.dead && d.y < view.h + 60);

    // aviões cruzando a torre
    spawnP -= dt;
    if (spawnP <= 0) {
      spawnP = A.rand(1.6, 3.2) - hard * 1.1;
      const fromLeft = Math.random() < 0.5;
      planes.push({
        x: fromLeft ? -70 : view.w + 70,
        y: A.rand(view.h * 0.12, view.h * 0.8),
        vx: (fromLeft ? 1 : -1) * (A.rand(130, 210) + hard * 110),
        bob: A.rand(0, 6.3),
        dead: false,
      });
    }
    for (const p of planes) {
      p.x += p.vx * dt;
      p.bob += dt * 3;
      if (!p.dead && Math.hypot(p.x - ax, p.y - ay) < r + 20) {
        p.dead = true;
        hit(p.x, p.y);
      }
    }
    planes = planes.filter((p) => !p.dead && p.x > -140 && p.x < view.w + 140);
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    const w = view.w;
    const h = view.h;

    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-1, 1) * shake * 13, A.rand(-1, 1) * shake * 13);

    // céu: quanto mais alto, mais escuro
    const alto = A.clamp(height / 700, 0, 1);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, alto > 0.5 ? "#0b1024" : "#1d2a4a");
    sky.addColorStop(0.55, A.lerp(60, 26, alto) > 40 ? "#3a4a72" : "#1a2340");
    sky.addColorStop(1, "#c98b6b");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // lua e nuvens em parallax
    ctx.fillStyle = "rgba(255,240,210,0.85)";
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.16, Math.min(w, h) * 0.055, 0, 7);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const cy = ((i * 137 + height * 2.2) % (h + 160)) - 80;
      const cx = (i * 191) % w;
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      ctx.beginPath();
      ctx.ellipse(cx, h - cy, 84, 20, 0, 0, 7);
      ctx.fill();
    }

    drawTower(w, h);
    drawPlanes();
    drawDebris();
    drawApe();
    drawBits();

    ctx.restore();
    drawHud(w, h);
  }

  function drawTower(w, h) {
    const tx = towerX();
    const tw = towerW();

    ctx.fillStyle = "#20242e";
    ctx.fillRect(tx, 0, tw, h);
    ctx.fillStyle = "#2b303c";
    ctx.fillRect(tx, 0, 10, h);
    ctx.fillRect(tx + tw - 10, 0, 10, h);

    // janelas rolando com a altura, algumas acesas
    const step = Math.max(28, tw / 9);
    const off = (height * 6) % step;
    for (let y = -step + off; y < h + step; y += step) {
      const row = Math.floor((height * 6 - y) / step);
      for (let i = 0; i < 7; i++) {
        const x = tx + 16 + i * ((tw - 32) / 7);
        const on = ((row * 7 + i) * 2654435761) % 5 === 0;
        ctx.fillStyle = on ? "rgba(255,196,110,0.75)" : "rgba(255,255,255,0.05)";
        ctx.fillRect(x, y, (tw - 32) / 7 - 8, step * 0.44);
      }
    }
  }

  function drawDebris() {
    for (const d of debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = "#7c6a58";
      ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s * 0.7);
      ctx.strokeStyle = "#4a3d31";
      ctx.lineWidth = 2;
      ctx.strokeRect(-d.s / 2, -d.s / 2, d.s, d.s * 0.7);
      ctx.restore();
    }
  }

  function drawPlanes() {
    for (const p of planes) {
      const dir = Math.sign(p.vx) || 1;
      const y = p.y + Math.sin(p.bob) * 5;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.scale(dir, 1);
      ctx.fillStyle = "#c9d2de";
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(16, -5);
      ctx.lineTo(26, 0);
      ctx.lineTo(16, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8b96a6";
      ctx.fillRect(-10, -14, 8, 28);
      ctx.fillRect(-24, -9, 7, 18);
      ctx.fillStyle = "#ffb03a";
      ctx.beginPath();
      ctx.arc(10, -1, 3, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawApe() {
    const s = apeSize();
    const x = towerX() + ape.x * towerW();
    const y = apeY();
    const piscando = ape.hurt > 0 && Math.floor(ape.hurt * 12) % 2 === 0;
    if (piscando) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ape.face, 1);
    const bal = Math.sin(ape.sway) * 0.05;
    ctx.rotate(bal);

    const braco = ape.swat > 0 ? -1.5 : -0.5 + Math.sin(ape.sway) * 0.2;

    // braço que golpeia
    ctx.strokeStyle = "#3a2f2a";
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -s * 0.1);
    ctx.lineTo(s * 0.18 + Math.cos(braco) * s * 0.62, -s * 0.1 + Math.sin(braco) * s * 0.62);
    ctx.stroke();

    // corpo
    ctx.fillStyle = "#4a3b34";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#6b574c";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.06, s * 0.26, s * 0.32, 0, 0, 7);
    ctx.fill();

    // braço de apoio agarrado ao prédio
    ctx.strokeStyle = "#3a2f2a";
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.05);
    ctx.lineTo(-s * 0.5, s * 0.3);
    ctx.stroke();

    // cabeça
    ctx.fillStyle = "#4a3b34";
    ctx.beginPath();
    ctx.arc(s * 0.04, -s * 0.5, s * 0.27, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#8a7062";
    ctx.beginPath();
    ctx.ellipse(s * 0.1, -s * 0.44, s * 0.16, s * 0.13, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(s * 0.12, -s * 0.56, s * 0.04, 0, 7);
    ctx.arc(s * 0.0, -s * 0.56, s * 0.04, 0, 7);
    ctx.fill();
    // boca aberta ao golpear
    if (ape.swat > 0) {
      ctx.fillStyle = "#241715";
      ctx.beginPath();
      ctx.ellipse(s * 0.1, -s * 0.36, s * 0.09, s * 0.06, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();

    // alcance do golpe
    if (ape.swat > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, SWAT_RANGE);
      g.addColorStop(0, `rgba(255,176,58,${0.22 * (ape.swat / SWAT_TIME)})`);
      g.addColorStop(1, "rgba(255,176,58,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - SWAT_RANGE, y - SWAT_RANGE, SWAT_RANGE * 2, SWAT_RANGE * 2);
      ctx.restore();
    }
  }

  function drawBits() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of bits) {
      ctx.globalAlpha = A.clamp(b.life / b.max, 0, 1);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawHud(w, h) {
    if (state === STATE.MENU) return;
    ctx.font = "700 clamp(18px, 3vw, 26px) 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(244,242,239,0.95)";
    ctx.fillText(Math.floor(height) + " m", 18, h * 0.5 - 40);
    ctx.font = "600 14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#ffb03a";
    ctx.fillText("✈ " + downed, 18, h * 0.5 - 6);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff5c39";
    ctx.fillText("♥".repeat(Math.max(0, lives)), w - 18, h * 0.5 - 6);
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    state = STATE.PLAY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
    if (el.hint) {
      el.hint.classList.remove("fade");
      setTimeout(() => el.hint.classList.add("fade"), 4200);
    }
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  A.onPress((code) => {
    if (code === "Space" || code === "ArrowUp" || code === "KeyW" || code === "Enter") {
      if (state === STATE.MENU) return play();
      if (state === STATE.DEAD) {
        if (!el.over.classList.contains("hidden")) play();
        return;
      }
      swat();
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === STATE.MENU) return play();
    if (state === STATE.DEAD) return;
    swat();
  });

  reset();
  A.loop(update, draw);
})();
