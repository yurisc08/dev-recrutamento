/* ============================================================
   CINEVOLT — arquivo.js
   Filtro por editoria, busca com atraso e paginação.
   O estado vive na URL (?cat=&q=&pg=), então dá para compartilhar
   e o botão voltar do navegador funciona.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const estado = { categoria: 'Tudo', busca: '', pagina: 0, total: 0 };

  function lerURL() {
    const p = new URLSearchParams(location.search);
    estado.categoria = p.get('cat') || 'Tudo';
    estado.busca = p.get('q') || '';
    estado.pagina = Math.max(0, parseInt(p.get('pg') || '0', 10));
  }

  function escreverURL(push) {
    const p = new URLSearchParams();
    if (estado.categoria !== 'Tudo') p.set('cat', estado.categoria);
    if (estado.busca) p.set('q', estado.busca);
    if (estado.pagina) p.set('pg', estado.pagina);
    const url = location.pathname + (p.toString() ? '?' + p : '');
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function montarFiltros() {
    const box = $('[data-filtros]');
    if (!box) return;
    const cats = ['Tudo'].concat(window.CINEVOLT.CATEGORIAS);
    box.innerHTML = cats.map(c =>
      `<button class="pill${c === estado.categoria ? ' is-active' : ''}" data-cat="${c}">${c}</button>`).join('');

    box.addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      estado.categoria = b.dataset.cat;
      estado.pagina = 0;
      box.querySelectorAll('.pill').forEach(p => p.classList.toggle('is-active', p === b));
      escreverURL(true);
      carregar();
      window.FX && window.FX.flash();
    });
  }

  function montarBusca() {
    const input = $('[data-busca]');
    if (!input) return;
    input.value = estado.busca;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estado.busca = input.value.trim();
        estado.pagina = 0;
        escreverURL(false);
        carregar();
      }, 320);
    });
  }

  function montarPaginacao() {
    const box = $('[data-paginacao]');
    if (!box) return;
    const tam = window.CINEVOLT.PAGE_SIZE;
    const paginas = Math.ceil(estado.total / tam);
    if (paginas <= 1) { box.innerHTML = ''; return; }

    let html = `<button class="pill" data-pg="${estado.pagina - 1}" ${estado.pagina === 0 ? 'disabled' : ''}>← Anterior</button>`;
    for (let i = 0; i < paginas; i++) {
      html += `<button class="pill${i === estado.pagina ? ' is-active' : ''}" data-pg="${i}">${i + 1}</button>`;
    }
    html += `<button class="pill" data-pg="${estado.pagina + 1}" ${estado.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima →</button>`;
    box.innerHTML = html;

    box.onclick = e => {
      const b = e.target.closest('[data-pg]');
      if (!b || b.disabled) return;
      estado.pagina = parseInt(b.dataset.pg, 10);
      escreverURL(true);
      carregar();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    };
  }

  async function carregar() {
    const alvo = $('[data-lista]');
    alvo.style.opacity = '.35';
    try {
      const { dados, total } = await window.CV.listarPosts({
        categoria: estado.categoria,
        busca: estado.busca,
        pagina: estado.pagina
      });
      estado.total = total;
      window.UI.listar(alvo, dados);
      montarPaginacao();
    } catch (e) {
      alvo.innerHTML = '<div class="empty" style="grid-column:1/-1">Erro ao carregar o arquivo</div>';
    } finally {
      alvo.style.opacity = '1';
    }
  }

  function init() {
    const ano = document.getElementById('ano');
    if (ano) ano.textContent = new Date().getFullYear();
    lerURL();
    montarFiltros();
    montarBusca();
    carregar();
    window.UI.avisoDemo();
    addEventListener('popstate', () => { lerURL(); montarFiltros(); carregar(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
