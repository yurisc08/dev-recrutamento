/* ============================================================
   Gerador de Mapas de Carreira — console corporativo
   Toda a execução acontece no navegador: nenhum dado é enviado.

   Conceitos centrais
   ------------------
   1. Modelos      — a ferramenta trabalha com quantos modelos Word
                     forem necessários. Cada um tem uma regra que diz
                     quando ele deve ser usado.
   2. Mapeamento   — a ligação entre as colunas da planilha e as
                     células de cada modelo não está no código: é
                     editável na tela Mapeamento.
   3. Distribuição — a configuração pronta pode ser exportada como um
                     novo arquivo HTML, já com modelos e mapeamentos
                     embutidos, para enviar a quem vai usar.
   ============================================================ */
(function () {
'use strict';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NIVEIS = ['JR', 'PL', 'SR'];
const NIVEL_NOME = { JR: 'Júnior', PL: 'Pleno', SR: 'Sênior' };
const LS_CURRENT = 'gmc.mapeamento.atual';
const LS_PROFILES = 'gmc.mapeamento.perfis';
const IDB_NOME = 'gmc';
const IDB_STORE = 'modelos';

/* Origem do próprio arquivo, para poder gerar cópias configuradas.
   O build substitui o marcador abaixo pelo HTML completo da ferramenta. */
const SHELL_SRC = "__SHELL__";
const podeExportarFerramenta = SHELL_SRC.length > 2000;

/* ---------------- ícones ----------------
   SVG em vez de caracteres tipo ▤ ou ⇄: os glifos geométricos faltam em
   várias fontes do Windows e apareciam como quadradinhos vazios.
--------------------------------------------------------------------- */
const SVG = (d, extra) => `<svg class="ico${extra ? ' ' + extra : ''}" viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
const ICONES = {
  subir: SVG('<path d="M10 15.5V4.9M5.6 9.3 10 4.9l4.4 4.4"/>'),
  descer: SVG('<path d="M10 4.5v10.6M14.4 10.7 10 15.1l-4.4-4.4"/>'),
  seta: SVG('<path d="M7.6 4.4 13.2 10l-5.6 5.6"/>'),
  mapear: '<path d="M3 6.6h10.2M10.6 3.9l2.7 2.7-2.7 2.7M17 13.4H6.8M9.4 10.7l-2.7 2.7 2.7 2.7"/>',
  documento: '<path d="M11.4 2.4H5.6a1.6 1.6 0 0 0-1.6 1.6v12a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6V7z"/><path d="M11.4 2.4V7H16"/>',
  caixa: '<path d="M17 10v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5V10M13.4 5.9 10 2.5 6.6 5.9M10 2.5v10.2"/>'
};
const ICONE_GRANDE = d => `<svg class="big" viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;

/* ---------------- utilidades ---------------- */
const $ = id => document.getElementById(id);
const qsa = (s, r) => [...(r || document).querySelectorAll(s)];
const str = x => String(x ?? '').trim();
const clean = x => str(x).replace(/\.0+$/, '');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = x => esc(x).replace(/\r?\n/g, '<br>');
const val = (o, k) => str(o?.[k]);
const firstOf = (o, keys) => { for (const k of keys) if (val(o, k)) return val(o, k); return ''; };
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const tokens = s => norm(s).split(/[^A-Z0-9]+/).filter(t => t.length > 1);
const bytesOf = b64 => { const b = atob(b64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const parseXml = t => { const d = new DOMParser().parseFromString(t, 'application/xml'); if (d.querySelector('parsererror')) throw new Error('XML inválido no arquivo.'); return d; };
const tagged = (el, n) => [...el.getElementsByTagNameNS(W, n)];
const kids = (el, n) => [...el.children].filter(x => x.localName === n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** base64 de um Uint8Array, em blocos para não estourar a pilha. */
function paraB64(bytes) {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(s);
}

/* ---------------- fontes de dados ----------------
   A ferramenta tem dois formatos de distribuição:

   - arquivo único: os assets vêm embutidos em base64 (tipo 'base64');
   - versão web:    os assets são baixados do servidor (tipo 'url').

   window.GMC é definido pelo build e descreve qual dos dois usar, de
   modo que o restante do código não precisa saber a diferença.
------------------------------------------------------------------- */
const SRC = window.GMC || {};
const LOGO = SRC.logo || '';

async function fetchSource(desc, onProgress) {
  if (!desc) return null;
  if (desc.tipo === 'base64') return bytesOf(desc.dados);

  const res = await fetch(desc.url, { cache: 'default' });
  if (!res.ok) throw new Error(`Não foi possível baixar ${desc.url} (HTTP ${res.status}).`);

  const total = +(res.headers.get('content-length') || 0);
  if (!onProgress || !total || !res.body) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const parts = [];
  let lidos = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    lidos += value.length;
    onProgress(lidos / total);
  }
  const out = new Uint8Array(lidos);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/* ---------------- estado ---------------- */
const state = {
  rows: [], allRecords: [], columns: [], sheets: [], sheetName: '',
  baseLabel: '', baseBytes: null, baseDefault: null,
  blocked: ['20', '21', '22', '23', '24'],
  modelos: [],            // [{id, nome, arquivo, bytes, scan, regra, origem}]
  mapeamento: {},         // { idDoModelo: { chaveDaCelula: vinculo } }
  modeloAtivo: '',
  celulaSelecionada: null,
  mostrarFixos: true,
  alterado: false,
  sel: { auto: [], escolhido: [] },
  semBase: false,
  pronto: false
};

/* ============================================================
   1. Leitura da planilha
   ============================================================ */
function colIndex(ref) {
  let n = 0;
  for (const c of ((ref.match(/^[A-Z]+/i) || [''])[0]).toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

async function readWorkbook(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const wb = parseXml(await zip.file('xl/workbook.xml').async('string'));
  const rels = parseXml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const relList = [...rels.getElementsByTagNameNS('*', 'Relationship')];

  const sheets = [...wb.getElementsByTagNameNS('*', 'sheet')].map(sh => {
    const id = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id');
    const rel = relList.find(r => r.getAttribute('Id') === id);
    let target = (rel ? rel.getAttribute('Target') : '').replace(/^\//, '');
    if (target && !target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
    return { name: sh.getAttribute('name'), target };
  }).filter(s => s.target);

  let shared = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const d = parseXml(await zip.file('xl/sharedStrings.xml').async('string'));
    shared = [...d.getElementsByTagNameNS('*', 'si')].map(si =>
      [...si.getElementsByTagNameNS('*', 't')].map(t => t.textContent || '').join(''));
  }
  return { zip, sheets, shared };
}

async function readSheet(wbook, sheetName) {
  const sheet = wbook.sheets.find(s => s.name === sheetName) || wbook.sheets[0];
  const doc = parseXml(await wbook.zip.file(sheet.target).async('string'));
  const matrix = [];
  for (const row of doc.getElementsByTagNameNS('*', 'row')) {
    const line = [];
    for (const c of kids(row, 'c')) {
      const i = colIndex(c.getAttribute('r') || 'A1');
      const type = c.getAttribute('t');
      let text = '';
      if (type === 'inlineStr') {
        text = [...c.getElementsByTagNameNS('*', 't')].map(t => t.textContent || '').join('');
      } else {
        const v = kids(c, 'v')[0];
        if (v) { text = v.textContent || ''; if (type === 's') text = wbook.shared[+text] ?? ''; }
      }
      line[i] = text;
    }
    matrix.push(line);
  }
  const header = (matrix.shift() || []).map(x => str(x));
  const records = matrix
    .filter(line => line.some(x => str(x)))
    .map(line => Object.fromEntries(header.map((h, i) => [h, line[i] ?? '']).filter(p => p[0])));
  return { header: header.filter(Boolean), records, sheetName: sheet.name };
}

function isBlocked(code) {
  const c = clean(code);
  return state.blocked.some(p => p && c.startsWith(p));
}

async function loadBase(buffer, label) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const wbook = await readWorkbook(bytes);
  state.workbook = wbook;
  state.baseBytes = bytes;
  state.sheets = wbook.sheets.map(s => s.name);
  const preferred = state.sheets.includes('Base') ? 'Base' : state.sheets[0];
  await applySheet(preferred);
  state.baseLabel = label;
}

async function applySheet(name) {
  const { header, records, sheetName } = await readSheet(state.workbook, name);
  state.columns = header;
  state.sheetName = sheetName;
  state.allRecords = records;
  refilterRows();
}

function refilterRows() {
  state.rows = (state.allRecords || []).filter(r => !isBlocked(r.COD_DO_CARGO));
}

/* ============================================================
   2. Leitura estrutural do modelo Word
   ============================================================ */
function cellText(tc) {
  return tagged(tc, 't').map(t => t.textContent || '').join('').replace(/\s+/g, ' ').trim();
}

/**
 * Nome do campo de mesclagem da célula.
 *
 * O texto visível («NOME») tem prioridade sobre o código interno do campo:
 * em modelos editados manualmente os dois divergem, e o que vale para quem
 * configura a ferramenta é o que aparece no documento. O código interno
 * (w:instrText) é usado apenas quando não há texto visível.
 */
function mergeField(tc) {
  const visible = cellText(tc).match(/^«\s*([A-Za-z0-9_]+)\s*»$/);
  if (visible) return visible[1];
  for (const instr of tagged(tc, 'instrText')) {
    const m = (instr.textContent || '').match(/MERGEFIELD\s+"?([A-Za-z0-9_]+)"?/);
    if (m) return m[1];
  }
  for (const f of tagged(tc, 'fldSimple')) {
    const m = (f.getAttribute('w:instr') || '').match(/MERGEFIELD\s+"?([A-Za-z0-9_]+)"?/);
    if (m) return m[1];
  }
  return null;
}

function gridSpan(tc) {
  const pr = kids(tc, 'tcPr')[0];
  if (!pr) return 1;
  const gs = kids(pr, 'gridSpan')[0];
  return gs ? (parseInt(gs.getAttribute('w:val'), 10) || 1) : 1;
}

function isVMergeContinuation(tc) {
  const pr = kids(tc, 'tcPr')[0];
  if (!pr) return false;
  const vm = kids(pr, 'vMerge')[0];
  return !!vm && (vm.getAttribute('w:val') || 'continue') !== 'restart';
}

/**
 * Lê document.xml e devolve a estrutura de tabelas/células com os
 * rótulos de contexto usados na tela de mapeamento.
 */
function scanTemplate(xmlDoc) {
  const tables = tagged(xmlDoc, 'tbl').map((tbl, ti) => {
    const trs = kids(tbl, 'tr');
    let flat = 0;
    const rows = trs.map((tr, ri) => {
      let gridCol = 0;
      const cells = kids(tr, 'tc').map(tc => {
        const span = gridSpan(tc);
        const cell = {
          index: flat++, row: ri, gridStart: gridCol, gridEnd: gridCol + span - 1,
          span, text: cellText(tc), field: mergeField(tc), vmerge: isVMergeContinuation(tc)
        };
        gridCol += span;
        return cell;
      });
      return { index: ri, cells, width: gridCol };
    });

    const title = rows[0]?.cells[0]?.text || `Tabela ${ti + 1}`;
    const isStatic = c => !c.field && !!c.text;

    rows.forEach(row => row.cells.forEach(cell => {
      let rowLabel = '';
      for (const c of row.cells) {
        if (c === cell) break;
        if (isStatic(c)) rowLabel = c.text;
      }
      let colLabel = '';
      for (let r = cell.row - 1; r >= 0; r--) {
        const above = rows[r].cells.find(c => c.gridStart <= cell.gridStart && c.gridEnd >= cell.gridStart);
        if (above && isStatic(above) && above.span < rows[r].width) { colLabel = above.text; break; }
      }
      let groupLabel = '';
      for (let r = cell.row - 1; r >= 1; r--) {
        const only = rows[r].cells;
        if (only.length === 1 && isStatic(only[0])) { groupLabel = only[0].text; break; }
      }
      cell.labels = { table: title, group: groupLabel, row: rowLabel, col: colLabel };
      cell.static = isStatic(cell);
      cell.key = `t${ti}c${cell.index}`;
      cell.sig = [title, groupLabel, colLabel, rowLabel, cell.field || ''].map(norm).join('|');
    }));

    return { index: ti, title, rows, cellCount: flat };
  });

  const cells = tables.flatMap(t => t.rows.flatMap(r => r.cells.map(c => ({ ...c, table: t.index }))));
  return { tables, cells, fieldCount: cells.filter(c => c.field).length };
}

/* ============================================================
   3. Coleção de modelos e regras de escolha
   ============================================================ */
function novoId(nome) {
  const base = norm(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modelo';
  let id = base, n = 2;
  while (state.modelos.some(m => m.id === id)) id = `${base}-${n++}`;
  return id;
}

function modeloPorId(id) {
  return state.modelos.find(m => m.id === id) || null;
}

function modeloAtivo() {
  return modeloPorId(state.modeloAtivo) || state.modelos[0] || null;
}

function regraPadrao() {
  return { tipo: 'sempre', coluna: '', operador: 'igual', valor: '', exigeFamilia: false };
}

function temFamilia(record) {
  return NIVEIS.every(s => val(record, 'COD_DO_CARGO_' + s));
}

function regraCombina(regra, record) {
  if (!regra || regra.tipo === 'manual') return false;
  if (regra.exigeFamilia && !temFamilia(record)) return false;
  if (regra.tipo === 'sempre') return true;
  if (regra.tipo === 'familia') return temFamilia(record);
  if (regra.tipo === 'condicao') {
    const v = norm(val(record, regra.coluna));
    const alvo = norm(regra.valor);
    switch (regra.operador) {
      case 'igual': return v === alvo;
      case 'contem': return !!alvo && v.includes(alvo);
      case 'comeca': return !!alvo && v.startsWith(alvo);
      case 'vazio': return !v;
      case 'preenchido': return !!v;
      default: return false;
    }
  }
  return false;
}

/** Primeiro modelo cuja regra combina; se nenhum combinar, o último da lista. */
function escolherModelo(record) {
  for (const m of state.modelos) {
    if (m.scan && regraCombina(m.regra, record)) return m;
  }
  const utilizaveis = state.modelos.filter(m => m.scan);
  return utilizaveis[utilizaveis.length - 1] || null;
}

function descreverRegra(regra) {
  if (!regra) return 'sempre';
  const extra = regra.exigeFamilia ? ' + trilha JR/PL/SR completa' : '';
  if (regra.tipo === 'manual') return 'somente quando escolhido manualmente';
  if (regra.tipo === 'sempre') return 'qualquer cargo (use como último da lista)' + extra;
  if (regra.tipo === 'familia') return 'cargos com trilha JR/PL/SR completa';
  if (regra.tipo === 'condicao') {
    const op = { igual: 'for igual a', contem: 'contiver', comeca: 'começar com', vazio: 'estiver vazia', preenchido: 'estiver preenchida' }[regra.operador] || '';
    const alvo = ['vazio', 'preenchido'].includes(regra.operador) ? '' : ` “${regra.valor}”`;
    return `quando ${regra.coluna || '(coluna)'} ${op}${alvo}` + extra;
  }
  return '';
}

/** Quantos cargos da base cairiam em cada modelo. */
function contagemPorModelo() {
  const contagem = Object.fromEntries(state.modelos.map(m => [m.id, 0]));
  for (const r of state.rows) {
    const m = escolherModelo(r);
    if (m) contagem[m.id] = (contagem[m.id] || 0) + 1;
  }
  return contagem;
}

async function lerModelo(modelo, buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Arquivo .docx inválido: document.xml não encontrado.');
  const scan = scanTemplate(parseXml(await file.async('string')));
  const anterior = modelo.scan;
  modelo.bytes = bytes;
  modelo.scan = scan;
  if (anterior) reancorarMapeamento(modelo.id, anterior, scan);
  return scan;
}

/**
 * Ao trocar o arquivo de um modelo, tenta preservar o mapeamento:
 * primeiro pela posição da célula, depois pela assinatura de contexto.
 */
function reancorarMapeamento(id, scanAntigo, scanNovo) {
  const antigo = state.mapeamento[id] || {};
  const porAssinatura = new Map();
  scanAntigo.cells.forEach(c => { if (antigo[c.key]) porAssinatura.set(c.sig, antigo[c.key]); });
  const novo = {};
  scanNovo.cells.forEach(c => {
    if (antigo[c.key]) novo[c.key] = antigo[c.key];
    else if (porAssinatura.has(c.sig)) novo[c.key] = porAssinatura.get(c.sig);
  });
  state.mapeamento[id] = novo;
}

async function adicionarModelo(nome, arquivo, bytes, regra, origem) {
  const modelo = {
    id: novoId(nome), nome, arquivo, bytes: null, scan: null,
    regra: regra || regraPadrao(), origem: origem || 'adicionado'
  };
  state.modelos.push(modelo);
  state.mapeamento[modelo.id] = {};
  await lerModelo(modelo, bytes);
  return modelo;
}

function removerModelo(id) {
  const i = state.modelos.findIndex(m => m.id === id);
  if (i < 0) return;
  state.modelos.splice(i, 1);
  delete state.mapeamento[id];
  idbRemover(id).catch(() => {});
  if (state.modeloAtivo === id) state.modeloAtivo = state.modelos[0]?.id || '';
}

function moverModelo(id, direcao) {
  const i = state.modelos.findIndex(m => m.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= state.modelos.length) return;
  const [m] = state.modelos.splice(i, 1);
  state.modelos.splice(j, 0, m);
}

/* ============================================================
   4. Mapeamento: sugestão automática e resolução de valores
   ============================================================ */
const SINONIMOS = {
  'EMPRESA': 'EMPRESA',
  'CODIGO DO CARGO': 'COD_DO_CARGO',
  'CODIGO DOS CARGOS': 'COD_DO_CARGO',
  'NOME DO CARGO': 'NOME_COMPLETO',
  'CARGO': 'NOME_COMPLETO',
  'CBO': 'CBO',
  'TRILHA DE CARREIRA': 'TCLC_DESC',
  'DATA DA CRIACAO': 'DT_ATIVACAO',
  'DATA DE CRIACAO': 'DT_ATIVACAO',
  'DATA DE REVISAO': 'DATA_REVISAO',
  'DATA DA REVISAO': 'DATA_REVISAO',
  'MISSAO': 'ATIV_DESC',
  'FOCO DE ATUACAO': 'TEXTO_RESULTADO_ESPERADO',
  'PRINCIPAIS RESPONSABILIDADES/ATIVIDADES': 'DESCRICAO_CARGO',
  'PRINCIPAIS RESPONSABILIDADES': 'DESCRICAO_CARGO'
};
const FALLBACKS = { NOME_COMPLETO: ['CARGO'], SKILL_37: ['SKILL_37_JR'] };

function levelFromLabel(label) {
  const n = norm(label);
  if (/JUNIOR|\bJR\b/.test(n)) return 'JR';
  if (/PLENO|\bPL\b/.test(n)) return 'PL';
  if (/SENIOR|\bSR\b/.test(n)) return 'SR';
  return '';
}

function formatFor(column) {
  return /^(DT_|DATA)/.test(norm(column)) ? 'data' : 'texto';
}

function columnByLabel(label) {
  const n = norm(label);
  if (SINONIMOS[n] && state.columns.includes(SINONIMOS[n])) return SINONIMOS[n];
  const want = tokens(label);
  if (!want.length) return '';
  let best = '', score = 0;
  for (const col of state.columns) {
    const have = tokens(col);
    const hit = want.filter(t => have.includes(t)).length;
    const s = hit / Math.max(want.length, have.length);
    if (hit && s > score) { score = s; best = col; }
  }
  return score >= 0.6 ? best : '';
}

function suggestBinding(cell) {
  const level = levelFromLabel(cell.labels.col) || levelFromLabel(cell.labels.row) || levelFromLabel(cell.labels.group);
  const make = (column, lvl) => ({
    source: 'column', column, level: lvl || '',
    fallbacks: lvl ? [] : (FALLBACKS[column] || []).filter(f => state.columns.includes(f)),
    format: formatFor(column), text: ''
  });

  if (cell.field) {
    if (level && state.columns.includes(cell.field + '_' + level)) return make(cell.field, level);
    if (state.columns.includes(cell.field)) return make(cell.field, '');
    const alt = columnByLabel(cell.field);
    if (alt) return make(alt, level && state.columns.includes(alt + '_' + level) ? level : '');
    return null;
  }
  if (cell.static) return null;
  const label = cell.labels.row || cell.labels.col;
  const col = columnByLabel(label);
  if (!col) return null;
  return make(col, level && state.columns.includes(col + '_' + level) ? level : '');
}

function autoSuggest(id) {
  const modelo = modeloPorId(id);
  if (!modelo || !modelo.scan) return 0;
  const map = state.mapeamento[id] || (state.mapeamento[id] = {});
  let n = 0;
  modelo.scan.cells.forEach(cell => {
    const b = suggestBinding(cell);
    if (b) { map[cell.key] = b; n++; }
  });
  return n;
}

function excelSerialToDate(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 1 || n > 400000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  const d = new Date(ms);
  return isNaN(d) ? null : d;
}

function applyFormat(value, format) {
  const v = str(value);
  if (!v) return '';
  if (format === 'data') {
    const d = excelSerialToDate(v);
    if (d) return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return v;
  }
  if (format === 'maiusculas') return v.toUpperCase();
  if (format === 'titulo') return v.toLowerCase().replace(/(^|[\s(\/-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase());
  return v;
}

/** Texto a gravar na célula, ou null para não alterar o documento. */
function resolveBinding(binding, record) {
  if (!binding) return null;
  if (binding.source === 'keep') return null;
  if (binding.source === 'empty') return '';
  if (binding.source === 'text') return str(binding.text);
  if (!binding.column) return null;
  const keys = binding.level ? [binding.column + '_' + binding.level] : [binding.column];
  for (const f of (binding.fallbacks || [])) keys.push(f);
  let raw = '';
  for (const k of keys) { const x = val(record, k); if (x) { raw = x; break; } }
  return applyFormat(raw, binding.format);
}

function describeBinding(b) {
  if (!b) return '';
  if (b.source === 'empty') return 'em branco';
  if (b.source === 'text') return 'texto fixo';
  if (!b.column) return '';
  return b.column + (b.level ? '_' + b.level : '');
}

function mappingStats(id) {
  const modelo = modeloPorId(id);
  const map = state.mapeamento[id] || {};
  if (!modelo || !modelo.scan) return { total: 0, bound: 0, pending: 0 };
  const alvo = modelo.scan.cells.filter(c => c.field || (!c.static && !c.text));
  const bound = alvo.filter(c => map[c.key]).length;
  const extra = modelo.scan.cells.filter(c => map[c.key] && !alvo.includes(c)).length;
  return { total: alvo.length, bound: bound + extra, pending: alvo.length - bound };
}

/* ============================================================
   5. Seleção de registros
   ============================================================ */
function exactRecord(code) {
  return state.rows.find(r => clean(r.COD_DO_CARGO) === clean(code)) || null;
}

/** Consolida a linha do cargo com as linhas irmãs da mesma trilha JR/PL/SR. */
function resolveRecord(code) {
  const base = exactRecord(code);
  if (!base) return null;
  const keys = ['COD_DO_CARGO', ...NIVEIS.map(s => 'COD_DO_CARGO_' + s)];
  const family = state.rows.filter(r =>
    keys.some(k => clean(r[k]) === clean(code)) &&
    (!val(base, 'EMP_COD') || !val(r, 'EMP_COD') || clean(base.EMP_COD) === clean(r.EMP_COD)));
  family.sort((a, b) =>
    NIVEIS.filter(s => val(b, 'COD_DO_CARGO_' + s)).length -
    NIVEIS.filter(s => val(a, 'COD_DO_CARGO_' + s)).length);

  const merged = { ...(family[0] || base) };
  for (const r of family) for (const [k, v] of Object.entries(r)) if (!val(merged, k) && str(v)) merged[k] = v;
  for (const k of ['COD_EMPRESA', 'EMPRESA', 'EMP_COD', 'COD_DO_CARGO', 'CARGO', 'NOME_COMPLETO', 'CBO',
    'TCLC_DESC', 'DT_ATIVACAO', 'DATA_REVISAO', 'TEXTO_RESULTADO_ESPERADO', 'ATIV_DESC', 'DESCRICAO_CARGO',
    'SKILL_30', 'SKILL_31', 'SKILL_32', 'SKILL_33', 'SKILL_34', 'SKILL_35', 'SKILL_36', 'SKILL_37']) {
    if (val(base, k)) merged[k] = base[k];
  }
  merged._family = temFamilia(merged);
  return merged;
}

/* ============================================================
   6. Geração do documento Word
   ============================================================ */
function writeCell(tc, text) {
  const doc = tc.ownerDocument;
  const paras = kids(tc, 'p');
  if (!paras.length) return;
  const target = paras[0];

  let rPr = null;
  for (const r of kids(target, 'r')) {
    if (kids(r, 't').length) { rPr = kids(r, 'rPr')[0] || null; break; }
  }
  if (!rPr) { const r0 = kids(target, 'r')[0]; rPr = r0 ? kids(r0, 'rPr')[0] || null : null; }
  const rPrClone = rPr ? rPr.cloneNode(true) : null;

  const removable = ['r', 'hyperlink', 'sdt', 'fldSimple', 'bookmarkStart', 'bookmarkEnd', 'ins', 'del'];
  for (const p of paras) for (const n of [...p.children]) if (removable.includes(n.localName)) p.removeChild(n);

  const run = doc.createElementNS(W, 'w:r');
  if (rPrClone) run.appendChild(rPrClone);
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (i) run.appendChild(doc.createElementNS(W, 'w:br'));
    const t = doc.createElementNS(W, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    run.appendChild(t);
  });
  target.appendChild(run);
  paras.slice(1).forEach(p => p.parentNode && p.parentNode.removeChild(p));
}

async function buildDocx(modelo, record) {
  if (!modelo || !modelo.bytes) throw new Error('Modelo Word não carregado.');
  const map = state.mapeamento[modelo.id] || {};
  const zip = await JSZip.loadAsync(modelo.bytes);
  const doc = parseXml(await zip.file('word/document.xml').async('string'));

  tagged(doc, 'tbl').forEach((tbl, ti) => {
    let flat = 0;
    kids(tbl, 'tr').forEach(tr => kids(tr, 'tc').forEach(tc => {
      const key = `t${ti}c${flat++}`;
      const text = resolveBinding(map[key], record);
      if (text !== null) writeCell(tc, text);
    }));
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

function fileNameFor(record) {
  const nome = firstOf(record, ['NOME_COMPLETO', 'CARGO']) || 'CARGO';
  return (clean(record.COD_DO_CARGO) + ' - ' + nome).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ============================================================
   7. Geração do PDF — reproduz a estrutura real do modelo
   ============================================================ */
function renderDocForPrint(modelo, record) {
  if (!modelo || !modelo.scan) return '';
  const map = state.mapeamento[modelo.id] || {};

  const tables = modelo.scan.tables.map(t => {
    const rows = t.rows.map(row => {
      const cells = row.cells.filter(c => !c.vmerge).map(c => {
        const bound = map[c.key];
        let text = bound ? resolveBinding(bound, record) : null;
        if (text === null) text = c.field ? '' : c.text;
        const head = !bound && c.static;
        const span = c.span > 1 ? ` colspan="${c.span}"` : '';
        return `<td class="${head ? 'h' : ''}"${span}>${nl2br(text)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table>${rows}</table>`;
  }).join('');

  return `<section class="pdfdoc print-doc">
    <div class="pd-head"><img src="${LOGO}" alt=""><b>DOCUMENTO OFICIAL</b></div>
    <h1>MAPA DE CARREIRA</h1>${tables}</section>`;
}

/* ============================================================
   8. Persistência
   ============================================================ */
function idbAbrir() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB indisponível'));
    const r = indexedDB.open(IDB_NOME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('IndexedDB bloqueado'));
    r.onblocked = () => rej(new Error('IndexedDB bloqueado'));
  });
}

async function idbGravar(id, bytes) {
  const db = await idbAbrir();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).put(bytes, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function idbLer(id) {
  const db = await idbAbrir();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readonly');
    const q = t.objectStore(IDB_STORE).get(id);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}

async function idbRemover(id) {
  const db = await idbAbrir();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

/** Configuração corrente, sem os arquivos: cabe no localStorage. */
function configuracaoAtual() {
  return {
    versao: 2,
    salvoEm: new Date().toISOString(),
    prefixosIgnorados: state.blocked,
    aba: state.sheetName,
    modelos: state.modelos.map(m => ({
      id: m.id, nome: m.nome, arquivo: m.arquivo, regra: m.regra, origem: m.origem
    })),
    mapeamento: state.mapeamento
  };
}

async function aplicarConfiguracao(cfg, { recarregarArquivos = true } = {}) {
  if (!cfg || !cfg.mapeamento) throw new Error('Arquivo de configuração inválido.');
  state.mapeamento = cfg.mapeamento;
  if (Array.isArray(cfg.prefixosIgnorados)) { state.blocked = cfg.prefixosIgnorados; refilterRows(); }

  if (Array.isArray(cfg.modelos) && cfg.modelos.length) {
    const ordenados = [];
    for (const meta of cfg.modelos) {
      const existente = modeloPorId(meta.id);
      if (existente) {
        existente.nome = meta.nome || existente.nome;
        existente.regra = meta.regra || existente.regra;
        existente.arquivo = meta.arquivo || existente.arquivo;
        ordenados.push(existente);
      } else if (recarregarArquivos) {
        // modelo adicionado por quem usa: o arquivo fica no IndexedDB
        let bytes = null;
        try { bytes = await idbLer(meta.id); } catch (e) { /* indisponível */ }
        const modelo = {
          id: meta.id, nome: meta.nome, arquivo: meta.arquivo,
          bytes: null, scan: null, regra: meta.regra || regraPadrao(),
          origem: meta.origem || 'adicionado'
        };
        ordenados.push(modelo);
        if (bytes) { try { await lerModelo(modelo, bytes); } catch (e) { /* arquivo corrompido */ } }
      }
    }
    for (const m of state.modelos) if (!ordenados.includes(m)) ordenados.push(m);
    state.modelos = ordenados;
  }
  if (!modeloPorId(state.modeloAtivo)) state.modeloAtivo = state.modelos[0]?.id || '';
  state.alterado = false;
}

function salvarConfiguracao() {
  try { localStorage.setItem(LS_CURRENT, JSON.stringify(configuracaoAtual())); } catch (e) { /* modo privado */ }
}

function lerConfiguracaoSalva() {
  try {
    const raw = localStorage.getItem(LS_CURRENT);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function listarPerfis() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILES) || '{}'); } catch (e) { return {}; }
}

/* ============================================================
   9. Exportação da ferramenta configurada
   ============================================================ */
/** O logotipo pode ser uma URL (versão web); na cópia gerada ele precisa ir embutido. */
async function logoEmbutido() {
  if (!LOGO || LOGO.startsWith('data:')) return LOGO;
  try {
    const res = await fetch(LOGO);
    const buf = new Uint8Array(await res.arrayBuffer());
    const tipo = res.headers.get('content-type') || 'image/png';
    return `data:${tipo};base64,` + paraB64(buf);
  } catch (e) {
    return '';
  }
}

async function gerarFerramenta({ comBase }) {
  if (!podeExportarFerramenta) throw new Error('Esta cópia não sabe se regerar. Use o build.py.');

  const fontes = {
    logo: await logoEmbutido(),
    base: comBase && state.baseBytes
      ? { tipo: 'base64', nome: state.baseLabel || 'Base incorporada', dados: paraB64(state.baseBytes) }
      : null,
    modelos: state.modelos.filter(m => m.bytes).map(m => ({
      id: m.id, nome: m.nome, arquivo: m.arquivo, regra: m.regra, origem: 'padrao',
      tipo: 'base64', dados: paraB64(m.bytes)
    })),
    mapeamento: state.mapeamento,
    prefixosIgnorados: state.blocked
  };

  const literalFontes = 'window.GMC=' + JSON.stringify(fontes) + ';';
  const literalShell = JSON.stringify(SHELL_SRC).replace(/<\//g, '<\\/');

  return SHELL_SRC
    .replace('/*__GMC_FONTES__*/', () => literalFontes)
    .replace('"__SHELL__"', () => literalShell);
}

/* ============================================================
   10. Interface
   ============================================================ */
function toast(message, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3600);
  setTimeout(() => el.remove(), 4000);
}

function setStatus(text, kind) {
  const p = $('statusPill');
  p.textContent = text;
  p.className = 'pill' + (kind ? ' ' + kind : '');
}

const VIEW_META = {
  painel: ['Painel', 'Visão geral da configuração e da base oficial'],
  base: ['Base de dados', 'Planilha oficial, aba utilizada e colunas disponíveis'],
  modelos: ['Modelos Word', 'Arquivos .docx e a regra que define quando cada um é usado'],
  mapeamento: ['Mapeamento de campos', 'Defina de onde vem o conteúdo de cada campo do documento'],
  geracao: ['Gerar documentos', 'Localize os cargos e baixe em Word ou PDF'],
  distribuir: ['Salvar e distribuir', 'Guarde a configuração ou gere a ferramenta pronta para enviar']
};

function showView(name) {
  qsa('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  qsa('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const [t, s] = VIEW_META[name] || ['', ''];
  $('pageTitle').textContent = t;
  $('pageSub').textContent = s;
  if (name === 'mapeamento') renderMapping();
  if (name === 'painel') renderDashboard();
  if (name === 'modelos') renderModelos();
  if (name === 'distribuir') renderDistribuir();
  window.scrollTo(0, 0);
}

/* ---------------- painel ---------------- */
function renderDashboard() {
  const stats = state.modelos.map(m => mappingStats(m.id));
  const vinculados = stats.reduce((a, s) => a + s.bound, 0);
  const pendentes = stats.reduce((a, s) => a + s.pending, 0);

  $('stRows').textContent = state.rows.length.toLocaleString('pt-BR');
  $('stRowsNote').textContent = state.columns.length
    ? `aba ${state.sheetName} · ${((state.allRecords || []).length - state.rows.length).toLocaleString('pt-BR')} ignorados por prefixo`
    : 'nenhuma planilha carregada';
  $('stCols').textContent = state.columns.length;
  $('stModelos').textContent = state.modelos.length;
  $('stModelosNote').textContent = `${vinculados} campos vinculados`;
  $('stPend').textContent = pendentes;

  const contagem = state.rows.length ? contagemPorModelo() : {};
  const itens = [];
  itens.push({
    ok: state.rows.length > 0, label: 'Base de dados',
    detalhe: state.rows.length ? `${state.rows.length.toLocaleString('pt-BR')} cargos · ${state.baseLabel}` : 'Nenhuma planilha carregada',
    view: 'base'
  });
  state.modelos.forEach(m => {
    const st = mappingStats(m.id);
    const n = contagem[m.id] || 0;
    itens.push({
      ok: !!m.scan && st.pending === 0, label: m.nome,
      detalhe: !m.scan ? 'Arquivo .docx ausente — carregue novamente'
        : `${st.pending ? st.pending + ' campo(s) sem origem · ' : ''}${n.toLocaleString('pt-BR')} cargo(s) usariam este modelo`,
      view: 'modelos'
    });
  });

  $('healthList').innerHTML = itens.map(it => `
    <div class="issue" data-goto="${it.view}">
      <span class="tag ${it.ok ? 'ok' : 'warn'}">${it.ok ? 'OK' : 'Atenção'}</span>
      <span class="il"><b>${esc(it.label)}</b><br><span style="color:var(--muted)">${esc(it.detalhe)}</span></span>
      <span class="chev">${ICONES.seta}</span>
    </div>`).join('');

  $('navBase').textContent = state.rows.length ? state.rows.length.toLocaleString('pt-BR') : '—';
  $('navModelos').textContent = state.modelos.length;
  const nav = $('navMap');
  nav.textContent = pendentes ? pendentes : 'OK';
  nav.parentElement.classList.toggle('warn', pendentes > 0);
}

/* ---------------- base ---------------- */
function renderBaseView() {
  $('baseName').textContent = state.baseLabel || 'Nenhuma planilha carregada';
  $('selSheet').innerHTML = state.sheets.map(s =>
    `<option${s === state.sheetName ? ' selected' : ''}>${esc(s)}</option>`).join('');
  $('inpBlocked').value = state.blocked.join(', ');

  if (!state.columns.length) {
    $('baseStatus').innerHTML = `<div class="alert warn"><span class="ai">!</span><div>
      <b>Nenhuma planilha carregada.</b> Selecione o arquivo <span class="mono">.xlsx</span> acima
      para começar. O arquivo é lido no seu próprio navegador e não é enviado para nenhum servidor.
    </div></div>`;
    renderColumns();
    return;
  }
  const ignorados = (state.allRecords || []).length - state.rows.length;
  let html = `<div class="alert ok"><span class="ai">✓</span><div>
    <b>${state.rows.length.toLocaleString('pt-BR')} registros</b> carregados da aba <span class="mono">${esc(state.sheetName)}</span>
    · ${state.columns.length} colunas.
  </div></div>`;

  // O filtro de prefixos descarta linhas em silêncio. Quando ele estiver
  // agindo, mostra quanto e quais, para não sumir cargo sem ninguém notar.
  if (ignorados > 0) {
    const porPrefixo = state.blocked.map(p => {
      const n = (state.allRecords || []).filter(r => clean(r.COD_DO_CARGO).startsWith(p)).length;
      return n ? `<span class="mono">${esc(p)}</span> (${n.toLocaleString('pt-BR')})` : '';
    }).filter(Boolean).join(', ');
    html += `<div class="alert warn" style="margin-top:9px"><span class="ai">!</span><div>
      <b>${ignorados.toLocaleString('pt-BR')} cargo(s) foram descartados</b> pelo filtro de prefixos: ${porPrefixo}.
      Eles não aparecem em nenhuma busca nem em nenhum documento. Se não for essa a intenção,
      limpe o campo <b>Prefixos de código ignorados</b> acima.
    </div></div>`;
  }
  $('baseStatus').innerHTML = html;
  renderColumns();
}

function renderColumns() {
  const filtro = norm($('colSearch').value);
  const amostra = state.rows[0] || {};
  const lista = state.columns.filter(c => !filtro || norm(c).includes(filtro));
  $('colTable').innerHTML = `
    <thead><tr><th style="width:44px">#</th><th>Coluna</th><th>Exemplo de conteúdo</th></tr></thead>
    <tbody>${lista.map(c => `<tr>
      <td class="mono" style="color:var(--muted)">${state.columns.indexOf(c) + 1}</td>
      <td class="mono"><b>${esc(c)}</b></td>
      <td style="color:var(--muted)">${esc(str(amostra[c]).slice(0, 90)) || '<i>vazio</i>'}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">Nenhuma coluna encontrada.</td></tr>'}</tbody>`;
}

/* ---------------- modelos ---------------- */
const OPERADORES = {
  igual: 'for igual a', contem: 'contiver', comeca: 'começar com',
  vazio: 'estiver vazia', preenchido: 'estiver preenchida'
};

function renderModelos() {
  const contagem = state.rows.length ? contagemPorModelo() : {};
  const host = $('listaModelos');

  host.innerHTML = state.modelos.map((m, i) => {
    const st = mappingStats(m.id);
    const n = contagem[m.id] || 0;
    const semArquivo = !m.scan;
    const precisaValor = m.regra.tipo === 'condicao' && !['vazio', 'preenchido'].includes(m.regra.operador);

    return `<div class="card modelo${semArquivo ? ' faltando' : ''}">
      <div class="card-head">
        <div>
          <h2>
            <span class="ordem">${i + 1}</span>
            <input class="nome-modelo" type="text" value="${esc(m.nome)}" data-nome="${m.id}" aria-label="Nome do modelo">
          </h2>
          <p class="desc mono" style="margin-top:6px">${esc(m.arquivo || '—')}</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost sm" data-mover="${m.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Subir">${ICONES.subir}</button>
          <button class="btn ghost sm" data-mover="${m.id}" data-dir="1" ${i === state.modelos.length - 1 ? 'disabled' : ''} title="Descer">${ICONES.descer}</button>
          <button class="btn sec sm" data-mapear="${m.id}" ${semArquivo ? 'disabled' : ''}>Mapear campos</button>
          <button class="btn ghost sm" data-remover="${m.id}" ${state.modelos.length < 2 ? 'disabled' : ''}>Remover</button>
        </div>
      </div>
      <div class="card-body">
        ${semArquivo ? `<div class="alert err" style="margin-bottom:14px"><span class="ai">×</span><div>
            O arquivo deste modelo não está disponível nesta sessão. Selecione o
            <span class="mono">.docx</span> abaixo para reativá-lo.</div></div>` : ''}

        <div class="grid-2">
          <div>
            <label>Quando usar este modelo</label>
            <select class="regra-tipo" data-regra="${m.id}" data-campo="tipo">
              <option value="condicao"${m.regra.tipo === 'condicao' ? ' selected' : ''}>Quando uma coluna tiver certo valor</option>
              <option value="familia"${m.regra.tipo === 'familia' ? ' selected' : ''}>Quando o cargo tiver trilha JR/PL/SR completa</option>
              <option value="sempre"${m.regra.tipo === 'sempre' ? ' selected' : ''}>Qualquer cargo (padrão de sobra)</option>
              <option value="manual"${m.regra.tipo === 'manual' ? ' selected' : ''}>Somente quando escolhido manualmente</option>
            </select>

            ${m.regra.tipo === 'condicao' ? `
              <div class="regra-cond">
                <select data-regra="${m.id}" data-campo="coluna">
                  <option value="">— coluna —</option>
                  ${state.columns.map(c => `<option${c === m.regra.coluna ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
                <select data-regra="${m.id}" data-campo="operador">
                  ${Object.entries(OPERADORES).map(([k, v]) => `<option value="${k}"${m.regra.operador === k ? ' selected' : ''}>${v}</option>`).join('')}
                </select>
                ${precisaValor ? `<input type="text" list="valores-${m.id}" value="${esc(m.regra.valor)}" data-regra="${m.id}" data-campo="valor" placeholder="valor">
                  <datalist id="valores-${m.id}">${valoresDaColuna(m.regra.coluna).map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}
              </div>` : ''}

            <label class="check" style="margin-top:12px">
              <input type="checkbox" data-regra="${m.id}" data-campo="exigeFamilia" ${m.regra.exigeFamilia ? 'checked' : ''}>
              Exigir também trilha JR/PL/SR completa
            </label>
          </div>

          <div>
            <label>Situação</label>
            <div class="alert ${semArquivo ? 'err' : st.pending ? 'warn' : 'ok'}">
              <span class="ai">${semArquivo ? '×' : st.pending ? '!' : '✓'}</span>
              <div>
                ${m.scan ? `${m.scan.tables.length} tabelas · ${m.scan.fieldCount} campos de mesclagem<br>` : ''}
                ${semArquivo ? 'Arquivo ausente' : st.pending ? `<b>${st.pending} campo(s) sem origem definida</b>` : `${st.bound} campos vinculados`}
                <br><b>${n.toLocaleString('pt-BR')}</b> cargo(s) da base usariam este modelo
              </div>
            </div>
            <p class="help" style="margin-top:10px">Usado ${esc(descreverRegra(m.regra))}.</p>
            <div class="field" style="margin-top:12px">
              <label for="troca-${m.id}">Substituir o arquivo .docx</label>
              <input type="file" accept=".docx" data-trocar="${m.id}" id="troca-${m.id}">
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  $('avisoOrdem').hidden = state.modelos.length < 2;
}

function valoresDaColuna(coluna) {
  if (!coluna) return [];
  const set = new Set();
  for (const r of state.rows) { const v = val(r, coluna); if (v) set.add(v); if (set.size > 60) break; }
  return [...set].sort();
}

/* ---------------- mapeamento ---------------- */
function renderMapping() {
  const modelo = modeloAtivo();
  $('selModelo').innerHTML = state.modelos.map(m =>
    `<option value="${m.id}"${m.id === (modelo && modelo.id) ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');

  const host = $('docTables');
  if (!modelo || !modelo.scan) {
    host.innerHTML = '<div class="card"><div class="empty-state">' + ICONE_GRANDE(ICONES.documento) + '<h3>Modelo sem arquivo</h3>Carregue o .docx na tela Modelos Word.</div></div>';
    $('mapCount').textContent = '—';
    renderInspector();
    return;
  }

  const map = state.mapeamento[modelo.id] || {};
  const st = mappingStats(modelo.id);
  $('mapCount').textContent = `${st.bound} vinculados · ${st.pending} pendentes`;
  $('mapDirty').hidden = !state.alterado;

  const record = previewRecord();
  host.innerHTML = modelo.scan.tables.map(t => {
    const rows = t.rows.map(row => {
      const cells = row.cells.map(c => {
        const b = map[c.key];
        const cls = ['cell'];
        if (state.celulaSelecionada === c.key) cls.push('sel');
        if (b) {
          cls.push('bound');
          if (b.source === 'text') cls.push('fixed');
          if (b.source === 'empty') cls.push('empty');
        } else if (c.field) cls.push('unbound');
        else if (c.static) cls.push('static');

        if (c.static && !b && !state.mostrarFixos) {
          return `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}><span class="cell static" style="opacity:.45"></span></td>`;
        }

        let body;
        if (b) {
          const preview = record ? resolveBinding(b, record) : '';
          body = `<span class="cv">${esc(str(preview).slice(0, 130)) || '<i style="color:#a8afb8">sem conteúdo</i>'}</span>
                  <span class="cf">${esc(describeBinding(b))}</span>`;
        } else if (c.field) {
          body = `<span class="cv" style="color:#a8afb8"><i>sem origem definida</i></span><span class="cf">«${esc(c.field)}»</span>`;
        } else {
          body = `<span class="cv">${esc(c.text) || '<i style="color:#c2c8d0">vazio</i>'}</span>`;
        }
        const label = c.labels.col || c.labels.row || '';
        return `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}>
          <button class="${cls.join(' ')}" data-cell="${c.key}" type="button">
            ${label && !c.static ? `<span class="cl">${esc(label)}</span>` : ''}${body}
          </button></td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="doc-table">
      <div class="doc-table-head"><span class="t">${esc(t.title)}</span><span class="m">tabela ${t.index + 1}</span></div>
      <table class="doc-grid">${rows}</table></div>`;
  }).join('');

  renderInspector();
}

function previewRecord() {
  const code = clean($('previewCode').value);
  if (code) {
    const r = resolveRecord(code);
    if (r) return r;
  }
  const modelo = modeloAtivo();
  if (modelo) {
    const alvo = state.rows.find(r => {
      const m = escolherModelo(resolveRecord(r.COD_DO_CARGO) || r);
      return m && m.id === modelo.id;
    });
    if (alvo) return resolveRecord(alvo.COD_DO_CARGO);
  }
  return state.rows[0] || null;
}

function findCell(key) {
  const modelo = modeloAtivo();
  return modelo && modelo.scan ? modelo.scan.cells.find(c => c.key === key) : null;
}

function renderInspector() {
  const key = state.celulaSelecionada;
  const cell = key ? findCell(key) : null;
  const body = $('inspBody');
  if (!cell) {
    $('inspTitle').textContent = 'Nenhuma célula selecionada';
    $('inspCrumb').textContent = 'Escolha uma célula na estrutura ao lado.';
    body.innerHTML = '<div class="insp-empty">' + ICONE_GRANDE(ICONES.mapear) + 'Selecione uma célula do documento para definir qual coluna da planilha vai preenchê-la.</div>';
    return;
  }
  const modelo = modeloAtivo();
  const map = state.mapeamento[modelo.id] || {};
  const b = map[key] || null;
  const source = b ? b.source : 'keep';

  $('inspTitle').textContent = cell.field ? `Campo «${cell.field}»` : (cell.labels.row || cell.labels.col || 'Célula do documento');
  $('inspCrumb').innerHTML = [cell.labels.table, cell.labels.group, cell.labels.col, cell.labels.row]
    .filter(Boolean).map(x => `<b>${esc(x)}</b>`).join(' › ') || 'Sem rótulos de contexto';

  const record = previewRecord();
  const preview = b ? resolveBinding(b, record) : null;

  body.innerHTML = `
    <div class="field">
      <label>Origem do conteúdo</label>
      <div class="seg" id="segSource">
        <button data-src="column" class="${source === 'column' ? 'on' : ''}">Coluna</button>
        <button data-src="text" class="${source === 'text' ? 'on' : ''}">Texto fixo</button>
        <button data-src="empty" class="${source === 'empty' ? 'on' : ''}">Em branco</button>
        <button data-src="keep" class="${source === 'keep' ? 'on' : ''}">Manter</button>
      </div>
      <p class="help">“Manter” preserva exatamente o que está escrito no arquivo Word.</p>
    </div>

    ${source === 'column' ? `
      <div class="field">
        <label>Nível da trilha</label>
        <div class="seg" id="segLevel">
          <button data-lvl="" class="${!b || !b.level ? 'on' : ''}">Sem nível</button>
          ${NIVEIS.map(n => `<button data-lvl="${n}" class="${b && b.level === n ? 'on' : ''}">${NIVEL_NOME[n]}</button>`).join('')}
        </div>
        <p class="help">Com um nível selecionado, a coluna usada passa a ser <span class="mono">COLUNA_${b && b.level ? b.level : 'JR'}</span>.</p>
      </div>
      <div class="field">
        <label for="inspColSearch">Coluna da planilha</label>
        <input type="search" id="inspColSearch" placeholder="Filtrar entre ${state.columns.length} colunas…">
        <div class="col-list" id="inspColList"></div>
      </div>
      <div class="field">
        <label for="inspFormat">Formato do valor</label>
        <select id="inspFormat">
          <option value="texto"${b && b.format === 'texto' ? ' selected' : ''}>Texto original</option>
          <option value="data"${b && b.format === 'data' ? ' selected' : ''}>Data (dd/mm/aaaa)</option>
          <option value="maiusculas"${b && b.format === 'maiusculas' ? ' selected' : ''}>MAIÚSCULAS</option>
          <option value="titulo"${b && b.format === 'titulo' ? ' selected' : ''}>Primeira Maiúscula</option>
        </select>
      </div>
      <div class="field">
        <label for="inspFallback">Colunas alternativas</label>
        <input type="text" id="inspFallback" value="${esc((b && b.fallbacks || []).join(', '))}" placeholder="Ex.: CARGO">
        <p class="help">Usadas em ordem quando a coluna principal estiver vazia. Separe por vírgula.</p>
      </div>` : ''}

    ${source === 'text' ? `
      <div class="field">
        <label for="inspText">Texto fixo</label>
        <textarea id="inspText" style="font-family:var(--font);min-height:88px">${esc(b ? b.text : '')}</textarea>
        <p class="help">O mesmo texto será gravado em todos os documentos gerados.</p>
      </div>` : ''}

    <div class="field">
      <label>Pré-visualização${record ? ` · cargo ${esc(clean(record.COD_DO_CARGO))}` : ''}</label>
      <div class="preview-box ${preview ? '' : 'empty-val'}">${preview ? esc(preview) : (source === 'keep' ? 'Conteúdo original do documento: ' + (esc(cell.text) || 'vazio') : 'Sem conteúdo para este cargo')}</div>
    </div>

    <div class="inline" style="margin-top:16px">
      <button class="btn sec sm" id="inspSuggest">Sugerir para esta célula</button>
      <button class="btn ghost sm" id="inspClear">Remover vínculo</button>
    </div>`;

  if (source === 'column') renderColumnPicker(b);
  bindInspectorEvents(cell, b, source);
}

function renderColumnPicker(binding) {
  const search = $('inspColSearch');
  const list = $('inspColList');
  const amostra = previewRecord() || {};
  const draw = () => {
    const f = norm(search.value);
    const cols = state.columns.filter(c => !f || norm(c).includes(f)).slice(0, 300);
    list.innerHTML = cols.map(c => {
      const on = binding && binding.column === c;
      const v = str(amostra[binding && binding.level ? c + '_' + binding.level : c]).slice(0, 46);
      return `<button class="col-opt ${on ? 'on' : ''}" data-col="${esc(c)}" type="button">${esc(c)}
        ${v ? `<span class="cs">${esc(v)}</span>` : ''}</button>`;
    }).join('') || '<div style="padding:12px;color:var(--muted);font-size:12.5px">Nenhuma coluna encontrada.</div>';
    const on = list.querySelector('.col-opt.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  draw();
  search.oninput = draw;
  list.onclick = e => {
    const btn = e.target.closest('[data-col]');
    if (!btn) return;
    updateBinding(b => { b.source = 'column'; b.column = btn.dataset.col; if (!b.format || b.format === 'texto') b.format = formatFor(b.column); });
  };
}

function currentBinding() {
  const modelo = modeloAtivo();
  const map = state.mapeamento[modelo.id] || (state.mapeamento[modelo.id] = {});
  if (!map[state.celulaSelecionada]) {
    map[state.celulaSelecionada] = { source: 'column', column: '', level: '', fallbacks: [], format: 'texto', text: '' };
  }
  return map[state.celulaSelecionada];
}

function updateBinding(mutator) {
  const b = currentBinding();
  mutator(b);
  state.alterado = true;
  renderMapping();
}

function removeBinding() {
  const modelo = modeloAtivo();
  delete (state.mapeamento[modelo.id] || {})[state.celulaSelecionada];
  state.alterado = true;
  renderMapping();
}

function bindInspectorEvents(cell, binding, source) {
  const seg = $('segSource');
  if (seg) seg.onclick = e => {
    const btn = e.target.closest('[data-src]');
    if (!btn) return;
    if (btn.dataset.src === 'keep') { removeBinding(); return; }
    updateBinding(b => { b.source = btn.dataset.src; });
  };

  const lvl = $('segLevel');
  if (lvl) lvl.onclick = e => {
    const btn = e.target.closest('[data-lvl]');
    if (!btn) return;
    updateBinding(b => { b.level = btn.dataset.lvl; });
  };

  const fmt = $('inspFormat');
  if (fmt) fmt.onchange = () => updateBinding(b => { b.format = fmt.value; });

  const fb = $('inspFallback');
  if (fb) fb.onchange = () => updateBinding(b => {
    b.fallbacks = fb.value.split(/[,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
  });

  const txt = $('inspText');
  if (txt) txt.onchange = () => updateBinding(b => { b.source = 'text'; b.text = txt.value; });

  const sug = $('inspSuggest');
  if (sug) sug.onclick = () => {
    const s = suggestBinding(cell);
    if (!s) { toast('Nenhuma coluna correspondente encontrada para esta célula.', 'warn'); return; }
    updateBinding(b => Object.assign(b, s));
    toast(`Sugerido: ${describeBinding(s)}`, 'ok');
  };
  const clr = $('inspClear');
  if (clr) clr.onclick = removeBinding;
}

/* ---------------- validação ---------------- */
function openModal(title, html) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modalBg').hidden = false;
}

function validateMapping() {
  const modelo = modeloAtivo();
  if (!modelo || !modelo.scan) return;
  const map = state.mapeamento[modelo.id] || {};
  const problemas = [];

  modelo.scan.cells.forEach(c => {
    const b = map[c.key];
    if (!b) {
      if (c.field) problemas.push({ lvl: 'warn', txt: `Campo «${esc(c.field)}» em <b>${esc(c.labels.table)}</b> não tem origem definida — sairá em branco.` });
      return;
    }
    if (b.source === 'column') {
      if (!b.column) { problemas.push({ lvl: 'err', txt: `Célula em <b>${esc(c.labels.table)}</b> está marcada como coluna, mas nenhuma coluna foi escolhida.` }); return; }
      const usada = b.level ? b.column + '_' + b.level : b.column;
      if (!state.columns.includes(usada)) {
        problemas.push({ lvl: 'err', txt: `A coluna <span class="mono">${esc(usada)}</span> não existe na planilha atual (<b>${esc(c.labels.table)}</b>).` });
      } else if (state.rows.filter(r => val(r, usada)).length === 0) {
        problemas.push({ lvl: 'warn', txt: `A coluna <span class="mono">${esc(usada)}</span> está vazia em todos os registros.` });
      }
      (b.fallbacks || []).forEach(f => {
        if (!state.columns.includes(f)) problemas.push({ lvl: 'warn', txt: `Coluna alternativa <span class="mono">${esc(f)}</span> não existe na planilha.` });
      });
    }
  });

  const html = problemas.length
    ? problemas.map(p => `<div class="alert ${p.lvl}" style="margin-bottom:8px"><span class="ai">${p.lvl === 'err' ? '×' : '!'}</span><div>${p.txt}</div></div>`).join('')
    : '<div class="alert ok"><span class="ai">✓</span><div>Nenhum problema encontrado. Todos os campos do documento têm origem válida.</div></div>';
  openModal(`Validação — ${modelo.nome}`, html);
}

/* ---------------- geração ---------------- */
function parseCodes(text) {
  return [...new Set(text.split(/[\s,;]+/).map(clean).filter(Boolean))];
}

function renderResults(hostId, itens, faltando) {
  $(hostId).innerHTML = itens.map(x => `
    <div class="result">
      <span class="code">${esc(clean(x.record.COD_DO_CARGO))}</span>
      <span class="nm">${esc(firstOf(x.record, ['NOME_COMPLETO', 'CARGO']))}</span>
      <span class="tag ${x.modelo ? 'brand' : 'err'}">${esc(x.modelo ? x.modelo.nome : 'sem modelo')}</span>
    </div>`).join('') + (faltando.length
      ? `<div class="alert warn" style="margin-top:10px"><span class="ai">!</span><div>Códigos não encontrados: <span class="mono">${esc(faltando.join(', '))}</span></div></div>`
      : '');
}

function searchAuto() {
  const codigos = parseCodes($('codesAuto').value);
  const achados = [], faltando = [];
  codigos.forEach(c => {
    const r = resolveRecord(c);
    if (r) achados.push({ record: r, modelo: escolherModelo(r) });
    else faltando.push(c);
  });
  state.sel.auto = achados;
  renderResults('resultsAuto', achados, faltando);
  $('btnWordAuto').disabled = $('btnPdfAuto').disabled = !achados.length;
  toast(`${achados.length} cargo(s) localizado(s).`, achados.length ? 'ok' : 'warn');
}

function searchEscolhido() {
  const modelo = modeloPorId($('selModeloGeracao').value);
  const codigos = parseCodes($('codesEscolhido').value);
  const achados = [], faltando = [];
  codigos.forEach(c => {
    const r = exactRecord(c);
    if (r) achados.push({ record: r, modelo });
    else faltando.push(c);
  });
  state.sel.escolhido = achados;
  renderResults('resultsEscolhido', achados, faltando);
  $('btnWordEscolhido').disabled = $('btnPdfEscolhido').disabled = !achados.length || !modelo;
  toast(`${achados.length} cargo(s) localizado(s).`, achados.length ? 'ok' : 'warn');
}

async function downloadWord(itens, botao) {
  if (!itens.length) return;
  const original = botao.textContent;
  botao.disabled = true;
  try {
    for (let i = 0; i < itens.length; i++) {
      const { record, modelo } = itens[i];
      if (!modelo) continue;
      botao.textContent = `Gerando ${i + 1} de ${itens.length}…`;
      download(await buildDocx(modelo, record), fileNameFor(record) + '.docx');
      await sleep(420);
    }
    toast(`${itens.length} arquivo(s) Word gerado(s).`, 'ok');
  } catch (e) {
    toast('Erro ao gerar Word: ' + e.message, 'err');
  } finally {
    botao.textContent = original;
    botao.disabled = false;
  }
}

function printPdf(itens) {
  if (!itens.length) return;
  $('printArea').innerHTML = itens.map(x => x.modelo ? renderDocForPrint(x.modelo, x.record) : '').join('');
  toast('Documento preparado. Escolha “Salvar como PDF” na janela de impressão.', 'ok');
  setTimeout(() => window.print(), 150);
}

/* ---------------- salvar e distribuir ---------------- */
function renderDistribuir() {
  const perfis = listarPerfis();
  const nomes = Object.keys(perfis);
  $('listaPerfis').innerHTML = nomes.length ? nomes.map(n => `
    <div class="issue">
      <span class="il"><b>${esc(n)}</b><br><span style="color:var(--muted)">Salvo em ${esc(new Date(perfis[n].salvoEm).toLocaleString('pt-BR'))}</span></span>
      <button class="btn sec sm" data-load-profile="${esc(n)}">Carregar</button>
      <button class="btn ghost sm" data-del-profile="${esc(n)}">Excluir</button>
    </div>`).join('')
    : '<div class="empty-state">' + ICONE_GRANDE(ICONES.caixa) + '<h3>Nenhum perfil salvo</h3>Configure e salve com um nome para reutilizar depois.</div>';

  const box = $('exportInfo');
  if (!podeExportarFerramenta) {
    box.innerHTML = `<div class="alert warn"><span class="ai">!</span><div>
      Esta cópia não consegue se regerar. Gere a ferramenta pelo <span class="mono">build.py</span>.</div></div>`;
    $('btnExportTool').disabled = true;
    $('btnExportToolSemBase').disabled = true;
    return;
  }
  const tamModelos = state.modelos.reduce((a, m) => a + (m.bytes ? m.bytes.length : 0), 0);
  const tamBase = state.baseBytes ? state.baseBytes.length : 0;
  const mb = b => (b * 1.37 / 1048576).toFixed(1);
  box.innerHTML = `<div class="alert info"><span class="ai">i</span><div>
    A ferramenta gerada leva ${state.modelos.length} modelo(s), o mapeamento e as regras já configurados.
    Tamanho aproximado: <b>${mb(tamModelos + tamBase + 250000)} MB</b> com a base,
    <b>${mb(tamModelos + 250000)} MB</b> sem ela.</div></div>`;
  $('btnExportTool').disabled = !state.baseBytes;
  $('btnExportToolSemBase').disabled = false;
}

async function exportarFerramenta(comBase) {
  const botao = comBase ? $('btnExportTool') : $('btnExportToolSemBase');
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  try {
    await sleep(30);
    const html = await gerarFerramenta({ comBase });
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'Gerador_Mapas_Carreira.html');
    toast('Ferramenta gerada. Envie o arquivo para quem vai usar.', 'ok');
  } catch (e) {
    toast('Erro ao gerar a ferramenta: ' + e.message, 'err');
  } finally {
    botao.textContent = original;
    botao.disabled = false;
    renderDistribuir();
  }
}

/* ============================================================
   11. Inicialização e eventos
   ============================================================ */
function bootProgress(msg, fraction) {
  const m = $('bootMsg'), f = $('bootFill');
  if (m && msg) m.textContent = msg;
  if (f) f.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
}

function bootDone() {
  const s = $('bootScreen');
  if (!s) return;
  s.style.opacity = '0';
  setTimeout(() => { s.hidden = true; }, 250);
}

async function boot() {
  const bootLogo = $('bootLogo');
  if (bootLogo && LOGO) bootLogo.src = LOGO;

  try {
    if (location.protocol === 'file:' && (SRC.modelos || []).some(m => m.tipo === 'url')) {
      throw new Error('esta é a versão web e precisa ser aberta por um servidor '
        + '(http://). Para uso local, abra o arquivo Gerador_Mapas_Carreira.html.');
    }

    const definicoes = SRC.modelos || [];
    for (let i = 0; i < definicoes.length; i++) {
      const d = definicoes[i];
      bootProgress('Carregando modelos Word…', 0.05 + (i / definicoes.length) * 0.18);
      const bytes = await fetchSource(d);
      const modelo = {
        id: d.id, nome: d.nome, arquivo: d.arquivo, bytes: null, scan: null,
        regra: d.regra || regraPadrao(), origem: d.origem || 'padrao'
      };
      state.modelos.push(modelo);
      state.mapeamento[modelo.id] = {};
      await lerModelo(modelo, bytes);
    }
    state.modeloAtivo = state.modelos[0]?.id || '';

    if (SRC.base) {
      bootProgress('Baixando a base de cargos…', 0.25);
      state.baseDefault = await fetchSource(SRC.base, p => bootProgress(null, 0.25 + p * 0.5));
      bootProgress('Lendo a planilha…', 0.8);
      await sleep(0);
      await loadBase(state.baseDefault, SRC.base.nome || 'Base incorporada');
    } else {
      state.semBase = true;
    }

    bootProgress('Preparando o mapeamento…', 0.9);
    if (Array.isArray(SRC.prefixosIgnorados)) { state.blocked = SRC.prefixosIgnorados; refilterRows(); }

    // mapeamento embutido pela exportação tem prioridade sobre a sugestão
    if (SRC.mapeamento && Object.keys(SRC.mapeamento).length) {
      state.mapeamento = SRC.mapeamento;
    }
    const salvo = lerConfiguracaoSalva();
    if (salvo) { try { await aplicarConfiguracao(salvo); } catch (e) { console.warn(e); } }

    depoisDaBase();
    state.pronto = true;
    renderAll();
    bootProgress('Pronto', 1);
    bootDone();
    if (state.semBase) showView('base');
  } catch (e) {
    bootProgress('Falha ao iniciar: ' + e.message, 1);
    const f = $('bootFill');
    if (f) f.style.background = 'var(--danger)';
    setStatus('Falha ao iniciar', 'err');
    console.error(e);
    setTimeout(bootDone, 2500);
    toast('Erro na inicialização: ' + e.message, 'err');
  }
}

/** Passos que dependem de haver (ou não) uma base carregada. */
function depoisDaBase() {
  if (!state.columns.length) {
    setStatus('Aguardando a planilha', 'warn');
    return;
  }
  state.semBase = false;
  let sugeridos = 0;
  for (const m of state.modelos) {
    if (m.scan && !Object.keys(state.mapeamento[m.id] || {}).length) sugeridos += autoSuggest(m.id);
  }
  if (sugeridos) salvarConfiguracao();
  setStatus(`${state.rows.length.toLocaleString('pt-BR')} cargos carregados`, 'ok');
}

function renderAll() {
  renderDashboard();
  renderBaseView();
  renderModelos();
  renderGeracaoModelos();
  if (!$('view-mapeamento').hidden) renderMapping();
  if (!$('view-distribuir').hidden) renderDistribuir();
}

function renderGeracaoModelos() {
  const sel = $('selModeloGeracao');
  const atual = sel.value;
  sel.innerHTML = state.modelos.filter(m => m.scan).map(m =>
    `<option value="${m.id}"${m.id === atual ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
}

function wire() {
  $('brandLogo').src = LOGO;

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav) { showView(nav.dataset.view); return; }
    const goto = e.target.closest('[data-goto]');
    if (goto) { showView(goto.dataset.goto); return; }

    const mapear = e.target.closest('[data-mapear]');
    if (mapear) { state.modeloAtivo = mapear.dataset.mapear; state.celulaSelecionada = null; showView('mapeamento'); return; }

    const mover = e.target.closest('[data-mover]');
    if (mover) {
      moverModelo(mover.dataset.mover, +mover.dataset.dir);
      state.alterado = true; salvarConfiguracao(); renderAll();
      return;
    }
    const remover = e.target.closest('[data-remover]');
    if (remover) {
      const m = modeloPorId(remover.dataset.remover);
      if (m && confirm(`Remover o modelo “${m.nome}”? O mapeamento dele será perdido.`)) {
        removerModelo(m.id); salvarConfiguracao(); renderAll();
        toast('Modelo removido.');
      }
      return;
    }
    const cellBtn = e.target.closest('[data-cell]');
    if (cellBtn) { state.celulaSelecionada = cellBtn.dataset.cell; renderMapping(); return; }

    const loadP = e.target.closest('[data-load-profile]');
    if (loadP) {
      const todos = listarPerfis();
      aplicarConfiguracao(todos[loadP.dataset.loadProfile])
        .then(() => { salvarConfiguracao(); renderAll(); toast('Perfil carregado.', 'ok'); })
        .catch(err => toast(err.message, 'err'));
      return;
    }
    const delP = e.target.closest('[data-del-profile]');
    if (delP) {
      const todos = listarPerfis();
      delete todos[delP.dataset.delProfile];
      localStorage.setItem(LS_PROFILES, JSON.stringify(todos));
      renderDistribuir();
      toast('Perfil excluído.');
      return;
    }
  });

  // ---- modelos: regras, nome e troca de arquivo ----
  $('listaModelos').addEventListener('change', async e => {
    const campoRegra = e.target.closest('[data-regra]');
    if (campoRegra) {
      const m = modeloPorId(campoRegra.dataset.regra);
      if (!m) return;
      const campo = campoRegra.dataset.campo;
      m.regra[campo] = campo === 'exigeFamilia' ? campoRegra.checked : campoRegra.value;
      state.alterado = true; salvarConfiguracao(); renderModelos(); renderDashboard();
      return;
    }
    const trocar = e.target.closest('[data-trocar]');
    if (trocar && trocar.files[0]) {
      const m = modeloPorId(trocar.dataset.trocar);
      const f = trocar.files[0];
      try {
        await lerModelo(m, await f.arrayBuffer());
        m.arquivo = f.name;
        if (m.origem === 'adicionado') { try { await idbGravar(m.id, m.bytes); } catch (err) { /* sem persistência */ } }
        if (!Object.keys(state.mapeamento[m.id] || {}).length) autoSuggest(m.id);
        salvarConfiguracao(); renderAll();
        const st = mappingStats(m.id);
        toast(st.pending ? `Modelo carregado. ${st.pending} campo(s) precisam de mapeamento.` : 'Modelo carregado.', st.pending ? 'warn' : 'ok');
      } catch (err) { toast(err.message, 'err'); }
    }
  });

  $('listaModelos').addEventListener('input', e => {
    const nome = e.target.closest('[data-nome]');
    if (!nome) return;
    const m = modeloPorId(nome.dataset.nome);
    if (m) { m.nome = nome.value; state.alterado = true; }
  });
  $('listaModelos').addEventListener('blur', e => {
    if (e.target.closest('[data-nome]')) { salvarConfiguracao(); renderAll(); }
  }, true);

  $('fileNovoModelo').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const nome = f.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim() || 'Novo modelo';
      const m = await adicionarModelo(nome, f.name, await f.arrayBuffer(), regraPadrao(), 'adicionado');
      // o novo modelo entra antes do último, que costuma ser o padrão de sobra
      if (state.modelos.length > 1) moverModelo(m.id, -1);
      try { await idbGravar(m.id, m.bytes); }
      catch (err) { toast('O arquivo não pôde ser guardado neste navegador: exporte a ferramenta para não perdê-lo.', 'warn'); }
      autoSuggest(m.id);
      salvarConfiguracao();
      renderAll();
      e.target.value = '';
      const st = mappingStats(m.id);
      toast(st.pending ? `Modelo adicionado. ${st.pending} campo(s) sem origem — revise o mapeamento.` : 'Modelo adicionado e mapeado automaticamente.', st.pending ? 'warn' : 'ok');
      showView('modelos');
    } catch (err) { toast('Não foi possível ler o arquivo: ' + err.message, 'err'); }
  };

  // ---- base ----
  $('fileExcel').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    setStatus('Lendo planilha…');
    try {
      await loadBase(await f.arrayBuffer(), f.name);
      depoisDaBase();
      renderAll();
      toast('Base atualizada nesta sessão.', 'ok');
    } catch (err) { setStatus('Falha ao ler planilha', 'err'); toast(err.message, 'err'); }
  };
  $('btnResetBase').onclick = async () => {
    if (!state.baseDefault) { toast('Esta instalação não tem base padrão: carregue uma planilha.', 'warn'); return; }
    await loadBase(state.baseDefault, SRC.base.nome || 'Base incorporada');
    depoisDaBase(); renderAll();
    toast('Base padrão restaurada.', 'ok');
  };
  $('selSheet').onchange = async e => {
    await applySheet(e.target.value);
    renderAll();
    toast(`Aba “${state.sheetName}” carregada.`, 'ok');
  };
  $('inpBlocked').onchange = e => {
    state.blocked = e.target.value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    refilterRows(); salvarConfiguracao(); renderAll();
  };
  $('colSearch').oninput = renderColumns;

  // ---- mapeamento ----
  $('selModelo').onchange = e => {
    state.modeloAtivo = e.target.value;
    state.celulaSelecionada = null;
    renderMapping();
  };
  $('btnSuggest').onclick = () => {
    const n = autoSuggest(state.modeloAtivo);
    state.alterado = true;
    renderMapping();
    toast(`${n} campo(s) mapeado(s) automaticamente.`, 'ok');
  };
  $('btnClearMap').onclick = () => {
    state.mapeamento[state.modeloAtivo] = {};
    state.celulaSelecionada = null;
    state.alterado = true;
    renderMapping();
    toast('Mapeamento do modelo limpo.');
  };
  $('btnValidate').onclick = validateMapping;
  $('btnSaveMap').onclick = () => {
    salvarConfiguracao();
    state.alterado = false;
    renderMapping(); renderDashboard();
    toast('Mapeamento salvo neste navegador.', 'ok');
  };
  $('previewCode').oninput = () => { if (!$('view-mapeamento').hidden) renderMapping(); };
  $('btnToggleStatic').onclick = () => {
    state.mostrarFixos = !state.mostrarFixos;
    $('btnToggleStatic').textContent = state.mostrarFixos ? 'Ocultar rótulos fixos' : 'Mostrar rótulos fixos';
    renderMapping();
  };

  // ---- geração ----
  $('genTabs').onclick = e => {
    const tab = e.target.closest('[data-pane]');
    if (!tab) return;
    qsa('#genTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    qsa('#view-geracao .pane').forEach(p => { p.hidden = p.id !== 'pane-' + tab.dataset.pane; });
  };
  $('btnSearchAuto').onclick = searchAuto;
  $('btnSearchEscolhido').onclick = searchEscolhido;
  $('btnWordAuto').onclick = () => downloadWord(state.sel.auto, $('btnWordAuto'));
  $('btnWordEscolhido').onclick = () => downloadWord(state.sel.escolhido, $('btnWordEscolhido'));
  $('btnPdfAuto').onclick = () => printPdf(state.sel.auto);
  $('btnPdfEscolhido').onclick = () => printPdf(state.sel.escolhido);
  $('selModeloGeracao').onchange = () => { if (state.sel.escolhido.length) searchEscolhido(); };

  // ---- salvar e distribuir ----
  $('btnExportTool').onclick = () => exportarFerramenta(true);
  $('btnExportToolSemBase').onclick = () => exportarFerramenta(false);
  $('btnProfileSave').onclick = () => {
    const nome = $('profileName').value.trim();
    if (!nome) { toast('Informe um nome para o perfil.', 'warn'); return; }
    const todos = listarPerfis();
    todos[nome] = configuracaoAtual();
    localStorage.setItem(LS_PROFILES, JSON.stringify(todos));
    salvarConfiguracao();
    state.alterado = false;
    renderDistribuir();
    toast(`Perfil “${nome}” salvo.`, 'ok');
  };
  $('btnProfileExport').onclick = () => {
    const blob = new Blob([JSON.stringify(configuracaoAtual(), null, 2)], { type: 'application/json' });
    download(blob, 'configuracao-mapas-carreira.json');
  };
  $('fileProfile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await aplicarConfiguracao(JSON.parse(await f.text()));
      salvarConfiguracao(); renderAll();
      toast('Configuração importada.', 'ok');
    } catch (err) { toast('Arquivo inválido: ' + err.message, 'err'); }
  };
  $('btnProfileReset').onclick = () => {
    for (const m of state.modelos) { state.mapeamento[m.id] = {}; autoSuggest(m.id); }
    salvarConfiguracao(); renderAll();
    toast('Mapeamento padrão restaurado.', 'ok');
  };

  $('modalClose').onclick = () => { $('modalBg').hidden = true; };
  $('modalBg').onclick = e => { if (e.target === $('modalBg')) $('modalBg').hidden = true; };
}

wire();
boot();

})();
