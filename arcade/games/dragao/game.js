/* Fuga do Dragao - carrinho nos trilhos de uma caverna, com um dragao
   cuspindo fogo logo atras.

   Fantasia generica: caverna, carrinho de mina e dragao sao arquetipos de
   dominio publico. Arte, nomes e efeitos sao criacoes deste projeto.

   O jogo roda em viewport fluido: o mundo acompanha o formato da tela, entao
   nada aqui usa largura ou altura fixa - tudo sai de `view.w` / `view.h`. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 540, minH: 310 });
  const ctx = view.ctx;
  const shell = A.mountShell("dragao");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    overTitle: document.getElementById("over-title"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    dist: document.getElementById("r-dist"),
    gems: document.getElementById("r-gems"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
    hint: document.getElementById("hint"),
  };

  // --------------------------------------------------------------- ajustes

  const GRAV = 2100;
  const JUMP_V = -760;
  const START_SPEED = 300;
  const MAX_SPEED = 720;
  const ACCEL = 7.4;          // px/s ganhos por segundo
  const GAP_MAX = 100;        // folga para o dragao, em "pontos de vida"
  const GAP_RECOVER = 5.2;    // por segundo, correndo limpo
  const HIT_COST = 26;
  const CART_X_RATIO = 0.3;

  const STATE = { MENU: "menu", RUN: "run", DEAD: "dead" };
  let state = STATE.MENU;

  // ---------------------------------------------------------------- estado

  const cart = { y: 0, vy: 0, air: false, duck: false, angle: 0, wheel: 0 };
  let scrollX = 0;
  let speed = START_SPEED;
  let dist = 0;
  let gems = 0;
  let hits = 0;
  let obstacles = [];
  let pickups = [];
  let sparks = [];
  let flames = [];
  let smoke = [];
  let dragon = { gap: GAP_MAX, wing: 0, fire: 0, roar: 0 };
  let shake = 0;
  let flash = 0;
  let nextSpawn = 0;
  let deadTimer = 0;

  const groundY = () => view.h * 0.74;
  const ceilY = () => view.h * 0.12;
  const cartX = () => view.w * CART_X_RATIO;

  /** Altura dos trilhos: ondulacao suave de montanha-russa. */
  function trackY(worldX) {
    const amp = view.h * 0.075;
    return (
      groundY() +
      Math.sin(worldX * 0.0034) * amp +
      Math.sin(worldX * 0.0091 + 1.4) * amp * 0.42
    );
  }

  const trackSlope = (x) => (trackY(x + 6) - trackY(x - 6)) / 12;

  const score = () => Math.floor(dist) + gems * 35;

  function reset() {
    scrollX = 0;
    speed = START_SPEED;
    dist = 0;
    gems = 0;
    hits = 0;
    cart.y = trackY(0);
    cart.vy = 0;
    cart.air = false;
    cart.duck = false;
    cart.angle = 0;
    obstacles = [];
    pickups = [];
    sparks = [];
    flames = [];
    smoke = [];
    dragon = { gap: GAP_MAX, wing: 0, fire: 0, roar: 0 };
    shake = 0;
    flash = 0;
    deadTimer = 0;
    nextSpawn = view.w + 260;
  }

  // ------------------------------------------------------------- geracao

  function spawnAhead() {
    const worldEnd = scrollX + view.w + 120;
    while (nextSpawn < worldEnd) {
      const roll = Math.random();
      const hard = Math.min(1, dist / 2600);

      if (roll < 0.34) {
        obstacles.push({ type: "rock", x: nextSpawn, w: 34, h: 30 + A.rand(0, 16) });
      } else if (roll < 0.63) {
        obstacles.push({ type: "spike", x: nextSpawn, w: 30, len: 60 + A.rand(0, 34) });
      } else {
        obstacles.push({ type: "gap", x: nextSpawn, w: 86 + hard * 54 });
      }

      // gemas costumam vir logo depois do obstaculo, premiando quem pula bem
      if (Math.random() < 0.72) {
        const gx = nextSpawn + A.rand(90, 150);
        const high = Math.random() < 0.55;
        pickups.push({ x: gx, dy: high ? -74 : -28, taken: false, spin: A.rand(0, 6.3) });
      }

      nextSpawn += A.rand(300, 470) - hard * 70;
    }

    const behind = scrollX - 200;
    obstacles = obstacles.filter((o) => o.x + (o.w || 40) > behind);
    pickups = pickups.filter((p) => !p.taken && p.x > behind);
  }

  /** True se worldX cai dentro de um buraco nos trilhos. */
  function overGap(worldX) {
    for (const o of obstacles) {
      if (o.type === "gap" && worldX > o.x && worldX < o.x + o.w) return o;
    }
    return null;
  }

  // ---------------------------------------------------------------- fisica

  function jump() {
    if (state !== STATE.RUN || cart.air) return;
    cart.vy = JUMP_V;
    cart.air = true;
    A.sfx.jump();
    for (let i = 0; i < 8; i++) spark(cartX(), cart.y, "#ffd166");
  }

  function penalize(reason) {
    hits++;
    dragon.gap -= HIT_COST;
    speed = Math.max(START_SPEED * 0.72, speed * 0.6);
    shake = 0.42;
    A.sfx.crash();
    for (let i = 0; i < 22; i++) spark(cartX(), cart.y - 14, "#ff8a3d");
    if (dragon.gap <= 0) die(reason);
  }

  function die(reason) {
    if (state !== STATE.RUN) return;
    state = STATE.DEAD;
    deadTimer = 0;
    flash = 1;
    dragon.fire = 1.4;
    A.sfx.crash();
    A.sfx.fire();

    const total = score();
    const record = shell.submit(total);
    el.overTitle.textContent = reason;
    el.dist.textContent = Math.floor(dist) + " m";
    el.gems.textContent = String(gems);
    el.score.textContent = A.fmt(total);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    setTimeout(() => el.over.classList.remove("hidden"), 900);
  }

  function update(dt) {
    dragon.wing += dt * (state === STATE.RUN ? 7 : 3.4);
    shake = Math.max(0, shake - dt * 1.6);
    flash = Math.max(0, flash - dt * 1.4);
    updateParticles(dt);

    if (state === STATE.MENU) {
      scrollX += 90 * dt;
      cart.y = trackY(scrollX + cartX());
      dragon.fire = Math.max(0, dragon.fire - dt);
      return;
    }

    if (state === STATE.DEAD) {
      deadTimer += dt;
      dragon.fire = Math.max(0, dragon.fire - dt * 0.5);
      if (deadTimer < 0.5) {
        scrollX += speed * dt * (1 - deadTimer * 2);
        breatheFire(dt, true);
      }
      return;
    }

    // ------- corrida
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    scrollX += speed * dt;
    dist += (speed * dt) / 11;

    cart.duck = A.keys.down("ArrowDown", "KeyS") && !cart.air;
    cart.wheel += (speed / 13) * dt;

    const wx = scrollX + cartX();
    const ty = trackY(wx);
    const gap = overGap(wx);

    if (cart.air) {
      cart.vy += GRAV * dt;
      cart.y += cart.vy * dt;
      if (cart.y >= ty && cart.vy > 0) {
        if (gap) {
          // caiu no vao
          if (cart.y > ty + view.h * 0.16) return die("Caiu no abismo");
        } else {
          cart.y = ty;
          cart.vy = 0;
          cart.air = false;
          A.sfx.rumble();
          for (let i = 0; i < 6; i++) spark(cartX(), cart.y, "#9ad5ff");
        }
      }
    } else if (gap) {
      cart.air = true;
      cart.vy = 40;
    } else {
      cart.y = ty;
      if (Math.random() < 0.5) spark(cartX() - 12, cart.y + 2, "#ffb03d");
    }

    cart.angle = A.damp(cart.angle, cart.air ? 0.12 : Math.atan(trackSlope(wx)), 12, dt);

    // ------- colisoes
    const half = 17;
    const top = cart.y - (cart.duck ? 20 : 40);
    for (const o of obstacles) {
      const ox = o.x - scrollX;
      const cx = cartX();
      if (o.type === "rock") {
        const oy = trackY(o.x + o.w / 2);
        if (
          Math.abs(ox + o.w / 2 - cx) < half + o.w / 2 &&
          cart.y > oy - o.h - 4 &&
          top < oy
        ) {
          o.x = -9999;
          penalize("O carrinho espatifou");
        }
      } else if (o.type === "spike") {
        const tip = ceilY() + o.len;
        if (Math.abs(ox + o.w / 2 - cx) < half + o.w / 2 && top < tip) {
          o.x = -9999;
          penalize("Bateu numa estalactite");
        }
      }
    }
    obstacles = obstacles.filter((o) => o.x > -9000);

    for (const p of pickups) {
      if (p.taken) continue;
      const py = trackY(p.x) + p.dy;
      if (Math.hypot(p.x - scrollX - cartX(), py - (cart.y - 22)) < 34) {
        p.taken = true;
        gems++;
        dragon.gap = Math.min(GAP_MAX, dragon.gap + 3);
        A.sfx.pickup();
        for (let i = 0; i < 9; i++) spark(cartX(), cart.y - 24, "#6ee7ff");
      }
      p.spin += dt * 2.4;
    }

    // ------- dragao
    dragon.gap = Math.min(GAP_MAX, dragon.gap + GAP_RECOVER * dt);
    if (dragon.gap < 46) {
      breatheFire(dt, false);
      if (dragon.roar <= 0) {
        dragon.roar = 1.6;
        A.sfx.fire();
      }
    }
    dragon.roar = Math.max(0, dragon.roar - dt);
    dragon.fire = A.damp(dragon.fire, dragon.gap < 46 ? 1 : 0, 5, dt);

    spawnAhead();
  }

  // ------------------------------------------------------------ particulas

  function spark(x, y, color) {
    sparks.push({
      x, y,
      vx: A.rand(-160, -20),
      vy: A.rand(-120, 40),
      life: A.rand(0.2, 0.5),
      max: 0.5,
      color,
    });
    if (sparks.length > 260) sparks.splice(0, sparks.length - 260);
  }

  /** Sopro do dragao: labaredas que sobem da esquerda em direcao ao carrinho. */
  function breatheFire(dt, intense) {
    const n = intense ? 9 : 4;
    const reach = A.lerp(0.06, CART_X_RATIO, 1 - dragon.gap / 46);
    for (let i = 0; i < n; i++) {
      flames.push({
        x: view.w * 0.06 + A.rand(-10, 30),
        y: cart.y - A.rand(-10, 46),
        vx: A.rand(150, 420) * (intense ? 1.5 : 1),
        vy: A.rand(-70, 30),
        life: A.rand(0.4, 0.9),
        max: 0.9,
        r: A.rand(11, 27),
        limit: view.w * reach,
      });
    }
    if (flames.length > 320) flames.splice(0, flames.length - 320);
    if (Math.random() < 0.4) {
      smoke.push({
        x: view.w * 0.1,
        y: cart.y - A.rand(0, 60),
        vx: A.rand(30, 90),
        vy: A.rand(-40, -10),
        life: A.rand(0.7, 1.5),
        max: 1.5,
        r: A.rand(16, 34),
      });
    }
  }

  function updateParticles(dt) {
    for (const s of sparks) {
      s.vy += 900 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    sparks = sparks.filter((s) => s.life > 0);

    for (const f of flames) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy -= 60 * dt;
      f.r += 22 * dt;
      f.life -= dt;
      if (f.x > f.limit) f.life -= dt * 2.6;
    }
    flames = flames.filter((f) => f.life > 0);

    for (const s of smoke) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += 26 * dt;
      s.life -= dt;
    }
    smoke = smoke.filter((s) => s.life > 0);
  }

  // --------------------------------------------------------------- desenho

  function draw() {
    const w = view.w;
    const h = view.h;

    ctx.save();
    if (shake > 0) {
      ctx.translate(A.rand(-1, 1) * shake * 14, A.rand(-1, 1) * shake * 14);
    }

    drawCave(w, h);
    drawParallax(w, h);
    drawTrack(w, h);
    drawPickups();
    drawObstacles(w, h);
    drawCart();
    drawDragon(w, h);
    drawFire();
    drawSparks();
    drawLighting(w, h);

    ctx.restore();

    drawHud(w, h);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,140,60,${flash * 0.6})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawCave(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a0710");
    g.addColorStop(0.5, "#1a1020");
    g.addColorStop(1, "#2a1410");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // lava distante brilhando no fundo da caverna
    const lava = ctx.createLinearGradient(0, h * 0.82, 0, h);
    lava.addColorStop(0, "rgba(255,90,20,0)");
    lava.addColorStop(1, "rgba(255,110,30,0.5)");
    ctx.fillStyle = lava;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  }

  /** Tres camadas de rocha em parallax, com estalactites e estalagmites. */
  function drawParallax(w, h) {
    const layers = [
      { o: 0.22, c: "#180f1e", top: 0.2, bot: 0.86, s: 46 },
      { o: 0.44, c: "#221422", top: 0.16, bot: 0.9, s: 34 },
      { o: 0.72, c: "#2c1a24", top: 0.13, bot: 0.94, s: 24 },
    ];
    for (const L of layers) {
      const off = scrollX * L.o;
      ctx.fillStyle = L.c;

      // Teto recortado em estalactites: sem os dentes, as camadas viravam
      // morros lisos e a cena nao lia como caverna.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const teeth = L.s * 1.6;
      for (let x = 0; x <= w + teeth; x += teeth) {
        const seed = Math.sin((x + off) * 0.021) * 43758.5;
        const drop = (seed - Math.floor(seed)) * h * 0.16;
        const base = h * L.top + Math.sin((x + off) * 0.008) * h * 0.035;
        ctx.lineTo(x, base);
        ctx.lineTo(x + teeth * 0.5, base + drop);
        ctx.lineTo(x + teeth, base);
      }
      ctx.lineTo(w + teeth, 0);
      ctx.closePath();
      ctx.fill();

      // chao
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + L.s; x += L.s) {
        const n = Math.sin((x + off) * 0.011 + 1.1) + Math.sin((x + off) * 0.027);
        ctx.lineTo(x, h * L.bot + n * h * 0.04);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTrack(w, h) {
    const start = scrollX - 40;

    // dormentes
    ctx.fillStyle = "#3b2418";
    const step = 26;
    const first = Math.ceil(start / step) * step;
    for (let wx = first; wx < scrollX + w + 40; wx += step) {
      if (overGap(wx)) continue;
      const y = trackY(wx);
      ctx.save();
      ctx.translate(wx - scrollX, y);
      ctx.rotate(Math.atan(trackSlope(wx)));
      ctx.fillRect(-9, 2, 18, 9);
      ctx.restore();
    }

    // par de trilhos
    for (const dy of [0, 6]) {
      ctx.strokeStyle = dy ? "#5e4636" : "#8d9aa8";
      ctx.lineWidth = dy ? 2.5 : 3.4;
      ctx.beginPath();
      let drawing = false;
      for (let wx = start; wx < scrollX + w + 40; wx += 8) {
        if (overGap(wx)) {
          drawing = false;
          continue;
        }
        const px = wx - scrollX;
        const py = trackY(wx) + dy;
        if (!drawing) {
          ctx.moveTo(px, py);
          drawing = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // suportes sobre o abismo
    ctx.strokeStyle = "#2a1a14";
    ctx.lineWidth = 3;
    for (const o of obstacles) {
      if (o.type !== "gap") continue;
      const px = o.x - scrollX;
      if (px < -120 || px > w + 120) continue;
      ctx.beginPath();
      ctx.moveTo(px, trackY(o.x));
      ctx.lineTo(px - 8, h);
      ctx.moveTo(px + o.w, trackY(o.x + o.w));
      ctx.lineTo(px + o.w + 8, h);
      ctx.stroke();
    }
  }

  function drawObstacles(w, h) {
    for (const o of obstacles) {
      const px = o.x - scrollX;
      if (px < -140 || px > w + 140) continue;

      if (o.type === "rock") {
        const y = trackY(o.x + o.w / 2);
        const grd = ctx.createLinearGradient(px, y - o.h, px, y);
        grd.addColorStop(0, "#7a6a72");
        grd.addColorStop(1, "#3b2f36");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(px, y + 2);
        ctx.lineTo(px + o.w * 0.22, y - o.h * 0.82);
        ctx.lineTo(px + o.w * 0.58, y - o.h);
        ctx.lineTo(px + o.w, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,170,90,0.25)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else if (o.type === "spike") {
        const tip = ceilY() + o.len;
        const grd = ctx.createLinearGradient(px, ceilY(), px, tip);
        grd.addColorStop(0, "#4a3340");
        grd.addColorStop(1, "#8d6a78");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(px, ceilY() - 6);
        ctx.lineTo(px + o.w, ceilY() - 6);
        ctx.lineTo(px + o.w * 0.5, tip);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawPickups() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of pickups) {
      if (p.taken) continue;
      const px = p.x - scrollX;
      if (px < -60 || px > view.w + 60) continue;
      const py = trackY(p.x) + p.dy;
      const s = 1 + Math.sin(p.spin) * 0.16;

      const glow = ctx.createRadialGradient(px, py, 0, px, py, 26);
      glow.addColorStop(0, "rgba(110,231,255,0.55)");
      glow.addColorStop(1, "rgba(110,231,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(px - 26, py - 26, 52, 52);

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(s, 1);
      ctx.fillStyle = "#6ee7ff";
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(9, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-4.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCart() {
    const x = cartX();
    const y = cart.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(cart.angle);

    // rodas
    for (const wx of [-13, 13]) {
      ctx.save();
      ctx.translate(wx, 2);
      ctx.rotate(cart.wheel);
      ctx.fillStyle = "#1b1418";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "#6d5a4a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.stroke();
      ctx.restore();
    }

    // caixa do carrinho
    const g = ctx.createLinearGradient(0, -22, 0, 0);
    g.addColorStop(0, "#8a5a34");
    g.addColorStop(1, "#4a2f1c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-19, -20);
    ctx.lineTo(19, -20);
    ctx.lineTo(15, -2);
    ctx.lineTo(-15, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#9aa6b2";
    ctx.fillRect(-19, -21, 38, 3.4);

    // passageiro: agachado ou de pe, de bracos para cima
    const duck = cart.duck;
    ctx.strokeStyle = "#e9dcc8";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (duck) {
      ctx.moveTo(-2, -22);
      ctx.lineTo(5, -27);
    } else {
      ctx.moveTo(0, -20);
      ctx.lineTo(0, -36);
      ctx.moveTo(0, -32);
      ctx.lineTo(-9, -42);
      ctx.moveTo(0, -32);
      ctx.lineTo(9, -42);
    }
    ctx.stroke();
    ctx.fillStyle = "#f0c9a0";
    ctx.beginPath();
    ctx.arc(duck ? 7 : 0, duck ? -30 : -43, 6, 0, 7);
    ctx.fill();

    ctx.restore();
  }

  function drawDragon(w, h) {
    // Quanto menor a folga, mais perto ele chega. Mesmo com a folga cheia a
    // cabeca fica espiando na borda: o dragao e a tensao do jogo, esconde-lo
    // por completo tirava a graca.
    const t = 1 - A.clamp(dragon.gap / GAP_MAX, 0, 1);
    const x = A.lerp(-w * 0.09, w * 0.1, t);
    const y = cart.y - 40 + Math.sin(dragon.wing * 0.7) * 12;
    const s = A.lerp(0.9, 1.35, t) * (view.h / 360);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    const flap = Math.sin(dragon.wing) * 0.6;

    // asa de tras
    ctx.fillStyle = "#3d1220";
    wing(-14, -6, flap - 0.4, 1.1);

    // corpo e pescoco
    const body = ctx.createLinearGradient(-60, -30, 40, 40);
    body.addColorStop(0, "#5c1327");
    body.addColorStop(1, "#8f1d2e");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-72, 6);
    ctx.quadraticCurveTo(-30, -26, 6, -22);
    ctx.quadraticCurveTo(40, -20, 52, -4);
    ctx.quadraticCurveTo(34, 16, -6, 20);
    ctx.quadraticCurveTo(-40, 24, -72, 6);
    ctx.closePath();
    ctx.fill();

    // cauda
    ctx.strokeStyle = "#6d1628";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-66, 8);
    ctx.quadraticCurveTo(-104, 16, -122, -8);
    ctx.stroke();

    // asa da frente
    ctx.fillStyle = "#7d1a2c";
    wing(-8, -12, flap, 1.35);

    // cabeca
    ctx.fillStyle = "#9c2033";
    ctx.beginPath();
    ctx.moveTo(38, -14);
    ctx.quadraticCurveTo(70, -22, 86, -6);
    ctx.lineTo(86, 4);
    ctx.quadraticCurveTo(66, 12, 40, 6);
    ctx.closePath();
    ctx.fill();

    // chifres
    ctx.fillStyle = "#e8d5b0";
    ctx.beginPath();
    ctx.moveTo(52, -16);
    ctx.lineTo(60, -34);
    ctx.lineTo(64, -15);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(42, -15);
    ctx.lineTo(46, -30);
    ctx.lineTo(52, -14);
    ctx.closePath();
    ctx.fill();

    // dentes
    ctx.fillStyle = "#fff4e0";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(66 + i * 5, 4);
      ctx.lineTo(69 + i * 5, 11);
      ctx.lineTo(72 + i * 5, 4);
      ctx.closePath();
      ctx.fill();
    }

    // olho brilhante
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const eye = ctx.createRadialGradient(64, -8, 0, 64, -8, 13);
    eye.addColorStop(0, "rgba(255,220,120,0.95)");
    eye.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = eye;
    ctx.fillRect(50, -22, 30, 30);
    ctx.restore();
    ctx.fillStyle = "#1a0b06";
    ctx.beginPath();
    ctx.ellipse(65, -8, 2.4, 5, 0, 0, 7);
    ctx.fill();

    ctx.restore();

    function wing(wx, wy, angle, scale) {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-26, -54, -66, -50);
      ctx.quadraticCurveTo(-46, -22, -40, 8);
      ctx.quadraticCurveTo(-20, -4, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** Fogo e fumaca em blending aditivo, para o brilho somar. */
  function drawFire() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of flames) {
      const t = A.clamp(f.life / f.max, 0, 1);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(255,${Math.round(240 * t)},${Math.round(180 * t)},${0.85 * t})`);
      g.addColorStop(0.45, `rgba(255,${Math.round(140 * t)},20,${0.5 * t})`);
      g.addColorStop(1, "rgba(180,20,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.restore();

    for (const s of smoke) {
      const t = A.clamp(s.life / s.max, 0, 1);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(60,50,55,${0.28 * t})`);
      g.addColorStop(1, "rgba(40,32,38,0)");
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
  }

  function drawSparks() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of sparks) {
      const t = A.clamp(s.life / s.max, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Luz do dragao tingindo a cena + vinheta. */
  function drawLighting(w, h) {
    if (dragon.fire > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(w * 0.08, cart.y, 0, w * 0.08, cart.y, w * 0.75);
      g.addColorStop(0, `rgba(255,120,30,${0.3 * dragon.fire})`);
      g.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHud(w, h) {
    if (state === STATE.MENU) return;

    // barra de folga do dragao
    const bw = Math.min(230, w * 0.34);
    const bx = w / 2 - bw / 2;
    const by = h - 26;
    const t = A.clamp(dragon.gap / GAP_MAX, 0, 1);

    ctx.fillStyle = "rgba(10,8,16,0.6)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, "#ff2e2e");
    g.addColorStop(0.5, "#ff9f1c");
    g.addColorStop(1, "#4ade80");
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw * t, 8);

    ctx.font = "600 10px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = t < 0.45 ? "#ff8a5c" : "rgba(200,208,235,0.75)";
    ctx.fillText(t < 0.45 ? "ELE ESTÁ COLANDO!" : "DISTÂNCIA DO DRAGÃO", w / 2, by - 5);

    ctx.font = "700 clamp(18px, 3vw, 26px) 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(238,241,251,0.95)";
    ctx.fillText(Math.floor(dist) + " m", 18, h * 0.5 - 40);
    ctx.font = "600 14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#6ee7ff";
    ctx.fillText("◆ " + gems, 18, h * 0.5 - 8);
  }

  // ----------------------------------------------------------------- fluxo

  function play() {
    reset();
    state = STATE.RUN;
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
      jump();
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === STATE.MENU) return play();
    if (state === STATE.DEAD) return;
    // metade de baixo abaixa, metade de cima pula
    const p = A.pointerPos(view, e);
    if (p.y > view.h * 0.62) A.keys.press("ArrowDown");
    else jump();
  });
  canvas.addEventListener("pointerup", () => A.keys.release("ArrowDown"));

  view.onResize(() => {
    if (state === STATE.MENU) cart.y = trackY(scrollX + cartX());
  });

  reset();
  A.loop(update, draw);
})();
