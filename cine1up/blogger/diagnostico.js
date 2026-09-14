/* ============================================================
   CINE 1UP — blogger/diagnostico.js
   Gera três temas de teste, do mais simples ao completo. Você sobe
   um por vez no Blogger e vê onde para de funcionar. Isso diz qual
   é a causa do erro, em vez de a gente ficar chutando.

     diag-1-esqueleto.xml   tema mínimo, sem CSS e sem JavaScript
     diag-2-css.xml         o mesmo + todo o CSS do projeto
     diag-3-css-js.xml      o mesmo + todo o JavaScript

   Como ler o resultado:

     · o 1 já falha  → o problema não é o nosso conteúdo; é a conta,
                       o navegador ou o arquivo chegando corrompido
     · o 1 passa e o 2 falha  → alguma coisa no CSS (ou o tamanho)
     · o 2 passa e o 3 falha  → alguma coisa no bloco de JavaScript
     · os três passam         → o problema está nas marcações do tema
                                completo, e aí eu sei onde procurar

   Uso:  node blogger/diagnostico.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');

const css = [
  'assets/css/base.css',
  'assets/css/effects.css',
  'assets/css/arcade.css'
].map(ler).join('\n\n');

const js = [
  'assets/js/art.js',
  'assets/js/lightning.js',
  'assets/js/maze.js',
  'assets/js/fx.js',
  'assets/js/ads.js',
  'assets/js/game.js',
  'assets/js/blogger.js'
].map(ler).join('\n\n');

/* Esqueleto: o mínimo que o Blogger exige para aceitar um tema. */
function tema({ comCSS, comJS, aviso }) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' class='v2' dir='ltr'
      xmlns='http://www.w3.org/1999/xhtml'
      xmlns:b='http://www.google.com/2005/gml/b'
      xmlns:data='http://www.google.com/2005/gml/data'
      xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta content='width=device-width, initial-scale=1' name='viewport'/>
  <b:include data='blog' name='all-head-content'/>
  <title><data:blog.pageTitle/></title>
  <b:skin><![CDATA[
body { background: #0e0619; color: #fff6e8; font-family: system-ui, sans-serif; }
.aviso-diagnostico { padding: 18px 22px; margin: 20px; border: 2px solid #ffd60a;
  border-radius: 8px; background: rgba(255,214,10,.08); color: #ffd60a;
  font: 15px/1.6 system-ui, sans-serif; }
${comCSS ? css : ''}
  ]]></b:skin>
</head>

<body>

<div class='aviso-diagnostico'>
  <b>Teste ${aviso}</b><br/>
  Se você está lendo isto, este arquivo subiu sem erro.
</div>

<b:section class='principal' id='principal' showaddelement='no'>
  <b:widget id='Blog1' locked='true' title='Matérias' type='Blog'>
    <b:includable id='main'>
      <b:loop values='data:posts' var='post'>
        <div style='padding:20px'>
          <h2><data:post.title/></h2>
          <div class='post-body'><data:post.body/></div>
        </div>
      </b:loop>
    </b:includable>
  </b:widget>
</b:section>
${comJS ? `
<script type='text/javascript'>
//<![CDATA[
window.CINE1UP = { ADSENSE: { cliente: '', slots: {}, semAnuncioEm: [] }, SECOES: [] };

${js}
//]]>
</script>` : ''}

</body>
</html>
`;
}

const testes = [
  ['diag-1-esqueleto.xml', { comCSS: false, comJS: false, aviso: '1 de 3 — esqueleto, sem CSS e sem JavaScript' }],
  ['diag-2-css.xml',       { comCSS: true,  comJS: false, aviso: '2 de 3 — com todo o CSS' }],
  ['diag-3-css-js.xml',    { comCSS: true,  comJS: true,  aviso: '3 de 3 — com CSS e JavaScript' }]
];

const pasta = path.join(__dirname, 'diagnostico');
fs.mkdirSync(pasta, { recursive: true });

testes.forEach(([nome, opcoes]) => {
  const conteudo = tema(opcoes);
  fs.writeFileSync(path.join(pasta, nome), conteudo, 'utf8');
  console.log(`${nome.padEnd(22)} ${(conteudo.length / 1024).toFixed(1)} KB`);
});

fs.writeFileSync(path.join(pasta, 'LEIA-ME.txt'), `TESTE DE DIAGNÓSTICO — tema do Blogger

Suba um arquivo por vez, na ordem, em:
  Blogger -> Tema -> seta ao lado de Personalizar -> Restaurar -> Fazer upload

Depois de cada um, anote: subiu ou deu erro?

  1) diag-1-esqueleto.xml
  2) diag-2-css.xml
  3) diag-3-css-js.xml

O QUE O RESULTADO SIGNIFICA

  o 1 ja da erro
    O problema nao esta no conteudo do tema. Pode ser a conta, o
    navegador, ou o arquivo chegando corrompido no download.
    Tente por outro navegador ou baixe o arquivo de novo.

  o 1 sobe e o 2 da erro
    O problema esta no CSS (provavelmente tamanho ou alguma regra).

  o 2 sobe e o 3 da erro
    O problema esta no bloco de JavaScript.

  os tres sobem, mas o tema-cine1up.xml da erro
    O problema esta nas marcacoes do tema completo.

EM QUALQUER CASO, me mande:
  - qual numero falhou
  - um print da tela de erro (a mensagem inteira)

Com isso eu corrijo direto, sem ficar tentando as cegas.
`, 'utf8');

console.log('\nLEIA-ME.txt gerado na pasta diagnostico/');
