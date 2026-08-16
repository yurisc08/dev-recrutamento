/* Magicine - base compartilhada pelos jogos.
   Cuida de: armazenamento, audio, viewport fluido, loop de passo fixo,
   teclado, botoes de toque, tela cheia e a barra flutuante de cada jogo. */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------- storage

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
        /* modo privado ou storage cheio: o jogo segue sem salvar */
      }
    },
  };

  const bestKey = (id) => "magicine.best." + id;

  function getBest(id) {
    return Number(store.get(bestKey(id), 0)) || 0;
  }

  /** Salva se for recorde. Retorna true quando o valor superou o anterior. */
  function saveBest(id, value) {
    const v = Math.floor(value);
    if (v > getBest(id)) {
      store.set(bestKey(id), v);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ audio

  let ac = null;
  let muted = store.get("magicine.muted", false) === true;

  function ensureAudio() {
    if (muted) return null;
    try {
      if (!ac) ac = new (global.AudioContext || global.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      return ac;
    } catch (_) {
      return null;
    }
  }

  function tone(freq, dur, type, gain, sweepTo) {
    const c = ensureAudio();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur);
      vol.gain.setValueAtTime(gain || 0.05, c.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.connect(vol).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch (_) {
      /* sem audio disponivel */
    }
  }

  /** Ruido filtrado - base de explosoes, fogo e trepidacao. */
  function noise(dur, gain, filterFreq) {
    const c = ensureAudio();
    if (!c) return;
    try {
      const frames = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, frames, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filterFreq || 1200;
      const vol = c.createGain();
      vol.gain.value = gain || 0.06;
      src.connect(lp).connect(vol).connect(c.destination);
      src.start();
    } catch (_) {
      /* sem audio disponivel */
    }
  }

  const sfx = {
    blip: () => tone(660, 0.07, "square", 0.04),
    jump: () => tone(520, 0.1, "square", 0.045, 900),
    pickup: () => tone(880, 0.11, "triangle", 0.05, 1320),
    point: () => tone(760, 0.09, "triangle", 0.045),
    shoot: () => tone(420, 0.07, "square", 0.035, 180),
    bounce: () => tone(300, 0.06, "square", 0.04),
    power: () => tone(300, 0.22, "triangle", 0.05, 1200),
    hit: () => tone(160, 0.18, "sawtooth", 0.05),
    explode: () => noise(0.3, 0.07, 900),
    fire: () => noise(0.5, 0.05, 480),
    rumble: () => noise(0.22, 0.035, 260),
    crash: () => {
      tone(120, 0.3, "sawtooth", 0.05);
      noise(0.35, 0.07, 700);
    },
    over: () => {
      tone(400, 0.16, "square", 0.045, 120);
      setTimeout(() => tone(220, 0.3, "square", 0.045, 90), 150);
    },
  };

  const isMuted = () => muted;

  function setMuted(v) {
    muted = !!v;
    store.set("magicine.muted", muted);
  }

  // --------------------------------------------------------------- viewport

  /**
   * Viewport fluido: o canvas ocupa todo o espaco disponivel e o MUNDO se
   * adapta ao formato da tela, em vez de ficar com tarjas pretas.
   *
   * `minW`/`minH` sao a area que sempre precisa caber. A escala e a menor
   * entre as duas razoes, entao numa tela mais larga sobra mundo na
   * horizontal (e vice-versa). Os jogos leem `view.w` e `view.h` a cada
   * quadro, nunca constantes.
   */
  function createView(canvas, opts) {
    const minW = opts.minW;
    const minH = opts.minH;
    const maxScale = opts.maxScale || Infinity;
    const ctx = canvas.getContext("2d");
    const listeners = [];

    const view = { ctx, canvas, w: minW, h: minH, scale: 1, dpr: 1 };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);

      const scale = Math.min(cssW / minW, cssH / minH, maxScale);
      view.scale = scale;
      view.dpr = dpr;
      view.w = cssW / scale;
      view.h = cssH / scale;

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

      listeners.forEach((fn) => fn(view));
    }

    view.onResize = (fn) => {
      listeners.push(fn);
      return view;
    };
    view.refresh = resize;

    resize();
    global.addEventListener("resize", resize);
    global.addEventListener("orientationchange", () => setTimeout(resize, 160));
    if (global.ResizeObserver) new ResizeObserver(resize).observe(canvas);

    return view;
  }

  /** Converte um evento de ponteiro para coordenadas do mundo. */
  function pointerPos(view, e) {
    const rect = view.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / view.scale,
      y: (e.clientY - rect.top) / view.scale,
    };
  }

  // ------------------------------------------------------------- tela cheia

  const fullscreen = {
    supported: () =>
      !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
    active: () => !!(document.fullscreenElement || document.webkitFullscreenElement),
    toggle(el) {
      const target = el || document.documentElement;
      try {
        if (fullscreen.active()) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          (target.requestFullscreen || target.webkitRequestFullscreen).call(target);
        }
      } catch (_) {
        /* alguns navegadores de iOS nao expoem a API */
      }
    },
  };

  // ------------------------------------------------------------------- loop

  function loop(update, draw, step) {
    const dtStep = step || 1 / 120;
    let last = performance.now();
    let acc = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      acc += Math.min((now - last) / 1000, 0.1);
      last = now;
      let guard = 0;
      while (acc >= dtStep && guard < 10) {
        update(dtStep);
        acc -= dtStep;
        guard++;
      }
      if (guard === 10) acc = 0;
      draw();
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
    return { stop: () => { running = false; } };
  }

  // ---------------------------------------------------------------- entrada

  const held = new Set();
  const pressHandlers = [];

  const keys = {
    down(...codes) {
      return codes.some((c) => held.has(c));
    },
    press(code) {
      if (!held.has(code)) {
        held.add(code);
        pressHandlers.forEach((fn) => fn(code));
      }
    },
    release(code) {
      held.delete(code);
    },
    clear() {
      held.clear();
    },
  };

  const onPress = (fn) => pressHandlers.push(fn);

  const BLOCKED = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  global.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (BLOCKED.has(e.code)) e.preventDefault();
    keys.press(e.code);
  });
  global.addEventListener("keyup", (e) => keys.release(e.code));
  global.addEventListener("blur", () => keys.clear());

  /** Liga botoes com [data-key] ao mesmo estado do teclado. */
  function bindTouchButtons(root) {
    (root || document).querySelectorAll("[data-key]").forEach((btn) => {
      const code = btn.dataset.key;
      const press = (e) => {
        e.preventDefault();
        btn.classList.add("is-active");
        keys.press(code);
      };
      const release = (e) => {
        e.preventDefault();
        btn.classList.remove("is-active");
        keys.release(code);
      };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointerleave", release);
      btn.addEventListener("pointercancel", release);
    });
  }

  // ------------------------------------------------------------------- util

  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const fmt = (n) => Math.floor(n).toLocaleString("pt-BR");

  /** Suavizacao independente de framerate. */
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  // ------------------------------------------------------------------ shell

  /** Barra flutuante comum: recorde, som, tela cheia e botoes de toque. */
  function mountShell(id) {
    const bestEl = document.getElementById("best");
    const muteBtn = document.getElementById("mute");
    const fsBtn = document.getElementById("fs");

    const gid = () => (typeof id === "function" ? id() : id);
    const refresh = () => {
      if (bestEl) bestEl.textContent = fmt(getBest(gid()));
    };
    refresh();

    if (muteBtn) {
      const paint = () => {
        muteBtn.textContent = muted ? "🔇" : "🔊";
        muteBtn.setAttribute("aria-pressed", String(muted));
      };
      paint();
      muteBtn.addEventListener("click", () => {
        setMuted(!muted);
        paint();
        if (!muted) sfx.blip();
      });
    }

    if (fsBtn) {
      if (!fullscreen.supported()) fsBtn.hidden = true;
      const paint = () => {
        fsBtn.textContent = fullscreen.active() ? "🗗" : "⛶";
      };
      paint();
      fsBtn.addEventListener("click", () => fullscreen.toggle(document.documentElement));
      document.addEventListener("fullscreenchange", paint);
      document.addEventListener("webkitfullscreenchange", paint);
    }

    bindTouchButtons(document);

    return {
      submit(score) {
        const record = saveBest(gid(), score);
        refresh();
        return record;
      },
      best: () => getBest(gid()),
      refresh,
    };
  }

  global.Arcade = {
    store, getBest, saveBest,
    sfx, tone, noise, isMuted, setMuted,
    createView, pointerPos, fullscreen, loop,
    keys, onPress, bindTouchButtons,
    clamp, lerp, damp, rand, randInt, fmt,
    mountShell,
  };
})(window);
