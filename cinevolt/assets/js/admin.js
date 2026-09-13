/* ============================================================
   CINEVOLT — admin.js
   Painel de publicação: login, lista, editor markdown com prévia,
   upload de imagem por arrastar-e-soltar, capa gerada, autosave
   local e publicação no Supabase.
   ============================================================ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const RASCUNHO_LOCAL = 'cinevolt:editor';

  /* Estado do post aberto no editor */
  let atual = vazio();
  let lista = [];

  function vazio() {
    return {
      id: null, slug: '', titulo: '', subtitulo: '', categoria: window.CINEVOLT.CATEGORIAS[0],
      tags: [], capa_url: null, arte_cena: null, nota: null, ano: null, duracao: null,
      diretor: '', autor: 'Redação CINEVOLT', trailer_url: '', destaque: false,
      status: 'rascunho', publicado_em: new Date().toISOString(), corpo: ''
    };
  }

  /* ---------------------------------------------------------
     Status na barra superior
     --------------------------------------------------------- */
  let statusTimer;
  function status(txt, tipo) {
    const el = $('[data-status]');
    if (!el) return;
    el.textContent = txt;
    el.className = 'painel__status' + (tipo ? ' is-' + tipo : '');
    clearTimeout(statusTimer);
    if (tipo === 'ok') statusTimer = setTimeout(() => { el.textContent = 'Pronto'; el.className = 'painel__status'; }, 2600);
  }

  /* =========================================================
     LOGIN
     ========================================================= */
  async function iniciarLogin() {
    const box = $('[data-login]');
    const painel = $('[data-painel]');

    if (window.CV.modoDemo) $('[data-login-demo]').hidden = false;

    const usuario = await window.CV.usuarioAtual();
    if (usuario || sessionStorage.getItem('cv:demo-logado')) return abrirPainel();

    $('[data-form-login]').addEventListener('submit', async e => {
      e.preventDefault();
      const erro = $('[data-login-erro]');
      erro.hidden = true;
      const email = e.target.email.value.trim();
      const senha = e.target.senha.value;
      try {
        await window.CV.entrar(email, senha);
        if (window.CV.modoDemo) sessionStorage.setItem('cv:demo-logado', '1');
        abrirPainel();
      } catch (err) {
        erro.hidden = false;
        erro.className = 'note note--err';
        erro.textContent = 'Não consegui entrar: ' + (err.message || 'verifique e-mail e senha');
      }
    });

    function abrirPainel() {
      box.hidden = true;
      box.style.display = 'none';
      painel.hidden = false;
      montarPainel();
    }
  }

  /* =========================================================
     LISTA
     ========================================================= */
  async function carregarLista(busca) {
    const box = $('[data-lista-admin]');
    try {
      const { dados } = await window.CV.listarPosts({
        tamanho: 100, incluirRascunhos: true, busca: busca || ''
      });
      lista = dados;
      if (!dados.length) {
        box.innerHTML = '<div class="empty" style="padding:24px">Nenhuma matéria ainda</div>';
        return;
      }
      box.innerHTML = dados.map(p => `
        <div class="item-post${atual.id && p.id === atual.id ? ' is-ativo' : ''}" data-abrir="${window.UI.esc(p.slug)}">
          <div class="item-post__titulo">${window.UI.esc(p.titulo || '(sem título)')}</div>
          <div class="item-post__meta">
            <span class="ponto${p.status === 'publicado' ? ' ponto--vivo' : ''}"></span>
            ${window.UI.esc(p.categoria || '')} · ${window.CV.dataBR(p.publicado_em) || 'sem data'}
          </div>
        </div>`).join('');
    } catch (_) {
      box.innerHTML = '<div class="empty" style="padding:24px">Erro ao listar</div>';
    }
  }

  /* =========================================================
     FORMULÁRIO <-> ESTADO
     ========================================================= */
  function paraFormulario(post) {
    atual = Object.assign(vazio(), post || {});
    $$('[data-campo]').forEach(el => {
      const k = el.dataset.campo;
      let v = atual[k];
      if (k === 'tags') v = (v || []).join(', ');
      if (k === 'publicado_em' && v) v = new Date(v).toISOString().slice(0, 16);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    });
    $('[data-excluir]').hidden = !atual.id;
    atualizarCapa();
    atualizarContador();
    atualizarPreview();
    document.querySelectorAll('.item-post').forEach(it =>
      it.classList.toggle('is-ativo', it.dataset.abrir === atual.slug));
  }

  function doFormulario() {
    $$('[data-campo]').forEach(el => {
      const k = el.dataset.campo;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'tags') v = String(v).split(',').map(t => t.trim()).filter(Boolean);
      if (['nota', 'ano', 'duracao'].includes(k)) v = v === '' ? null : Number(v);
      if (k === 'publicado_em') v = v ? new Date(v).toISOString() : new Date().toISOString();
      atual[k] = v;
    });
    if (!atual.slug && atual.titulo) atual.slug = window.CV.slugify(atual.titulo);
    return atual;
  }

  /* =========================================================
     CAPA
     ========================================================= */
  function atualizarCapa() {
    const box = $('[data-capa-preview]');
    const url = window.CV.capaDe(
      Object.assign({}, atual, { slug: atual.slug || atual.titulo || 'cinevolt' }),
      { w: 600 }
    );
    box.innerHTML = url ? `<img src="${url}" alt="Prévia da capa">` : '';
    $('[data-limpar-capa]').hidden = !atual.capa_url;
  }

  function ligarCapa() {
    $('[data-variar-arte]').addEventListener('click', () => {
      atual.capa_url = null;
      atual.arte_cena = ((atual.arte_cena == null ? -1 : Number(atual.arte_cena)) + 1) % 7;
      atualizarCapa();
      status('Nova variação de arte', 'ok');
    });

    $('[data-limpar-capa]').addEventListener('click', () => {
      atual.capa_url = null;
      atualizarCapa();
    });

    const input = $('[data-input-capa]');
    $('[data-subir-capa]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      status('Enviando imagem…', 'salvando');
      try {
        atual.capa_url = await window.CV.enviarImagem(f);
        atualizarCapa();
        status('Capa enviada', 'ok');
      } catch (e) {
        status('Falha no envio', 'erro');
        window.FX.toast('Não consegui enviar: ' + (e.message || ''), 'err');
      }
      input.value = '';
    });
  }

  /* =========================================================
     EDITOR: markdown, atalhos, prévia, arrastar imagem
     ========================================================= */
  function envolver(antes, depois, padrao) {
    const ta = $('[data-campo="corpo"]');
    const ini = ta.selectionStart, fim = ta.selectionEnd;
    const sel = ta.value.slice(ini, fim) || padrao || '';
    ta.setRangeText(antes + sel + (depois || ''), ini, fim, 'end');
    ta.focus();
    aoDigitar();
  }

  function prefixarLinha(prefixo) {
    const ta = $('[data-campo="corpo"]');
    const ini = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    ta.setRangeText(prefixo, ini, ini, 'end');
    ta.focus();
    aoDigitar();
  }

  const ACOES = {
    titulo: () => prefixarLinha('## '),
    negrito: () => envolver('**', '**', 'texto'),
    italico: () => envolver('*', '*', 'texto'),
    citacao: () => prefixarLinha('> '),
    lista: () => prefixarLinha('- '),
    numerada: () => prefixarLinha('1. '),
    separador: () => envolver('\n\n---\n\n', ''),
    link: () => {
      const url = prompt('Endereço do link:', 'https://');
      if (url) envolver('[', `](${url})`, 'texto do link');
    },
    imagem: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => inp.files[0] && inserirImagem(inp.files[0]);
      inp.click();
    }
  };

  async function inserirImagem(file) {
    status('Enviando imagem…', 'salvando');
    try {
      const url = await window.CV.enviarImagem(file);
      envolver(`\n\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n\n`, '');
      status('Imagem inserida', 'ok');
    } catch (e) {
      status('Falha no envio', 'erro');
      window.FX.toast('Não consegui enviar a imagem', 'err');
    }
  }

  function atualizarContador() {
    const txt = $('[data-campo="corpo"]').value.trim();
    const n = txt ? txt.split(/\s+/).length : 0;
    $('[data-contador]').textContent =
      `${n} palavra${n === 1 ? '' : 's'} · ${Math.max(1, Math.round(n / 200))} min`;
  }

  function atualizarPreview() {
    const pv = $('[data-preview]');
    if (pv.hidden) return;
    pv.innerHTML = window.MD.render($('[data-campo="corpo"]').value);
  }

  let autosave;
  function aoDigitar() {
    doFormulario();
    atualizarContador();
    atualizarPreview();
    clearTimeout(autosave);
    autosave = setTimeout(() => {
      try { localStorage.setItem(RASCUNHO_LOCAL, JSON.stringify(atual)); } catch (_) {}
      status('Rascunho guardado neste navegador');
    }, 900);
  }

  function ligarEditor() {
    const ta = $('[data-campo="corpo"]');

    $$('[data-md]').forEach(b =>
      b.addEventListener('click', () => ACOES[b.dataset.md] && ACOES[b.dataset.md]()));

    $('[data-toggle-previa]').addEventListener('click', e => {
      const pv = $('[data-preview]');
      pv.hidden = !pv.hidden;
      e.currentTarget.classList.toggle('is-on', !pv.hidden);
      atualizarPreview();
    });

    document.addEventListener('input', e => {
      if (e.target.matches('[data-campo]')) {
        if (e.target.dataset.campo === 'titulo' && !atual.id) {
          const slugEl = $('[data-campo="slug"]');
          if (!slugEl.dataset.tocado) slugEl.value = window.CV.slugify(e.target.value);
        }
        if (e.target.dataset.campo === 'categoria') atualizarCapa();
        aoDigitar();
      }
    });

    $('[data-campo="slug"]').addEventListener('input', e => {
      e.target.dataset.tocado = '1';
      atualizarCapa();
    });

    $('[data-regerar-slug]').addEventListener('click', () => {
      const s = window.CV.slugify($('[data-campo="titulo"]').value);
      $('[data-campo="slug"]').value = s;
      atual.slug = s;
      atualizarCapa();
    });

    /* Atalhos de teclado */
    ta.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const mapa = { b: 'negrito', i: 'italico', k: 'link', h: 'titulo' };
      if (mapa[e.key.toLowerCase()]) { e.preventDefault(); ACOES[mapa[e.key.toLowerCase()]](); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); salvar(atual.status === 'publicado'); }
    });

    /* Arrastar imagem para dentro do texto */
    ['dragenter', 'dragover'].forEach(ev =>
      ta.addEventListener(ev, e => { e.preventDefault(); ta.classList.add('is-arrastando'); }));
    ['dragleave', 'drop'].forEach(ev =>
      ta.addEventListener(ev, () => ta.classList.remove('is-arrastando')));
    ta.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) { e.preventDefault(); inserirImagem(f); }
    });

    /* Colar imagem da área de transferência */
    ta.addEventListener('paste', e => {
      const item = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); inserirImagem(item.getAsFile()); }
    });
  }

  /* =========================================================
     SALVAR / PUBLICAR / EXCLUIR
     ========================================================= */
  async function salvar(publicar) {
    doFormulario();

    if (!atual.titulo.trim()) { window.FX.toast('Dê um título antes de salvar', 'err'); return; }
    if (!atual.slug) atual.slug = window.CV.slugify(atual.titulo);
    if (publicar) atual.status = 'publicado';

    status(publicar ? 'Publicando…' : 'Salvando…', 'salvando');
    try {
      const salvo = await window.CV.salvarPost(atual);
      atual = Object.assign(atual, salvo);
      $('[data-campo="status"]').value = atual.status;
      $('[data-excluir]').hidden = false;
      localStorage.removeItem(RASCUNHO_LOCAL);
      status(publicar ? 'Publicado ⚡' : 'Rascunho salvo', 'ok');
      window.FX.toast(publicar ? 'No ar! A matéria já aparece no site.' : 'Rascunho salvo.', 'ok');
      await carregarLista($('[data-busca-admin]').value);
    } catch (e) {
      status('Erro ao salvar', 'erro');
      window.FX.toast('Erro: ' + (e.message || 'tente de novo'), 'err');
    }
  }

  async function excluir() {
    if (!atual.id) return;
    if (!confirm(`Excluir "${atual.titulo}"? Isso não tem volta.`)) return;
    try {
      await window.CV.excluirPost(atual.id);
      window.FX.toast('Matéria excluída', 'ok');
      paraFormulario(vazio());
      await carregarLista();
    } catch (e) {
      window.FX.toast('Não consegui excluir', 'err');
    }
  }

  /* =========================================================
     MONTAGEM
     ========================================================= */
  function montarPainel() {
    /* categorias no select */
    $('[data-campo="categoria"]').innerHTML =
      window.CINEVOLT.CATEGORIAS.map(c => `<option>${c}</option>`).join('');

    ligarEditor();
    ligarCapa();

    /* recupera rascunho local não salvo */
    let inicial = vazio();
    try {
      const guardado = JSON.parse(localStorage.getItem(RASCUNHO_LOCAL) || 'null');
      if (guardado && guardado.titulo && confirm('Encontrei um rascunho não salvo neste navegador. Continuar de onde parou?')) {
        inicial = guardado;
      }
    } catch (_) {}
    paraFormulario(inicial);

    carregarLista();

    /* abrir matéria da lista */
    $('[data-lista-admin]').addEventListener('click', async e => {
      const it = e.target.closest('[data-abrir]');
      if (!it) return;
      const post = lista.find(p => p.slug === it.dataset.abrir);
      if (post) { paraFormulario(post); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    let t;
    $('[data-busca-admin]').addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => carregarLista(e.target.value), 300);
    });

    $('[data-novo]').addEventListener('click', () => {
      paraFormulario(vazio());
      $('[data-campo="slug"]').dataset.tocado = '';
      $('[data-campo="titulo"]').focus();
    });

    $('[data-salvar]').addEventListener('click', () => salvar(false));
    $('[data-publicar]').addEventListener('click', () => salvar(true));
    $('[data-excluir]').addEventListener('click', excluir);

    $('[data-ver-site]').addEventListener('click', () => {
      const url = atual.slug ? '/post.html?p=' + encodeURIComponent(atual.slug) : '/';
      open(url, '_blank', 'noopener');
    });

    $('[data-sair]').addEventListener('click', async () => {
      await window.CV.sair();
      sessionStorage.removeItem('cv:demo-logado');
      location.reload();
    });

    /* Ctrl+S global */
    addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        salvar(false);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarLogin);
  else iniciarLogin();
})();
