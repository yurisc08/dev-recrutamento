/**
 * Junta as migrações num arquivo só: portal-supabase.sql.
 * É o arquivo que se cola no SQL Editor do Supabase, de uma vez.
 *
 *   node portal-cloudflare/supabase/montar.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const partes = readdirSync(AQUI).filter((f) => /^\d\d-.*\.sql$/.test(f)).sort();

const cabecalho = `-- =====================================================================
-- Portal de Decisões — Supabase (PostgreSQL)
--
-- ARQUIVO ÚNICO. Cole tudo no SQL Editor do Supabase e rode uma vez.
-- Pode rodar de novo sem medo: nada é duplicado e nada é apagado.
--
-- ANTES DE RODAR: troque TROQUE_ESTA_SENHA (aparece uma vez, no papel
-- portal_app) por uma senha longa e aleatória, e guarde-a — ela vai na
-- string de conexão que o Worker usa.
--
-- Gerado por portal-cloudflare/supabase/montar.mjs a partir de:
${partes.map((f) => `--   ${f}`).join('\n')}
-- NÃO EDITE ESTE ARQUIVO À MÃO: edite as partes e gere de novo.
-- =====================================================================

`;

const corpo = partes.map((f) => {
  const texto = readFileSync(join(AQUI, f), 'utf8').trimEnd();
  return `\n-- ###################################################################\n` +
         `-- ${f}\n` +
         `-- ###################################################################\n\n${texto}\n`;
}).join('\n');

const destino = join(AQUI, 'portal-supabase.sql');
writeFileSync(destino, cabecalho + corpo);
const linhas = (cabecalho + corpo).split('\n').length;
console.log('gerado:', destino);
console.log('  partes:', partes.join(', '));
console.log('  linhas:', linhas);
