/* ============================================================
   CINEVOLT — fx.js
   Todos os efeitos globais: preloader, cursor, reveal no scroll,
   tilt 3D, botões magnéticos, marquee, contadores, menu, toasts,
   lightbox, transição de página e trovão sintetizado.
   ============================================================ */

(function () {
  'use strict';

  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, ctx) => (ctx || document).querySelector(s);
  const $$ = (s, ctx) => Array.from((ctx || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* =========================================================
     1. PRELOADER
     ========================================================= */
  function preloader() {
    const el = $('.preloader');
    if (!el) return;
    const barra = $('.preloader__bar', el);
    const pct = $('.preloader__pct', el);
    let p = 0;

    const tick = setInterval(() => {
      p = Math.min(100, p + Math.random() * 18);
      if (barra) barra.style.width = p + '%';
      if (pct) pct.textContent = String(Math.floor(p)).padStart(3, '0') + '%';
      if (p >= 100) {
        clearInterval(tick);
        setTimeout(() => {
          el.classList.add('is-done');
          document.body.classList.remove('is-loading');
          document.dispatchEvent(new CustomEvent('cv:pronto'));
        }, 320);
      }
    }, reduzido ? 40 : 130);
  }

  /* =========================================================
     2. CURSOR CUSTOMIZADO com trilha de faíscas
     ========================================================= */
  function cursor() {
    if (!fino || reduzido) return;
    const wrap = document.createElement('div');
    wrap.className = 'cursor';
    wrap.innerHTML = '<div class="cursor__ring"></div><div class="cursor__dot"></div>';
    document.body.appendChild(wrap);
    document.body.classList.add('has-cursor');

    const dot = $('.cursor__dot', wrap);
    const ring = $('.cursor__ring', wrap);
    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my;

    addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      if (Math.random() < .12) faisca(mx, my);
    }, { passive: true });

    (function anim() {
      rx = lerp(rx, mx, .16);
      ry = lerp(ry, my, .16);
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(anim);
    })();

    function faisca(x, y) {
      const s = document.createElement('i');
      s.className = 'cursor__spark';
      s.style.transform = `translate(${x + (Math.random() - .5) * 16}px, ${y + (Math.random() - .5) * 16}px)`;
      wrap.appendChild(s);
      s.animate(
        [{ opacity: .9, transform: s.style.transform + ' scale(1)' },
         { opacity: 0, transform: s.style.transform + ` translate(${(Math.random() - .5) * 30}px, ${20 + Math.random() * 26}px) scale(0)` }],
        { duration: 520 + Math.random() * 420, easing: 'cubic-bezier(.16,1,.3,1)' }
      ).onfinish = () => s.remove();
    }

    const alvos = 'a, button, .card, .pill, input, textarea, select, [data-hot]';
    document.addEventListener('mouseover', e => {
      if (e.target.closest(alvos)) wrap.classList.add('is-hot');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(alvos)) wrap.classList.remove('is-hot');
    });
  }

  /* =========================================================
     3. REVEAL NO SCROLL
     ========================================================= */
  function reveal() {
    const alvos = $$('[data-reveal], .stat, .split-line');
    if (!alvos.length) return;
    if (reduzido) { alvos.forEach(el => el.classList.add('is-in')); return; }

    const io = new IntersectionObserver((entradas) => {
      entradas.forEach(ent => {
        if (!ent.isIntersecting) return;
        ent.target.classList.add('is-in');
        io.unobserve(ent.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });

    alvos.forEach((el, i) => {
      if (!el.style.getPropertyValue('--d')) {
        const grupo = el.parentElement;
        const irmaos = grupo ? Array.from(grupo.children).indexOf(el) : i;
        el.style.setProperty('--d', Math.min(irmaos, 8) * 85 + 'ms');
      }
      io.observe(el);
    });
  }

  /* =========================================================
     4. TILT 3D + brilho que segue o mouse
     ========================================================= */
  function tilt() {
    if (!fino || reduzido) return;
    $$('[data-tilt]').forEach(el => {
      const forca = parseFloat(el.dataset.tilt) || 9;
      if (!$('.tilt__shine', el)) {
        const s = document.createElement('div');
        s.className = 'tilt__shine';
        el.appendChild(s);
      }
      el.classList.add('tilt');

      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.transform =
          `perspective(900px) rotateX(${(0.5 - py) * forca}deg) rotateY(${(px - 0.5) * forca}deg) translateZ(14px)`;
        el.style.setProperty('--mx', px * 100 + '%');
        el.style.setProperty('--my', py * 100 + '%');
      });

      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* =========================================================
     5. BOTÕES MAGNÉTICOS
     ========================================================= */
  function magnetico() {
    if (!fino || reduzido) return;
    $$('[data-magnetic], .magnetic').forEach(el => {
      const f = parseFloat(el.dataset.magnetic) || .35;
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform =
          `translate(${(e.clientX - r.left - r.width / 2) * f}px, ${(e.clientY - r.top - r.height / 2) * f}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* =========================================================
     6. MARQUEE — duplica a faixa para loop contínuo
     ========================================================= */
  function marquee() {
    $$('.marquee, .filmstrip').forEach(m => {
      const track = $('.marquee__track, .filmstrip__track', m);
      if (!track || track.dataset.pronto) return;
      track.dataset.pronto = '1';
      m.appendChild(track.cloneNode(true));
    });
  }

  /* =========================================================
     7. CONTADORES
     ========================================================= */
  function contadores() {
    const els = $$('[data-count]');
    if (!els.length) return;
    const io = new IntersectionObserver(ents => {
      ents.forEach(ent => {
        if (!ent.isIntersecting) return;
        const el = ent.target;
        io.unobserve(el);
        const fim = parseFloat(el.dataset.count);
        const dec = (el.dataset.count.split('.')[1] || '').length;
        const sufixo = el.dataset.suffix || '';
        if (reduzido) { el.textContent = fim.toFixed(dec) + sufixo; return; }
        const dur = 1600;
        const t0 = performance.now();
        (function passo(t) {
          const k = clamp((t - t0) / dur, 0, 1);
          const eased = 1 - Math.pow(1 - k, 3);
          el.textContent = (fim * eased).toFixed(dec) + sufixo;
          if (k < 1) requestAnimationFrame(passo);
        })(t0);
      });
    }, { threshold: .4 });
    els.forEach(el => io.observe(el));
  }

  /* =========================================================
     8. HEADER + MENU + PROGRESSO + VOLTAR AO TOPO
     ========================================================= */
  function chrome() {
    const header = $('.header');
    const progress = $('.progress');
    const totop = $('.totop');

    const onScroll = () => {
      const y = scrollY;
      if (header) header.classList.toggle('is-stuck', y > 40);
      if (totop) totop.classList.toggle('is-on', y > 700);
      if (progress) {
        const h = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (totop) totop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduzido ? 'auto' : 'smooth' }));

    const burger = $('.burger');
    const menu = $('.menu');
    if (burger && menu) {
      burger.addEventListener('click', () => {
        const aberto = menu.classList.toggle('is-open');
        burger.classList.toggle('is-open', aberto);
        document.body.classList.toggle('is-locked', aberto);
        burger.setAttribute('aria-expanded', String(aberto));
      });
      $$('a', menu).forEach(a => a.addEventListener('click', () => {
        menu.classList.remove('is-open');
        burger.classList.remove('is-open');
        document.body.classList.remove('is-locked');
      }));
    }
  }

  /* =========================================================
     9. TRANSIÇÃO ENTRE PÁGINAS
     ========================================================= */
  function transicao() {
    let wipe = $('.page-wipe');
    if (!wipe) {
      wipe = document.createElement('div');
      wipe.className = 'page-wipe';
      document.body.appendChild(wipe);
    }

    requestAnimationFrame(() => document.body.classList.remove('is-entering'));

    if (reduzido) return;
    document.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')
          || a.target === '_blank' || a.hasAttribute('download')) return;
      e.preventDefault();
      flash();
      wipe.classList.add('is-out');
      setTimeout(() => { location.href = href; }, 460);
    });
  }

  /* =========================================================
     10. FLASH DE RAIO NA TELA + TROVÃO (WebAudio, sem arquivo)
     ========================================================= */
  let ctxAudio = null;
  let somLigado = false;

  function flash(x) {
    const el = $('.fx-flash');
    if (!el || reduzido) return;
    el.style.setProperty('--fx', (x != null ? x : 50) + '%');
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  function trovao(forca) {
    if (!somLigado) return;
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxAudio;
      const dur = 1.6 + Math.random() * 1.4;
      const taxa = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, taxa * dur, taxa);
      const dados = buffer.getChannelData(0);
      // ruído marrom = grave, encorpado
      let last = 0;
      for (let i = 0; i < dados.length; i++) {
        const branco = Math.random() * 2 - 1;
        last = (last + 0.02 * branco) / 1.02;
        dados[i] = last * 3.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + dur);

      const g = ctx.createGain();
      const vol = 0.28 * (forca || 1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

      src.connect(lp).connect(g).connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch (_) { /* áudio indisponível: segue sem som */ }
  }

  function botaoSom() {
    const btn = $('[data-som]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      somLigado = !somLigado;
      btn.classList.toggle('is-on', somLigado);
      btn.setAttribute('aria-pressed', String(somLigado));
      btn.querySelector('span').textContent = somLigado ? 'Som ligado' : 'Som desligado';
      if (somLigado) trovao(.5);
    });
  }

  /* =========================================================
     11. LIGHTBOX DE TRAILER
     ========================================================= */
  function lightbox() {
    let lb = $('.lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = '<button class="lightbox__close" aria-label="Fechar">✕</button><div class="lightbox__frame"></div>';
      document.body.appendChild(lb);
    }
    const frame = $('.lightbox__frame', lb);

    function abrir(url) {
      const id = (url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/) || [])[1];
      frame.innerHTML = id
        ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen title="Trailer"></iframe>`
        : `<div class="empty" style="display:grid;place-items:center;height:100%">Trailer indisponível</div>`;
      lb.classList.add('is-open');
      document.body.classList.add('is-locked');
    }

    function fechar() {
      lb.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(() => { frame.innerHTML = ''; }, 400);
    }

    document.addEventListener('click', e => {
      const t = e.target.closest('[data-trailer]');
      if (t) { e.preventDefault(); abrir(t.dataset.trailer); }
      if (e.target.closest('.lightbox__close') || e.target === lb) fechar();
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

    window.CVLightbox = { abrir, fechar };
  }

  /* =========================================================
     12. TOASTS
     ========================================================= */
  function toast(msg, tipo) {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (tipo ? ' toast--' + tipo : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-going');
      setTimeout(() => t.remove(), 400);
    }, 3600);
  }

  /* =========================================================
     13. PARALLAX POR SCROLL
     ========================================================= */
  function parallax() {
    const els = $$('[data-parallax]');
    if (!els.length || reduzido) return;
    let tick = false;
    const atualizar = () => {
      const vh = innerHeight;
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const vel = parseFloat(el.dataset.parallax) || .2;
        const centro = r.top + r.height / 2 - vh / 2;
        el.style.transform = `translate3d(0, ${(-centro * vel).toFixed(1)}px, 0)`;
      });
      tick = false;
    };
    addEventListener('scroll', () => {
      if (!tick) { tick = true; requestAnimationFrame(atualizar); }
    }, { passive: true });
    atualizar();
  }

  /* =========================================================
     14. TEXTO DIVIDIDO EM LINHAS (para a animação de subida)
     ========================================================= */
  function splitLines(sel) {
    $$(sel || '[data-split]').forEach(el => {
      if (el.dataset.splitPronto) return;
      el.dataset.splitPronto = '1';
      const linhas = el.innerHTML.split(/<br\s*\/?>/i);
      el.innerHTML = linhas
        .map((l, i) => `<span class="split-line" style="--d:${i * 110}ms"><span>${l}</span></span>`)
        .join('');
    });
  }

  /* =========================================================
     15. NEWSLETTER
     ========================================================= */
  function newsletter() {
    $$('[data-newsletter]').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('input[type=email]', form);
        const btn = $('button', form);
        if (!input || !input.value) return;
        btn.disabled = true;
        try {
          await window.CV.assinar(input.value.trim());
          toast('Pronto! Você está na lista. ⚡', 'ok');
          input.value = '';
        } catch (err) {
          toast('Não consegui cadastrar agora. Tente de novo.', 'err');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  /* =========================================================
     INICIALIZAÇÃO
     ========================================================= */
  function init() {
    preloader();
    cursor();
    chrome();
    transicao();
    lightbox();
    botaoSom();
    splitLines();
    reveal();
    tilt();
    magnetico();
    marquee();
    contadores();
    parallax();
    newsletter();
  }

  window.FX = {
    init, reveal, tilt, magnetico, marquee, contadores, splitLines,
    flash, trovao, toast, parallax,
    get somLigado() { return somLigado; },
    reduzido, fino, $, $$, lerp, clamp
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
