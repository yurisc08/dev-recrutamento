/* ============================================================
   CINEVOLT — placar.js
   Liga o jogo ao ranking: mostra o formulário no game over,
   envia a pontuação e recarrega o Top 10.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  let ultimaPontuacao = 0;

  async function carregarRanking() {
    const lista = $('[data-ranking]');
    if (!lista) return;
    try {
      const dados = await window.CV.ranking(10);
      if (!dados.length) {
        lista.innerHTML = '<li class="empty">Ninguém pontuou ainda. Seja o primeiro.</li>';
        return;
      }
      lista.innerHTML = dados.map((r, i) => `
        <li class="ranking__item${i === 0 ? ' is-topo' : ''}">
          <span class="ranking__pos">${String(i + 1).padStart(2, '0')}</span>
          <span class="ranking__nome">${window.UI.esc(r.apelido)}</span>
          <span class="ranking__pts">${Number(r.pontos).toLocaleString('pt-BR')}</span>
        </li>`).join('');
    } catch (_) {
      lista.innerHTML = '<li class="empty">Não consegui carregar o placar</li>';
    }
  }

  function init() {
    const ano = document.getElementById('ano');
    if (ano) ano.textContent = new Date().getFullYear();

    carregarRanking();

    document.addEventListener('jogo:fim', e => {
      ultimaPontuacao = e.detail.pontos;
      const painel = $('[data-fim]');
      const num = $('[data-pontos-final]');
      if (num) num.textContent = ultimaPontuacao;
      if (painel && ultimaPontuacao > 0) painel.hidden = false;
      window.FX && window.FX.flash();
    });

    const form = $('[data-form-placar]');
    if (form) {
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const input = form.querySelector('input');
        const btn = form.querySelector('button');
        const apelido = input.value.trim().slice(0, 14);
        if (!apelido || ultimaPontuacao <= 0) return;

        btn.disabled = true;
        try {
          await window.CV.salvarPontuacao(apelido, ultimaPontuacao);
          window.FX.toast('Pontuação registrada ⚡', 'ok');
          localStorage.setItem('cinevolt:apelido', apelido);
          $('[data-fim]').hidden = true;
          await carregarRanking();
        } catch (_) {
          window.FX.toast('Não consegui enviar agora', 'err');
        } finally {
          btn.disabled = false;
        }
      });

      const salvo = localStorage.getItem('cinevolt:apelido');
      if (salvo) form.querySelector('input').value = salvo;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
