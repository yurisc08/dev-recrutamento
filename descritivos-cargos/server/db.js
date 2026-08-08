/*
 * server/db.js
 * -----------------------------------------------------------------------------
 * Banco em arquivo (data/db.json) e configurações (data/config.json).
 *
 * A gravação é atômica — escreve num temporário e renomeia — e serializada,
 * para que duas requisições simultâneas nunca se sobreponham no arquivo.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const crypto = require('node:crypto');

const Model = require('../shared/model.js');
const Flow = require('../shared/flow.js');
const seedData = require('../shared/seed.js');

const ROOT = path.join(__dirname, '..');

/* Onde os dados são gravados. A variável DATA_DIR permite apontar para um disco
 * persistente — necessário em plataformas de hospedagem cujo sistema de
 * arquivos é apagado a cada nova implantação. */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/* ============================= Dados iniciais ============================ */
/* Os dados de demonstração vêm de shared/seed.js, os mesmos do modo local. */
function seed() {
  return { keys: seedData.seedKeys(), jobs: seedData.seedJobs(), model: Model.DEFAULT_SECTIONS };
}

function defaultConfig() {
  return {
    appUrl: '',                 // endereço que aparece nos e-mails
    notificationsEnabled: true, // avisos automáticos do fluxo
    remindersEnabled: true,     // cobrança de prazo
    reminderDaysBefore: 3,      // começa a cobrar a N dias do prazo
    smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
  };
}

/* ================================ Estado ================================= */
function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback();
  }
}

/* Mantém chaves novas ao ler um config gravado por uma versão anterior. */
function mergeConfig(stored) {
  const base = defaultConfig();
  return { ...base, ...stored, smtp: { ...base.smtp, ...(stored.smtp || {}) } };
}

let db = load(DB_FILE, seed);
let config = mergeConfig(load(CONFIG_FILE, defaultConfig));

function normalize() {
  /* O modelo entra em vigor antes de qualquer outra coisa: normalizar cargos
   * depende de saber quais campos existem. */
  const applied = db.model ? Model.setSections(db.model) : { ok: false };
  if (!applied.ok) {
    Model.resetSections();
    db.model = Model.sections();
  }

  db.jobs = (db.jobs || []).map(Flow.normalizeJob);
  db.keys = db.keys || [];

  /* Bancos da versão com e-mail e senha viram códigos de acesso, preservando
   * nome e papel de cada pessoa. O código novo aparece em "Códigos de acesso". */
  if (db.users && db.users.length) {
    const criados = [];

    db.users.forEach(user => {
      if (db.keys.some(k => k.name === user.name && k.role === user.role)) return;
      const key = {
        code: Flow.newAccessCode(max => crypto.randomInt(max), user.role),
        name: user.name,
        role: user.role,
        email: user.email || '',
        createdAt: new Date().toISOString(),
        lastUsedAt: ''
      };
      db.keys.push(key);
      criados.push(key);
    });

    delete db.users;
    persist();

    /* Os códigos são sorteados, então precisam aparecer em algum lugar na
     * primeira subida — senão ninguém consegue entrar depois da atualização. */
    if (criados.length) {
      console.log('\nUsuários da versão anterior viraram códigos de acesso:');
      criados.forEach(k => console.log(`  ${k.code}  ${k.name} (${k.role === 'hr' ? 'C&R' : 'aprovador'})`));
      console.log('');
    }
  }
}

/* =============================== Gravação ================================ */
let queue = Promise.resolve();

function writeFile(file, content) {
  queue = queue.then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(content, null, 2));
    await fsp.rename(tmp, file);
  }).catch(err => console.error(`Falha ao gravar ${path.basename(file)}:`, err.message));
  return queue;
}

const persist = () => writeFile(DB_FILE, db);
const persistConfig = () => writeFile(CONFIG_FILE, config);

/* Depois de persist() existir: a migração de bancos antigos precisa gravar. */
normalize();

if (!fs.existsSync(DB_FILE)) persist();
if (!fs.existsSync(CONFIG_FILE)) persistConfig();

/* ================================ Acesso ================================= */
module.exports = {
  DATA_DIR,
  DB_FILE,

  get jobs() { return db.jobs; },
  get keys() { return db.keys; },
  get model() { return db.model; },

  /* Troca o modelo do descritivo. Aplica primeiro, grava depois. */
  setModel(sections) {
    const applied = Model.setSections(sections);
    if (!applied.ok) return applied;
    db.model = Model.sections();
    return { ok: true };
  },

  resetModel() {
    Model.resetSections();
    db.model = Model.sections();
    return { ok: true };
  },
  get config() { return config; },

  persist,
  persistConfig,

  findJob(id) {
    return db.jobs.find(j => String(j.id) === String(id));
  },

  /* Aceita o código como a pessoa digitou: sem hífen, minúsculo, com espaços. */
  findKey(code) {
    return db.keys.find(k => Flow.sameCode(k.code, code));
  },

  addJob(job) {
    db.jobs.push(job);
    return job;
  },

  addKey(key) {
    db.keys.push(key);
    return key;
  },

  removeKey(code) {
    const index = db.keys.findIndex(k => Flow.sameCode(k.code, code));
    if (index < 0) return false;
    db.keys.splice(index, 1);
    return true;
  },

  updateConfig(patch) {
    config = mergeConfig({ ...config, ...patch, smtp: { ...config.smtp, ...(patch.smtp || {}) } });
    return config;
  },

  reset() {
    db = seed();
    normalize();
    return persist();
  }
};
