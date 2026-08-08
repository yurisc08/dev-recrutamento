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

const Flow = require('../shared/flow.js');
const seedData = require('../shared/seed.js');
const auth = require('./auth.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/* ============================= Dados iniciais ============================ */
/* Os dados de demonstração vêm de shared/seed.js, os mesmos do modo local.
 * Aqui as senhas viram hash antes de tocar o disco. */
function seed() {
  return {
    users: seedData.seedUsers().map(({ password, ...user }) => ({
      ...user,
      passwordHash: auth.hashPassword(password)
    })),
    jobs: seedData.seedJobs()
  };
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
  db.jobs = (db.jobs || []).map(Flow.normalizeJob);
  db.users = db.users || [];
}
normalize();

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

if (!fs.existsSync(DB_FILE)) persist();
if (!fs.existsSync(CONFIG_FILE)) persistConfig();

/* ================================ Acesso ================================= */
module.exports = {
  DATA_DIR,
  DB_FILE,

  get jobs() { return db.jobs; },
  get users() { return db.users; },
  get config() { return config; },

  persist,
  persistConfig,

  findJob(id) {
    return db.jobs.find(j => String(j.id) === String(id));
  },

  findUser(email) {
    const wanted = String(email || '').trim().toLowerCase();
    return db.users.find(u => u.email.toLowerCase() === wanted);
  },

  addJob(job) {
    db.jobs.push(job);
    return job;
  },

  addUser(user) {
    db.users.push(user);
    return user;
  },

  removeUser(email) {
    const wanted = String(email || '').trim().toLowerCase();
    const index = db.users.findIndex(u => u.email.toLowerCase() === wanted);
    if (index < 0) return false;
    db.users.splice(index, 1);
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
