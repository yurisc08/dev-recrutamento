// Grade estilo Excel para a base de cargos (aba "Base de cargos" — perfil ADMIN).
// Monta toda a interface dentro de #basesView: barra de ferramentas, planilha
// virtualizada (suporta dezenas de milhares de linhas), edicao de celulas,
// inclusao/exclusao de linhas, copiar/colar do Excel, desfazer, importacao e
// exportacao do arquivo.
import {
  COLUMNS, COLUMN_KEYS, COLUMN_BY_KEY, SKILL_LABELS,
  txt, norm, linkedUpdates, buildXlsx, readXlsx, toCsv, parseCsv, parseDelimited, download,
} from "./base-cargos.js";

const ROW_H = 34;
const GUTTER_W = 58;
const WINDOW_PAD = 12;
const LS_COLUMNS = "base_cargos_hidden_cols";
const LS_LOCAL_ROWS = "base_cargos_local_rows";

const esc = (s = "") =>
  txt(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);

let seq = 0;
const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

function blankRow() {
  const row = { __key: newKey(), __id: null, __new: true, __dirty: true };
  COLUMN_KEYS.forEach((k) => (row[k] = ""));
  Object.entries(SKILL_LABELS).forEach(([k, label]) => (row[`${k}_DESC`] = label));
  return row;
}

export function mountBaseCargos({ sb, toast, getProfile }) {
  const view = document.getElementById("basesView");
  if (!view) return { open: () => {}, hasPendingChanges: () => false };

  const G = {
    rows: [],
    order: [],           // indices de G.rows apos filtro/ordenacao
    deleted: [],         // ids ja gravados aguardando exclusao
    hidden: new Set(readHidden()),
    sel: null,           // { r1, c1, r2, c2 } em coordenadas da view
    editing: null,
    undo: [],
    mode: "remote",      // remote | local
    loaded: false,
    loading: false,
    sort: null,          // { key, dir }
    dupKeys: new Set(),
    suggestions: new Map(),
  };

  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Administração</p>
        <h1>Base de cargos</h1>
        <p class="muted">Planilha da base geral usada pelo fluxo. Edite as células, inclua ou exclua linhas e salve — o conteúdo alimenta a pesquisa de cargo vigente e os campos do descritivo.</p>
      </div>
      <div class="base-head-actions">
        <button id="baseReload" class="btn ghost" type="button">Recarregar</button>
        <button id="baseSave" class="btn primary" type="button" disabled>Salvar alterações</button>
      </div>
    </div>
    <div id="baseBanner" class="notice warning hidden"></div>
    <div class="base-toolbar">
      <input id="baseSearch" type="search" placeholder="Pesquisar em toda a base (código, cargo, texto...)">
      <select id="baseCompany"><option value="">Todas as empresas</option></select>
      <label class="base-check"><input id="baseOnlyChanged" type="checkbox"> Somente alterados</label>
      <div class="base-toolbar-actions">
        <button id="baseAdd" class="btn secondary" type="button">+ Linha</button>
        <button id="baseDuplicate" class="btn ghost" type="button">Duplicar</button>
        <button id="baseDelete" class="btn danger-soft" type="button">Excluir linha</button>
        <button id="baseDiscard" class="btn ghost" type="button">Descartar</button>
        <div class="base-menu">
          <button id="baseColsBtn" class="btn ghost" type="button">Colunas ▾</button>
          <div id="baseColsPanel" class="base-panel hidden"></div>
        </div>
        <div class="base-menu">
          <button id="baseFileBtn" class="btn ghost" type="button">Arquivo ▾</button>
          <div id="baseFilePanel" class="base-panel hidden">
            <button type="button" data-file="xlsx">Baixar planilha (.xlsx)</button>
            <button type="button" data-file="csv">Baixar CSV (.csv)</button>
            <button type="button" data-file="import">Importar arquivo...</button>
            <small>O download considera o filtro aplicado na tela.</small>
            <input id="baseFileInput" type="file" accept=".xlsx,.csv,.txt" class="hidden">
          </div>
        </div>
      </div>
    </div>
    <div id="baseStatus" class="base-status"></div>
    <div id="baseScroll" class="sheet-scroll" tabindex="0">
      <div id="baseSheetHost"></div>
    </div>
    <p class="fine base-hint">Atalhos: setas navegam · <b>Enter</b> ou duplo clique edita · <b>Tab</b> avança · <b>Ctrl+C / Ctrl+V</b> copia e cola do Excel · <b>Delete</b> limpa · <b>Ctrl+Z</b> desfaz · <b>Shift+setas</b> seleciona intervalo.</p>
    <section class="card base-legend"><h2>Como os campos se interligam</h2><div id="baseLegend" class="base-legend-grid"></div></section>
  `;

  const el = (id) => view.querySelector(`#${id}`);
  const scroll = el("baseScroll");
  const host = el("baseSheetHost");
  const statusBox = el("baseStatus");
  const banner = el("baseBanner");

  // -------------------------------------------------------------------------
  // Estado derivado
  // -------------------------------------------------------------------------
  const visibleColumns = () => COLUMNS.filter((c) => !G.hidden.has(c.key));
  const canEdit = () => getProfile()?.role === "ADMIN";
  const dirtyCount = () => G.rows.filter((r) => r.__dirty || r.__new).length;
  const pendingCount = () => dirtyCount() + G.deleted.length;

  function readHidden() { try { return JSON.parse(localStorage.getItem(LS_COLUMNS) || "[]"); } catch { return []; } }
  function persistHidden() {
    try { localStorage.setItem(LS_COLUMNS, JSON.stringify([...G.hidden])); } catch { /* opcional */ }
  }

  function rowData(row) {
    const data = {};
    COLUMN_KEYS.forEach((k) => { const v = txt(row[k]).trim(); if (v) data[k] = v; });
    return data;
  }

  function refreshDerived() {
    // Duplicidades de codigo do cargo dentro da mesma empresa.
    const seen = new Map();
    G.dupKeys = new Set();
    G.rows.forEach((r) => {
      const code = txt(r.COD_DO_CARGO).trim();
      if (!code) return;
      const key = `${norm(r.EMPRESA)}|${norm(code)}`;
      if (seen.has(key)) { G.dupKeys.add(seen.get(key)); G.dupKeys.add(r.__key); }
      else seen.set(key, r.__key);
    });
    // Sugestoes por coluna (datalist das celulas curtas).
    G.suggestions = new Map();
    COLUMNS.filter((c) => c.suggest).forEach((c) => {
      const set = new Set();
      for (const r of G.rows) {
        const v = txt(r[c.key]).trim();
        if (v && v.length <= 60) set.add(v);
        if (set.size > 400) break;
      }
      G.suggestions.set(c.key, [...set].sort((a, b) => a.localeCompare(b, "pt-BR")));
    });
    // Filtro de empresas.
    const companies = [...new Set(G.rows.map((r) => txt(r.EMPRESA).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const select = el("baseCompany");
    const current = select.value;
    select.innerHTML = `<option value="">Todas as empresas</option>` + companies.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    select.value = companies.includes(current) ? current : "";
  }

  function refreshOrder() {
    const q = norm(el("baseSearch").value);
    const company = el("baseCompany").value;
    const onlyChanged = el("baseOnlyChanged").checked;
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    G.order = [];
    G.rows.forEach((row, i) => {
      if (company && txt(row.EMPRESA).trim() !== company) return;
      if (onlyChanged && !(row.__dirty || row.__new)) return;
      if (terms.length) {
        const haystack = norm(COLUMN_KEYS.map((k) => row[k]).join(" "));
        if (!terms.every((t) => haystack.includes(t))) return;
      }
      G.order.push(i);
    });
    if (G.sort) {
      const { key, dir } = G.sort;
      const factor = dir === "desc" ? -1 : 1;
      G.order.sort((a, b) => {
        const va = txt(G.rows[a][key]).trim(), vb = txt(G.rows[b][key]).trim();
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
        const na = Number(va.replace(",", ".")), nb = Number(vb.replace(",", "."));
        if (Number.isFinite(na) && Number.isFinite(nb) && va !== "" && vb !== "") return (na - nb) * factor;
        return va.localeCompare(vb, "pt-BR") * factor;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Renderizacao da planilha (janela virtual)
  // -------------------------------------------------------------------------
  let headerHtml = "", pinOffsets = {}, totalWidth = 0;

  function buildHeader() {
    const cols = visibleColumns();
    pinOffsets = {};
    let offset = GUTTER_W;
    cols.forEach((c) => { if (c.pin) { pinOffsets[c.key] = offset; offset += c.width; } });
    totalWidth = GUTTER_W + cols.reduce((sum, c) => sum + c.width, 0);
    const colgroup = `<colgroup><col style="width:${GUTTER_W}px">${cols.map((c) => `<col style="width:${c.width}px">`).join("")}</colgroup>`;
    const ths = cols.map((c) => {
      const pin = c.pin ? ` sheet-pin" style="left:${pinOffsets[c.key]}px` : "";
      const arrow = G.sort?.key === c.key ? (G.sort.dir === "asc" ? " ▲" : " ▼") : "";
      const flow = c.flow ? `<small class="sheet-flow" title="Alimenta: ${esc(c.flow)}">↳ ${esc(c.flow)}</small>` : "";
      return `<th class="sheet-th${pin}" data-k="${c.key}" title="${esc(c.key)}"><span class="sheet-th-label">${esc(c.label)}${arrow}</span>${flow}</th>`;
    }).join("");
    headerHtml = `${colgroup}<thead><tr><th class="sheet-th sheet-gutter" style="left:0">#</th>${ths}</tr></thead>`;
  }

  function cellHtml(row, col, r, c) {
    const value = txt(row[col.key]);
    const classes = ["sheet-td"];
    if (col.pin) classes.push("sheet-pin");
    if (col.long) classes.push("sheet-long");
    if (col.auto) classes.push("sheet-auto");
    if (row.__changed?.has(col.key)) classes.push("sheet-changed");
    if (row.__linked?.has(col.key)) classes.push("sheet-linked");
    if (col.key === "COD_DO_CARGO" && G.dupKeys.has(row.__key)) classes.push("sheet-dup");
    const style = col.pin ? ` style="left:${pinOffsets[col.key]}px"` : "";
    const title = value.length > 40 ? ` title="${esc(value.slice(0, 400))}"` : "";
    return `<td class="${classes.join(" ")}"${style} data-r="${r}" data-c="${c}"${title}>${esc(value)}</td>`;
  }

  function renderBody() {
    const cols = visibleColumns();
    const total = G.order.length;
    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - WINDOW_PAD);
    const visibleCount = Math.ceil(scroll.clientHeight / ROW_H) + WINDOW_PAD * 2;
    const last = Math.min(total, first + visibleCount);
    const span = cols.length + 1;
    const parts = [];
    if (first > 0) parts.push(`<tr class="sheet-spacer" style="height:${first * ROW_H}px"><td colspan="${span}"></td></tr>`);
    for (let r = first; r < last; r++) {
      const row = G.rows[G.order[r]];
      const state = row.__new ? " sheet-row-new" : row.__dirty ? " sheet-row-dirty" : "";
      parts.push(
        `<tr class="sheet-row${state}" data-r="${r}"><th class="sheet-td sheet-gutter" style="left:0" data-r="${r}" data-c="-1">${r + 1}${row.__new ? '<i class="sheet-flag" title="Linha nova">•</i>' : row.__dirty ? '<i class="sheet-flag" title="Linha alterada">•</i>' : ""}</th>` +
        cols.map((col, c) => cellHtml(row, col, r, c)).join("") + `</tr>`,
      );
    }
    if (last < total) parts.push(`<tr class="sheet-spacer" style="height:${(total - last) * ROW_H}px"><td colspan="${span}"></td></tr>`);
    const tbody = host.querySelector("tbody");
    if (tbody) tbody.innerHTML = parts.join("");
    paintSelection();
  }

  function renderGrid() {
    buildHeader();
    host.innerHTML = `<table class="sheet" style="width:${totalWidth}px">${headerHtml}<tbody></tbody></table>`;
    renderBody();
    renderStatus();
  }

  function renderStatus() {
    const pending = dirtyCount();
    const total = G.rows.length;
    const shown = G.order.length;
    const modeTag = G.mode === "local"
      ? `<span class="base-tag warn">Modo local</span>`
      : `<span class="base-tag ok">Conectado à base</span>`;
    statusBox.innerHTML = `${modeTag}
      <span><b>${total.toLocaleString("pt-BR")}</b> cargos na base</span>
      <span><b>${shown.toLocaleString("pt-BR")}</b> exibidos</span>
      <span class="${pending ? "base-pending" : ""}"><b>${pending.toLocaleString("pt-BR")}</b> alterações não salvas</span>
      ${G.deleted.length ? `<span class="base-pending"><b>${G.deleted.length.toLocaleString("pt-BR")}</b> exclusões pendentes</span>` : ""}`;
    el("baseSave").disabled = !canEdit() || !pendingCount();
    el("baseDiscard").disabled = !pendingCount();
  }

  function renderLegend() {
    const groups = {};
    COLUMNS.forEach((c) => {
      if (!c.flow) return;
      (groups[c.group] ||= []).push(c);
    });
    el("baseLegend").innerHTML = Object.entries(groups).map(([group, cols]) => `
      <div class="base-legend-card">
        <h3>${esc(group)}</h3>
        <ul>${cols.map((c) => `<li><b>${esc(c.label)}</b><span>${esc(c.flow)}</span></li>`).join("")}</ul>
      </div>`).join("") + `
      <div class="base-legend-card">
        <h3>Preenchimento automático</h3>
        <ul>
          <li><b>Empresa</b><span>completa código da empresa e emp. cód. a partir de outro registro</span></li>
          <li><b>Cargo</b><span>replica para nome completo e nome resumido quando vazios</span></li>
          <li><b>Código do cargo</b><span>herda CBO, nível, trilha e natureza de cargo já cadastrado</span></li>
          <li><b>Cód. família</b><span>gera a chave de agrupamento (H|família)</span></li>
          <li><b>Requisitos</b><span>preenchem o rótulo oficial correspondente (escolaridade, idioma, competências)</span></li>
        </ul>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Selecao
  // -------------------------------------------------------------------------
  function normalizedSel() {
    if (!G.sel) return null;
    const { r1, c1, r2, c2 } = G.sel;
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) };
  }

  function paintSelection() {
    host.querySelectorAll(".sheet-td.sel, .sheet-td.sel-active, .sheet-row.sel-row").forEach((n) => n.classList.remove("sel", "sel-active", "sel-row"));
    const s = normalizedSel();
    if (!s) return;
    host.querySelectorAll("tr.sheet-row").forEach((tr) => {
      const r = Number(tr.dataset.r);
      if (r < s.r1 || r > s.r2) return;
      tr.classList.add("sel-row");
      tr.querySelectorAll("td.sheet-td").forEach((td) => {
        const c = Number(td.dataset.c);
        if (c >= s.c1 && c <= s.c2) td.classList.add("sel");
        if (r === G.sel.r1 && c === G.sel.c1) td.classList.add("sel-active");
      });
    });
  }

  function setSel(r, c, extend = false) {
    const cols = visibleColumns();
    r = Math.max(0, Math.min(G.order.length - 1, r));
    c = Math.max(0, Math.min(cols.length - 1, c));
    if (extend && G.sel) G.sel = { ...G.sel, r2: r, c2: c };
    else G.sel = { r1: r, c1: c, r2: r, c2: c };
    ensureVisible(r, c);
    paintSelection();
  }

  function ensureVisible(r, c) {
    const top = r * ROW_H, bottom = top + ROW_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (bottom > scroll.scrollTop + scroll.clientHeight - 8) scroll.scrollTop = bottom - scroll.clientHeight + 8;
    const cols = visibleColumns();
    let left = GUTTER_W;
    for (let i = 0; i < c; i++) left += cols[i].width;
    const width = cols[c]?.width || 120;
    const pinned = cols.filter((x) => x.pin).reduce((sum, x) => sum + x.width, GUTTER_W);
    if (!cols[c]?.pin) {
      if (left - pinned < scroll.scrollLeft) scroll.scrollLeft = Math.max(0, left - pinned);
      else if (left + width > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = left + width - scroll.clientWidth + 8;
    }
  }

  // -------------------------------------------------------------------------
  // Alteracao de valores (com desfazer e interligacao)
  // -------------------------------------------------------------------------
  function applyChanges(changes, { record = true, linked = true } = {}) {
    if (!changes.length) return;
    const undoEntry = { type: "cells", changes: [] };
    const touched = new Set();
    const applyOne = (row, key, value, isLink) => {
      const before = txt(row[key]);
      const after = txt(value);
      if (before === after) return;
      undoEntry.changes.push({ key: row.__key, field: key, before });
      row[key] = after;
      row.__dirty = true;
      (row.__changed ||= new Set()).add(key);
      if (isLink) (row.__linked ||= new Set()).add(key);
      touched.add(row);
    };
    changes.forEach(({ row, key, value }) => applyOne(row, key, value, false));
    if (linked) {
      changes.forEach(({ row, key }) => {
        const extra = linkedUpdates(row, key, G.rows);
        Object.entries(extra).forEach(([k, v]) => applyOne(row, k, v, true));
      });
    }
    if (record && undoEntry.changes.length) pushUndo(undoEntry);
    if (touched.size) {
      refreshDerived();
      refreshOrder();
      renderBody();
      renderStatus();
    }
  }

  function pushUndo(entry) {
    G.undo.push(entry);
    if (G.undo.length > 120) G.undo.shift();
  }

  function undo() {
    const entry = G.undo.pop();
    if (!entry) return toast("Nada para desfazer.");
    if (entry.type === "cells") {
      const byKey = new Map(G.rows.map((r) => [r.__key, r]));
      entry.changes.forEach(({ key, field, before }) => {
        const row = byKey.get(key);
        if (!row) return;
        row[field] = before;
        row.__dirty = true;
        (row.__changed ||= new Set()).add(field);
      });
    } else if (entry.type === "insert") {
      G.rows = G.rows.filter((r) => !entry.keys.includes(r.__key));
    } else if (entry.type === "delete") {
      entry.rows.forEach(({ index, row }) => G.rows.splice(Math.min(index, G.rows.length), 0, row));
      entry.restoredIds.forEach((id) => { G.deleted = G.deleted.filter((x) => x !== id); });
    }
    refreshDerived();
    refreshOrder();
    renderBody();
    renderStatus();
    toast("Alteração desfeita.");
  }

  // -------------------------------------------------------------------------
  // Editor de celula
  // -------------------------------------------------------------------------
  function startEdit(initial = null) {
    if (!canEdit() || !G.sel) return;
    const cols = visibleColumns();
    const col = cols[G.sel.c1];
    const row = G.rows[G.order[G.sel.r1]];
    if (!col || !row) return;
    const td = host.querySelector(`td.sheet-td[data-r="${G.sel.r1}"][data-c="${G.sel.c1}"]`);
    if (!td) return;
    closeEditor(false);
    const rect = td.getBoundingClientRect(), base = scroll.getBoundingClientRect();
    const wrap = document.createElement("div");
    wrap.className = "sheet-editor";
    wrap.style.left = `${rect.left - base.left + scroll.scrollLeft}px`;
    wrap.style.top = `${rect.top - base.top + scroll.scrollTop}px`;
    wrap.style.width = `${Math.max(rect.width, col.long ? 420 : rect.width)}px`;
    const suggestions = G.suggestions.get(col.key) || [];
    const listId = `sheetList_${col.key}`;
    wrap.innerHTML = col.long
      ? `<textarea spellcheck="false"></textarea>`
      : `<input spellcheck="false" ${suggestions.length ? `list="${listId}"` : ""}>` +
        (suggestions.length ? `<datalist id="${listId}">${suggestions.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>` : "");
    scroll.appendChild(wrap);
    const input = wrap.querySelector("textarea,input");
    input.value = initial == null ? txt(row[col.key]) : initial;
    if (col.long) input.style.height = `${Math.min(260, Math.max(ROW_H, input.scrollHeight || 0) + 8)}px`;
    G.editing = { row, col, input, wrap };
    input.focus();
    if (initial == null) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener("keydown", (e) => {
      // O editor fica dentro da area rolavel: sem isto a mesma tecla seria
      // tratada de novo pela grade (Enter abriria a celula seguinte).
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); closeEditor(false); scroll.focus(); }
      else if (e.key === "Enter" && (!col.long || !e.shiftKey)) {
        e.preventDefault();
        closeEditor(true);
        scroll.focus();
        setSel(G.sel.r1 + 1, G.sel.c1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        closeEditor(true);
        scroll.focus();
        setSel(G.sel.r1, G.sel.c1 + (e.shiftKey ? -1 : 1));
      }
    });
    input.addEventListener("input", () => {
      if (col.long) input.style.height = `${Math.min(260, input.scrollHeight + 4)}px`;
    });
    input.addEventListener("blur", () => closeEditor(true));
  }

  function closeEditor(commit) {
    if (!G.editing) return;
    const { row, col, input, wrap } = G.editing;
    G.editing = null;
    const value = input.value;
    wrap.remove();
    if (commit) applyChanges([{ row, key: col.key, value }]);
  }

  // -------------------------------------------------------------------------
  // Linhas
  // -------------------------------------------------------------------------
  function addRow() {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    const row = blankRow();
    const anchor = G.sel ? G.order[G.sel.r1] : -1;
    const at = anchor >= 0 ? anchor + 1 : 0;
    G.rows.splice(at, 0, row);
    pushUndo({ type: "insert", keys: [row.__key] });
    refreshDerived();
    refreshOrder();
    renderBody();
    renderStatus();
    const pos = G.order.indexOf(at);
    if (pos >= 0) setSel(pos, Math.max(0, visibleColumns().findIndex((c) => c.key === "COD_DO_CARGO")));
    toast("Linha adicionada. Preencha e clique em Salvar alterações.");
  }

  function duplicateRow() {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    const s = normalizedSel();
    if (!s) return toast("Selecione uma linha para duplicar.");
    const sources = [];
    for (let r = s.r1; r <= s.r2; r++) sources.push(G.rows[G.order[r]]);
    const clones = sources.map((src) => {
      const clone = { ...src, __key: newKey(), __id: null, __new: true, __dirty: true, __changed: new Set(), __linked: undefined };
      return clone;
    });
    const at = G.order[s.r2] + 1;
    G.rows.splice(at, 0, ...clones);
    pushUndo({ type: "insert", keys: clones.map((c) => c.__key) });
    refreshDerived();
    refreshOrder();
    renderBody();
    renderStatus();
    toast(`${clones.length} linha(s) duplicada(s).`);
  }

  function deleteRows() {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    const s = normalizedSel();
    if (!s) return toast("Selecione as linhas que deseja excluir.");
    const targets = [];
    for (let r = s.r1; r <= s.r2; r++) targets.push(G.rows[G.order[r]]);
    const label = targets.length === 1
      ? `Excluir o cargo “${txt(targets[0].COD_DO_CARGO) || "sem código"} — ${txt(targets[0].CARGO) || "sem nome"}”?`
      : `Excluir ${targets.length} linhas da base?`;
    if (!confirm(`${label}\n\nA exclusão só é aplicada na base quando você clicar em Salvar alterações.`)) return;
    const removed = [], restoredIds = [];
    targets.forEach((row) => {
      const index = G.rows.indexOf(row);
      if (index < 0) return;
      removed.push({ index, row });
      G.rows.splice(index, 1);
      if (row.__id) { G.deleted.push(row.__id); restoredIds.push(row.__id); }
    });
    pushUndo({ type: "delete", rows: removed.reverse(), restoredIds });
    G.sel = null;
    refreshDerived();
    refreshOrder();
    renderBody();
    renderStatus();
  }

  function clearSelection() {
    if (!canEdit()) return;
    const s = normalizedSel();
    if (!s) return;
    const cols = visibleColumns();
    const changes = [];
    for (let r = s.r1; r <= s.r2; r++) {
      const row = G.rows[G.order[r]];
      for (let c = s.c1; c <= s.c2; c++) changes.push({ row, key: cols[c].key, value: "" });
    }
    applyChanges(changes, { linked: false });
  }

  // -------------------------------------------------------------------------
  // Copiar / colar
  // -------------------------------------------------------------------------
  function selectionTsv() {
    const s = normalizedSel();
    if (!s) return "";
    const cols = visibleColumns();
    const lines = [];
    for (let r = s.r1; r <= s.r2; r++) {
      const row = G.rows[G.order[r]];
      const line = [];
      for (let c = s.c1; c <= s.c2; c++) line.push(txt(row[cols[c].key]).replace(/\t/g, " ").replace(/\r?\n/g, " "));
      lines.push(line.join("\t"));
    }
    return lines.join("\n");
  }

  function pasteMatrix(matrix) {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    if (!G.sel || !matrix.length) return;
    const cols = visibleColumns();
    const startR = normalizedSel().r1, startC = normalizedSel().c1;
    const changes = [];
    const created = [];
    matrix.forEach((line, i) => {
      let index = G.order[startR + i];
      if (index == null) {
        const row = blankRow();
        G.rows.push(row);
        created.push(row.__key);
        index = G.rows.length - 1;
        G.order.push(index);
      }
      const row = G.rows[index];
      line.forEach((value, j) => {
        const col = cols[startC + j];
        if (col) changes.push({ row, key: col.key, value });
      });
    });
    if (created.length) pushUndo({ type: "insert", keys: created });
    applyChanges(changes);
    toast(`${matrix.length} linha(s) coladas${created.length ? ` (${created.length} nova(s))` : ""}.`);
  }

  // -------------------------------------------------------------------------
  // Persistencia
  // -------------------------------------------------------------------------
  function toRow(record) {
    const data = record.data && typeof record.data === "object" ? record.data : record;
    const row = { __key: newKey(), __id: record.id ?? data.id ?? null, __new: false, __dirty: false };
    COLUMN_KEYS.forEach((k) => (row[k] = txt(data[k] ?? data[k.toLowerCase()] ?? "")));
    return row;
  }

  async function loadRows({ silent = false } = {}) {
    if (G.loading) return;
    G.loading = true;
    statusBox.innerHTML = `<span class="base-tag">Carregando base...</span>`;
    try {
      const { data, error } = await sb.rpc("admin_list_job_catalog", { p_query: "", p_limit: 100000, p_offset: 0 });
      if (error) throw error;
      G.rows = (data || []).map(toRow);
      G.mode = "remote";
      G.deleted = [];
      G.undo = [];
      banner.classList.add("hidden");
    } catch (error) {
      console.error("Base de cargos: RPC indisponível", error);
      G.mode = "local";
      G.rows = readLocalRows();
      banner.classList.remove("hidden");
      banner.innerHTML = `<b>Base não conectada.</b> As funções <code>admin_list_job_catalog</code> / <code>admin_save_job_catalog_rows</code> ainda não existem no Supabase.
        Execute <code>sql/base_cargos_admin.sql</code> e clique em Recarregar. Enquanto isso a planilha funciona em <b>modo local</b>: importe o arquivo, edite e use <b>Arquivo → Baixar planilha</b> para salvar. Detalhe técnico: ${esc(error.message || error)}`;
      if (!silent && !G.rows.length) toast("Base não conectada — importe um arquivo para trabalhar em modo local.");
    } finally {
      G.loading = false;
      G.loaded = true;
      refreshDerived();
      refreshOrder();
      renderGrid();
    }
  }

  function readLocalRows() {
    try {
      const raw = localStorage.getItem(LS_LOCAL_ROWS);
      if (!raw) return [];
      return JSON.parse(raw).map((data) => toRow({ id: null, data }));
    } catch { return []; }
  }

  function writeLocalRows() {
    try {
      localStorage.setItem(LS_LOCAL_ROWS, JSON.stringify(G.rows.map(rowData)));
      return true;
    } catch {
      return false;
    }
  }

  async function save() {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    const pending = G.rows.filter((r) => r.__dirty || r.__new);
    if (!pending.length && !G.deleted.length) return toast("Nenhuma alteração pendente.");

    if (G.mode === "local") {
      const ok = writeLocalRows();
      pending.forEach((r) => { r.__new = false; r.__dirty = false; r.__changed = new Set(); });
      G.deleted = [];
      refreshOrder();
      renderBody();
      renderStatus();
      return toast(ok
        ? "Alterações guardadas neste navegador (modo local). Baixe a planilha para salvar o arquivo."
        : "Base grande demais para o armazenamento do navegador. Use Arquivo → Baixar planilha para salvar.");
    }

    const btn = el("baseSave");
    btn.disabled = true;
    const originalLabel = btn.textContent;
    try {
      if (G.deleted.length) {
        const { error } = await sb.rpc("admin_delete_job_catalog_rows", { p_ids: G.deleted });
        if (error) throw error;
        G.deleted = [];
      }
      const batches = [];
      for (let i = 0; i < pending.length; i += 200) batches.push(pending.slice(i, i + 200));
      let done = 0;
      for (const batch of batches) {
        btn.textContent = `Salvando ${done}/${pending.length}...`;
        const payload = batch.map((row) => ({ client_key: row.__key, id: row.__id, data: rowData(row) }));
        const { data, error } = await sb.rpc("admin_save_job_catalog_rows", { p_rows: payload });
        if (error) throw error;
        const byKey = new Map((data || []).map((x) => [x.client_key, x.id]));
        batch.forEach((row) => {
          const id = byKey.get(row.__key);
          if (id) row.__id = id;
          row.__new = false;
          row.__dirty = false;
          row.__changed = new Set();
          row.__linked = undefined;
        });
        done += batch.length;
      }
      G.undo = [];
      toast(`Base atualizada: ${pending.length} linha(s) gravada(s).`);
    } catch (error) {
      console.error("Falha ao salvar a base de cargos", error);
      toast("Não foi possível salvar: " + (error.details || error.message || error));
    } finally {
      btn.textContent = originalLabel;
      refreshDerived();
      refreshOrder();
      renderBody();
      renderStatus();
    }
  }

  function discard() {
    if (!pendingCount()) return;
    if (!confirm("Descartar todas as alterações não salvas e recarregar a base?")) return;
    loadRows();
  }

  // -------------------------------------------------------------------------
  // Arquivo
  // -------------------------------------------------------------------------
  function exportRows() {
    const rows = (G.order.length && G.order.length !== G.rows.length ? G.order.map((i) => G.rows[i]) : G.rows).map(rowData);
    return rows;
  }

  async function exportXlsx() {
    toast("Gerando planilha...");
    const blob = await buildXlsx(COLUMN_KEYS, exportRows(), "Base");
    download(blob, `base-cargos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Planilha gerada.");
  }

  function exportCsv() {
    const blob = new Blob([toCsv(COLUMN_KEYS, exportRows())], { type: "text/csv;charset=utf-8" });
    download(blob, `base-cargos-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function importFile(file) {
    if (!canEdit()) return toast("Somente o ADMIN pode alterar a base.");
    if (!file) return;
    const mode = prompt(
      `Importar "${file.name}".\n\nDigite:\n1 = mesclar pelo código do cargo (atualiza existentes e inclui novos)\n2 = substituir toda a base carregada`,
      "1",
    );
    if (!mode) return;
    toast("Lendo arquivo...");
    try {
      const parsed = /\.xlsx$/i.test(file.name) ? await readXlsx(file) : parseCsv(await file.text());
      const unknown = parsed.headers.filter((h) => h && !COLUMN_KEYS.includes(h));
      const incoming = parsed.rows.map((data) => {
        const row = blankRow();
        COLUMN_KEYS.forEach((k) => { if (data[k] != null && txt(data[k]).trim()) row[k] = txt(data[k]).trim(); });
        return row;
      }).filter((row) => COLUMN_KEYS.some((k) => txt(row[k]).trim()));
      if (!incoming.length) return toast("Nenhuma linha válida encontrada no arquivo.");

      if (mode.trim() === "2") {
        G.rows.forEach((row) => { if (row.__id) G.deleted.push(row.__id); });
        G.rows = incoming;
      } else {
        const index = new Map();
        G.rows.forEach((row) => {
          const key = `${norm(row.EMPRESA)}|${norm(row.COD_DO_CARGO)}`;
          if (txt(row.COD_DO_CARGO).trim()) index.set(key, row);
        });
        let updated = 0, added = 0;
        incoming.forEach((row) => {
          const key = `${norm(row.EMPRESA)}|${norm(row.COD_DO_CARGO)}`;
          const current = txt(row.COD_DO_CARGO).trim() ? index.get(key) : null;
          if (current) {
            COLUMN_KEYS.forEach((k) => {
              const value = txt(row[k]).trim();
              if (value && value !== txt(current[k])) {
                current[k] = value;
                current.__dirty = true;
                (current.__changed ||= new Set()).add(k);
              }
            });
            updated++;
          } else {
            G.rows.push(row);
            index.set(key, row);
            added++;
          }
        });
        toast(`Importação concluída: ${updated} atualizados, ${added} novos.`);
      }
      G.undo = [];
      refreshDerived();
      refreshOrder();
      renderGrid();
      if (unknown.length) toast(`Colunas ignoradas (fora do padrão da base): ${unknown.slice(0, 4).join(", ")}${unknown.length > 4 ? "..." : ""}`);
      if (mode.trim() === "2") toast(`Base substituída por ${incoming.length} linhas. Clique em Salvar alterações para gravar.`);
    } catch (error) {
      console.error("Falha ao importar arquivo", error);
      toast("Não foi possível ler o arquivo: " + (error.message || error));
    }
  }

  // -------------------------------------------------------------------------
  // Painel de colunas
  // -------------------------------------------------------------------------
  function renderColumnsPanel() {
    const groups = {};
    COLUMNS.forEach((c) => (groups[c.group] ||= []).push(c));
    el("baseColsPanel").innerHTML = `<div class="base-panel-head"><b>Colunas visíveis</b><button type="button" id="baseColsAll" class="btn ghost">Mostrar todas</button></div>` +
      Object.entries(groups).map(([group, cols]) => `
        <div class="base-col-group"><small>${esc(group)}</small>
          ${cols.map((c) => `<label><input type="checkbox" data-col="${c.key}" ${G.hidden.has(c.key) ? "" : "checked"}> ${esc(c.label)}</label>`).join("")}
        </div>`).join("");
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  scroll.addEventListener("scroll", () => {
    if (G.editing) closeEditor(true);
    renderBody();
  }, { passive: true });

  host.addEventListener("mousedown", (e) => {
    const cell = e.target.closest("td.sheet-td, th.sheet-gutter, th.sheet-th");
    if (!cell) return;
    if (cell.matches("th.sheet-th") && !cell.classList.contains("sheet-gutter")) {
      const key = cell.dataset.k;
      G.sort = G.sort?.key === key ? (G.sort.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" };
      refreshOrder();
      renderGrid();
      return;
    }
    const r = Number(cell.dataset.r);
    if (Number.isNaN(r)) return;
    if (cell.matches("th.sheet-gutter")) {
      // Clique na numeracao seleciona a linha inteira.
      G.sel = { r1: r, c1: 0, r2: r, c2: visibleColumns().length - 1 };
      paintSelection();
      scroll.focus();
      return;
    }
    const c = Number(cell.dataset.c);
    if (G.editing) closeEditor(true);
    setSel(r, c, e.shiftKey);
    scroll.focus();
  });

  host.addEventListener("dblclick", (e) => {
    if (!e.target.closest("td.sheet-td")) return;
    startEdit();
  });

  scroll.addEventListener("keydown", (e) => {
    if (G.editing) return;
    if (!G.sel) {
      if (["ArrowDown", "ArrowRight", "Enter"].includes(e.key) && G.order.length) { e.preventDefault(); setSel(0, 0); }
      return;
    }
    const { r1, c1, r2, c2 } = G.sel;
    // Com Shift a selecao cresce a partir da ponta atual do intervalo.
    const br = e.shiftKey ? r2 : r1, bc = e.shiftKey ? c2 : c1;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); return undo(); }
    if (ctrl && ["c", "v", "x", "a"].includes(e.key.toLowerCase())) {
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        G.sel = { r1: 0, c1: 0, r2: G.order.length - 1, c2: visibleColumns().length - 1 };
        paintSelection();
      }
      return; // copy/paste tratados pelos eventos nativos
    }
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); setSel(br - 1, bc, e.shiftKey); break;
      case "ArrowDown": e.preventDefault(); setSel(br + 1, bc, e.shiftKey); break;
      case "ArrowLeft": e.preventDefault(); setSel(br, bc - 1, e.shiftKey); break;
      case "ArrowRight": e.preventDefault(); setSel(br, bc + 1, e.shiftKey); break;
      case "PageDown": e.preventDefault(); setSel(br + Math.floor(scroll.clientHeight / ROW_H), bc, e.shiftKey); break;
      case "PageUp": e.preventDefault(); setSel(br - Math.floor(scroll.clientHeight / ROW_H), bc, e.shiftKey); break;
      case "Home": e.preventDefault(); setSel(ctrl ? 0 : br, 0, e.shiftKey); break;
      case "End": e.preventDefault(); setSel(ctrl ? G.order.length - 1 : br, visibleColumns().length - 1, e.shiftKey); break;
      case "Tab": e.preventDefault(); setSel(r1, c1 + (e.shiftKey ? -1 : 1)); break;
      case "Enter": case "F2": e.preventDefault(); startEdit(); break;
      case "Delete": case "Backspace": e.preventDefault(); clearSelection(); break;
      default:
        if (e.key.length === 1 && !ctrl && !e.altKey) { e.preventDefault(); startEdit(e.key); }
    }
  });

  scroll.addEventListener("copy", (e) => {
    if (G.editing || !G.sel) return;
    const tsv = selectionTsv();
    if (!tsv) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
    toast("Conteúdo copiado. Pode colar direto no Excel.");
  });

  scroll.addEventListener("paste", (e) => {
    if (G.editing || !G.sel) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const matrix = parseDelimited(text.replace(/\r\n?/g, "\n").replace(/\n$/, ""), "\t");
    pasteMatrix(matrix);
  });

  el("baseSearch").addEventListener("input", () => { refreshOrder(); scroll.scrollTop = 0; renderBody(); renderStatus(); });
  el("baseCompany").addEventListener("change", () => { refreshOrder(); scroll.scrollTop = 0; renderBody(); renderStatus(); });
  el("baseOnlyChanged").addEventListener("change", () => { refreshOrder(); scroll.scrollTop = 0; renderBody(); renderStatus(); });
  el("baseAdd").addEventListener("click", addRow);
  el("baseDuplicate").addEventListener("click", duplicateRow);
  el("baseDelete").addEventListener("click", deleteRows);
  el("baseSave").addEventListener("click", save);
  el("baseDiscard").addEventListener("click", discard);
  el("baseReload").addEventListener("click", () => {
    if (pendingCount() && !confirm("Existem alterações não salvas. Recarregar mesmo assim?")) return;
    loadRows();
  });

  el("baseColsBtn").addEventListener("click", () => {
    const panel = el("baseColsPanel");
    renderColumnsPanel();
    panel.classList.toggle("hidden");
  });
  el("baseColsPanel").addEventListener("change", (e) => {
    const key = e.target.dataset?.col;
    if (!key) return;
    if (e.target.checked) G.hidden.delete(key); else G.hidden.add(key);
    persistHidden();
    G.sel = null;
    renderGrid();
  });
  el("baseColsPanel").addEventListener("click", (e) => {
    if (e.target.id !== "baseColsAll") return;
    G.hidden.clear();
    persistHidden();
    renderColumnsPanel();
    renderGrid();
  });

  el("baseFileBtn").addEventListener("click", () => el("baseFilePanel").classList.toggle("hidden"));
  el("baseFilePanel").addEventListener("click", (e) => {
    const action = e.target.dataset?.file;
    if (!action) return;
    el("baseFilePanel").classList.add("hidden");
    if (action === "xlsx") exportXlsx();
    if (action === "csv") exportCsv();
    if (action === "import") el("baseFileInput").click();
  });
  el("baseFileInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    importFile(file);
  });

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".base-menu")) {
      el("baseColsPanel").classList.add("hidden");
      el("baseFilePanel").classList.add("hidden");
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!pendingCount()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  renderLegend();
  renderStatus();

  return {
    open() {
      view.classList.toggle("base-readonly", !canEdit());
      if (!G.loaded && !G.loading) loadRows({ silent: true });
      else { refreshOrder(); renderGrid(); }
      requestAnimationFrame(() => renderBody());
    },
    hasPendingChanges: () => pendingCount() > 0,
    reload: () => loadRows(),
  };
}
