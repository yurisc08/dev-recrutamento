/**
 * Gera, a partir de colunas.json, o catálogo que cada portal usa.
 * Uma fonte só: os dois portais não podem divergir da planilha.
 *
 *   node modelo/gerar.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const modelo = JSON.parse(readFileSync(join(AQUI, 'colunas.json'), 'utf8'));

const js = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`);
const sql = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/* ------------------- portal-local: módulo JavaScript ------------------- */
const linhasJs = modelo.campos.map((c) => '  ' + JSON.stringify({
  chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, grupo: c.grupo, origem: c.origem,
  coluna_planilha: c.coluna_planilha, visivel_lista: c.visivel_lista, agrupar: c.agrupar,
  somar: c.somar, sensivel: c.sensivel, editavel_por: c.editavel_por, ordem: c.ordem,
  ajuda: c.ajuda ?? null,
}));

const arquivoLocal = `/**
 * Catálogo do processo — as ${modelo.campos.filter((c) => c.coluna_planilha).length} colunas da planilha, na ordem do arquivo,
 * mais a JUSTIFICATIVA que o portal exige e a planilha não tem.
 *
 * NÃO EDITE À MÃO. Gerado por modelo/gerar.mjs a partir de modelo/colunas.json.
 */
export const CAMPOS_PADRAO = [
${linhasJs.join(',\n')},
];

export const ACOES_PADRAO = [
${modelo.acoes.map((a, i) => `  [${js(a.valor)}, ${js(a.cor)}, ${a.exige_justificativa ? 1 : 0}, ${a.exige_destino ? 1 : 0}, ${a.considera_desligamento ? 1 : 0}, ${(i + 1) * 10}]`).join(',\n')},
];
`;
mkdirSync(join(RAIZ, 'portal-local/servidor'), { recursive: true });
writeFileSync(join(RAIZ, 'portal-local/servidor/campos-padrao.mjs'), arquivoLocal);

/* ----------------------- Supabase: VALUES do SQL ----------------------- */
const linhasSql = modelo.campos.map((c) =>
  `  (${sql(c.chave)},${sql(c.rotulo)},${sql(c.tipo)},${sql(c.grupo)},${sql(c.origem)},` +
  `${c.visivel_lista},${c.agrupar},${c.somar},${c.sensivel},${sql(c.editavel_por)},${c.ordem},${sql(c.ajuda)})`);

mkdirSync(join(AQUI, 'gerado'), { recursive: true });
writeFileSync(join(AQUI, 'gerado/campos.sql'),
  `-- NÃO EDITE À MÃO. Gerado por modelo/gerar.mjs.\n` +
  `campos(chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, ordem, ajuda) AS (VALUES\n` +
  linhasSql.join(',\n') + '\n)\n');

writeFileSync(join(AQUI, 'gerado/acoes.sql'),
  `-- NÃO EDITE À MÃO. Gerado por modelo/gerar.mjs.\n` +
  `acoes(valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem) AS (VALUES\n` +
  modelo.acoes.map((a, i) => `  (${sql(a.valor)},${sql(a.cor)},${a.exige_justificativa},${a.exige_destino},${a.considera_desligamento},${(i + 1) * 10})`).join(',\n') +
  '\n)\n');

/* ------------- cabeçalho da planilha-modelo (ordem do arquivo) --------- */
writeFileSync(join(AQUI, 'gerado/cabecalho.json'), JSON.stringify(
  modelo.campos.filter((c) => c.coluna_planilha)
    .sort((a, b) => a.coluna_planilha - b.coluna_planilha)
    .map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo })), null, 2) + '\n');

console.log('gerado:');
console.log('  portal-local/servidor/campos-padrao.mjs  —', modelo.campos.length, 'campos');
console.log('  modelo/gerado/campos.sql                 —', linhasSql.length, 'linhas');
console.log('  modelo/gerado/acoes.sql                  —', modelo.acoes.length, 'ações');
console.log('  modelo/gerado/cabecalho.json             —', modelo.campos.filter((c) => c.coluna_planilha).length, 'colunas da planilha');
