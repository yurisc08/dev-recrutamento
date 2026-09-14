import ExcelJS from 'exceljs';
import { ErroHttp } from '../http/erros.js';
import { converter, formatarBR, normalizar } from '../dominio/valores.js';
import type { Campo } from '../dominio/tipos.js';

export interface Cabecalho { indice: number; rotulo: string }
export interface Analise {
  abas: Array<{ nome: string; linhas: number }>;
  aba: string;
  linha_cabecalho: number;
  total_linhas: number;
  cabecalhos: Cabecalho[];
  previa: unknown[][];
}

function valorCelula(celula: ExcelJS.Cell): unknown {
  const valor = celula.value as unknown;
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    const objeto = valor as Record<string, unknown> & { richText?: Array<{ text: string }> };
    if (objeto.text !== undefined) return objeto.text;
    if (objeto.result !== undefined) return objeto.result;
    if (objeto.richText) return objeto.richText.map((parte) => parte.text).join('');
    return null;
  }
  return valor;
}

function lerLinha(planilha: ExcelJS.Worksheet, numero: number): unknown[] {
  const linha = planilha.getRow(numero);
  const largura = Math.max(planilha.columnCount, linha.cellCount);
  const valores: unknown[] = [];
  for (let coluna = 1; coluna <= largura; coluna += 1) valores.push(valorCelula(linha.getCell(coluna)));
  return valores;
}

/** Primeira linha com 3+ células preenchidas — cobre planilhas com título/logo no topo. */
function detectarCabecalho(planilha: ExcelJS.Worksheet): number {
  for (let numero = 1; numero <= Math.min(planilha.rowCount, 15); numero += 1) {
    const preenchidas = lerLinha(planilha, numero).filter((valor) => valor !== null && String(valor).trim() !== '').length;
    if (preenchidas >= 3) return numero;
  }
  return 1;
}

export async function carregar(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

export async function analisar(
  buffer: Buffer,
  opcoes: { aba?: string; linhaCabecalho?: number } = {},
): Promise<Analise> {
  const workbook = await carregar(buffer);
  const visiveis = workbook.worksheets.filter((planilha) => planilha.state !== 'veryHidden');
  if (visiveis.length === 0) throw new ErroHttp(422, 'A planilha não contém abas legíveis.');

  const escolhida =
    (opcoes.aba ? workbook.getWorksheet(opcoes.aba) : undefined) ??
    visiveis.find((planilha) => normalizar(planilha.name).includes('base')) ??
    visiveis.reduce((maior, atual) => (maior.rowCount >= atual.rowCount ? maior : atual));

  const linhaCabecalho = Number(opcoes.linhaCabecalho) || detectarCabecalho(escolhida);
  const cabecalhos: Cabecalho[] = lerLinha(escolhida, linhaCabecalho).map((valor, indice) => ({
    indice: indice + 1,
    rotulo: String(valor ?? '').replace(/\s+/g, ' ').trim(),
  }));

  const previa: unknown[][] = [];
  for (let numero = linhaCabecalho + 1; numero <= Math.min(escolhida.rowCount, linhaCabecalho + 10); numero += 1) {
    const valores = lerLinha(escolhida, numero);
    if (valores.every((valor) => valor === null || String(valor).trim() === '')) continue;
    previa.push(valores.map((valor) => (valor instanceof Date ? valor.toISOString().slice(0, 10) : valor)));
  }

  return {
    abas: visiveis.map((planilha) => ({ nome: planilha.name, linhas: planilha.rowCount })),
    aba: escolhida.name,
    linha_cabecalho: linhaCabecalho,
    total_linhas: Math.max(escolhida.rowCount - linhaCabecalho, 0),
    cabecalhos,
    previa,
  };
}

const APELIDOS: Record<string, string[]> = {
  chapa: ['chapa', 'matricula', 'registro', 'cod colaborador'],
  nome: ['nome', 'nome completo', 'colaborador'],
  diretoria: ['diretoria'],
  divisao: ['divisao', 'divisão'],
  departamento: ['departamento'],
  des_cargo: ['des cargo', 'cargo'],
  situacao: ['situacao', 'situação', 'status'],
  estabilidade: ['estabilidade', 'estabilidade/afastamento'],
  data_fim_estabilidade: ['data fim estabilidade', 'fim estabilidade', 'vigencia estabilidade'],
  salario_anual: ['salario anual', 'salário anual'],
  acao: ['acao indicada', 'ação indicada', 'acao', 'decisao'],
  destino: ['em caso de transferencia, indicar para onde setor/area/no processo', 'destino', 'para onde'],
  justificativa: ['justificativa', 'motivo'],
};

/** Sugere o destino de cada cabeçalho comparando com o catálogo de campos. */
export function sugerirMapeamento(cabecalhos: Cabecalho[], campos: Campo[]): Record<number, string | null> {
  const porNome = new Map<string, string>();
  for (const campo of campos) {
    porNome.set(normalizar(campo.rotulo), campo.chave);
    porNome.set(normalizar(campo.chave), campo.chave);
  }
  for (const [chave, apelidos] of Object.entries(APELIDOS)) {
    for (const apelido of apelidos) if (!porNome.has(apelido)) porNome.set(apelido, chave);
  }
  const mapa: Record<number, string | null> = {};
  for (const cabecalho of cabecalhos) {
    if (!cabecalho.rotulo) continue;
    mapa[cabecalho.indice] = porNome.get(normalizar(cabecalho.rotulo)) ?? null;
  }
  return mapa;
}

export interface LinhaPreparada {
  linha: number;
  chapa: string;
  dados: Record<string, unknown>;
  decisao: { acao?: string | null; destino?: string | null; justificativa?: string | null };
  erros: string[];
}

/** Lê a aba e converte cada linha conforme o mapeamento, sem gravar nada. */
export async function prepararLinhas(
  buffer: Buffer,
  opcoes: { aba?: string; linhaCabecalho?: number; mapeamento: Record<string, string> },
  campos: Campo[],
): Promise<{ linhas: LinhaPreparada[]; aba: string }> {
  const workbook = await carregar(buffer);
  const planilha = (opcoes.aba ? workbook.getWorksheet(opcoes.aba) : undefined) ?? workbook.worksheets[0];
  if (!planilha) throw new ErroHttp(422, 'Aba não encontrada na planilha.');

  const linhaCabecalho = Number(opcoes.linhaCabecalho) || detectarCabecalho(planilha);
  const destinos = Object.entries(opcoes.mapeamento)
    .map(([indice, chave]) => ({ indice: Number(indice), chave }))
    .filter((destino) => destino.chave && destino.chave !== '__ignorar__');

  if (!destinos.some((destino) => destino.chave === 'chapa')) {
    throw new ErroHttp(422, 'Indique qual coluna da planilha contém a matrícula (CHAPA).');
  }

  const porChave = new Map(campos.map((campo) => [campo.chave, campo]));
  const linhas: LinhaPreparada[] = [];

  for (let numero = linhaCabecalho + 1; numero <= planilha.rowCount; numero += 1) {
    const valores = lerLinha(planilha, numero);
    if (valores.every((valor) => valor === null || String(valor).trim() === '')) continue;

    const preparada: LinhaPreparada = { linha: numero, chapa: '', dados: {}, decisao: {}, erros: [] };
    for (const destino of destinos) {
      const bruto = valores[destino.indice - 1];
      const campo = porChave.get(destino.chave);
      if (!campo) continue;

      if (campo.origem === 'avaliacao') {
        const texto = bruto === null || bruto === undefined ? '' : String(bruto).trim();
        if (campo.chave === 'acao') preparada.decisao.acao = texto || null;
        else if (campo.chave === 'destino') preparada.decisao.destino = texto || null;
        else if (campo.chave === 'justificativa') preparada.decisao.justificativa = texto || null;
        continue;
      }

      const convertido = converter(bruto, campo);
      if (convertido.erro) {
        preparada.erros.push(convertido.erro);
        continue;
      }
      if (campo.obrigatorio && (convertido.valor === null || convertido.valor === '')) {
        preparada.erros.push(`"${campo.rotulo}" é obrigatório.`);
      }
      preparada.dados[campo.chave] = convertido.valor;
    }

    preparada.chapa = String(preparada.dados.chapa ?? '').trim();
    if (!preparada.chapa) preparada.erros.push('Linha sem matrícula (CHAPA).');
    linhas.push(preparada);
  }

  return { linhas, aba: planilha.name };
}

/* ------------------------------ exportação ----------------------------- */

const AZUL = 'FF1C5CAB';
const CINZA = 'FFF0EFEC';
const VERDE = 'FFDDF3E8';

export interface ItemExportacao {
  chapa: string;
  nome: string | null;
  diretoria: string | null;
  divisao: string | null;
  dados: Record<string, unknown>;
  acao: string | null;
  destino: string | null;
  justificativa: string | null;
  status: string;
  alertas: string[];
  atualizado_por: string | null;
  atualizado_em: Date | null;
}

export interface ResumoExportacao {
  totais: Record<string, number>;
  acoes: Array<{ valor: string; total: number; custo: number }>;
  por_divisao: Array<Record<string, unknown>>;
}

/** Gera o arquivo de devolução: aba "1. Resumo" + aba "2. Base Decisões" com lista suspensa. */
export async function gerarExportacao(opcoes: {
  processo: { nome: string; data_base: string; prazo: string | null };
  campos: Campo[];
  acoes: string[];
  itens: ItemExportacao[];
  resumo: ResumoExportacao;
  geradoPor: string;
}): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Portal de Decisões';
  workbook.created = new Date();

  const resumo = workbook.addWorksheet('1. Resumo');
  resumo.columns = [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  resumo.mergeCells('A1:F1');
  const titulo = resumo.getCell('A1');
  titulo.value = `${opcoes.processo.nome} — posição de ${formatarBR(opcoes.processo.data_base, 'data')}`;
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  resumo.getRow(1).height = 26;

  resumo.addRow([]);
  resumo.addRow(['Prazo de devolução', opcoes.processo.prazo ? formatarBR(opcoes.processo.prazo, 'data') : '—']);
  resumo.addRow(['Gerado em', new Date().toLocaleString('pt-BR')]);
  resumo.addRow(['Gerado por', opcoes.geradoPor]);
  resumo.addRow([]);

  const cabecalhoIndicadores = resumo.addRow(['Indicador', 'Quantidade']);
  cabecalhoIndicadores.font = { bold: true };
  cabecalhoIndicadores.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
  for (const [rotulo, valor] of Object.entries(opcoes.resumo.totais)) resumo.addRow([rotulo, valor]);
  resumo.addRow([]);

  const cabecalhoAcoes = resumo.addRow(['Ação indicada', 'Pessoas', '% da base', 'Custo anual (R$)']);
  cabecalhoAcoes.font = { bold: true };
  cabecalhoAcoes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
  const totalPessoas = opcoes.resumo.totais['Total de colaboradores'] ?? 0;
  for (const acao of opcoes.resumo.acoes) {
    const linha = resumo.addRow([acao.valor, acao.total, totalPessoas ? acao.total / totalPessoas : 0, acao.custo]);
    linha.getCell(3).numFmt = '0.0%';
    linha.getCell(4).numFmt = 'R$ #,##0.00';
  }
  resumo.addRow([]);

  const cabecalhoDivisao = resumo.addRow(['Divisão', 'Diretoria', 'Total', 'Avaliados', 'Pendentes', '% concluído']);
  cabecalhoDivisao.font = { bold: true };
  cabecalhoDivisao.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
  for (const linha of opcoes.resumo.por_divisao) {
    const total = Number(linha.total ?? 0);
    const avaliados = Number(linha.avaliados ?? 0);
    const nova = resumo.addRow([
      linha.nome, linha.diretoria, total, avaliados, Number(linha.pendentes ?? 0), total ? avaliados / total : 0,
    ]);
    nova.getCell(6).numFmt = '0.0%';
  }

  const base = workbook.addWorksheet('2. Base Decisões', { views: [{ state: 'frozen', ySplit: 1 }] });
  const camposBase = opcoes.campos.filter((campo) => campo.ativo && campo.origem === 'base');
  const colunas = [
    { chave: '__diretoria__', rotulo: 'DIRETORIA (portal)', tipo: 'texto' as const },
    { chave: '__divisao__', rotulo: 'DIVISÃO (portal)', tipo: 'texto' as const },
    ...camposBase.map((campo) => ({ chave: campo.chave, rotulo: campo.rotulo, tipo: campo.tipo })),
    { chave: '__acao__', rotulo: 'AÇÃO INDICADA', tipo: 'texto' as const },
    { chave: '__destino__', rotulo: 'EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE', tipo: 'texto' as const },
    { chave: '__justificativa__', rotulo: 'JUSTIFICATIVA', tipo: 'texto' as const },
    { chave: '__status__', rotulo: 'STATUS DA AVALIAÇÃO', tipo: 'texto' as const },
    { chave: '__alertas__', rotulo: 'ALERTAS', tipo: 'texto' as const },
    { chave: '__por__', rotulo: 'PREENCHIDO POR', tipo: 'texto' as const },
    { chave: '__em__', rotulo: 'PREENCHIDO EM', tipo: 'texto' as const },
  ];
  base.columns = colunas.map((coluna) => ({
    header: coluna.rotulo,
    key: coluna.chave,
    width: coluna.chave === '__justificativa__' ? 46 : Math.min(Math.max(coluna.rotulo.length + 4, 14), 34),
  }));
  const cabecalho = base.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  cabecalho.alignment = { vertical: 'middle', wrapText: true };
  cabecalho.height = 32;

  const rotuloStatus: Record<string, string> = {
    pendente: 'Pendente', preenchida: 'Preenchida', homologada: 'Homologada',
  };

  for (const item of opcoes.itens) {
    const linha: Record<string, unknown> = {
      __diretoria__: item.diretoria ?? '',
      __divisao__: item.divisao ?? '',
      __acao__: item.acao ?? '',
      __destino__: item.destino ?? '',
      __justificativa__: item.justificativa ?? '',
      __status__: rotuloStatus[item.status] ?? item.status,
      __alertas__: item.alertas.join(' | '),
      __por__: item.atualizado_por ?? '',
      __em__: item.atualizado_em ? new Date(item.atualizado_em).toLocaleString('pt-BR') : '',
    };
    for (const campo of camposBase) {
      const valor = item.dados[campo.chave];
      linha[campo.chave] = campo.tipo === 'moeda' || campo.tipo === 'numero'
        ? (valor === null || valor === undefined ? null : Number(valor))
        : formatarBR(valor, campo.tipo);
    }
    base.addRow(linha);
  }

  const indiceAcao = colunas.findIndex((coluna) => coluna.chave === '__acao__') + 1;
  const lista = `"${opcoes.acoes.join(',')}"`;
  for (let numero = 2; numero <= Math.max(base.rowCount, 2); numero += 1) {
    const celula = base.getRow(numero).getCell(indiceAcao);
    celula.dataValidation = {
      type: 'list', allowBlank: true, formulae: [lista],
      showErrorMessage: true, errorTitle: 'Opção inválida',
      error: 'Escolha uma das opções da lista suspensa.',
    };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  }
  base.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  for (const campo of camposBase) {
    if (campo.tipo === 'moeda') base.getColumn(campo.chave).numFmt = 'R$ #,##0.00';
  }

  return workbook;
}
