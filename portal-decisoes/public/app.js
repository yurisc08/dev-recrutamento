'use strict';
/* Portal de Decisões — front-end sem dependências externas. */

const estado = {
  ctx: null,
  colunas: [],
  itens: [],
  total: 0,
  pagina: 1,
  porPagina: 50,
  ordenar: 'nome',
  direcao: 'asc',
  selecao: new Set(),
  vista: 'resumo',
  resumo: null,
  importacao: null,
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/* ---------------- infraestrutura ---------------- */

async function api(metodo, caminho, corpo, opcoes = {}) {
  const req = { method: metodo, headers: { 'x-portal': '1' }, credentials: 'same-origin' };
  if (corpo instanceof FormData) req.body = corpo;
  else if (corpo !== undefined) {
    req.headers['Content-Type'] = 'application/json';
    req.body = JSON.stringify(corpo);
  }
  const resposta = await fetch(caminho, req);
  if (opcoes.bruto) return resposta;
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!resposta.ok) {
    if (resposta.status === 401) mostrarLogin();
    if (resposta.status === 403 && dados?.detalhes?.trocar_senha) mostrarTrocaSenha();
    const erro = new Error(dados.erro || 'Falha na operação.');
    erro.status = resposta.status;
    erro.detalhes = dados.detalhes;
    throw erro;
  }
  return dados;
}

let temporizadorAviso;
function avisar(texto, tipo = 'ok') {
  const caixa = $('#aviso-flutuante');
  caixa.textContent = texto;
  caixa.className = `aviso-flutuante ${tipo}`;
  caixa.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { caixa.hidden = true; }, tipo === 'erro' ? 7000 : 3500);
}

function texto(valor) {
  return valor === null || valor === undefined ? '' : String(valor);
}

function el(tag, props = {}, filhos = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v; // CSSOM: permitido pela CSP (style-src 'self')
    else if (k === 'texto') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const filho of [].concat(filhos)) if (filho) node.append(filho);
  return node;
}

function limpar(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

function dataBR(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
function dataHoraBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function moedaBR(n) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function formatarValor(valor, coluna) {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (coluna.tipo) {
    case 'data': return dataBR(valor);
    case 'moeda': return moedaBR(valor);
    case 'numero': return numero(valor);
    case 'booleano': return Number(valor) ? 'Sim' : 'Não';
    default: return String(valor);
  }
}

const CORES_ACAO = { desligamento: 'var(--desligamento)', transferencia: 'var(--transferencia)', manter: 'var(--manter)', pendente: 'var(--pendente)' };
function corDaAcao(valor) {
  const acao = estado.ctx?.config.acoes.find((a) => a.valor === valor);
  if (!acao) return valor ? 'var(--extra)' : 'var(--pendente)';
  return CORES_ACAO[acao.cor] || 'var(--extra)';
}
function classeSelo(valor) {
  const acao = estado.ctx?.config.acoes.find((a) => a.valor === valor);
  return acao && CORES_ACAO[acao.cor] ? `selo-${acao.cor}` : 'selo-pendente';
}

/* ---------------- sessão ---------------- */

function mostrarLogin() {
  $('#app').hidden = true;
  $('#tela-senha').hidden = true;
  $('#tela-login').hidden = false;
}
function mostrarTrocaSenha() {
  $('#app').hidden = true;
  $('#tela-login').hidden = true;
  $('#tela-senha').hidden = false;
}

function aplicarContexto(ctx) {
  estado.ctx = ctx;
  estado.colunas = ctx.colunas;
  $('#tela-login').hidden = true;
  $('#tela-senha').hidden = true;
  $('#app').hidden = false;

  $('#titulo-portal').textContent = ctx.config.titulo;
  document.title = ctx.config.titulo;
  $('#info-usuario').textContent = `${ctx.usuario.nome} · ${ctx.usuario.perfil_descricao}`;
  $('#aviso-conf').textContent = `⚠ ${ctx.config.aviso_confidencialidade}`;

  const prazo = ctx.config.prazo;
  if (prazo) {
    const dias = Math.ceil((new Date(prazo + 'T23:59:59') - new Date()) / 86400000);
    $('#info-prazo').textContent = dias >= 0 ? `Prazo ${dataBR(prazo)} · ${dias} dia(s)` : `Prazo vencido em ${dataBR(prazo)}`;
  } else {
    $('#info-prazo').hidden = true;
  }

  for (const node of $$('[data-perfil]')) {
    node.hidden = !node.dataset.perfil.split(',').includes(ctx.usuario.perfil);
  }
  $('#btn-homologar').hidden = !ctx.permissoes.homologar;

  for (const seletor of ['#filtro-escopo', '#resumo-escopo']) {
    const select = $(seletor);
    limpar(select).append(el('option', { value: '', texto: seletor === '#resumo-escopo' ? 'Todas as divisões' : 'Todas' }));
    for (const valor of ctx.escopos_disponiveis) select.append(el('option', { value: valor, texto: valor }));
  }
  const filtroAcao = $('#filtro-acao');
  limpar(filtroAcao).append(el('option', { value: '', texto: 'Todas' }), el('option', { value: '__sem__', texto: 'Sem indicação' }));
  for (const a of ctx.config.acoes) filtroAcao.append(el('option', { value: a.valor, texto: a.valor }));

  irPara(estado.vista);
}

async function carregarSessao() {
  try {
    const dados = await api('GET', '/api/auth/eu');
    if (dados.trocar_senha) return mostrarTrocaSenha();
    aplicarContexto(dados);
  } catch {
    mostrarLogin();
  }
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#login-msg');
  msg.hidden = true;
  try {
    const dados = await api('POST', '/api/auth/login', {
      usuario: $('#login-usuario').value.trim(),
      senha: $('#login-senha').value,
    });
    $('#login-senha').value = '';
    if (dados.trocar_senha) return mostrarTrocaSenha();
    aplicarContexto(dados);
  } catch (erro) {
    msg.textContent = erro.message;
    msg.hidden = false;
  }
});

$('#form-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#senha-msg');
  msg.hidden = true;
  if ($('#senha-nova').value !== $('#senha-nova2').value) {
    msg.textContent = 'A confirmação não confere com a nova senha.';
    msg.hidden = false;
    return;
  }
  try {
    const ctx = await api('POST', '/api/auth/senha', {
      senha_atual: $('#senha-atual').value,
      nova_senha: $('#senha-nova').value,
    });
    $('#form-senha').reset();
    aplicarContexto(ctx);
    avisar('Senha atualizada.');
  } catch (erro) {
    msg.textContent = erro.message;
    msg.hidden = false;
  }
});

$('#btn-sair').addEventListener('click', async () => {
  try { await api('POST', '/api/auth/logout'); } catch { /* sessão já encerrada */ }
  estado.ctx = null;
  mostrarLogin();
});

$('#btn-tema').addEventListener('click', () => {
  const atual = document.documentElement.dataset.tema;
  const escuro = atual ? atual === 'escuro' : matchMedia('(prefers-color-scheme: dark)').matches;
  const novo = escuro ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = novo;
  try { localStorage.setItem('pd-tema', novo); } catch { /* armazenamento indisponível */ }
});
try {
  const tema = localStorage.getItem('pd-tema');
  if (tema) document.documentElement.dataset.tema = tema;
} catch { /* armazenamento indisponível */ }

/* ---------------- navegação ---------------- */

function irPara(vista) {
  estado.vista = vista;
  for (const aba of $$('.aba')) aba.setAttribute('aria-selected', String(aba.dataset.vista === vista));
  for (const secao of $$('.vista')) secao.hidden = secao.id !== `vista-${vista}`;
  const carregar = {
    resumo: carregarResumo,
    base: carregarBase,
    colunas: carregarColunas,
    importar: carregarImportacoes,
    usuarios: carregarUsuarios,
    auditoria: carregarAuditoria,
    config: carregarConfig,
  }[vista];
  if (carregar) carregar().catch((e) => avisar(e.message, 'erro'));
}

for (const aba of $$('.aba')) aba.addEventListener('click', () => irPara(aba.dataset.vista));

/* ---------------- resumo ---------------- */

async function carregarResumo() {
  const escopo = $('#resumo-escopo').value;
  const resumo = await api('GET', `/api/resumo${escopo ? `?escopo=${encodeURIComponent(escopo)}` : ''}`);
  estado.resumo = resumo;
  const t = resumo.totais;

  const kpis = [
    { rotulo: 'Colaboradores na base', valor: numero(t.total), nota: `Posição de ${dataBR(resumo.posicao_base)}` },
    { rotulo: 'Elegíveis a decisão', valor: numero(t.elegiveis), nota: `${numero(t.desligados_base)} já desligados na posição base` },
    { rotulo: 'Decisões preenchidas', valor: `${t.percentual}%`, nota: `${numero(t.decididos)} de ${numero(t.elegiveis)}`, progresso: t.percentual },
    { rotulo: 'Pendentes', valor: numero(t.pendentes), nota: 'Sem ação indicada', destaque: t.pendentes > 0 },
    { rotulo: 'Homologadas', valor: numero(t.homologados), nota: 'Confirmadas pela diretoria' },
    {
      rotulo: 'Estabilidade / afastamento',
      valor: numero(t.com_estabilidade),
      nota: `${numero(t.estabilidade_com_desligamento)} com desligamento indicado`,
      destaque: t.estabilidade_com_desligamento > 0,
    },
  ];
  if (resumo.coluna_soma) {
    kpis.push({
      rotulo: `${resumo.coluna_soma.rotulo} — desligamentos`,
      valor: moedaBR(t.custo_desligamentos),
      nota: `De ${moedaBR(t.custo_total)} na base`,
    });
  }

  const caixa = limpar($('#kpis'));
  for (const k of kpis) {
    const node = el('div', { class: `kpi${k.destaque ? ' kpi-destaque' : ''}` }, [
      el('div', { class: 'rotulo', texto: k.rotulo }),
      el('div', { class: 'valor', texto: k.valor }),
      el('div', { class: 'nota', texto: k.nota }),
    ]);
    if (k.progresso !== undefined) {
      node.append(el('div', { class: 'progresso', style: 'margin-top:8px' }, [
        el('div', { style: `width:${Math.min(k.progresso, 100)}%` }),
      ]));
    }
    caixa.append(node);
  }

  // Barras horizontais com rótulo e valor diretos (identidade nunca só pela cor).
  const maximo = Math.max(...resumo.acoes.map((a) => a.total), 1);
  const grafico = limpar($('#grafico-acoes'));
  for (const acao of resumo.acoes) {
    const cor = acao.valor === 'Sem indicação' ? 'var(--pendente)' : corDaAcao(acao.valor);
    const pct = t.elegiveis ? Math.round((acao.total / t.elegiveis) * 100) : 0;
    grafico.append(el('div', { class: 'barra-linha' }, [
      el('div', { class: 'barra-rotulo' }, [
        el('span', { class: 'barra-chip', style: `background:${cor}` }),
        el('span', { texto: acao.valor }),
      ]),
      el('div', { class: 'barra-trilho' }, [
        el('div', { class: 'barra-valor-fill', style: `width:${(acao.total / maximo) * 100}%;background:${cor}` }),
      ]),
      el('div', { class: 'barra-numero' }, [
        el('span', { texto: `${numero(acao.total)} ` }),
        el('span', { texto: `(${pct}%)` }),
      ]),
    ]));
  }

  montarTabela($('#tabela-escopos'),
    ['Divisão', 'Total', 'Desligados na base', 'Pendentes', 'Desligamentos', 'Transferências', 'Manter', 'Homologadas'],
    resumo.por_escopo.map((e) => [
      e.escopo, numero(e.total), numero(e.desligados_base), numero(e.pendentes),
      numero(e.desligamentos), numero(e.transferencias), numero(e.manter), numero(e.homologados),
    ]),
    { numericas: [1, 2, 3, 4, 5, 6, 7] });

  const quebras = limpar($('#quebras'));
  for (const q of resumo.quebras) {
    const cartao = el('div', { class: 'cartao' }, [el('h2', { texto: `Por ${q.rotulo}` })]);
    const tabela = el('table');
    cartao.append(el('div', { class: 'tabela-simples' }, [tabela]));
    montarTabela(tabela, [q.rotulo, 'Total', 'Pendentes', 'Desligamentos'],
      q.linhas.map((l) => [l.valor, numero(l.total), numero(l.pendentes), numero(l.desligamentos)]),
      { numericas: [1, 2, 3] });
    quebras.append(cartao);
  }
}

function montarTabela(tabela, cabecalhos, linhas, opcoes = {}) {
  limpar(tabela);
  const thead = el('thead');
  const trCab = el('tr');
  cabecalhos.forEach((c, i) =>
    trCab.append(el('th', { class: `sem-ordem${(opcoes.numericas || []).includes(i) ? ' num' : ''}`, texto: c })));
  thead.append(trCab);
  tabela.append(thead);
  const tbody = el('tbody');
  if (linhas.length === 0) {
    tbody.append(el('tr', {}, [el('td', { class: 'vazio', colspan: cabecalhos.length, texto: opcoes.vazio || 'Nada a exibir.' })]));
  }
  for (const linha of linhas) {
    const tr = el('tr');
    linha.forEach((valor, i) => {
      const td = el('td', { class: (opcoes.numericas || []).includes(i) ? 'num' : '' });
      if (valor instanceof Node) td.append(valor);
      else td.textContent = texto(valor);
      tr.append(td);
    });
    tbody.append(tr);
  }
  tabela.append(tbody);
  return tabela;
}

$('#resumo-escopo').addEventListener('change', () => carregarResumo().catch((e) => avisar(e.message, 'erro')));
$('#btn-exportar-resumo').addEventListener('click', () => exportar($('#resumo-escopo').value));
$('#btn-exportar-base').addEventListener('click', () => exportar($('#filtro-escopo').value));
$('#btn-exportar-tudo').addEventListener('click', () => exportar(''));

function exportar(escopo) {
  const url = `/api/planilha/exportar${escopo ? `?escopo=${encodeURIComponent(escopo)}` : ''}`;
  window.location.assign(url);
}

/* ---------------- base de decisões ---------------- */

let temporizadorBusca;
function agendarBusca() {
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => { estado.pagina = 1; carregarBase().catch((e) => avisar(e.message, 'erro')); }, 300);
}
$('#filtro-busca').addEventListener('input', agendarBusca);
for (const id of ['#filtro-escopo', '#filtro-status', '#filtro-acao', '#filtro-estabilidade']) {
  $(id).addEventListener('change', () => { estado.pagina = 1; carregarBase().catch((e) => avisar(e.message, 'erro')); });
}
$('#por-pagina').addEventListener('change', () => {
  estado.porPagina = Number($('#por-pagina').value);
  estado.pagina = 1;
  carregarBase().catch((e) => avisar(e.message, 'erro'));
});
$('#btn-limpar-filtros').addEventListener('click', () => {
  $('#filtro-busca').value = '';
  $('#filtro-escopo').value = '';
  $('#filtro-status').value = '';
  $('#filtro-acao').value = '';
  $('#filtro-estabilidade').checked = false;
  estado.pagina = 1;
  carregarBase().catch((e) => avisar(e.message, 'erro'));
});
$('#pag-anterior').addEventListener('click', () => {
  if (estado.pagina > 1) { estado.pagina--; carregarBase().catch((e) => avisar(e.message, 'erro')); }
});
$('#pag-proxima').addEventListener('click', () => {
  estado.pagina++;
  carregarBase().catch((e) => avisar(e.message, 'erro'));
});

function parametrosBase() {
  const p = new URLSearchParams();
  const busca = $('#filtro-busca').value.trim();
  if (busca) p.set('busca', busca);
  if ($('#filtro-escopo').value) p.set('escopo', $('#filtro-escopo').value);
  if ($('#filtro-status').value) p.set('status', $('#filtro-status').value);
  if ($('#filtro-acao').value) p.set('acao', $('#filtro-acao').value);
  if ($('#filtro-estabilidade').checked) p.set('estabilidade', '1');
  p.set('pagina', String(estado.pagina));
  p.set('por_pagina', String(estado.porPagina));
  p.set('ordenar', estado.ordenar);
  p.set('direcao', estado.direcao);
  return p;
}

async function carregarBase() {
  const dados = await api('GET', `/api/colaboradores?${parametrosBase()}`);
  estado.itens = dados.itens;
  estado.total = dados.total;
  estado.pagina = dados.pagina;
  desenharBase(dados);
}

function podeEditarDecisao(item) {
  const ctx = estado.ctx;
  if (!ctx) return false;
  if (item.status === 'desligado') return ctx.usuario.perfil === 'admin';
  if (item.homologado && ctx.usuario.perfil === 'gestor') return false;
  return true;
}

function desenharBase(dados) {
  const tabela = limpar($('#tabela-base'));
  const ctx = estado.ctx;
  const colunasVisiveis = estado.colunas.filter(
    (c) => c.visivel && !['matricula', 'nome', 'observacoes'].includes(c.chave)
  );

  const thead = el('thead');
  const tr = el('tr');
  if (ctx.permissoes.homologar) {
    tr.append(el('th', { class: 'sem-ordem' }, [
      el('input', { type: 'checkbox', title: 'Selecionar página', onchange: (ev) => {
        for (const item of estado.itens) {
          if (ev.target.checked) estado.selecao.add(item.id); else estado.selecao.delete(item.id);
        }
        desenharBase({ total: estado.total, pagina: estado.pagina, paginas: Math.ceil(estado.total / estado.porPagina) });
      } }),
    ]));
  }
  // Decisão fica logo após o nome: é a coluna de trabalho e não pode exigir rolagem horizontal.
  const cabecalhos = [
    { chave: 'matricula', rotulo: 'Matrícula' },
    { chave: 'nome', rotulo: 'Nome' },
    { chave: 'acao', rotulo: 'Ação indicada' },
    { chave: 'justificativa', rotulo: 'Justificativa' },
    { chave: '__status__', rotulo: 'Status' },
    ...colunasVisiveis,
    { chave: '__detalhe__', rotulo: '' },
  ];
  for (const c of cabecalhos) {
    const ordenavel = !c.chave.startsWith('__') && c.chave !== 'justificativa';
    const th = el('th', {
      class: ordenavel ? '' : 'sem-ordem',
      texto: c.rotulo + (estado.ordenar === c.chave ? (estado.direcao === 'asc' ? ' ▲' : ' ▼') : ''),
      title: c.ajuda || '',
    });
    if (ordenavel) {
      th.addEventListener('click', () => {
        estado.direcao = estado.ordenar === c.chave && estado.direcao === 'asc' ? 'desc' : 'asc';
        estado.ordenar = c.chave;
        carregarBase().catch((e) => avisar(e.message, 'erro'));
      });
    }
    tr.append(th);
  }
  thead.append(tr);
  tabela.append(thead);

  const tbody = el('tbody');
  if (estado.itens.length === 0) {
    tbody.append(el('tr', {}, [el('td', { class: 'vazio', colspan: cabecalhos.length + 1, texto: 'Nenhum colaborador encontrado com os filtros atuais.' })]));
  }

  for (const item of estado.itens) {
    const linha = el('tr', { class: estado.selecao.has(item.id) ? 'selecionada' : '' });
    if (ctx.permissoes.homologar) {
      linha.append(el('td', {}, [
        el('input', {
          type: 'checkbox', checked: estado.selecao.has(item.id),
          onchange: (ev) => {
            if (ev.target.checked) estado.selecao.add(item.id); else estado.selecao.delete(item.id);
            linha.classList.toggle('selecionada', ev.target.checked);
          },
        }),
      ]));
    }
    linha.append(el('td', { class: 'col-fixa mono', texto: item.matricula }));
    linha.append(el('td', { class: 'col-nome', texto: item.nome || '', title: item.nome || '' }));

    // Ação indicada
    const tdAcao = el('td');
    if (podeEditarDecisao(item)) {
      const select = el('select', { class: 'acao-select celula-editavel' });
      select.append(el('option', { value: '', texto: '— selecionar —' }));
      for (const a of ctx.config.acoes) {
        select.append(el('option', { value: a.valor, texto: a.valor, ...(item.acao === a.valor ? { selected: true } : {}) }));
      }
      select.value = item.acao || '';
      select.addEventListener('change', () => salvarCampo(item, { acao: select.value || null }, select));
      tdAcao.append(select);
    } else {
      tdAcao.append(el('span', { class: `selo ${classeSelo(item.acao)}`, texto: item.acao || (item.status === 'desligado' ? 'Desligado' : 'Pendente') }));
    }
    linha.append(tdAcao);

    // Justificativa
    const tdJust = el('td');
    if (podeEditarDecisao(item)) {
      const campo = el('input', { type: 'text', class: 'just-input celula-editavel', value: item.justificativa || '', placeholder: 'Opcional — obrigatório em transferências' });
      campo.addEventListener('change', () => salvarCampo(item, { justificativa: campo.value }, campo));
      tdJust.append(campo);
    } else {
      tdJust.textContent = item.justificativa || '';
    }
    linha.append(tdJust);

    // Status + alertas
    const tdStatus = el('td');
    const rotuloStatus = { desligado: 'Desligado na base', pendente: 'Pendente', preenchido: 'Preenchido', homologado: 'Homologado' }[item.status];
    tdStatus.append(el('span', { class: `selo selo-${item.status === 'homologado' ? 'homologado' : item.status === 'preenchido' ? 'manter' : 'pendente'}`, texto: rotuloStatus }));
    const bloqueio = item.alertas.filter((a) => a.tipo !== 'info');
    if (bloqueio.length) {
      tdStatus.append(el('span', { class: 'alerta-icone', title: bloqueio.map((a) => a.texto).join('\n'), texto: ' ⚠' }));
    }
    linha.append(tdStatus);

    for (const coluna of colunasVisiveis) {
      const valor = formatarValor(item.dados[coluna.chave], coluna);
      linha.append(el('td', {
        class: ['numero', 'moeda'].includes(coluna.tipo) ? 'num celula-dado' : 'celula-dado',
        texto: valor,
        title: valor,
      }));
    }

    linha.append(el('td', {}, [
      el('button', { class: 'btn btn-pequeno', type: 'button', texto: 'Detalhes', onclick: () => abrirColaborador(item.id) }),
    ]));
    tbody.append(linha);
  }
  tabela.append(tbody);

  const paginas = Math.max(Math.ceil(estado.total / estado.porPagina), 1);
  $('#base-contagem').textContent = `${numero(estado.total)} colaborador(es)` +
    (estado.selecao.size ? ` · ${estado.selecao.size} selecionado(s)` : '');
  $('#pag-info').textContent = `Página ${estado.pagina} de ${paginas}`;
  $('#pag-anterior').disabled = estado.pagina <= 1;
  $('#pag-proxima').disabled = estado.pagina >= paginas;
  void dados;
}

async function salvarCampo(item, alteracoes, campoNode) {
  try {
    const atualizado = await api('PATCH', `/api/colaboradores/${item.id}`, alteracoes);
    Object.assign(item, atualizado);
    if (campoNode) {
      campoNode.style.borderColor = 'var(--manter)';
      setTimeout(() => { campoNode.style.borderColor = ''; }, 1200);
    }
    avisar('Decisão registrada.');
    const bloqueios = atualizado.alertas.filter((a) => a.tipo === 'bloqueio');
    if (bloqueios.length) avisar(bloqueios[0].texto, 'erro');
  } catch (erro) {
    avisar(erro.message, 'erro');
    if (campoNode) {
      campoNode.style.borderColor = 'var(--desligamento)';
      if (campoNode.tagName === 'SELECT') campoNode.value = item.acao || '';
      else campoNode.value = item.justificativa || '';
      setTimeout(() => { campoNode.style.borderColor = ''; }, 2000);
    }
  }
}

$('#btn-homologar').addEventListener('click', async () => {
  if (estado.selecao.size === 0) return avisar('Selecione ao menos um colaborador.', 'erro');
  if (!confirm(`Homologar ${estado.selecao.size} decisão(ões)? O gestor não poderá mais alterá-las.`)) return;
  try {
    await api('POST', '/api/colaboradores/homologar', { ids: [...estado.selecao], homologado: true });
    estado.selecao.clear();
    await carregarBase();
    avisar('Decisões homologadas.');
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

/* ---------------- detalhe do colaborador ---------------- */

const dlgColab = $('#dlg-colaborador');
for (const btn of $$('[data-fechar]')) btn.addEventListener('click', (ev) => ev.target.closest('dialog').close());

async function abrirColaborador(id) {
  const [item, historico] = await Promise.all([
    api('GET', `/api/colaboradores/${id}`),
    api('GET', `/api/colaboradores/${id}/historico`).catch(() => ({ itens: [] })),
  ]);
  $('#dlg-colab-titulo').textContent = `${item.nome || 'Colaborador'} · ${item.matricula}`;
  const corpo = limpar($('#dlg-colab-corpo'));
  const editaveis = {};

  for (const alerta of item.alertas) {
    corpo.append(el('div', { class: `msg ${alerta.tipo === 'bloqueio' ? 'msg-erro' : alerta.tipo === 'atencao' ? 'msg-info' : 'msg-info'}`, texto: alerta.texto }));
  }

  const grade = el('div', { class: 'grade-2' });
  for (const coluna of estado.colunas) {
    if (coluna.chave === 'matricula') continue;
    const valor = item.dados[coluna.chave];
    const campo = el('div', { class: 'campo' }, [el('label', { texto: coluna.rotulo, title: coluna.ajuda || '' })]);
    if (coluna.editavel_por_mim) {
      let entrada;
      if (coluna.tipo === 'lista') {
        entrada = el('select');
        entrada.append(el('option', { value: '', texto: '—' }));
        for (const o of coluna.opcoes || []) entrada.append(el('option', { value: o, texto: o }));
        entrada.value = valor || '';
      } else if (coluna.tipo === 'booleano') {
        entrada = el('select');
        entrada.append(el('option', { value: '', texto: '—' }), el('option', { value: '1', texto: 'Sim' }), el('option', { value: '0', texto: 'Não' }));
        entrada.value = valor === null || valor === undefined || valor === '' ? '' : String(Number(valor));
      } else {
        entrada = el('input', {
          type: coluna.tipo === 'data' ? 'date' : ['numero', 'moeda'].includes(coluna.tipo) ? 'number' : 'text',
          value: valor === null || valor === undefined ? '' : String(valor),
        });
        if (coluna.tipo === 'moeda') entrada.step = '0.01';
      }
      editaveis[coluna.chave] = entrada;
      campo.append(entrada);
    } else {
      campo.append(el('div', { class: 'texto-2', texto: formatarValor(valor, coluna) || '—' }));
    }
    grade.append(campo);
  }
  corpo.append(grade);

  const podeDecidir = podeEditarDecisao(item);
  const bloco = el('div', { class: 'cartao', style: 'margin-top:16px' }, [el('h2', { texto: 'Decisão' })]);
  const selAcao = el('select');
  selAcao.append(el('option', { value: '', texto: '— selecionar —' }));
  for (const a of estado.ctx.config.acoes) selAcao.append(el('option', { value: a.valor, texto: a.valor }));
  selAcao.value = item.acao || '';
  selAcao.disabled = !podeDecidir;
  const txtJust = el('textarea', { rows: 4, placeholder: 'Critérios considerados: cultura, desempenho, custo x entrega, polivalência, impacto na continuidade...' });
  txtJust.value = item.justificativa || '';
  txtJust.disabled = !podeDecidir;
  bloco.append(
    el('div', { class: 'campo' }, [el('label', { texto: 'Ação indicada' }), selAcao]),
    el('div', { class: 'campo', style: 'margin-top:10px' }, [el('label', { texto: 'Justificativa' }), txtJust])
  );
  if (item.decidido_em) {
    bloco.append(el('p', { class: 'pequeno texto-3', texto: `Última decisão por ${item.decidido_por_nome || '—'} em ${dataHoraBR(item.decidido_em)}.` }));
  }
  corpo.append(bloco);

  if (historico.itens.length) {
    const lista = el('ul', { class: 'lista-historico' });
    for (const h of historico.itens.slice(0, 60)) {
      lista.append(el('li', {}, [
        el('div', { texto: `${h.campo}: "${texto(h.valor_anterior) || '—'}" → "${texto(h.valor_novo) || '—'}"` }),
        el('div', { class: 'quando', texto: `${h.usuario_nome || 'sistema'} · ${dataHoraBR(h.criado_em)} · ${h.origem}` }),
      ]));
    }
    corpo.append(el('div', { class: 'cartao', style: 'margin-top:16px' }, [el('h2', { texto: 'Histórico' }), lista]));
  }

  const botaoSalvar = $('#dlg-colab-salvar');
  botaoSalvar.hidden = !podeDecidir && Object.keys(editaveis).length === 0;
  botaoSalvar.onclick = async () => {
    const alteracoes = {};
    if (podeDecidir) {
      alteracoes.acao = selAcao.value || null;
      alteracoes.justificativa = txtJust.value;
    }
    for (const [chave, entrada] of Object.entries(editaveis)) alteracoes[chave] = entrada.value;
    try {
      await api('PATCH', `/api/colaboradores/${id}`, alteracoes);
      dlgColab.close();
      await carregarBase();
      avisar('Registro atualizado.');
    } catch (erro) {
      avisar(erro.message, 'erro');
    }
  };
  dlgColab.showModal();
}

$('#btn-novo-colaborador').addEventListener('click', () => {
  const corpo = limpar($('#dlg-generico-corpo'));
  $('#dlg-generico-titulo').textContent = 'Incluir colaborador';
  const entradas = {};
  const grade = el('div', { class: 'grade-2' });
  for (const coluna of estado.colunas) {
    const campo = el('div', { class: 'campo' }, [el('label', { texto: coluna.rotulo })]);
    let entrada;
    if (coluna.tipo === 'lista') {
      entrada = el('select');
      entrada.append(el('option', { value: '', texto: '—' }));
      for (const o of coluna.opcoes || []) entrada.append(el('option', { value: o, texto: o }));
    } else {
      entrada = el('input', { type: coluna.tipo === 'data' ? 'date' : ['numero', 'moeda'].includes(coluna.tipo) ? 'number' : 'text' });
    }
    entradas[coluna.chave] = entrada;
    campo.append(entrada);
    grade.append(campo);
  }
  corpo.append(grade);
  corpo.append(el('button', { class: 'btn btn-primario', style: 'margin-top:14px', type: 'button', texto: 'Salvar', onclick: async () => {
    const dados = {};
    for (const [chave, entrada] of Object.entries(entradas)) if (entrada.value !== '') dados[chave] = entrada.value;
    try {
      await api('POST', '/api/colaboradores', dados);
      $('#dlg-generico').close();
      await carregarBase();
      avisar('Colaborador incluído.');
    } catch (erro) { avisar(erro.message, 'erro'); }
  } }));
  $('#dlg-generico').showModal();
});

/* ---------------- colunas ---------------- */

$('#col-tipo').addEventListener('change', () => {
  $('#campo-opcoes').hidden = $('#col-tipo').value !== 'lista';
});

$('#form-coluna').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('POST', '/api/colunas', {
      rotulo: $('#col-rotulo').value,
      tipo: $('#col-tipo').value,
      editavel: $('#col-editavel').value,
      opcoes: $('#col-opcoes').value,
      ajuda: $('#col-ajuda').value,
    });
    $('#form-coluna').reset();
    $('#campo-opcoes').hidden = true;
    await recarregarContexto();
    await carregarColunas();
    avisar('Coluna criada.');
  } catch (erro) { avisar(erro.message, 'erro'); }
});

async function recarregarContexto() {
  const ctx = await api('GET', '/api/auth/eu');
  estado.ctx = ctx;
  estado.colunas = ctx.colunas;
}

async function carregarColunas() {
  const { itens } = await api('GET', '/api/colunas');
  estado.colunas = itens;
  const tabela = limpar($('#tabela-colunas'));
  const cabecalhos = ['Ordem', 'Coluna', 'Tipo', 'Quem preenche', 'Visível', 'Somar', 'Agrupar', 'Origem', 'Ações'];
  const thead = el('thead', {}, [el('tr', {}, cabecalhos.map((c) => el('th', { class: 'sem-ordem', texto: c })))]);
  tabela.append(thead);
  const tbody = el('tbody');

  itens.forEach((coluna, indice) => {
    const tr = el('tr');
    const mover = el('div', { class: 'linha', style: 'gap:4px' }, [
      el('button', { class: 'btn btn-pequeno', type: 'button', texto: '↑', title: 'Subir', disabled: indice === 0, onclick: () => reordenar(indice, -1) }),
      el('button', { class: 'btn btn-pequeno', type: 'button', texto: '↓', title: 'Descer', disabled: indice === itens.length - 1, onclick: () => reordenar(indice, 1) }),
    ]);
    tr.append(el('td', {}, [mover]));

    const nome = el('input', { type: 'text', value: coluna.rotulo });
    nome.addEventListener('change', () => atualizarColuna(coluna.id, { rotulo: nome.value }));
    tr.append(el('td', {}, [nome, el('div', { class: 'pequeno texto-3 mono', texto: coluna.chave })]));

    tr.append(el('td', { texto: { texto: 'Texto', numero: 'Número', moeda: 'Moeda', data: 'Data', lista: 'Lista', booleano: 'Sim/Não' }[coluna.tipo] }));

    const permissao = el('select');
    for (const [valor, rotulo] of [['nao', 'Ninguém'], ['gestor', 'Gestor+'], ['diretor', 'Diretor+'], ['admin', 'Somente RH']]) {
      permissao.append(el('option', { value: valor, texto: rotulo }));
    }
    permissao.value = coluna.editavel;
    permissao.addEventListener('change', () => atualizarColuna(coluna.id, { editavel: permissao.value }));
    tr.append(el('td', {}, [permissao]));

    for (const [campo, valor] of [['visivel', coluna.visivel], ['somar', coluna.somar], ['agrupar', coluna.agrupar]]) {
      const caixa = el('input', { type: 'checkbox', checked: valor });
      caixa.addEventListener('change', () => atualizarColuna(coluna.id, { [campo]: caixa.checked }));
      tr.append(el('td', {}, [caixa]));
    }

    tr.append(el('td', { texto: coluna.sistema ? 'Sistema' : 'Personalizada' }));

    const acoes = el('div', { class: 'linha', style: 'gap:4px' }, [
      el('button', { class: 'btn btn-pequeno', type: 'button', texto: 'Opções', onclick: () => editarOpcoes(coluna) }),
    ]);
    if (!coluna.sistema) {
      acoes.append(el('button', {
        class: 'btn btn-pequeno btn-perigo', type: 'button', texto: 'Excluir',
        onclick: async () => {
          if (!confirm(`Excluir a coluna "${coluna.rotulo}" e todos os seus valores? Esta ação não pode ser desfeita.`)) return;
          try {
            await api('DELETE', `/api/colunas/${coluna.id}`);
            await recarregarContexto();
            await carregarColunas();
            avisar('Coluna excluída.');
          } catch (erro) { avisar(erro.message, 'erro'); }
        },
      }));
    }
    tr.append(el('td', {}, [acoes]));
    tbody.append(tr);
  });
  tabela.append(tbody);
}

async function reordenar(indice, direcao) {
  const ids = estado.colunas.map((c) => c.id);
  const destino = indice + direcao;
  if (destino < 0 || destino >= ids.length) return;
  [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
  await api('POST', '/api/colunas/ordem', { ids });
  await recarregarContexto();
  await carregarColunas();
}

async function atualizarColuna(id, alteracoes) {
  try {
    await api('PATCH', `/api/colunas/${id}`, alteracoes);
    await recarregarContexto();
    avisar('Coluna atualizada.');
  } catch (erro) {
    avisar(erro.message, 'erro');
    await carregarColunas();
  }
}

function editarOpcoes(coluna) {
  $('#dlg-generico-titulo').textContent = `Configurar "${coluna.rotulo}"`;
  const corpo = limpar($('#dlg-generico-corpo'));
  const tipo = el('select');
  for (const [valor, rotulo] of [['texto', 'Texto'], ['lista', 'Lista suspensa'], ['numero', 'Número'], ['moeda', 'Moeda'], ['data', 'Data'], ['booleano', 'Sim/Não']]) {
    tipo.append(el('option', { value: valor, texto: rotulo }));
  }
  tipo.value = coluna.tipo;
  tipo.disabled = coluna.sistema;
  const opcoes = el('textarea', { rows: 6, placeholder: 'Uma opção por linha' });
  opcoes.value = (coluna.opcoes || []).join('\n');
  const ajuda = el('input', { type: 'text', value: coluna.ajuda || '' });
  corpo.append(
    el('div', { class: 'campo' }, [el('label', { texto: 'Tipo' }), tipo]),
    el('div', { class: 'campo', style: 'margin-top:10px' }, [el('label', { texto: 'Opções da lista' }), opcoes]),
    el('div', { class: 'campo', style: 'margin-top:10px' }, [el('label', { texto: 'Texto de ajuda' }), ajuda]),
    el('button', {
      class: 'btn btn-primario', style: 'margin-top:14px', type: 'button', texto: 'Salvar',
      onclick: async () => {
        try {
          await api('PATCH', `/api/colunas/${coluna.id}`, { tipo: tipo.value, opcoes: opcoes.value, ajuda: ajuda.value });
          $('#dlg-generico').close();
          await recarregarContexto();
          await carregarColunas();
          avisar('Coluna atualizada.');
        } catch (erro) {
          if (erro.detalhes?.exemplos && confirm(`${erro.message}\n\nLimpar os valores incompatíveis e continuar?`)) {
            await api('PATCH', `/api/colunas/${coluna.id}`, { tipo: tipo.value, opcoes: opcoes.value, ajuda: ajuda.value, forcar: true });
            $('#dlg-generico').close();
            await recarregarContexto();
            await carregarColunas();
          } else {
            avisar(erro.message, 'erro');
          }
        }
      },
    })
  );
  $('#dlg-generico').showModal();
}

/* ---------------- importação ---------------- */

$('#form-upload').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const arquivo = $('#arquivo').files[0];
  if (!arquivo) return;
  const dados = new FormData();
  dados.append('arquivo', arquivo);
  try {
    avisar('Analisando planilha...');
    estado.importacao = await api('POST', '/api/planilha/analisar', dados);
    desenharMapeamento();
  } catch (erro) { avisar(erro.message, 'erro'); }
});

function desenharMapeamento() {
  const analise = estado.importacao;
  const caixa = limpar($('#importacao-passo2'));
  caixa.hidden = false;

  const cartao = el('div', { class: 'cartao' }, [
    el('h2', { texto: `Conferência — ${analise.arquivo}` }),
    el('p', { class: 'texto-2 pequeno', texto: `Aba "${analise.aba}", cabeçalho na linha ${analise.linha_cabecalho}, ${analise.total_linhas} linha(s) de dados.` }),
  ]);

  if (analise.abas.length > 1) {
    const sel = el('select', { style: 'max-width:280px' });
    for (const a of analise.abas) sel.append(el('option', { value: a.nome, texto: a.nome, ...(a.nome === analise.aba ? { selected: true } : {}) }));
    sel.value = analise.aba;
    sel.addEventListener('change', async () => {
      const arquivo = $('#arquivo').files[0];
      const dados = new FormData();
      dados.append('arquivo', arquivo);
      dados.append('aba', sel.value);
      estado.importacao = await api('POST', '/api/planilha/analisar', dados);
      desenharMapeamento();
    });
    cartao.append(el('div', { class: 'campo' }, [el('label', { texto: 'Aba da planilha' }), sel]));
  }

  const tabela = el('table');
  const thead = el('thead', {}, [el('tr', {}, ['Coluna da planilha', 'Exemplo', 'Destino no portal'].map((c) => el('th', { class: 'sem-ordem', texto: c })))]);
  tabela.append(thead);
  const tbody = el('tbody');
  const seletores = {};
  for (const cab of analise.cabecalhos) {
    if (!cab.rotulo) continue;
    const exemplo = (analise.previa[0] || [])[cab.indice - 1];
    const select = el('select');
    select.append(el('option', { value: '', texto: '— ignorar —' }));
    select.append(el('option', { value: '__nova__', texto: '➕ criar nova coluna' }));
    for (const c of analise.colunas) select.append(el('option', { value: c.chave, texto: c.rotulo }));
    select.append(el('option', { value: 'acao', texto: 'Ação indicada (decisão)' }));
    select.append(el('option', { value: 'justificativa', texto: 'Justificativa (decisão)' }));
    select.value = analise.mapeamento_sugerido[cab.indice] || '';
    seletores[cab.indice] = select;
    tbody.append(el('tr', {}, [
      el('td', { texto: cab.rotulo }),
      el('td', { class: 'texto-3', texto: texto(exemplo).slice(0, 40) }),
      el('td', {}, [select]),
    ]));
  }
  tabela.append(tbody);
  cartao.append(el('div', { class: 'tabela-simples', style: 'margin-top:12px' }, [tabela]));

  const decisoes = el('input', { type: 'checkbox' });
  cartao.append(el('label', { class: 'linha', style: 'margin-top:12px;gap:8px;align-items:center' }, [
    decisoes, el('span', { texto: 'Importar também Ação e Justificativa da planilha (sobrescreve o que já foi preenchido no portal)' }),
  ]));

  cartao.append(el('div', { class: 'linha', style: 'margin-top:14px' }, [
    el('button', {
      class: 'btn btn-primario', type: 'button', texto: 'Confirmar importação',
      onclick: async (ev) => {
        ev.target.disabled = true;
        const mapeamento = {};
        const cabecalhos = {};
        for (const [indice, select] of Object.entries(seletores)) {
          if (select.value) mapeamento[indice] = select.value;
          cabecalhos[indice] = analise.cabecalhos.find((c) => c.indice === Number(indice)).rotulo;
        }
        try {
          const resultado = await api('POST', '/api/planilha/importar', {
            token: analise.token,
            aba: analise.aba,
            linha_cabecalho: analise.linha_cabecalho,
            mapeamento,
            cabecalhos,
            importar_decisoes: decisoes.checked,
            arquivo: analise.arquivo,
          });
          mostrarResultadoImportacao(resultado);
          await recarregarContexto();
          await carregarImportacoes();
        } catch (erro) {
          avisar(erro.message, 'erro');
          ev.target.disabled = false;
        }
      },
    }),
    el('button', { class: 'btn', type: 'button', texto: 'Cancelar', onclick: () => { caixa.hidden = true; limpar(caixa); } }),
  ]));
  caixa.append(cartao);
}

function mostrarResultadoImportacao(resultado) {
  const caixa = limpar($('#importacao-passo2'));
  const cartao = el('div', { class: 'cartao' }, [
    el('h2', { texto: 'Importação concluída' }),
    el('div', { class: 'msg msg-ok', texto: `${resultado.linhas} linha(s) lidas · ${resultado.criados} incluída(s) · ${resultado.atualizados} atualizada(s) · ${resultado.ignorados} ignorada(s).` }),
  ]);
  if (resultado.colunas_novas?.length) {
    cartao.append(el('p', { class: 'pequeno', texto: `Novas colunas criadas: ${resultado.colunas_novas.map((c) => c.rotulo).join(', ')}.` }));
  }
  if (resultado.erros?.length) {
    const lista = el('ul');
    for (const e of resultado.erros.slice(0, 50)) lista.append(el('li', { texto: `Linha ${e.linha}${e.matricula ? ` (${e.matricula})` : ''}: ${e.erro}` }));
    cartao.append(el('div', { class: 'msg msg-erro', texto: `${resultado.erros.length} linha(s) com problema:` }), lista);
  }
  cartao.append(el('button', { class: 'btn', type: 'button', texto: 'Fechar', onclick: () => { caixa.hidden = true; limpar(caixa); } }));
  caixa.append(cartao);
  avisar('Base atualizada.');
}

async function carregarImportacoes() {
  const { itens } = await api('GET', '/api/historico/importacoes');
  montarTabela($('#tabela-importacoes'),
    ['Quando', 'Usuário', 'Arquivo', 'Linhas', 'Incluídos', 'Atualizados', 'Ignorados'],
    itens.map((i) => [dataHoraBR(i.criado_em), i.usuario_nome, i.arquivo, numero(i.linhas), numero(i.criados), numero(i.atualizados), numero(i.ignorados)]),
    { numericas: [3, 4, 5, 6], vazio: 'Nenhuma importação realizada.' });
}

/* ---------------- usuários ---------------- */

async function carregarUsuarios() {
  const { itens } = await api('GET', '/api/usuarios');
  const escopos = $('#usr-escopos');
  limpar(escopos);
  for (const valor of estado.ctx.escopos_disponiveis) escopos.append(el('option', { value: valor, texto: valor }));

  const tabela = limpar($('#tabela-usuarios'));
  tabela.append(el('thead', {}, [el('tr', {}, ['Usuário', 'Nome', 'Perfil', 'Divisões', 'Último acesso', 'Situação', 'Ações'].map((c) => el('th', { class: 'sem-ordem', texto: c })))]));
  const tbody = el('tbody');
  for (const u of itens) {
    const perfil = el('select');
    for (const [valor, rotulo] of [['gestor', 'Gestor'], ['diretor', 'Diretor'], ['admin', 'RH / Admin']]) perfil.append(el('option', { value: valor, texto: rotulo }));
    perfil.value = u.perfil;
    perfil.addEventListener('change', () => salvarUsuario(u.id, { perfil: perfil.value }));

    const chips = el('div', { class: 'chips' });
    for (const e of u.escopos) chips.append(el('span', { class: 'chip', texto: e }));
    if (u.perfil !== 'gestor') chips.append(el('span', { class: 'chip', texto: 'Base completa' }));
    const botaoEscopos = el('button', { class: 'btn btn-pequeno', type: 'button', texto: 'Divisões', onclick: () => editarEscopos(u) });

    const tr = el('tr', {}, [
      el('td', { class: 'mono', texto: u.usuario }),
      el('td', { texto: u.nome }),
      el('td', {}, [perfil]),
      el('td', {}, [chips, botaoEscopos]),
      el('td', { texto: u.ultimo_acesso ? dataHoraBR(u.ultimo_acesso) : '—' }),
      el('td', {}, [el('span', { class: `selo ${u.ativo ? 'selo-manter' : 'selo-pendente'}`, texto: u.ativo ? 'Ativo' : 'Inativo' })]),
      el('td', {}, [el('div', { class: 'linha', style: 'gap:4px' }, [
        el('button', { class: 'btn btn-pequeno', type: 'button', texto: u.ativo ? 'Desativar' : 'Reativar', onclick: () => salvarUsuario(u.id, { ativo: !u.ativo }) }),
        el('button', { class: 'btn btn-pequeno', type: 'button', texto: 'Nova senha', onclick: () => resetarSenha(u) }),
      ])]),
    ]);
    if (u.trocar_senha) tr.querySelector('td:nth-child(6)').append(el('span', { class: 'selo selo-atencao', style: 'margin-left:6px', texto: 'Senha provisória' }));
    tbody.append(tr);
  }
  tabela.append(tbody);
}

async function salvarUsuario(id, alteracoes) {
  try {
    await api('PATCH', `/api/usuarios/${id}`, alteracoes);
    await carregarUsuarios();
    avisar('Usuário atualizado.');
  } catch (erro) { avisar(erro.message, 'erro'); await carregarUsuarios(); }
}

async function resetarSenha(u) {
  if (!confirm(`Gerar nova senha provisória para ${u.nome}? As sessões ativas serão encerradas.`)) return;
  try {
    const r = await api('POST', `/api/usuarios/${u.id}/senha`);
    mostrarSenha(u, r.senha_provisoria);
  } catch (erro) { avisar(erro.message, 'erro'); }
}

function mostrarSenha(u, senha) {
  $('#dlg-generico-titulo').textContent = 'Senha provisória';
  limpar($('#dlg-generico-corpo')).append(
    el('p', { texto: `Entregue esta senha a ${u.nome} por canal seguro. Ela será trocada no primeiro acesso.` }),
    el('p', { class: 'mono', style: 'font-size:20px;padding:12px;background:var(--superficie-2);border-radius:8px;text-align:center', texto: senha })
  );
  $('#dlg-generico').showModal();
}

function editarEscopos(u) {
  $('#dlg-generico-titulo').textContent = `Divisões de ${u.nome}`;
  const corpo = limpar($('#dlg-generico-corpo'));
  const lista = el('div');
  const caixas = [];
  for (const valor of estado.ctx.escopos_disponiveis) {
    const caixa = el('input', { type: 'checkbox', checked: u.escopos.includes(valor), style: 'width:auto' });
    caixas.push([valor, caixa]);
    lista.append(el('label', { class: 'linha', style: 'gap:8px;align-items:center;padding:4px 0' }, [caixa, el('span', { texto: valor })]));
  }
  corpo.append(
    el('p', { class: 'texto-2 pequeno', texto: 'O gestor só enxerga e preenche os colaboradores das divisões marcadas.' }),
    lista,
    el('button', {
      class: 'btn btn-primario', style: 'margin-top:12px', type: 'button', texto: 'Salvar',
      onclick: async () => {
        const escopos = caixas.filter(([, c]) => c.checked).map(([v]) => v);
        await salvarUsuario(u.id, { escopos });
        $('#dlg-generico').close();
      },
    })
  );
  $('#dlg-generico').showModal();
}

$('#form-usuario').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const criado = await api('POST', '/api/usuarios', {
      usuario: $('#usr-login').value,
      nome: $('#usr-nome').value,
      email: $('#usr-email').value,
      perfil: $('#usr-perfil').value,
      escopos: Array.from($('#usr-escopos').selectedOptions).map((o) => o.value),
    });
    $('#form-usuario').reset();
    await carregarUsuarios();
    mostrarSenha(criado, criado.senha_provisoria);
  } catch (erro) { avisar(erro.message, 'erro'); }
});

/* ---------------- auditoria ---------------- */

async function carregarAuditoria() {
  const matricula = $('#aud-matricula').value.trim();
  const { itens } = await api('GET', `/api/historico?limite=300${matricula ? `&matricula=${encodeURIComponent(matricula)}` : ''}`);
  montarTabela($('#tabela-auditoria'),
    ['Quando', 'Usuário', 'Matrícula', 'Colaborador', 'Campo', 'De', 'Para', 'Origem'],
    itens.map((h) => [dataHoraBR(h.criado_em), h.usuario_nome, h.matricula, h.colaborador_nome, h.campo, h.valor_anterior, h.valor_novo, h.origem]),
    { vazio: 'Sem alterações registradas.' });

  if (estado.ctx.usuario.perfil === 'admin') {
    const acessos = await api('GET', '/api/historico/acessos');
    montarTabela($('#tabela-acessos'), ['Quando', 'Usuário', 'IP', 'Resultado'],
      acessos.itens.map((a) => [dataHoraBR(a.criado_em), a.usuario, a.ip, a.sucesso ? 'Sucesso' : 'Falha']),
      { vazio: 'Sem registros.' });
  }
}
$('#btn-aud-filtrar').addEventListener('click', () => carregarAuditoria().catch((e) => avisar(e.message, 'erro')));

/* ---------------- configurações ---------------- */

async function carregarConfig() {
  const cfg = await api('GET', '/api/config');
  $('#cfg-titulo').value = cfg.titulo || '';
  $('#cfg-posicao').value = cfg.posicao_base || '';
  $('#cfg-prazo').value = cfg.prazo || '';
  $('#cfg-aviso').value = cfg.aviso_confidencialidade || '';
  const sel = limpar($('#cfg-escopo'));
  for (const c of estado.colunas) sel.append(el('option', { value: c.chave, texto: c.rotulo }));
  sel.value = cfg.coluna_escopo;
  desenharAcoes(cfg.acoes);
}

function desenharAcoes(acoes) {
  const caixa = limpar($('#lista-acoes'));
  acoes.forEach((acao, i) => {
    const exige = el('input', { type: 'checkbox', checked: acao.exige_justificativa, style: 'width:auto' });
    exige.addEventListener('change', async () => {
      const novas = acoes.map((a, j) => (j === i ? { ...a, exige_justificativa: exige.checked } : a));
      await salvarAcoes(novas);
    });
    caixa.append(el('div', { class: 'linha', style: 'align-items:center;padding:6px 0;border-bottom:1px solid var(--borda)' }, [
      el('span', { class: 'barra-chip', style: `background:${corDaAcao(acao.valor)}` }),
      el('strong', { texto: acao.valor, style: 'flex:1' }),
      el('label', { class: 'linha pequeno', style: 'gap:6px;align-items:center' }, [exige, el('span', { texto: 'Exige justificativa' })]),
      el('button', {
        class: 'btn btn-pequeno btn-perigo', type: 'button', texto: 'Remover',
        onclick: () => salvarAcoes(acoes.filter((_, j) => j !== i)),
      }),
    ]));
  });
}

async function salvarAcoes(acoes) {
  try {
    const cfg = await api('PATCH', '/api/config', { acoes });
    await recarregarContexto();
    desenharAcoes(cfg.acoes);
    avisar('Ações atualizadas.');
  } catch (erro) { avisar(erro.message, 'erro'); await carregarConfig(); }
}

$('#btn-add-acao').addEventListener('click', async () => {
  const valor = $('#acao-nova').value.trim();
  if (!valor) return;
  const cfg = await api('GET', '/api/config');
  await salvarAcoes([...cfg.acoes, { valor, cor: 'neutra', exige_justificativa: $('#acao-exige').checked }]);
  $('#acao-nova').value = '';
  $('#acao-exige').checked = false;
});

$('#form-config').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('PATCH', '/api/config', {
      titulo: $('#cfg-titulo').value,
      posicao_base: $('#cfg-posicao').value,
      prazo: $('#cfg-prazo').value,
      coluna_escopo: $('#cfg-escopo').value,
      aviso_confidencialidade: $('#cfg-aviso').value,
    });
    await recarregarContexto();
    aplicarContexto(estado.ctx);
    avisar('Configurações salvas.');
  } catch (erro) { avisar(erro.message, 'erro'); }
});

carregarSessao();
