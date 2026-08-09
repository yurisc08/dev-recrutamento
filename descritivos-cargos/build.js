/*
 * build.js
 * -----------------------------------------------------------------------------
 * Gera o index.html da raiz: um arquivo único, com o CSS e todos os scripts
 * embutidos.
 *
 *   node build.js
 *
 * Por que arquivo único: assim o index.html funciona com um duplo clique, sem
 * servidor e sem depender de caminhos relativos (que quebram ao abrir de dentro
 * de um .zip). O mesmo arquivo é servido quando o servidor está no ar.
 *
 * O código de verdade continua em src/, assets/ e shared/ — edite lá e rode
 * este build de novo (o `npm start` já faz isso sozinho).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const TEMPLATE = path.join(ROOT, 'src', 'index.html');
const OUTPUT = path.join(ROOT, 'index.html');

/*
 * Com `node build.js --com-dados`, gera também um segundo arquivo com os dados
 * atuais embutidos: é o arquivo para enviar a alguém por e-mail ou Teams. Quem
 * abrir vê o modelo e os cargos como estão hoje, sem precisar de servidor.
 */
const COM_DADOS = process.argv.includes('--com-dados');
const SHARE_OUTPUT = path.join(ROOT, 'Descritivos-de-Cargos.html');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

/* A ordem importa: modelo e fluxo primeiro, interface por último. */
const SCRIPTS = [
  'shared/model.js',
  'shared/flow.js',
  'shared/seed.js',
  'assets/local-store.js',
  'assets/api.js',
  'assets/app.js'
];

const STYLES = ['assets/styles.css'];

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

/* Nenhum dos arquivos contém "</script>" em texto, mas se um dia contiver, o
 * navegador fecharia a tag no lugar errado — então protegemos aqui. */
const guard = code => code.replace(/<\/script>/gi, '<\\/script>');

/* Lê o banco atual e devolve um bloco <script> com os dados, sem nada sigiloso.
 * A senha do SMTP fica de fora: ela não pode viajar dentro de um arquivo. */
function embedData() {
  let db;
  try {
    db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
  } catch {
    console.log('Sem data/db.json — o arquivo compartilhável sai com os dados de demonstração.');
    return '';
  }

  let config = {};
  try {
    const { smtp, ...resto } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8'));
    config = { ...resto, notificationsEnabled: false, remindersEnabled: false };
  } catch { /* sem config, tudo bem */ }

  const seed = { jobs: db.jobs || [], keys: db.keys || [], model: db.model, config };
  return `<script>window.DC_SEED = ${JSON.stringify(seed).replace(/</g, '\\u003c')};</script>`;
}

function build() {
  const styles = STYLES.map(file => `<style>\n/* ${file} */\n${read(file)}\n</style>`).join('\n');
  const scripts = SCRIPTS.map(file => `<script>\n/* ${file} */\n${guard(read(file))}\n</script>`).join('\n');

  // As substituições usam função de propósito: com string, o `replace` trataria
  // "$$", "$&" e afins como referências e corromperia o código embutido.
  const html = read('src/index.html')
    .replace('<!--ESTILOS-->', () => styles)
    .replace('<!--SCRIPTS-->', () => scripts);

  fs.writeFileSync(OUTPUT, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`index.html gerado (${kb} KB, ${SCRIPTS.length + STYLES.length} arquivos embutidos)`);

  if (!COM_DADOS) return;

  const dados = embedData();
  const comDados = html.replace('<script>\n/* shared/model.js */', () => dados + '\n<script>\n/* shared/model.js */');
  fs.writeFileSync(SHARE_OUTPUT, comDados);

  const kbShare = (Buffer.byteLength(comDados) / 1024).toFixed(0);
  console.log(`Descritivos-de-Cargos.html gerado (${kbShare} KB) — arquivo único para compartilhar.`);
}

build();
