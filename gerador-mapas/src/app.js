/* ============================================================
   Gerador de Mapas de Carreira — console corporativo
   Toda a execução acontece no navegador: nenhum dado é enviado.

   Conceito central
   ----------------
   A ligação entre as colunas da planilha e as células dos modelos
   Word não está no código: ela é um "mapeamento" editável na tela
   Mapeamento e guardado em perfis. Trocar o modelo Word ou uma
   coluna da base não exige alteração de código.
   ============================================================ */
(function () {
'use strict';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NIVEIS = ['JR', 'PL', 'SR'];
const NIVEL_NOME = { JR: 'Júnior', PL: 'Pleno', SR: 'Sênior' };
const LS_CURRENT = 'gmc.mapeamento.atual';
const LS_PROFILES = 'gmc.mapeamento.perfis';

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

/* ---------------- estado ---------------- */
const state = {
  rows: [], columns: [], sheets: [], sheetName: '',
  baseLabel: 'Base incorporada',
  blocked: ['20', '21', '22', '23', '24'],
  templates: {
    carreira: { label: 'Modelo de carreira (padrão)', bytes: null, scan: null, custom: false },
    individual: { label: 'Modelo individual (padrão)', bytes: null, scan: null, custom: false }
  },
  mapping: { carreira: {}, individual: {} },
  activeTpl: 'carreira',
  selectedSlot: null,
  showStatic: true,
  dirty: false,
  sel: { auto: [], individual: [] },
  ready: false
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
  const wbook = await readWorkbook(buffer);
  state.workbook = wbook;
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

    // Rótulos de contexto de cada célula
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

async function loadTemplate(key, buffer, label, custom) {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Arquivo .docx inválido: document.xml não encontrado.');
  const scan = scanTemplate(parseXml(await file.async('string')));
  const tpl = state.templates[key];
  const previous = tpl.scan;
  tpl.bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);
  tpl.scan = scan;
  tpl.label = label;
  tpl.custom = !!custom;
  if (previous) reattachMapping(key, previous, scan);
  return scan;
}

/**
 * Ao trocar um modelo, tenta preservar o mapeamento existente:
 * primeiro pela posição, depois pela assinatura de contexto.
 */
function reattachMapping(key, oldScan, newScan) {
  const old = state.mapping[key] || {};
  const bySig = new Map();
  oldScan.cells.forEach(c => { if (old[c.key]) bySig.set(c.sig, old[c.key]); });
  const next = {};
  newScan.cells.forEach(c => {
    if (old[c.key]) next[c.key] = old[c.key];
    else if (bySig.has(c.sig)) next[c.key] = bySig.get(c.sig);
  });
  state.mapping[key] = next;
}

/* ============================================================
   3. Mapeamento: sugestão automática e resolução de valores
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
  if (cell.static) return null;                       // rótulo fixo: não sugere
  const label = cell.labels.row || cell.labels.col;
  const col = columnByLabel(label);
  if (!col) return null;
  return make(col, level && state.columns.includes(col + '_' + level) ? level : '');
}

function autoSuggest(key) {
  const scan = state.templates[key].scan;
  if (!scan) return 0;
  const map = state.mapping[key] || (state.mapping[key] = {});
  let n = 0;
  scan.cells.forEach(cell => {
    const b = suggestBinding(cell);
    if (b) { map[cell.key] = b; n++; }
  });
  return n;
}

/* --- formatação de valores --- */
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

/** Devolve o texto a gravar na célula, ou null para não alterar o documento. */
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

function mappingStats(key) {
  const scan = state.templates[key].scan;
  const map = state.mapping[key] || {};
  if (!scan) return { total: 0, bound: 0, pending: 0 };
  const fieldCells = scan.cells.filter(c => c.field || (!c.static && !c.text));
  const bound = fieldCells.filter(c => map[c.key]).length;
  const extra = scan.cells.filter(c => map[c.key] && !fieldCells.includes(c)).length;
  return { total: fieldCells.length, bound: bound + extra, pending: fieldCells.length - bound };
}

/* ============================================================
   4. Seleção de registros
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
  // campos de identidade sempre vêm da linha exata pesquisada
  for (const k of ['COD_EMPRESA', 'EMPRESA', 'EMP_COD', 'COD_DO_CARGO', 'CARGO', 'NOME_COMPLETO', 'CBO',
    'TCLC_DESC', 'DT_ATIVACAO', 'DATA_REVISAO', 'TEXTO_RESULTADO_ESPERADO', 'ATIV_DESC', 'DESCRICAO_CARGO',
    'SKILL_30', 'SKILL_31', 'SKILL_32', 'SKILL_33', 'SKILL_34', 'SKILL_35', 'SKILL_36', 'SKILL_37']) {
    if (val(base, k)) merged[k] = base[k];
  }
  merged._family = NIVEIS.every(s => val(merged, 'COD_DO_CARGO_' + s));
  return merged;
}

/* ============================================================
   5. Geração do documento Word
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

async function buildDocx(tplKey, record) {
  const tpl = state.templates[tplKey];
  if (!tpl.bytes) throw new Error('Modelo Word não carregado.');
  const map = state.mapping[tplKey] || {};
  const zip = await JSZip.loadAsync(tpl.bytes);
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
   6. Geração do PDF — reproduz a estrutura real do modelo
   ============================================================ */
function renderDocForPrint(tplKey, record) {
  const scan = state.templates[tplKey].scan;
  const map = state.mapping[tplKey] || {};
  if (!scan) return '';

  const tables = scan.tables.map(t => {
    const rows = t.rows.map(row => {
      const cells = row.cells.filter(c => !c.vmerge).map(c => {
        const bound = map[c.key];
        let text = bound ? resolveBinding(bound, record) : null;
        if (text === null) text = c.field ? '' : c.text;   // campo sem origem fica vazio
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
   7. Interface
   ============================================================ */
function toast(message, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function setStatus(text, kind) {
  const p = $('statusPill');
  p.textContent = text;
  p.className = 'pill' + (kind ? ' ' + kind : '');
}

const VIEW_META = {
  painel: ['Painel', 'Visão geral da configuração e da base oficial'],
  base: ['Base de dados', 'Planilha oficial, aba utilizada e colunas disponíveis'],
  modelos: ['Modelos Word', 'Arquivos .docx usados como base dos documentos'],
  mapeamento: ['Mapeamento de campos', 'Defina de onde vem o conteúdo de cada campo do documento'],
  geracao: ['Gerar documentos', 'Localize os cargos e baixe em Word ou PDF'],
  perfis: ['Perfis', 'Salve, exporte e importe configurações de mapeamento']
};

function showView(name) {
  qsa('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  qsa('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const [t, s] = VIEW_META[name] || ['', ''];
  $('pageTitle').textContent = t;
  $('pageSub').textContent = s;
  if (name === 'mapeamento') renderMapping();
  if (name === 'painel') renderDashboard();
  if (name === 'perfis') renderProfiles();
  window.scrollTo(0, 0);
}

/* ---------------- painel ---------------- */
function renderDashboard() {
  const c = mappingStats('carreira'), i = mappingStats('individual');
  $('stRows').textContent = state.rows.length.toLocaleString('pt-BR');
  $('stRowsNote').textContent = `aba ${state.sheetName || '—'} · ${((state.allRecords || []).length - state.rows.length).toLocaleString('pt-BR')} ignorados por prefixo`;
  $('stCols').textContent = state.columns.length;
  $('stMapped').textContent = c.bound + i.bound;
  $('stPend').textContent = c.pending + i.pending;

  const items = [];
  const push = (ok, label, detail, view) => items.push({ ok, label, detail, view });
  push(state.rows.length > 0, 'Base de dados carregada',
    state.rows.length ? `${state.rows.length.toLocaleString('pt-BR')} cargos disponíveis · ${state.baseLabel}` : 'Nenhum registro disponível', 'base');
  push(!!state.templates.carreira.scan, 'Modelo de carreira',
    state.templates.carreira.scan ? `${state.templates.carreira.scan.tables.length} tabelas · ${state.templates.carreira.scan.fieldCount} campos de mesclagem` : 'Não carregado', 'modelos');
  push(!!state.templates.individual.scan, 'Modelo individual',
    state.templates.individual.scan ? `${state.templates.individual.scan.tables.length} tabelas · ${state.templates.individual.scan.fieldCount} campos de mesclagem` : 'Não carregado', 'modelos');
  push(c.pending === 0, 'Mapeamento do modelo de carreira',
    c.pending ? `${c.pending} campo(s) sem coluna definida` : `${c.bound} campos vinculados`, 'mapeamento');
  push(i.pending === 0, 'Mapeamento do modelo individual',
    i.pending ? `${i.pending} campo(s) sem coluna definida` : `${i.bound} campos vinculados`, 'mapeamento');

  $('healthList').innerHTML = items.map(it => `
    <div class="issue" data-goto="${it.view}">
      <span class="tag ${it.ok ? 'ok' : 'warn'}">${it.ok ? 'OK' : 'Atenção'}</span>
      <span class="il"><b>${esc(it.label)}</b><br><span style="color:var(--muted)">${esc(it.detail)}</span></span>
      <span style="color:var(--muted)">›</span>
    </div>`).join('');

  $('navBase').textContent = state.rows.length ? state.rows.length.toLocaleString('pt-BR') : '—';
  const pend = c.pending + i.pending;
  const nav = $('navMap');
  nav.textContent = pend ? pend : 'OK';
  nav.parentElement.classList.toggle('warn', pend > 0);
}

/* ---------------- base ---------------- */
function renderBaseView() {
  $('baseName').textContent = state.baseLabel;
  $('selSheet').innerHTML = state.sheets.map(s =>
    `<option${s === state.sheetName ? ' selected' : ''}>${esc(s)}</option>`).join('');
  $('inpBlocked').value = state.blocked.join(', ');

  const ignored = (state.allRecords || []).length - state.rows.length;
  $('baseStatus').innerHTML = `<div class="alert ok"><span class="ai">✓</span><div>
    <b>${state.rows.length.toLocaleString('pt-BR')} registros</b> carregados da aba <span class="mono">${esc(state.sheetName)}</span>
    · ${state.columns.length} colunas · ${ignored.toLocaleString('pt-BR')} registros ignorados pelos prefixos configurados.
  </div></div>`;
  renderColumns();
}

function renderColumns() {
  const filter = norm($('colSearch').value);
  const sample = state.rows[0] || {};
  const list = state.columns.filter(c => !filter || norm(c).includes(filter));
  $('colTable').innerHTML = `
    <thead><tr><th style="width:44px">#</th><th>Coluna</th><th>Exemplo de conteúdo</th></tr></thead>
    <tbody>${list.map((c, i) => `<tr>
      <td class="mono" style="color:var(--muted)">${state.columns.indexOf(c) + 1}</td>
      <td class="mono"><b>${esc(c)}</b></td>
      <td style="color:var(--muted)">${esc(str(sample[c]).slice(0, 90)) || '<i>vazio</i>'}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">Nenhuma coluna encontrada.</td></tr>'}</tbody>`;
}

/* ---------------- modelos ---------------- */
function renderTemplatesView() {
  ['carreira', 'individual'].forEach(key => {
    const tpl = state.templates[key];
    const box = $('infoTpl' + (key === 'carreira' ? 'Carreira' : 'Individual'));
    if (!tpl.scan) { box.innerHTML = '<div class="alert warn"><span class="ai">!</span><div>Modelo não carregado.</div></div>'; return; }
    const st = mappingStats(key);
    box.innerHTML = `
      <div class="alert ${st.pending ? 'warn' : 'ok'}"><span class="ai">${st.pending ? '!' : '✓'}</span><div>
        <b>${esc(tpl.label)}</b><br>
        ${tpl.scan.tables.length} tabelas · ${tpl.scan.cells.length} células · ${tpl.scan.fieldCount} campos de mesclagem<br>
        ${st.pending ? `<b>${st.pending} campo(s) sem coluna definida.</b>` : `${st.bound} campos vinculados.`}
      </div></div>`;
  });
}

/* ---------------- mapeamento ---------------- */
function renderMapping() {
  const key = state.activeTpl;
  const tpl = state.templates[key];
  const host = $('docTables');
  if (!tpl.scan) {
    host.innerHTML = '<div class="card"><div class="empty-state"><span class="big">▣</span><h3>Modelo não carregado</h3>Carregue um arquivo .docx na tela Modelos Word.</div></div>';
    return;
  }
  const map = state.mapping[key] || {};
  const st = mappingStats(key);
  $('mapCount').textContent = `${st.bound} vinculados · ${st.pending} pendentes`;
  $('mapDirty').hidden = !state.dirty;

  const record = previewRecord();
  host.innerHTML = tpl.scan.tables.map(t => {
    const rows = t.rows.map(row => {
      const cells = row.cells.map(c => {
        const b = map[c.key];
        const cls = ['cell'];
        if (state.selectedSlot === c.key) cls.push('sel');
        if (b) {
          cls.push('bound');
          if (b.source === 'text') cls.push('fixed');
          if (b.source === 'empty') cls.push('empty');
        } else if (c.field) cls.push('unbound');
        else if (c.static) cls.push('static');

        if (c.static && !b && !state.showStatic) {
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
    const r = state.activeTpl === 'carreira' ? resolveRecord(code) : exactRecord(code);
    if (r) return r;
  }
  // registro representativo: um cargo com trilha completa para o modelo de carreira
  if (state.activeTpl === 'carreira') {
    const f = state.rows.find(r => NIVEIS.every(s => val(r, 'COD_DO_CARGO_' + s)));
    if (f) return resolveRecord(f.COD_DO_CARGO);
  }
  return state.rows[0] || null;
}

function findCell(key) {
  const scan = state.templates[state.activeTpl].scan;
  return scan ? scan.cells.find(c => c.key === key) : null;
}

function renderInspector() {
  const key = state.selectedSlot;
  const cell = key ? findCell(key) : null;
  const body = $('inspBody');
  if (!cell) {
    $('inspTitle').textContent = 'Nenhuma célula selecionada';
    $('inspCrumb').textContent = 'Escolha uma célula na estrutura ao lado.';
    body.innerHTML = '<div class="insp-empty"><span class="big">⇄</span>Selecione uma célula do documento para definir qual coluna da planilha vai preenchê-la.</div>';
    return;
  }
  const map = state.mapping[state.activeTpl] || {};
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
        <label for="inspLevel">Nível da trilha</label>
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
  const sample = previewRecord() || {};
  const draw = () => {
    const f = norm(search.value);
    const cols = state.columns.filter(c => !f || norm(c).includes(f)).slice(0, 300);
    list.innerHTML = cols.map(c => {
      const on = binding && binding.column === c;
      const v = str(sample[binding && binding.level ? c + '_' + binding.level : c]).slice(0, 46);
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
  const map = state.mapping[state.activeTpl] || (state.mapping[state.activeTpl] = {});
  if (!map[state.selectedSlot]) {
    map[state.selectedSlot] = { source: 'column', column: '', level: '', fallbacks: [], format: 'texto', text: '' };
  }
  return map[state.selectedSlot];
}

function updateBinding(mutator) {
  const b = currentBinding();
  mutator(b);
  state.dirty = true;
  renderMapping();
}

function removeBinding() {
  const map = state.mapping[state.activeTpl] || {};
  delete map[state.selectedSlot];
  state.dirty = true;
  renderMapping();
}

function bindInspectorEvents(cell, binding, source) {
  const seg = $('segSource');
  if (seg) seg.onclick = e => {
    const btn = e.target.closest('[data-src]');
    if (!btn) return;
    const src = btn.dataset.src;
    if (src === 'keep') { removeBinding(); return; }
    updateBinding(b => { b.source = src; });
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
  const key = state.activeTpl;
  const scan = state.templates[key].scan;
  const map = state.mapping[key] || {};
  if (!scan) return;
  const problems = [];

  scan.cells.forEach(c => {
    const b = map[c.key];
    if (!b) {
      if (c.field) problems.push({ lvl: 'warn', txt: `Campo «${c.field}» em <b>${esc(c.labels.table)}</b> não tem origem definida — sairá em branco.` });
      return;
    }
    if (b.source === 'column') {
      if (!b.column) { problems.push({ lvl: 'err', txt: `Célula em <b>${esc(c.labels.table)}</b> está marcada como coluna, mas nenhuma coluna foi escolhida.` }); return; }
      const usedKey = b.level ? b.column + '_' + b.level : b.column;
      if (!state.columns.includes(usedKey)) {
        problems.push({ lvl: 'err', txt: `A coluna <span class="mono">${esc(usedKey)}</span> não existe na planilha atual (<b>${esc(c.labels.table)}</b>).` });
      } else {
        const filled = state.rows.filter(r => val(r, usedKey)).length;
        if (filled === 0) problems.push({ lvl: 'warn', txt: `A coluna <span class="mono">${esc(usedKey)}</span> está vazia em todos os registros.` });
      }
      (b.fallbacks || []).forEach(f => {
        if (!state.columns.includes(f)) problems.push({ lvl: 'warn', txt: `Coluna alternativa <span class="mono">${esc(f)}</span> não existe na planilha.` });
      });
    }
  });

  const html = problems.length
    ? problems.map(p => `<div class="alert ${p.lvl}" style="margin-bottom:8px"><span class="ai">${p.lvl === 'err' ? '×' : '!'}</span><div>${p.txt}</div></div>`).join('')
    : '<div class="alert ok"><span class="ai">✓</span><div>Nenhum problema encontrado. Todos os campos do documento têm origem válida.</div></div>';
  openModal(`Validação — ${key === 'carreira' ? 'modelo de carreira' : 'modelo individual'}`, html);
}

/* ---------------- geração ---------------- */
function renderResults(hostId, items, missing, mode) {
  const host = $(hostId);
  host.innerHTML = items.map(r => {
    const carreira = mode === 'auto' && r._family;
    return `<div class="result">
      <span class="code">${esc(clean(r.COD_DO_CARGO))}</span>
      <span class="nm">${esc(firstOf(r, ['NOME_COMPLETO', 'CARGO']))}</span>
      <span class="tag ${carreira ? 'brand' : ''}">${carreira ? 'Modelo de carreira' : 'Modelo individual'}</span>
    </div>`;
  }).join('') + (missing.length
    ? `<div class="alert warn" style="margin-top:10px"><span class="ai">!</span><div>Códigos não encontrados: <span class="mono">${esc(missing.join(', '))}</span></div></div>`
    : '');
}

function parseCodes(text) {
  return [...new Set(text.split(/[\s,;]+/).map(clean).filter(Boolean))];
}

function searchAuto() {
  const codes = parseCodes($('codesAuto').value);
  const found = [], missing = [];
  codes.forEach(c => { const r = resolveRecord(c); r ? found.push(r) : missing.push(c); });
  state.sel.auto = found;
  renderResults('resultsAuto', found, missing, 'auto');
  $('btnWordAuto').disabled = $('btnPdfAuto').disabled = !found.length;
  toast(`${found.length} cargo(s) localizado(s).`, found.length ? 'ok' : 'warn');
}

function searchIndividual() {
  const codes = parseCodes($('codesInd').value);
  const found = [], missing = [];
  codes.forEach(c => {
    const r = exactRecord(c);
    r ? found.push({ ...r, _family: false }) : missing.push(c);
  });
  state.sel.individual = found;
  renderResults('resultsInd', found, missing, 'individual');
  $('btnWordInd').disabled = $('btnPdfInd').disabled = !found.length;
  toast(`${found.length} cargo(s) localizado(s).`, found.length ? 'ok' : 'warn');
}

async function downloadWord(items, forceIndividual, button) {
  if (!items.length) return;
  const original = button.textContent;
  button.disabled = true;
  try {
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      button.textContent = `Gerando ${i + 1} de ${items.length}…`;
      const key = (!forceIndividual && r._family) ? 'carreira' : 'individual';
      download(await buildDocx(key, r), fileNameFor(r) + '.docx');
      await sleep(420);
    }
    toast(`${items.length} arquivo(s) Word gerado(s).`, 'ok');
  } catch (e) {
    toast('Erro ao gerar Word: ' + e.message, 'err');
  } finally {
    button.textContent = original;
    button.disabled = false;
  }
}

function printPdf(items, forceIndividual) {
  if (!items.length) return;
  $('printArea').innerHTML = items.map(r =>
    renderDocForPrint((!forceIndividual && r._family) ? 'carreira' : 'individual', r)).join('');
  toast('Documento preparado. Escolha “Salvar como PDF” na janela de impressão.', 'ok');
  setTimeout(() => window.print(), 150);
}

/* ---------------- perfis ---------------- */
function currentProfile() {
  return {
    versao: 1,
    salvoEm: new Date().toISOString(),
    prefixosIgnorados: state.blocked,
    aba: state.sheetName,
    mapeamento: state.mapping
  };
}

function applyProfile(p) {
  if (!p || !p.mapeamento) throw new Error('Arquivo de perfil inválido.');
  state.mapping = { carreira: p.mapeamento.carreira || {}, individual: p.mapeamento.individual || {} };
  if (Array.isArray(p.prefixosIgnorados)) { state.blocked = p.prefixosIgnorados; refilterRows(); }
  state.dirty = false;
}

function saveCurrent() {
  try { localStorage.setItem(LS_CURRENT, JSON.stringify(currentProfile())); } catch (e) { /* modo privado */ }
}

function loadCurrent() {
  try {
    const raw = localStorage.getItem(LS_CURRENT);
    if (!raw) return false;
    applyProfile(JSON.parse(raw));
    return true;
  } catch (e) { return false; }
}

function listProfiles() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILES) || '{}'); } catch (e) { return {}; }
}

function renderProfiles() {
  const all = listProfiles();
  const names = Object.keys(all);
  $('profileList').innerHTML = names.length ? names.map(n => `
    <div class="issue">
      <span class="il"><b>${esc(n)}</b><br><span style="color:var(--muted)">Salvo em ${esc(new Date(all[n].salvoEm).toLocaleString('pt-BR'))}</span></span>
      <button class="btn sec sm" data-load-profile="${esc(n)}">Carregar</button>
      <button class="btn ghost sm" data-del-profile="${esc(n)}">Excluir</button>
    </div>`).join('')
    : '<div class="empty-state"><span class="big">▥</span><h3>Nenhum perfil salvo</h3>Configure o mapeamento e salve com um nome para reutilizar depois.</div>';
}

/* ============================================================
   8. Inicialização e eventos
   ============================================================ */
async function boot() {
  setStatus('Carregando base…');
  try {
    await loadBase(bytesOf(BASE).buffer, 'Base incorporada');
    await loadTemplate('carreira', bytesOf(TPL_CARREIRA).buffer, TPL_CARREIRA_NOME, false);
    await loadTemplate('individual', bytesOf(TPL_INDIVIDUAL).buffer, TPL_INDIVIDUAL_NOME, false);

    const restored = loadCurrent();
    if (!restored || !Object.keys(state.mapping.carreira || {}).length) {
      autoSuggest('carreira');
      autoSuggest('individual');
      saveCurrent();
    }
    state.ready = true;
    setStatus(`${state.rows.length.toLocaleString('pt-BR')} cargos carregados`, 'ok');
    renderAll();
  } catch (e) {
    setStatus('Falha ao iniciar', 'err');
    toast('Erro na inicialização: ' + e.message, 'err');
    console.error(e);
  }
}

function renderAll() {
  renderDashboard();
  renderBaseView();
  renderTemplatesView();
  if (!$('view-mapeamento').hidden) renderMapping();
}

function wire() {
  $('brandLogo').src = LOGO;

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav) { showView(nav.dataset.view); return; }
    const goto = e.target.closest('[data-goto]');
    if (goto) { showView(goto.dataset.goto); return; }
    const mapTpl = e.target.closest('[data-map-tpl]');
    if (mapTpl) { state.activeTpl = mapTpl.dataset.mapTpl; syncTplSegment(); showView('mapeamento'); return; }
    const cellBtn = e.target.closest('[data-cell]');
    if (cellBtn) { state.selectedSlot = cellBtn.dataset.cell; renderMapping(); return; }
    const loadP = e.target.closest('[data-load-profile]');
    if (loadP) {
      const all = listProfiles();
      try { applyProfile(all[loadP.dataset.loadProfile]); saveCurrent(); renderAll(); toast('Perfil carregado.', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
      return;
    }
    const delP = e.target.closest('[data-del-profile]');
    if (delP) {
      const all = listProfiles();
      delete all[delP.dataset.delProfile];
      localStorage.setItem(LS_PROFILES, JSON.stringify(all));
      renderProfiles();
      toast('Perfil excluído.');
      return;
    }
    const resetTpl = e.target.closest('[data-reset-tpl]');
    if (resetTpl) { resetTemplate(resetTpl.dataset.resetTpl); return; }
  });

  // abas de geração
  $('genTabs').onclick = e => {
    const tab = e.target.closest('[data-pane]');
    if (!tab) return;
    qsa('#genTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    qsa('#view-geracao .pane').forEach(p => { p.hidden = p.id !== 'pane-' + tab.dataset.pane; });
  };

  // base
  $('fileExcel').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    setStatus('Lendo planilha…');
    try {
      await loadBase(await f.arrayBuffer(), f.name);
      setStatus(`${state.rows.length.toLocaleString('pt-BR')} cargos carregados`, 'ok');
      renderAll();
      toast('Base atualizada nesta sessão.', 'ok');
    } catch (err) { setStatus('Falha ao ler planilha', 'err'); toast(err.message, 'err'); }
  };
  $('btnResetBase').onclick = async () => {
    await loadBase(bytesOf(BASE).buffer, 'Base incorporada');
    renderAll();
    toast('Base incorporada restaurada.', 'ok');
  };
  $('selSheet').onchange = async e => {
    await applySheet(e.target.value);
    renderAll();
    toast(`Aba “${state.sheetName}” carregada.`, 'ok');
  };
  $('inpBlocked').onchange = e => {
    state.blocked = e.target.value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    refilterRows();
    saveCurrent();
    renderAll();
  };
  $('colSearch').oninput = renderColumns;

  // modelos
  const tplInput = (inputId, key) => {
    $(inputId).onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await loadTemplate(key, await f.arrayBuffer(), f.name, true);
        renderAll();
        const st = mappingStats(key);
        toast(st.pending
          ? `Modelo carregado. ${st.pending} campo(s) precisam de mapeamento.`
          : 'Modelo carregado e mapeamento preservado.', st.pending ? 'warn' : 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  };
  tplInput('fileTplCarreira', 'carreira');
  tplInput('fileTplIndividual', 'individual');

  // mapeamento
  $('segTpl').onclick = e => {
    const btn = e.target.closest('[data-tpl]');
    if (!btn) return;
    state.activeTpl = btn.dataset.tpl;
    state.selectedSlot = null;
    syncTplSegment();
    renderMapping();
  };
  $('btnSuggest').onclick = () => {
    const n = autoSuggest(state.activeTpl);
    state.dirty = true;
    renderMapping();
    toast(`${n} campo(s) mapeado(s) automaticamente.`, 'ok');
  };
  $('btnClearMap').onclick = () => {
    state.mapping[state.activeTpl] = {};
    state.selectedSlot = null;
    state.dirty = true;
    renderMapping();
    toast('Mapeamento do modelo limpo.');
  };
  $('btnValidate').onclick = validateMapping;
  $('btnSaveMap').onclick = () => {
    saveCurrent();
    state.dirty = false;
    renderMapping();
    renderDashboard();
    toast('Mapeamento salvo neste navegador.', 'ok');
  };
  $('previewCode').oninput = () => { if (!$('view-mapeamento').hidden) renderMapping(); };
  $('btnToggleStatic').onclick = () => {
    state.showStatic = !state.showStatic;
    $('btnToggleStatic').textContent = state.showStatic ? 'Ocultar rótulos fixos' : 'Mostrar rótulos fixos';
    renderMapping();
  };

  // geração
  $('btnSearchAuto').onclick = searchAuto;
  $('btnSearchInd').onclick = searchIndividual;
  $('btnWordAuto').onclick = () => downloadWord(state.sel.auto, false, $('btnWordAuto'));
  $('btnWordInd').onclick = () => downloadWord(state.sel.individual, true, $('btnWordInd'));
  $('btnPdfAuto').onclick = () => printPdf(state.sel.auto, false);
  $('btnPdfInd').onclick = () => printPdf(state.sel.individual, true);

  // perfis
  $('btnProfileSave').onclick = () => {
    const name = $('profileName').value.trim();
    if (!name) { toast('Informe um nome para o perfil.', 'warn'); return; }
    const all = listProfiles();
    all[name] = currentProfile();
    localStorage.setItem(LS_PROFILES, JSON.stringify(all));
    saveCurrent();
    state.dirty = false;
    renderProfiles();
    toast(`Perfil “${name}” salvo.`, 'ok');
  };
  $('btnProfileExport').onclick = () => {
    const blob = new Blob([JSON.stringify(currentProfile(), null, 2)], { type: 'application/json' });
    download(blob, 'mapeamento-mapas-carreira.json');
  };
  $('fileProfile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      applyProfile(JSON.parse(await f.text()));
      saveCurrent();
      renderAll();
      toast('Perfil importado.', 'ok');
    } catch (err) { toast('Arquivo inválido: ' + err.message, 'err'); }
  };
  $('btnProfileReset').onclick = () => {
    state.mapping = { carreira: {}, individual: {} };
    autoSuggest('carreira');
    autoSuggest('individual');
    saveCurrent();
    renderAll();
    toast('Mapeamento padrão restaurado.', 'ok');
  };

  // modal
  $('modalClose').onclick = () => { $('modalBg').hidden = true; };
  $('modalBg').onclick = e => { if (e.target === $('modalBg')) $('modalBg').hidden = true; };
}

async function resetTemplate(key) {
  const src = key === 'carreira' ? TPL_CARREIRA : TPL_INDIVIDUAL;
  const nome = key === 'carreira' ? TPL_CARREIRA_NOME : TPL_INDIVIDUAL_NOME;
  await loadTemplate(key, bytesOf(src).buffer, nome, false);
  renderAll();
  toast('Modelo padrão restaurado.', 'ok');
}

function syncTplSegment() {
  qsa('#segTpl button').forEach(b => b.classList.toggle('on', b.dataset.tpl === state.activeTpl));
}

wire();
boot();

})();
