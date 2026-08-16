/* Magicine - fundo animado.
   Único lugar do site com movimento: luz de projetor varrendo devagar,
   poeira subindo no facho e manchas quentes que respiram. Tudo fica atrás
   do conteúdo, em alpha baixo, para nunca disputar com o texto.

   Cuidados de desempenho: resolução limitada (a imagem é borrada, não
   precisa de DPR alto), pausa quando a aba sai de foco e desliga inteiro
   se a pessoa pediu menos movimento no sistema. */
(() => {
  "use strict";

  const canvas = document.getElementById("bg");
  if (!canvas) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0;
  let h = 0;
  let raf = 0;
  let t = 0;

  // Manchas quentes: cor, tamanho e velocidade próprias de cada uma.
  const BLOBS = [
    { hue: "255,176,58",  r: 0.46, sx: 0.021, sy: 0.013, px: 0.18, py: 0.16, a: 0.16 },
    { hue: "255,92,57",   r: 0.40, sx: 0.017, sy: 0.023, px: 0.82, py: 0.24, a: 0.14 },
    { hue: "193,18,31",   r: 0.34, sx: 0.013, sy: 0.019, px: 0.55, py: 0.78, a: 0.11 },
    { hue: "98,168,255",  r: 0.30, sx: 0.024, sy: 0.011, px: 0.12, py: 0.72, a: 0.07 },
  ];

  const dust = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // a quantidade de poeira acompanha a área da tela
    const alvo = Math.round(Math.min(90, (w * h) / 24000));
    dust.length = 0;
    for (let i = 0; i < alvo; i++) {
      dust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.6,
        v: 4 + Math.random() * 16,
        drift: (Math.random() - 0.5) * 10,
        a: 0.1 + Math.random() * 0.35,
        ph: Math.random() * 6.28,
      });
    }
  }

  /** Facho de luz atravessando a tela, como um projetor de cinema. */
  function beam(cx, angle, width, alpha) {
    ctx.save();
    ctx.translate(cx, -h * 0.15);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, 0, h * 1.5);
    g.addColorStop(0, `rgba(255,196,120,${alpha})`);
    g.addColorStop(0.55, `rgba(255,150,80,${alpha * 0.35})`);
    g.addColorStop(1, "rgba(255,120,60,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-width * 0.12, 0);
    ctx.lineTo(width * 0.12, 0);
    ctx.lineTo(width, h * 1.5);
    ctx.lineTo(-width, h * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min((now - t) / 1000, 0.05) || 0;
    t = now;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const s = now / 1000;

    for (const b of BLOBS) {
      const x = (b.px + Math.sin(s * b.sx + b.py * 9) * 0.14) * w;
      const y = (b.py + Math.cos(s * b.sy + b.px * 7) * 0.12) * h;
      const r = Math.min(w, h) * b.r * (1 + Math.sin(s * 0.09 + b.px * 5) * 0.09);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.hue},${b.a})`);
      g.addColorStop(1, `rgba(${b.hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    beam(w * (0.3 + Math.sin(s * 0.045) * 0.1), -0.16 + Math.sin(s * 0.035) * 0.05, w * 0.1, 0.035);
    beam(w * (0.76 + Math.cos(s * 0.037) * 0.08), 0.2 + Math.cos(s * 0.03) * 0.04, w * 0.07, 0.024);

    for (const d of dust) {
      d.y -= d.v * dt;
      d.x += Math.sin(s * 0.6 + d.ph) * d.drift * dt;
      if (d.y < -6) {
        d.y = h + 6;
        d.x = Math.random() * w;
      }
      const tw = d.a * (0.55 + Math.sin(s * 1.6 + d.ph) * 0.45);
      ctx.fillStyle = `rgba(255,226,190,${tw})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 6.2832);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  /** Um quadro só, para quem pediu menos movimento no sistema. */
  function still() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const b of BLOBS) {
      const x = b.px * w;
      const y = b.py * h;
      const r = Math.min(w, h) * b.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.hue},${b.a})`);
      g.addColorStop(1, `rgba(${b.hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function start() {
    if (reduce || raf) return;
    t = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduce) still();
  });

  // aba em segundo plano não precisa gastar bateria desenhando
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  resize();
  if (reduce) still();
  else start();
})();
