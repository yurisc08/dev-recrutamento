// Base de cargos — planilha editavel embutida (perfil ADMIN).
// Fornece grade estilo Excel sobre a base geral de cargos (job_catalog):
// edicao celula a celula, inclusao/exclusao de linhas, colar do Excel,
// interligacao automatica entre campos e exportacao/importacao de arquivo.
import JSZip from "https://esm.sh/jszip@3.10.1";

export const SKILL_LABELS = {
  SKILL_30: "ESCOLARIDADE MÍNIMA",
  SKILL_31: "ESCOLARIDADE DESEJÁVEL",
  SKILL_32: "IDIOMA MÍNIMO",
  SKILL_33: "IDIOMA DESEJÁVEL",
  SKILL_34: "COMPETÊNCIAS TÉCNICAS MÍNIMAS",
  SKILL_35: "COMPETÊNCIAS TÉCNICAS DESEJÁVEIS",
  SKILL_36: "EXPERIÊNCIA PROFISSIONAL DESEJÁVEL",
  SKILL_37: "COMPETÊNCIAS MARCOPOLO DESEJÁVEIS",
};

// Cada coluna descreve como o dado e exibido, editado e onde ele alimenta o fluxo.
// flow: campo do fluxo de descritivos que consome a coluna (interligacao).
export const COLUMNS = [
  { key: "COD_EMPRESA", label: "Cód. empresa", width: 110, group: "Empresa", suggest: true },
  { key: "EMPRESA", label: "Empresa", width: 210, group: "Empresa", suggest: true, flow: "Empresa exibida na busca de cargo vigente" },
  { key: "EMP_COD", label: "Emp. cód.", width: 100, group: "Empresa", suggest: true },
  { key: "COD_DO_CARGO", label: "Código do cargo", width: 135, group: "Identificação", pin: true, flow: "Código do cargo (pesquisa e documento)" },
  { key: "CARGO", label: "Cargo", width: 230, group: "Identificação", pin: true, flow: "Nome do cargo na solicitação" },
  { key: "NOME_COMPLETO", label: "Nome completo", width: 230, group: "Identificação", flow: "Nome do cargo (prioritário)" },
  { key: "NOME", label: "Nome resumido", width: 190, group: "Identificação" },
  { key: "CBO", label: "CBO", width: 100, group: "Classificação", suggest: true, flow: "Campo CBO do formulário" },
  { key: "NATUREZA_DO_CARGO", label: "Natureza do cargo", width: 150, group: "Classificação", suggest: true, flow: "Campo natureza do cargo" },
  { key: "DT_DESATIVADO", label: "Desativado em", width: 125, group: "Vigência" },
  { key: "DT_ATIVACAO", label: "Ativado em", width: 120, group: "Vigência" },
  { key: "TCLC_DESC", label: "Trilha de carreira", width: 165, group: "Classificação", suggest: true, flow: "Campo trilha de carreira" },
  { key: "DATA_REVISAO", label: "Data de revisão", width: 135, group: "Vigência" },
  { key: "NIVEL_CARGO", label: "Nível do cargo", width: 125, group: "Classificação", suggest: true, flow: "Campo nível do cargo" },
  { key: "COD_FAMILIA_CARGO", label: "Cód. família", width: 120, group: "Classificação", suggest: true },
  { key: "CHAVE_AGRUPAMENTO", label: "Chave agrupamento", width: 150, group: "Classificação" },
  { key: "TEXTO_RESULTADO_ESPERADO", label: "Resultado esperado", width: 320, group: "Conteúdo", long: true, flow: "Missão (origem alternativa)" },
  { key: "DESCRICAO_CARGO", label: "Descrição do cargo", width: 320, group: "Conteúdo", long: true, flow: "Principais responsabilidades/atividades" },
  { key: "ATIV_DESC", label: "Missão / atividades", width: 320, group: "Conteúdo", long: true, flow: "Missão" },
  { key: "SKILL_30_DESC", label: "Rótulo — escolaridade mín.", width: 210, group: "Requisitos", auto: true },
  { key: "SKILL_30", label: "Escolaridade mínima", width: 260, group: "Requisitos", long: true, flow: "Formação/Escolaridade mínima" },
  { key: "SKILL_31_DESC", label: "Rótulo — escolaridade desej.", width: 210, group: "Requisitos", auto: true },
  { key: "SKILL_31", label: "Escolaridade desejável", width: 260, group: "Requisitos", long: true, flow: "Formação/Escolaridade desejável" },
  { key: "SKILL_32_DESC", label: "Rótulo — idioma mín.", width: 190, group: "Requisitos", auto: true },
  { key: "SKILL_32", label: "Idioma mínimo", width: 240, group: "Requisitos", long: true, flow: "Idioma mínimo" },
  { key: "SKILL_33_DESC", label: "Rótulo — idioma desej.", width: 190, group: "Requisitos", auto: true },
  { key: "SKILL_33", label: "Idioma desejável", width: 240, group: "Requisitos", long: true, flow: "Idioma desejável" },
  { key: "SKILL_34_DESC", label: "Rótulo — técnicas mín.", width: 200, group: "Requisitos", auto: true },
  { key: "SKILL_34", label: "Competências técnicas mínimas", width: 300, group: "Requisitos", long: true, flow: "Competências técnicas mínimas" },
  { key: "SKILL_35_DESC", label: "Rótulo — técnicas desej.", width: 200, group: "Requisitos", auto: true },
  { key: "SKILL_35", label: "Competências técnicas desejáveis", width: 300, group: "Requisitos", long: true, flow: "Competências técnicas desejáveis" },
  { key: "SKILL_36_DESC", label: "Rótulo — experiência", width: 200, group: "Requisitos", auto: true },
  { key: "SKILL_36", label: "Experiência profissional desejável", width: 300, group: "Requisitos", long: true, flow: "Experiência profissional desejável" },
  { key: "SKILL_37_DESC", label: "Rótulo — competências MP", width: 200, group: "Requisitos", auto: true },
  { key: "SKILL_37", label: "Competências Marcopolo desejáveis", width: 300, group: "Requisitos", long: true, flow: "Competências Marcopolo desejáveis" },
];

export const COLUMN_KEYS = COLUMNS.map((c) => c.key);
export const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

export const txt = (v) => (v == null ? "" : String(v));
export const norm = (v) =>
  txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// ---------------------------------------------------------------------------
// Interligacao entre campos: ao preencher uma coluna, as colunas relacionadas
// sao completadas automaticamente (somente quando estao vazias, para nunca
// sobrescrever o que o ADMIN digitou).
// ---------------------------------------------------------------------------
export function linkedUpdates(row, key, allRows = []) {
  const out = {};
  const val = txt(row[key]).trim();
  const empty = (k) => !txt(row[k]).trim();

  // Empresa: nome, codigo e emp_cod caminham juntos.
  if (key === "EMPRESA" && val) {
    const twin = allRows.find((r) => r !== row && norm(r.EMPRESA) === norm(val) && txt(r.COD_EMPRESA).trim());
    if (twin) {
      if (empty("COD_EMPRESA")) out.COD_EMPRESA = txt(twin.COD_EMPRESA);
      if (empty("EMP_COD")) out.EMP_COD = txt(twin.EMP_COD);
    }
  }
  if ((key === "COD_EMPRESA" || key === "EMP_COD") && val) {
    const twin = allRows.find((r) => r !== row && txt(r[key]).trim() === val && txt(r.EMPRESA).trim());
    if (twin && empty("EMPRESA")) out.EMPRESA = txt(twin.EMPRESA);
    if (key === "COD_EMPRESA" && empty("EMP_COD")) out.EMP_COD = val;
    if (key === "EMP_COD" && empty("COD_EMPRESA")) out.COD_EMPRESA = val;
  }

  // Nome do cargo: CARGO alimenta NOME_COMPLETO e NOME (usados na busca do fluxo).
  if (key === "CARGO" && val) {
    if (empty("NOME_COMPLETO")) out.NOME_COMPLETO = val;
    if (empty("NOME")) out.NOME = val;
  }
  if (key === "NOME_COMPLETO" && val && empty("CARGO")) out.CARGO = val;

  // Familia de cargo alimenta a chave de agrupamento usada nos mapas de hierarquia.
  if (key === "COD_FAMILIA_CARGO" && val && empty("CHAVE_AGRUPAMENTO")) out.CHAVE_AGRUPAMENTO = `H|${val}`;

  // Requisitos: preencher o conteudo garante o rotulo oficial correspondente.
  const skill = /^(SKILL_\d\d)$/.exec(key);
  if (skill && val) {
    const descKey = `${skill[1]}_DESC`;
    if (empty(descKey) && SKILL_LABELS[skill[1]]) out[descKey] = SKILL_LABELS[skill[1]];
  }

  // Cargo ja classificado: herda CBO/nivel/trilha de outro registro com o mesmo codigo.
  if (key === "COD_DO_CARGO" && val) {
    const twin = allRows.find((r) => r !== row && txt(r.COD_DO_CARGO).trim() === val);
    if (twin) {
      ["CARGO", "NOME_COMPLETO", "CBO", "NIVEL_CARGO", "TCLC_DESC", "NATUREZA_DO_CARGO"].forEach((k) => {
        if (empty(k) && txt(twin[k]).trim()) out[k] = txt(twin[k]);
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leitura e gravacao de arquivos (.xlsx e .csv) direto no navegador.
// ---------------------------------------------------------------------------
const colName = (i) => {
  let s = "", n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const xmlEsc = (s) =>
  txt(s)
    .replace(CONTROL_CHARS, "")
    .replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[m]);

export async function buildXlsx(headers, rows, sheetName = "Base") {
  const zip = new JSZip();
  const cell = (r, c, value) => {
    const v = txt(value);
    if (!v) return "";
    return `<c r="${colName(c)}${r}" t="inlineStr" s="${r === 1 ? 1 : 0}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const lines = [`<row r="1">${headers.map((h, c) => cell(1, c, h)).join("")}</row>`];
  rows.forEach((row, i) => {
    const r = i + 2;
    lines.push(`<row r="${r}">${headers.map((h, c) => cell(r, c, row[h])).join("")}</row>`);
  });
  const cols = headers
    .map((h, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(12, (COLUMN_BY_KEY[h]?.width || 140) / 8))}" customWidth="1"/>`)
    .join("");

  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4C2A6B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${colName(headers.length - 1)}${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${lines.join("")}</sheetData><autoFilter ref="A1:${colName(headers.length - 1)}${rows.length + 1}"/></worksheet>`);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// Le a primeira planilha de um .xlsx e devolve { headers, rows } com strings.
export async function readXlsx(file) {
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wbFile = zip.file("xl/workbook.xml"), relFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbFile && relFile) {
    const wb = parser.parseFromString(await wbFile.async("string"), "application/xml");
    const rels = parser.parseFromString(await relFile.async("string"), "application/xml");
    const first = wb.getElementsByTagName("sheet")[0];
    const rid = first?.getAttribute("r:id") ||
      first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...rels.getElementsByTagName("Relationship")].find((x) => x.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const shared = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const ss = parser.parseFromString(await ssFile.async("string"), "application/xml");
    [...ss.getElementsByTagName("si")].forEach((si) => {
      shared.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
    });
  }
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("Não foi possível localizar a planilha dentro do arquivo.");
  const doc = parser.parseFromString(await sheetFile.async("string"), "application/xml");
  const matrix = [];
  [...doc.getElementsByTagName("row")].forEach((rowEl) => {
    const line = [];
    [...rowEl.getElementsByTagName("c")].forEach((c) => {
      const ref = c.getAttribute("r") || "";
      const letters = ref.replace(/[0-9]+/g, "");
      let idx = 0;
      for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
      idx = Math.max(0, idx - 1);
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") value = [...c.getElementsByTagName("t")].map((t) => t.textContent).join("");
      else {
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      line[idx] = txt(value).trim();
    });
    matrix.push(line);
  });
  const headerRow = matrix.shift() || [];
  const headers = headerRow.map((h) => txt(h).trim());
  const rows = matrix
    .filter((line) => line.some((v) => txt(v).trim()))
    .map((line) => Object.fromEntries(headers.map((h, i) => [h, txt(line[i])])));
  return { headers, rows };
}

// CSV com separador ponto e virgula (padrao pt-BR do Excel).
export function toCsv(headers, rows) {
  const cell = (v) => {
    const s = txt(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + [headers.join(";"), ...rows.map((r) => headers.map((h) => cell(r[h])).join(";"))].join("\r\n");
}

export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const src = txt(text).replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseCsv(text) {
  const first = txt(text).split(/\r?\n/)[0] || "";
  const delimiter = first.split(";").length > first.split(",").length ? ";" : ",";
  const matrix = parseDelimited(text, delimiter).filter((line) => line.some((v) => txt(v).trim()));
  const headers = (matrix.shift() || []).map((h) => txt(h).trim());
  return { headers, rows: matrix.map((line) => Object.fromEntries(headers.map((h, i) => [h, txt(line[i]).trim()]))) };
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
