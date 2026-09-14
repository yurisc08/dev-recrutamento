/* ============================================================
   CINE 1UP — blogger/validar.js
   Confere o tema gerado contra as regras do Blogger que costumam
   derrubar o upload. Não substitui o Blogger (só ele valida de
   verdade), mas pega os erros conhecidos antes de você subir.

   Uso:  node blogger/build.js && node blogger/validar.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  arquivos.push(path.join(__dirname, 'tema-cine1up.xml'),
                path.join(__dirname, 'tema-cine1up-v3.xml'));
}

let falhou = false;
arquivos.forEach(a => { if (!checar(a)) falhou = true; });
process.exit(falhou ? 1 : 0);

function checar(arquivo) {
const s = fs.readFileSync(arquivo, 'utf8');

const erros = [];
const avisos = [];

/* Dentro de CDATA está o CSS e o JavaScript: o Blogger não
   interpreta nada ali. As checagens de campo e de expressão valem
   só para o markup, então o conteúdo dos CDATA sai fora. */
const markup = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

/* ---------- 1. XML bem formado ---------- */
try {
  const { DOMParser } = (() => { try { return require('@xmldom/xmldom'); } catch (_) { return {}; } })();
  if (!DOMParser) {
    // sem dependência externa: checagem simples de fechamento
    const abre = (s.match(/<b:[a-z]+[^>]*[^/]>/g) || []).length;
    const fecha = (s.match(/<\/b:[a-z]+>/g) || []).length;
    if (abre !== fecha) erros.push(`tags b: abertas (${abre}) e fechadas (${fecha}) não batem`);
  }
} catch (e) { erros.push('XML inválido: ' + e.message); }

/* ---------- 2. Comentários XML não podem conter "--" ---------- */
(markup.match(/<!--[\s\S]*?-->/g) || []).forEach(c => {
  if (/--/.test(c.slice(4, -3))) erros.push('comentário XML com "--" dentro: ' + c.slice(0, 60));
});

/* ---------- 3. Blocos CDATA ---------- */
const aberturas = (s.match(/<!\[CDATA\[/g) || []).length;
const fechamentos = (s.match(/\]\]>/g) || []).length;
if (aberturas !== fechamentos) {
  erros.push(`CDATA desbalanceado: ${aberturas} aberturas, ${fechamentos} fechamentos`);
}

/* ---------- 4. Estrutura mínima exigida ---------- */
if (!/<b:section[^>]*>/.test(markup)) erros.push('falta pelo menos uma <b:section>');
if (!/type='Blog'/.test(markup)) erros.push("falta o widget type='Blog'");
if (/<b:widget(?![^>]*version=)/.test(markup)) {
  avisos.push("b:widget sem version='2' — normal no motor clássico; " +
              "se o Blogger reclamar disso, use a variante -v3.xml");
}
if (!/name='all-head-content'/.test(markup)) avisos.push("sem <b:include name='all-head-content'/>: o blog perde meta tags");

/* ---------- 5. IDs repetidos de section e widget ---------- */
const repetidos = (regex, rotulo) => {
  const ids = [...markup.matchAll(regex)].map(m => m[1]);
  const vistos = new Set(), dupes = new Set();
  ids.forEach(i => (vistos.has(i) ? dupes.add(i) : vistos.add(i)));
  dupes.forEach(d => erros.push(`${rotulo} com id repetido: ${d}`));
};
repetidos(/<b:section[^>]*id='([^']+)'/g, 'b:section');
repetidos(/<b:widget[^>]*id='([^']+)'/g, 'b:widget');

/* ---------- 6. Campos e expressões que o Blogger novo recusa ---------- */
const proibidos = [
  ['data:post.snippet', 'campo antigo; use o feed JSON'],
  ['data:post.firstImageUrl', 'campo antigo; use o feed JSON'],
  ['data:post.dateHeader', 'campo antigo; formate a data no JavaScript'],
  ['<data:post.author/>', 'em v2 o autor é um objeto, não texto'],
  ['.first.', 'acessor não suportado'],
  ['data:post.thumbnailUrl', 'campo antigo']
];
proibidos.forEach(([termo, motivo]) => {
  const n = markup.split(termo).length - 1;
  if (n) erros.push(`${termo} aparece ${n}x — ${motivo}`);
});

/* expr: com ternário, concatenação ou chamada de função */
[...markup.matchAll(/expr:[\w-]+='([^']*)'/g)].forEach(m => {
  const v = m[1];
  if (/[?]|\+|\(/.test(v)) erros.push(`expr: com expressão complexa: ${v.slice(0, 60)}`);
});

/* ---------- 7. As Páginas do Blogger precisam renderizar ---------- */
if (/data:post.body/.test(markup) && !/static_page/.test(markup)) {
  erros.push('o tema renderiza o conteúdo só em "item": as Páginas ' +
             '(como a do fliperama) sairiam vazias');
}

/* ---------- 8. Tamanho ---------- */
const kb = s.length / 1024;
if (kb > 900) erros.push(`tema com ${kb.toFixed(0)} KB — o Blogger costuma recusar acima de ~1 MB`);
else if (kb > 500) avisos.push(`tema com ${kb.toFixed(0)} KB: grande, mas dentro do limite`);

/* ---------- Resultado ---------- */
console.log(`\nValidando ${path.basename(arquivo)} (${kb.toFixed(1)} KB)`);

if (avisos.length) {
  avisos.forEach(a => console.log('  · aviso:', a));
}

if (erros.length) {
  console.log('  ERROS que o Blogger vai recusar:');
  erros.forEach(e => console.log('    ✗', e));
  console.log('');
  return false;
}

console.log('  ✔ nenhum problema conhecido\n');
return true;
}
