/* ============================================================
   CINEVOLT — hero.js
   Orquestra o palco: a tempestade mira o martelo do Guardião,
   as camadas reagem ao mouse (parallax), o flash e o trovão
   disparam junto do raio e a figura "leva o impacto".
   ============================================================ */

(function () {
  'use strict';

  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function iniciarHero() {
    const hero = document.querySelector('.cine-hero');
    if (!hero) return;

    const canvas = hero.querySelector('.ch-bolts');
    const figura = hero.querySelector('.ch-figure');
    const nucleo = hero.querySelector('#nucleoMartelo');

    /* ---- Ponto que os raios procuram: o núcleo do martelo ---- */
    function alvo() {
      const cr = canvas.getBoundingClientRect();
      if (nucleo && nucleo.getBoundingClientRect) {
        const nr = nucleo.getBoundingClientRect();
        if (nr.width) {
          return { x: nr.left + nr.width / 2 - cr.left, y: nr.top + nr.height / 2 - cr.top };
        }
      }
      return { x: cr.width * 0.66, y: cr.height * 0.3 };
    }

    if (!canvas || !window.Storm || reduzido) return;

    const storm = new window.Storm(canvas, {
      alvo,
      intervalo: [1700, 3900],
      cores: ['#9fe9ff', '#cfefff', '#b9a6ff'],
      aoRaio: ({ x, forca }) => {
        const w = canvas.getBoundingClientRect().width || 1;
        window.FX && window.FX.flash((x / w) * 100);
        window.FX && window.FX.trovao(forca);
        if (figura) {
          figura.classList.remove('is-hit');
          void figura.offsetWidth;
          figura.classList.add('is-hit');
        }
      }
    });

    storm.start();

    /* ---- Segunda tempestade, ATRÁS da figura: raios distantes
            caindo no horizonte, que dão profundidade à cena ---- */
    const fundo = hero.querySelector('.ch-bolts--back');
    let stormFundo = null;
    if (fundo) {
      stormFundo = new window.Storm(fundo, {
        ambiente: false,
        densidade: 0.5,
        intervalo: [2600, 6000],
        cores: ['#6fc8ff', '#8fb6ff', '#9a7cff'],
        alvo: () => {
          const r = fundo.getBoundingClientRect();
          return { x: r.width * (0.08 + Math.random() * 0.84), y: r.height * (0.80 + Math.random() * 0.12) };
        },
        aoRaio: ({ x }) => {
          const w = fundo.getBoundingClientRect().width || 1;
          window.FX && window.FX.flash((x / w) * 100);
        }
      });
      stormFundo.start();
      window.CVStormFundo = stormFundo;
    }

    /* ---- Raio sob demanda: clique no palco ---- */
    hero.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      const cr = canvas.getBoundingClientRect();
      storm.strike({
        para: alvo(),
        deX: e.clientX - cr.left,
        deY: -20,
        largura: 3.2,
        forca: 1.2
      });
    });

    /* ---- Parallax das camadas conforme o mouse ---- */
    const camadas = Array.from(hero.querySelectorAll('[data-depth]'));
    if (camadas.length && window.matchMedia('(hover: hover)').matches) {
      let mx = 0, my = 0, cx = 0, cy = 0;

      hero.addEventListener('mousemove', e => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
      }, { passive: true });

      hero.addEventListener('mouseleave', () => { mx = 0; my = 0; });

      (function anim() {
        cx += (mx - cx) * 0.06;
        cy += (my - cy) * 0.06;
        camadas.forEach(c => {
          const d = parseFloat(c.dataset.depth) || 10;
          c.style.transform = `translate3d(${(-cx * d).toFixed(2)}px, ${(-cy * d * 0.6).toFixed(2)}px, 0)`;
        });
        requestAnimationFrame(anim);
      })();
    }

    /* ---- Arcos elétricos seguindo o cursor perto do martelo ---- */
    hero.addEventListener('mousemove', e => {
      if (Math.random() > 0.055) return;
      const cr = canvas.getBoundingClientRect();
      const a = alvo();
      const px = e.clientX - cr.left;
      const py = e.clientY - cr.top;
      if (Math.hypot(px - a.x, py - a.y) < 380) storm.arco(a.x, a.y, px, py);
    }, { passive: true });

    /* ---- Rajada de boas-vindas ---- */
    setTimeout(() => storm.strike({ largura: 3.6, forca: 1.4, raioClarao: 320 }), 900);

    window.CVStorm = storm;
  }

  /* Nuvens: bloco SVG com turbulência, injetado nas camadas marcadas */
  function nuvens() {
    document.querySelectorAll('[data-nuvens]').forEach((el, i) => {
      const seed = 3 + i * 7;
      const freq = el.dataset.nuvens || '0.009';
      el.innerHTML = `
        <svg width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <filter id="nuvem${i}">
            <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="5" seed="${seed}" result="n"/>
            <feColorMatrix in="n" type="matrix"
              values="0 0 0 0 0.36  0 0 0 0 0.64  0 0 0 0 0.95  0 0 0 -1.5 1.05"/>
          </filter>
          <rect width="100%" height="100%" filter="url(#nuvem${i})"/>
        </svg>`;
    });
  }

  function init() { nuvens(); iniciarHero(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
