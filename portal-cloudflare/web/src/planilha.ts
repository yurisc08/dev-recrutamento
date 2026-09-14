/**
 * Leitura e gravação de .xlsx dentro do navegador.
 *
 * Em Cloudflare Workers não roda biblioteca de Excel (e mandar a planilha
 * inteira para a nuvem seria expor dado sensível sem necessidade). Então o
 * arquivo é aberto aqui, no computador de quem importa, e para a API vão só
 * as linhas já conferidas, em JSON.
 */

const decodificador = new TextDecoder('utf-8');
const codificador = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Leitura: ZIP (diretório central) + XML das abas                     */
/* ------------------------------------------------------------------ */

interface EntradaZip { nome: string; metodo: number; tamanhoComprimido: number; deslocamento: number }
interface Zip { bytes: Uint8Array; dados: DataView; entradas: EntradaZip[] }

function lerZip(buffer: ArrayBuffer): Zip {
  const dados = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (dados.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('O arquivo não parece um .xlsx válido (estrutura ZIP não encontrada).');
  const quantidade = dados.getUint16(fim + 10, true);
  let ponteiro = dados.getUint32(fim + 16, true);
  const entradas: EntradaZip[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    if (dados.getUint32(ponteiro, true) !== 0x02014b50) break;
    const metodo = dados.getUint16(ponteiro + 10, true);
    const tamanhoComprimido = dados.getUint32(ponteiro + 20, true);
    const tamanhoNome = dados.getUint16(ponteiro + 28, true);
    const tamanhoExtra = dados.getUint16(ponteiro + 30, true);
    const tamanhoComentario = dados.getUint16(ponteiro + 32, true);
    const deslocamento = dados.getUint32(ponteiro + 42, true);
    const nome = decodificador.decode(bytes.subarray(ponteiro + 46, ponteiro + 46 + tamanhoNome));
    entradas.push({ nome, metodo, tamanhoComprimido, deslocamento });
    ponteiro += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return { bytes, dados, entradas };
}

async function extrair(zip: Zip, nome: string): Promise<string | null> {
  const entrada = zip.entradas.find((e) => e.nome === nome);
  if (!entrada) return null;
  const inicio = entrada.deslocamento;
  if (zip.dados.getUint32(inicio, true) !== 0x04034b50) throw new Error(`Entrada corrompida no arquivo: ${nome}`);
  const tamanhoNome = zip.dados.getUint16(inicio + 26, true);
  const tamanhoExtra = zip.dados.getUint16(inicio + 28, true);
  const dadoInicio = inicio + 30 + tamanhoNome + tamanhoExtra;
  const bruto = zip.bytes.subarray(dadoInicio, dadoInicio + entrada.tamanhoComprimido);
  if (entrada.metodo === 0) return decodificador.decode(bruto);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador não consegue descompactar o arquivo. Use Chrome, Edge ou Firefox atualizados.');
  }
  const fluxo = new Blob([bruto as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return decodificador.decode(await new Response(fluxo).arrayBuffer());
}

function letrasParaIndice(referencia: string): number {
  const letras = (referencia.match(/^[A-Z]+/) ?? ['A'])[0];
  let indice = 0;
  for (let i = 0; i < letras.length; i += 1) indice = indice * 26 + (letras.charCodeAt(i) - 64);
  return indice;
}

/** Excel guarda data como número de dias desde 30/12/1899. */
function serialParaISO(numero: string): string {
  const ms = Math.round((Number(numero) - 25569) * 86400 * 1000);
  const data = new Date(ms);
  return Number.isNaN(data.getTime()) ? String(numero) : data.toISOString().slice(0, 10);
}

export interface AbaLida { nome: string; linhas: string[][] }

/** Abre o .xlsx e devolve as abas com as células já convertidas em texto. */
export async function lerPlanilha(arquivo: File): Promise<AbaLida[]> {
  const zip = lerZip(await arquivo.arrayBuffer());
  const leitor = new DOMParser();
  const workbookXml = await extrair(zip, 'xl/workbook.xml');
  const relsXml = await extrair(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('Não foi possível ler a estrutura da planilha.');
  const workbook = leitor.parseFromString(workbookXml, 'application/xml');
  const rels = leitor.parseFromString(relsXml, 'application/xml');

  const alvos: Record<string, string> = {};
  rels.querySelectorAll('Relationship').forEach((r) => {
    alvos[r.getAttribute('Id') ?? ''] = r.getAttribute('Target') ?? '';
  });

  const compartilhados: string[] = [];
  const sstXml = await extrair(zip, 'xl/sharedStrings.xml');
  if (sstXml) {
    leitor.parseFromString(sstXml, 'application/xml').querySelectorAll('si').forEach((si) => {
      compartilhados.push([...si.querySelectorAll('t')].map((t) => t.textContent ?? '').join(''));
    });
  }

  // Descobre quais estilos representam data, para não devolver "45870" no lugar de "2025-07-31".
  const estiloEhData: boolean[] = [];
  const estilosXml = await extrair(zip, 'xl/styles.xml');
  if (estilosXml) {
    const doc = leitor.parseFromString(estilosXml, 'application/xml');
    const formatos: Record<string, string> = {};
    doc.querySelectorAll('numFmt').forEach((f) => {
      formatos[f.getAttribute('numFmtId') ?? ''] = f.getAttribute('formatCode') ?? '';
    });
    const embutidosData = ['14', '15', '16', '17', '18', '19', '20', '21', '22', '45', '46', '47'];
    const xfs = doc.querySelector('cellXfs');
    if (xfs) {
      [...xfs.querySelectorAll('xf')].forEach((xf, indice) => {
        const id = xf.getAttribute('numFmtId') ?? '0';
        const codigo = (formatos[id] ?? '').replace(/\[[^\]]*\]/g, '');
        estiloEhData[indice] = embutidosData.includes(id) || (/[dmy]/i.test(codigo) && /[dy]/i.test(codigo));
      });
    }
  }

  const abas: AbaLida[] = [];
  for (const folha of [...workbook.querySelectorAll('sheets > sheet')]) {
    const id = folha.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ?? folha.getAttribute('r:id') ?? '';
    let alvo = alvos[id] ?? '';
    alvo = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
    const xml = await extrair(zip, alvo);
    if (!xml) continue;
    const doc = leitor.parseFromString(xml, 'application/xml');
    const linhas: string[][] = [];
    doc.querySelectorAll('sheetData > row').forEach((row) => {
      const numero = Number(row.getAttribute('r') ?? linhas.length + 1);
      const celulas: string[] = [];
      row.querySelectorAll('c').forEach((c) => {
        const indice = letrasParaIndice(c.getAttribute('r') ?? 'A1') - 1;
        const tipo = c.getAttribute('t');
        let valor = '';
        if (tipo === 's') {
          const v = c.querySelector('v');
          valor = compartilhados[Number(v ? v.textContent : -1)] ?? '';
        } else if (tipo === 'inlineStr') {
          valor = [...c.querySelectorAll('is t')].map((t) => t.textContent ?? '').join('');
        } else {
          const v = c.querySelector('v');
          valor = v?.textContent ?? '';
          const estilo = Number(c.getAttribute('s') ?? -1);
          if (valor !== '' && estiloEhData[estilo] && !Number.isNaN(Number(valor))) valor = serialParaISO(valor);
        }
        celulas[indice] = valor == null ? '' : String(valor);
      });
      linhas[numero - 1] = celulas;
    });
    abas.push({ nome: folha.getAttribute('name') ?? `Planilha ${abas.length + 1}`, linhas: linhas.filter(Boolean) });
  }
  if (!abas.length) throw new Error('A planilha não tem nenhuma aba legível.');
  return abas;
}

/** Acha a linha que parece o cabeçalho (a com mais células preenchidas entre as 15 primeiras). */
export function acharCabecalho(linhas: string[][]): number {
  let melhor = 0;
  let melhorContagem = 0;
  for (let i = 0; i < Math.min(linhas.length, 15); i += 1) {
    const contagem = (linhas[i] ?? []).filter((c) => String(c ?? '').trim()).length;
    if (contagem > melhorContagem) { melhorContagem = contagem; melhor = i; }
  }
  return melhor;
}

/* ------------------------------------------------------------------ */
/* Gravação: ZIP sem compressão (o Excel aceita) + XML das abas         */
/* ------------------------------------------------------------------ */

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tabela[i] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function montarZip(arquivos: Array<{ nome: string; conteudo: string }>): Blob {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome);
    const conteudo = codificador.encode(arquivo.conteudo);
    const crc = crc32(conteudo);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, conteudo.length, true); local.setUint32(22, conteudo.length, true);
    local.setUint16(26, nome.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, conteudo);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0, true); cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, conteudo.length, true); cd.setUint32(24, conteudo.length, true);
    cd.setUint16(28, nome.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true);
    cd.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(cd.buffer), nome);
    deslocamento += 30 + nome.length + conteudo.length;
  }

  const tamanhoCentral = central.reduce((soma, parte) => soma + parte.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(4, 0, true); fim.setUint16(6, 0, true);
  fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true); fim.setUint32(16, deslocamento, true); fim.setUint16(20, 0, true);

  const blocos = [...partes, ...central, new Uint8Array(fim.buffer)] as BlobPart[];
  return new Blob(blocos, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const escaparXml = (texto: unknown) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colunaLetra(indice: number): string {
  let letra = '';
  let n = indice;
  while (n > 0) { const resto = (n - 1) % 26; letra = String.fromCharCode(65 + resto) + letra; n = Math.floor((n - resto) / 26); }
  return letra;
}

export type Celula = string | number | null;
export interface AbaEscrita {
  nome: string;
  linhas: Celula[][];
  /** Coluna (1 = A) que recebe lista suspensa com as opções indicadas. */
  colunaLista?: number;
  opcoesLista?: string[];
}

function abaXml(aba: AbaEscrita): string {
  const corpo = aba.linhas.map((celulas, indiceLinha) => {
    const numero = indiceLinha + 1;
    const conteudo = celulas.map((celula, indiceColuna) => {
      if (celula === null || celula === undefined || celula === '') return '';
      const referencia = colunaLetra(indiceColuna + 1) + numero;
      const estilo = numero === 1 ? ' s="1"' : '';
      if (typeof celula === 'number') return `<c r="${referencia}"${estilo}><v>${celula}</v></c>`;
      return `<c r="${referencia}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escaparXml(celula)}</t></is></c>`;
    }).join('');
    return `<row r="${numero}">${conteudo}</row>`;
  }).join('');

  let validacao = '';
  if (aba.colunaLista && aba.opcoesLista?.length) {
    const letra = colunaLetra(aba.colunaLista);
    const ultima = Math.max(aba.linhas.length, 2);
    validacao = '<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1"'
      + ' showErrorMessage="1" errorTitle="Opção inválida" error="Escolha uma das opções da lista."'
      + ` sqref="${letra}2:${letra}${ultima}">`
      + `<formula1>"${escaparXml(aba.opcoesLista.join(','))}"</formula1></dataValidation></dataValidations>`;
  }

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0">'
    + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<sheetData>${corpo}</sheetData>${validacao}</worksheet>`;
}

export function montarXlsx(abas: AbaEscrita[]): Blob {
  const arquivos: Array<{ nome: string; conteudo: string }> = [
    {
      nome: '[Content_Types].xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
    },
    {
      nome: '_rels/.rels',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + abas.map((aba, i) => `<sheet name="${escaparXml(aba.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>',
    },
    {
      nome: 'xl/styles.xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FF1C5CAB"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        + '</styleSheet>',
    },
  ];
  abas.forEach((aba, i) => arquivos.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: abaXml(aba) }));
  return montarZip(arquivos);
}

/** Entrega o arquivo ao usuário (link temporário; nada sai do navegador). */
export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
