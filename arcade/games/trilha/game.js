/* Trilha Radical - moto de trilha em terreno gerado na hora.
   A moto e modelada como duas rodas ligadas por uma barra rigida: a barra
   define a inclinacao, e cada roda resolve o contato com o chao sozinha. */
(() => {
  "use strict";

  const A = window.Arcade;
  const W = 640;
  const H = 360;

  const GRAV = 1150;
  const WHEEL_R = 11;
  const ROD = 46;             // distancia entre eixos
  const MAX_SPEED = 430;
  const DRIVE = 620;          // aceleracao no contato com o solo
  const BRAKE = 0.90;         // fator de reducao por passo ao frear
  const AIR_TORQUE = 2900;    // giro no ar ao inclinar
  const GROUND_TORQUE = 1250;
  const STABILIZE = 2400;     // endireita a moto no chao quando ninguem inclina
  const RESTITUTION = 0.18;
  const STAR_GAP = 430;
  const FLAT_UNTIL = 420;     // rampa inicial plana, para dar partida

  const canvas = document.getElementById("c");
  const ctx = A.fitCanvas(canvas, W, H);
  const shell = A.mountShell("trilha");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    dist: document.getElementById("r-dist"),
    stars: document.getElementById("r-stars"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
  };

  // ------------------------------------------------------------- terreno

  let seed = [0, 0, 0];

  /** Altura do solo em x. Comeca plano e vai ficando mais acidentado. */
  function groundY(x) {
    const hard = Math.min(1, Math.max(0, x) / 9000);
    const h =
      248 +
      (36 + 44 * hard) * Math.sin(x * 0.0041 + seed[0]) +
      (17 + 23 * hard) * Math.sin(x * 0.0109 + seed[1]) +
      (6 + 11 * hard) * Math.sin(x * 0.0268 + seed[2]);
    const t = A.clamp(x / FLAT_UNTIL, 0, 1);
    return A.lerp(268, h, t);
  }

  /** Inclinacao do solo (dy/dx) por diferenca central. */
  function slopeAt(x) {
    return (groundY(x + 3) - groundY(x - 3)) / 6;
  }

  /** Vetor normal do solo, apontando para cima (y cresce para baixo). */
  function normalAt(x) {
    const s = slopeAt(x);
    const len = Math.hypot(s, 1);
    return { x: -s / len, y: -1 / len };
  }

  // ---------------------------------------------------------------- estado

  const STATE = { MENU: "menu", PLAY: "play", CRASH: "crash" };
  let state = STATE.MENU;

  // As duas rodas sao particulas; a barra rigida entre elas e a moto.
  const rear = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, ground: false };
  const front = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, ground: false };

  let stars = [];
  let particles = [];
  let cam = { x: 0, y: 0 };
  let distance = 0;
  let starCount = 0;
  let flips = 0;
  let airSpin = 0;
  let flipAccum = 0;
  let wasAirborne = false;
  let crashTimer = 0;
  let startX = 0;

  function reset() {
    seed = [A.rand(0, 6.28), A.rand(0, 6.28), A.rand(0, 6.28)];
    startX = 80;
    const gy = groundY(startX);
    rear.x = startX;
    rear.y = gy - WHEEL_R;
    front.x = startX + ROD;
    front.y = groundY(startX + ROD) - WHEEL_R;
    rear.vx = front.vx = 60;
    rear.vy = front.vy = 0;
    rear.spin = front.spin = 0;

    stars = [];
    for (let i = 1; i <= 60; i++) {
      const x = startX + 700 + i * STAR_GAP + A.rand(-90, 90);
      stars.push({ x, y: groundY(x) - A.rand(52, 104), taken: false });
    }

    particles = [];
    distance = 0;
    starCount = 0;
    flips = 0;
    airSpin = 0;
    wasAirborne = false;
    crashTimer = 0;
    cam.x = rear.x - 200;
    cam.y = rear.y - 200;
  }

  const bikeAngle = () => Math.atan2(front.y - rear.y, front.x - rear.x);
  const score = () => Math.floor(distance) + starCount * 25 + flips * 150;

  // --------------------------------------------------------------- fisica

  /** Resolve o contato de uma roda com o terreno. */
  function collideWheel(p, isRear, dt, throttle, braking) {
    const gy = groundY(p.x);
    const pen = p.y + WHEEL_R - gy;
    p.ground = pen > 0;
    if (!p.ground) return;

    // tira a roda de dentro do chao
    p.y -= pen;

    const n = normalAt(p.x);
    const t = { x: -n.y, y: n.x }; // tangente no sentido do avanco

    const vn = p.vx * n.x + p.vy * n.y;
    if (vn < 0) {
      // quica, perdendo parte da energia
      const j = -vn * (1 + RESTITUTION);
      p.vx += n.x * j;
      p.vy += n.y * j;
      if (j > 130) {
        A.sfx.bounce();
        spawnDirt(p.x, gy, 6);
      }
    }

    let vt = p.vx * t.x + p.vy * t.y;

    if (isRear && throttle) {
      vt += DRIVE * dt;
      if (Math.random() < 0.35) spawnDirt(p.x, gy, 1);
    }
    if (braking) vt *= BRAKE;
    vt *= 0.999; // atrito de rolagem
    vt = A.clamp(vt, -MAX_SPEED * 0.45, MAX_SPEED);

    const vnKeep = p.vx * n.x + p.vy * n.y;
    p.vx = t.x * vt + n.x * vnKeep;
    p.vy = t.y * vt + n.y * vnKeep;

    p.spin += (vt / WHEEL_R) * dt;
  }

  /** Mantem a distancia entre as rodas (barra rigida). */
  function solveRod() {
    const dx = front.x - rear.x;
    const dy = front.y - rear.y;
    const dist = Math.hypot(dx, dy) || 1;
    const diff = (dist - ROD) / dist / 2;
    const cx = dx * diff;
    const cy = dy * diff;
    rear.x += cx;
    rear.y += cy;
    front.x -= cx;
    front.y -= cy;
  }

  /**
   * Aplica um binario nas rodas para girar a moto: as duas recebem empurroes
   * opostos e perpendiculares a barra. Positivo mergulha a frente.
   */
  function applyTorque(accel, dt) {
    const dx = front.x - rear.x;
    const dy = front.y - rear.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * accel * dt;
    const ny = (dx / len) * accel * dt;
    rear.vx -= nx;
    rear.vy -= ny;
    front.vx += nx;
    front.vy += ny;
  }

  /** Menor diferenca entre dois angulos, no intervalo -pi..pi. */
  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function step(dt) {
    const throttle = A.keys.down("ArrowUp", "KeyW");
    const braking = A.keys.down("ArrowDown", "KeyS");
    const leanBack = A.keys.down("ArrowLeft", "KeyA");
    const leanFwd = A.keys.down("ArrowRight", "KeyD");

    rear.vy += GRAV * dt;
    front.vy += GRAV * dt;

    const airborne = !rear.ground && !front.ground;
    const torque = airborne ? AIR_TORQUE : GROUND_TORQUE;
    if (leanBack) applyTorque(-torque, dt);
    if (leanFwd) applyTorque(torque, dt);
    // no ar, o motor tambem joga a moto para tras (empina)
    if (airborne && throttle) applyTorque(-AIR_TORQUE * 0.35, dt);

    // sem comando e com roda no chao, a moto tende a acompanhar o terreno;
    // sem isso a tracao traseira deixa a moto empinada o tempo todo
    if (!airborne && !leanBack && !leanFwd) {
      const mid = (rear.x + front.x) / 2;
      const d = angleDiff(bikeAngle(), Math.atan(slopeAt(mid)));
      applyTorque(-d * STABILIZE, dt);
    }

    rear.x += rear.vx * dt;
    rear.y += rear.vy * dt;
    front.x += front.vx * dt;
    front.y += front.vy * dt;

    solveRod();
    collideWheel(rear, true, dt, throttle, braking);
    collideWheel(front, false, dt, false, braking);
    solveRod();

    if (!rear.ground && !front.ground) {
      const a = bikeAngle();
      if (wasAirborne) {
        const d = angleDiff(a, airSpin);
        airSpin += d;
        flipAccum += d;
        if (Math.abs(flipAccum) >= Math.PI * 2) {
          flipAccum -= Math.sign(flipAccum) * Math.PI * 2;
          flips++;
          A.sfx.power();
        }
      } else {
        airSpin = a;
        flipAccum = 0;
        wasAirborne = true;
      }
    } else {
      wasAirborne = false;
      flipAccum = 0;
    }

    // o piloto bate a cabeca: fim de linha
    const ang = bikeAngle();
    const mx = (rear.x + front.x) / 2;
    const my = (rear.y + front.y) / 2;
    const headX = mx + Math.sin(ang) * 26;
    const headY = my - Math.cos(ang) * 26;
    if (headY > groundY(headX) - 2) return crash();

    distance = Math.max(distance, (rear.x - startX) / 10);

    for (const s of stars) {
      if (s.taken) continue;
      if (Math.hypot(s.x - mx, s.y - my) < 26) {
        s.taken = true;
        starCount++;
        A.sfx.pickup();
        for (let i = 0; i < 8; i++) spawnDirt(s.x, s.y, 1, "#ffd166");
      }
    }

    updateParticles(dt);

    // camera: segue de perto no x, com folga no y
    cam.x = A.lerp(cam.x, rear.x - 210, 1 - Math.pow(0.001, dt));
    cam.y = A.lerp(cam.y, rear.y - 195, 1 - Math.pow(0.02, dt));
  }

  function crash() {
    if (state !== STATE.PLAY) return;
    state = STATE.CRASH;
    crashTimer = 0;
    A.sfx.crash();
    for (let i = 0; i < 22; i++) {
      spawnDirt((rear.x + front.x) / 2, (rear.y + front.y) / 2, 1);
    }
  }

  function finish() {
    const total = score();
    const record = shell.submit(total);
    el.dist.textContent = Math.floor(distance) + " m";
    el.stars.textContent = String(starCount);
    el.score.textContent = A.fmt(total);
    el.overTitle.textContent = flips > 0 ? `Capotou! (${flips} manobra${flips > 1 ? "s" : ""})` : "Capotou!";
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // ------------------------------------------------------------ particulas

  function spawnDirt(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: A.rand(-90, 40),
        vy: A.rand(-140, -20),
        life: A.rand(0.3, 0.8),
        max: 0.8,
        color: color || "#8a6a44",
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.vy += GRAV * 0.55 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawRidges();

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawTerrain();
    drawStars();
    drawParticles();
    drawBike();
    ctx.restore();

    drawHud();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#17204a");
    g.addColorStop(0.55, "#42558f");
    g.addColorStop(1, "#c98b6b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sol baixo no horizonte
    ctx.fillStyle = "rgba(255, 214, 150, 0.75)";
    ctx.beginPath();
    ctx.arc(W * 0.76, H * 0.62 - cam.y * 0.02, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Serras ao fundo, em duas camadas de parallax. */
  function drawRidges() {
    const layers = [
      { off: 0.18, base: 250, amp: 46, color: "#2c3564" },
      { off: 0.36, base: 274, amp: 34, color: "#3c4372" },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 8) {
        const wx = (cam.x + sx) * L.off;
        const y =
          L.base -
          cam.y * 0.12 +
          Math.sin(wx * 0.006) * L.amp +
          Math.sin(wx * 0.017 + 1.2) * L.amp * 0.45;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTerrain() {
    const left = cam.x - 20;
    const right = cam.x + W + 20;

    ctx.beginPath();
    ctx.moveTo(left, cam.y + H + 200);
    for (let x = left; x <= right; x += 6) ctx.lineTo(x, groundY(x));
    ctx.lineTo(right, cam.y + H + 200);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, cam.y, 0, cam.y + H);
    g.addColorStop(0, "#6f4f2f");
    g.addColorStop(1, "#3a2617");
    ctx.fillStyle = g;
    ctx.fill();

    // faixa de grama no topo do terreno
    ctx.strokeStyle = "#79a44a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let x = left; x <= right; x += 6) {
      const y = groundY(x);
      if (x === left) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // pedrinhas para dar textura
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    const first = Math.floor(left / 34) * 34;
    for (let x = first; x <= right; x += 34) {
      ctx.fillRect(x, groundY(x) + 16 + ((x * 13) % 22), 8, 4);
    }
  }

  function drawStars() {
    for (const s of stars) {
      if (s.taken) continue;
      if (s.x < cam.x - 40 || s.x > cam.x + W + 40) continue;
      const pulse = 1 + Math.sin(performance.now() / 220 + s.x) * 0.12;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ffd166";
      ctx.shadowColor = "rgba(255, 209, 102, 0.8)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.lineTo(Math.cos(a2) * 4.6, Math.sin(a2) * 4.6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = A.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3.5, 3.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawBike() {
    const ang = bikeAngle();
    const mx = (rear.x + front.x) / 2;
    const my = (rear.y + front.y) / 2;

    drawWheel(rear.x, rear.y, rear.spin);
    drawWheel(front.x, front.y, front.spin);

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);

    // quadro
    ctx.strokeStyle = "#e63946";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-4, -9);
    ctx.lineTo(11, -6);
    ctx.lineTo(21, 1);
    ctx.stroke();

    ctx.strokeStyle = "#22283a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -9);
    ctx.lineTo(-19, 0);
    ctx.moveTo(11, -6);
    ctx.lineTo(15, -14);
    ctx.stroke();

    // piloto
    const lean = A.keys.down("ArrowLeft", "KeyA") ? -3 : A.keys.down("ArrowRight", "KeyD") ? 3 : 0;
    ctx.strokeStyle = "#f1faee";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6 + lean, -12);
    ctx.lineTo(2 + lean, -22);
    ctx.stroke();

    ctx.strokeStyle = "#1d3557";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(2 + lean, -22);
    ctx.lineTo(14, -13);
    ctx.moveTo(-6 + lean, -12);
    ctx.lineTo(-8, -4);
    ctx.stroke();

    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(4 + lean, -27, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d3557";
    ctx.fillRect(6 + lean, -29, 5, 3);

    ctx.restore();
  }

  function drawWheel(x, y, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    ctx.fillStyle = "#1a1a20";
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#3d4353";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (WHEEL_R - 3), Math.sin(a) * (WHEEL_R - 3));
      ctx.lineTo(-Math.cos(a) * (WHEEL_R - 3), -Math.sin(a) * (WHEEL_R - 3));
      ctx.stroke();
    }

    ctx.strokeStyle = "#606878";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(6, 10, 22, 0.5)";
    ctx.fillRect(10, 10, 168, 62);
    ctx.fillStyle = "#e8ecf8";
    ctx.fillText(Math.floor(distance) + " m", 20, 16);
    ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText("★ " + starCount, 20, 44);
    ctx.fillStyle = "#4cc9f0";
    ctx.fillText("Manobras: " + flips, 74, 44);

    const speed = Math.hypot(rear.vx, rear.vy);
    ctx.fillStyle = "rgba(6, 10, 22, 0.5)";
    ctx.fillRect(W - 128, 10, 118, 30);
    ctx.fillStyle = "#e8ecf8";
    ctx.fillText(Math.round(speed / 4) + " km/h", W - 118, 18);
  }

  // ----------------------------------------------------------------- fluxo

  function update(dt) {
    if (state === STATE.PLAY) {
      step(dt);
    } else if (state === STATE.CRASH) {
      // deixa a moto tombar por um instante antes de mostrar o resultado
      rear.vy += GRAV * dt;
      front.vy += GRAV * dt;
      rear.x += rear.vx * dt;
      rear.y += rear.vy * dt;
      front.x += front.vx * dt;
      front.y += front.vy * dt;
      solveRod();
      collideWheel(rear, false, dt, false, true);
      collideWheel(front, false, dt, false, true);
      updateParticles(dt);
      cam.x = A.lerp(cam.x, rear.x - 210, 1 - Math.pow(0.01, dt));
      crashTimer += dt;
      if (crashTimer > 1.1) {
        state = STATE.MENU;
        finish();
      }
    } else {
      updateParticles(dt);
    }
  }

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
  });

  reset();
  A.loop(update, draw, 1 / 240);
})();
