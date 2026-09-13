/* ============================================================
   CINEVOLT — arcade.js
   Liga o labirinto do hero à página: placar, aviso de "você
   assumiu", raio ao comer a pílula (o volt do CINEVOLT) e os
   sprites da faixa de perseguição.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  /* ---------- Sprites em SVG: herói e fantasmas ---------- */
  function spriteFantasma(cor) {
    return `<svg class="sprite" viewBox="0 0 32 32" style="color:${cor}" aria-hidden="true">
      <path fill="${cor}" d="M16 2a12 12 0 0 0-12 12v16l4-3 4 3 4-3 4 3 4-3 4 3V14A12 12 0 0 0 16 2Z"/>
      <circle cx="11" cy="13" r="4.2" fill="#fff"/><circle cx="21" cy="13" r="4.2" fill="#fff"/>
      <circle cx="9.6" cy="13" r="2.1" fill="#14103a"/><circle cx="19.6" cy="13" r="2.1" fill="#14103a"/>
    </svg>`;
  }

  function spriteHeroi() {
    return `<svg class="sprite" viewBox="0 0 32 32" style="color:#ffd60a" aria-hidden="true">
      <path fill="#ffd60a" d="M16 16 29 8a15 15 0 1 0 0 16Z"/>
      <circle cx="16" cy="8.5" r="1.9" fill="rgba(20,10,0,.5)"/>
      <circle cx="8.5" cy="16" r="1.9" fill="rgba(20,10,0,.5)"/>
      <circle cx="16" cy="23.5" r="1.9" fill="rgba(20,10,0,.5)"/>
    </svg>`;
  }

  function montarPerseguicao() {
    const trilha = $('[data-perseguicao]');
    if (!trilha) return;
    trilha.innerHTML = spriteHeroi() +
      ['#ff2b4e', '#ff6ad5', '#22e7ff', '#ff9d2e'].map(spriteFantasma).join('');
  }

  /* ---------- Labirinto do hero ---------- */
  function iniciarLabirinto() {
    const cv = $('.arcade-hero__maze--frente');
    if (!cv || !window.Labirinto) return;
    if (window.FX && window.FX.reduzido) { cv.style.display = 'none'; return; }

    const placar = $('[data-placar]');
    const recordeEl = $('[data-recorde]');
    const dica = $('[data-dica]');

    let recorde = Number(localStorage.getItem('cinevolt:maze') || 0);
    if (recordeEl) recordeEl.textContent = String(recorde).padStart(6, '0');

    /* tempestade só para o efeito do raio ao comer a pílula */
    let storm = null;
    const cvRaio = $('.arcade-hero__raio');
    if (cvRaio && window.Storm) {
      storm = new window.Storm(cvRaio, {
        ambiente: false,
        intervalo: [999999, 999999],   // nunca sozinho: só quando pedimos
        cores: ['#ffd60a', '#fff08a', '#ff6ad5']
      });
      storm.start();
    }

    const lab = new window.Labirinto(cv, {
      canvasFundo: $('.arcade-hero__maze--fundo'),
      aoComer: pontos => {
        if (placar) placar.textContent = String(pontos).padStart(6, '0');
      },

      aoPilula: () => {
        // a pílula é o "volt": um raio atravessa o labirinto
        if (storm) {
          const r = cvRaio.getBoundingClientRect();
          storm.strike({
            para: { x: r.width * (.2 + Math.random() * .6), y: r.height * .9 },
            largura: 3.4, forca: 1.2
          });
        }
        window.FX && window.FX.flash(40 + Math.random() * 30);
        window.FX && window.FX.trovao(.7);
      },

      aoMorrer: pontos => {
        if (pontos > recorde) {
          recorde = pontos;
          localStorage.setItem('cinevolt:maze', String(pontos));
          if (recordeEl) recordeEl.textContent = String(recorde).padStart(6, '0');
        }
        window.FX && window.FX.flash();
      },

      aoAssumir: () => {
        if (!dica) return;
        dica.textContent = '1 PLAYER · VOCÊ ESTÁ NO CONTROLE';
        dica.classList.add('is-on');
      }
    });

    lab.start();
    window.CVLabirinto = lab;

    /* economiza bateria quando a aba sai de foco */
    document.addEventListener('visibilitychange', () => { lab.pausado = document.hidden; });
  }

  function montarLampadas() {
    const faixa = document.querySelector('[data-lampadas]');
    if (!faixa) return;
    const quantas = Math.max(12, Math.floor(innerWidth / 34));
    faixa.innerHTML = '<i></i>'.repeat(quantas);
  }

  function init() {
    montarLampadas();
    montarPerseguicao();
    iniciarLabirinto();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
