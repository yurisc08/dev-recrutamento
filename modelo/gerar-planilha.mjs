/**
 * Gera modelo-base.xlsx a partir de modelo/colunas.json.
 * As colunas e a ordem são as da planilha do processo; os dados são fictícios.
 *
 *   node modelo/gerar-planilha.mjs
 */
import { createRequire } from 'node:module';
const exigir = createRequire('/home/user/dev-recrutamento/portal-reestruturacao/backend/package.json');
const ExcelJS = exigir('exceljs');
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const modelo = JSON.parse(readFileSync(join(AQUI, 'colunas.json'), 'utf8'));
const colunas = modelo.campos;
const acoes = modelo.acoes.map((a) => a.valor);

/* Dados fictícios. Nenhum valor aqui vem da planilha real. */
const EXEMPLOS = [
  { chapa: 'A1001', nome: 'Ana Beatriz Moraes', diretoria: 'DIRETORIA INDUSTRIAL', divisao: 'DIVISAO PRODUCAO',
    departamento: 'PRODUCAO', filial: 'MATRIZ', des_cargo: 'ANALISTA II', natureza: 'ADMINISTRATIVO', mo: 'MOI',
    situacao: 'ATIVO', dt_admissao: '10/03/2015', tempo_casa: 11, idade: 38, salario: 6500, salario_total: 7150,
    salario_anual: 92950, avaliacao_performar: '2025 - 3,8',
    gestor_imediato: 'Marcos Vilela Antunes', gerente: 'Helena Braga Souto', diretor: 'Paulo Ferrari Nunes' },
  { chapa: 'A1002', nome: 'Bruno Carvalho Lima', diretoria: 'DIRETORIA INDUSTRIAL', divisao: 'DIVISAO PRODUCAO',
    departamento: 'PRODUCAO', filial: 'MATRIZ', des_cargo: 'OPERADOR I', natureza: 'OPERACIONAL', mo: 'MOD',
    situacao: 'ATIVO', dt_admissao: '02/09/2019', tempo_casa: 7, idade: 29, salario: 3200, salario_total: 3520,
    salario_anual: 45760, avaliacao_performar: '2025 - 3,1', estabilidade: 'CIPA', data_fim_estabilidade: '31/12/2026',
    gestor_imediato: 'Marcos Vilela Antunes', gerente: 'Helena Braga Souto', diretor: 'Paulo Ferrari Nunes' },
  { chapa: 'B2001', nome: 'Patrícia Lemos Farias', diretoria: 'DIRETORIA COMERCIAL', divisao: 'DIVISAO VENDAS',
    departamento: 'COMERCIAL', filial: 'FILIAL 02', des_cargo: 'COORDENADOR', natureza: 'GERENCIA', mo: 'MOI',
    situacao: 'ATIVO', dt_admissao: '22/07/2013', tempo_casa: 13, idade: 44, salario: 11200, salario_total: 12320,
    salario_anual: 160160, avaliacao_performar: '2025 - 4,2',
    gestor_imediato: 'Rogério Sales Pontes', gerente: 'Rogério Sales Pontes', diretor: 'Cláudia Terra Mendes' },
];

const wb = new ExcelJS.Workbook();
wb.creator = 'Portal de Decisões';
wb.created = new Date();

/* ------------------------------ Instruções ----------------------------- */
const ins = wb.addWorksheet('Instruções');
ins.columns = [{ width: 26 }, { width: 104 }];
const titulo = ins.addRow(['Planilha-modelo do Portal de Decisões']);
titulo.font = { bold: true, size: 14 };
ins.addRow([]);
[
  ['Para que serve', 'Tem exatamente as colunas que o portal entende, na ordem da planilha do processo.'],
  ['Como usar', 'Cole a sua base na aba "Base", a partir da linha 2. Ou renomeie as colunas da sua planilha para estes nomes.'],
  ['Chave', 'CHAPA (matrícula). É por ela que a importação atualiza em vez de duplicar.'],
  ['Quem decide o quê', 'GESTOR IMEDIATO, GERENTE e DIRETOR são os três níveis. O portal usa o nome dessas colunas para separar a base e distribuir.'],
  ['AÇÃO INDICADA', `Lista suspensa: ${acoes.join(' · ')}.`],
  ['JUSTIFICATIVA', 'Não existe na planilha original — é exigência do portal, para a decisão ficar registrada com o motivo.'],
  ['Coluna a mais', 'Coluna que não estiver aqui não se perde: na importação você mapeia na mão ou deixa de fora.'],
  ['Dados desta planilha', 'Fictícios. Apague as três linhas de exemplo antes de colar a base real.'],
].forEach(([a, b]) => {
  const l = ins.addRow([a, b]);
  l.getCell(1).font = { bold: true };
  l.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  l.height = 30;
});

/* --------------------------------- Base -------------------------------- */
const base = wb.addWorksheet('Base');
const cab = base.addRow(colunas.map((c) => c.rotulo));
cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
cab.alignment = { wrapText: true, vertical: 'middle' };
cab.height = 42;
cab.eachCell((cel) => {
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F4B7C' } };
  cel.border = { bottom: { style: 'thin', color: { argb: 'FF1F3357' } } };
});
base.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
colunas.forEach((c, i) => {
  base.getColumn(i + 1).width = Math.min(Math.max(c.rotulo.length + 2, 12), 34);
});

for (const exemplo of EXEMPLOS) {
  base.addRow(colunas.map((c) => exemplo[c.chave] ?? null));
}

// Lista suspensa na AÇÃO INDICADA, como na planilha do processo.
const iAcao = colunas.findIndex((c) => c.chave === 'acao') + 1;
const letra = base.getColumn(iAcao).letter;
for (let linha = 2; linha <= 1000; linha += 1) {
  base.getCell(`${letra}${linha}`).dataValidation = {
    type: 'list', allowBlank: true, formulae: [`"${acoes.join(',')}"`],
    showErrorMessage: true, errorStyle: 'stop',
    errorTitle: 'Ação inválida', error: `Use uma das opções: ${acoes.join(', ')}.`,
  };
}

/* ------------------------------- Colunas ------------------------------- */
const ref = wb.addWorksheet('Colunas');
ref.columns = [
  { header: '#', width: 5 }, { header: 'COLUNA', width: 46 }, { header: 'CHAVE NO PORTAL', width: 24 },
  { header: 'TIPO', width: 10 }, { header: 'GRUPO', width: 16 }, { header: 'OBSERVAÇÃO', width: 60 },
];
ref.getRow(1).font = { bold: true };
colunas.forEach((c, i) => {
  const obs = c.coluna_planilha ? (c.ajuda ?? '') : 'Não existe na planilha original — acrescentada pelo portal.';
  const l = ref.addRow([c.coluna_planilha ?? '', c.rotulo, c.chave, c.tipo, c.grupo, obs]);
  l.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  l.getCell(6).alignment = { wrapText: true, vertical: 'top' };
  if (c.sensivel) l.getCell(6).font = { color: { argb: 'FFB3261E' } };
  void i;
});
ref.views = [{ state: 'frozen', ySplit: 1 }];

const destino = join(RAIZ, 'modelo/modelo-base.xlsx');
await wb.xlsx.writeFile(destino);
console.log('gerado:', destino, '|', colunas.length, 'colunas |', EXEMPLOS.length, 'linhas fictícias');
