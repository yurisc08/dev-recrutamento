/* Preenche o modelo oficial e confere o resultado marcador a marcador. */
import { replaceDocxMarkers } from './pure.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const TMP = '/tmp/docxtest';

execSync(`rm -rf ${TMP} && mkdir -p ${TMP} && cd ${TMP} && unzip -qo "${RAIZ}/modelo-cargo-individual.docx"`);
const original = fs.readFileSync(`${TMP}/word/document.xml`, 'utf8');

const map = {
  EMPRESA: 'MARCOPOLO S A', COD_DO_CARGO: '120', NOME_COMPLETO: 'PROGRAMADOR SISTEMAS',
  CBO: '317110', TCLC_DESC: 'TECNICOS', DT_ATIVACAO: '01/01/2020',
  TEXTO_RESULTADO_ESPERADO: 'UTILIZA PROCEDIMENTOS EXISTENTES.',
  ATIV_DESC: 'PRESERVAR & DEFENDER <interesses>',
  DESCRICAO_CARGO: 'ACOMPANHAR AS ASSESSORIAS;\nCONTROLAR PROCESSOS;',
  SKILL_30: 'ENSINO SUPERIOR COMPLETO', SKILL_31: 'POS-GRADUACAO',
  SKILL_32: 'INGLES BASICO', SKILL_33: 'ESPANHOL BASICO',
  SKILL_34: 'PACOTE OFFICE', SKILL_35: 'COMPLIANCE',
  SKILL_36: '0 A 2 ANOS', SKILL_37: 'AGILIDADE PARA APRENDIZAGEM',
};
const saida = replaceDocxMarkers(original, map);
fs.writeFileSync(`${TMP}/word/document.xml`, saida);
execSync(`cd ${TMP} && zip -qr /tmp/docxtest-saida.docx . -x ".*"`);

let bad = 0;
const check = (n, c, extra) => { console.log((c ? '  ok  ' : '  FAIL ') + n + (c ? '' : ' :: ' + extra)); if (!c) { bad++; process.exitCode = 1; } };

const restantes = [...saida.matchAll(/«([^»]{1,40})»/g)].map((m) => m[1]);
check('nenhum marcador sobrou', restantes.length === 0, restantes.join(','));
check('quebras de linha viraram <w:br/>', (saida.match(/<w:br\/>/g) || []).length > (original.match(/<w:br\/>/g) || []).length);
check('& e < > escapados', saida.includes('PRESERVAR &amp; DEFENDER &lt;interesses&gt;'));
check('tags w:t balanceadas', (saida.match(/<w:t[ >]/g) || []).length === (saida.match(/<\/w:t>/g) || []).length);

/* Cada valor tem de cair na celula certa: conferimos a ordem em que os
   textos aparecem no documento contra a ordem dos rotulos do modelo. */
const semPr = saida.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, '');
const textos = [...semPr.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
  .map((p) => [...p[0].matchAll(/<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('').trim())
  .filter(Boolean);
const pos = (t) => textos.findIndex((x) => x.includes(t));
check('SKILL_30 vem logo apos FORMACAO/ESCOLARIDADE', pos('ENSINO SUPERIOR COMPLETO') > pos('FORMAÇÃO/ESCOLARIDADE'));
check('SKILL_30 antes de SKILL_31', pos('ENSINO SUPERIOR COMPLETO') < pos('POS-GRADUACAO'));
check('idiomas na secao IDIOMA', pos('INGLES BASICO') > pos('IDIOMA') && pos('INGLES BASICO') < pos('ESPANHOL BASICO'));
check('tecnicas apos COMPETENCIAS TECNICAS', pos('PACOTE OFFICE') > pos('COMPETÊNCIAS TÉCNICAS'));
check('missao logo apos MISSAO', pos('PRESERVAR') === pos('MISSÃO') + 1);

console.log(bad ? `\n${bad} falha(s)` : '\nDOCX gerado corretamente -> /tmp/docxtest-saida.docx');
