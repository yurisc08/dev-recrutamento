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

const Model = require('../shared/model.js');
const Flow = require('../shared/flow.js');
const auth = require('./auth.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/* ============================= Dados iniciais ============================ */
function seed() {
  const today = Model.isoToday();
  return {
    users: [
      { email: 'rh@empresa.com',        name: 'Carreira & Recompensa', role: 'hr',       passwordHash: auth.hashPassword('Rh@2026!') },
      { email: 'aprovador@empresa.com', name: 'Aprovador Demonstração', role: 'approver', passwordHash: auth.hashPassword('Ap@2026!') }
    ],
    jobs: [
      Flow.normalizeJob({
        id: 1,
        code: 'DC-00001',
        jobCode: 'AN-0421',
        name: 'Analista de Dados e BI',
        company: 'Empresa Exemplo',
        cbo: '2124-05',
        track: 'Especialista',
        creationDate: today,
        manager: 'Gestor Demonstração',
        managerEmail: 'gestor@empresa.com',
        approver: 'Aprovador Demonstração',
        deadline: Model.addDays(today, 12),
        status: 'editing',
        educationMin: 'Superior completo em Estatística, Sistemas de Informação ou correlatos',
        educationDesired: 'Pós-graduação em Análise de Dados',
        behavioral: 'Trabalho em equipe\nOrientação a resultados\nComunicação assertiva',
        history: [Flow.entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr')]
      }),
      Flow.normalizeJob({
        id: 2,
        code: 'DC-00001',
        jobCode: 'ES-0118',
        name: 'Especialista de Processos',
        company: 'Empresa Exemplo',
        cbo: '2521-05',
        track: 'Especialista',
        creationDate: today,
        manager: 'Gestor Demonstração',
        managerEmail: 'gestor@empresa.com',
        approver: 'Aprovador Demonstração',
        deadline: Model.addDays(today, 14),
        status: 'returned',
        educationMin: 'Superior completo em Engenharia ou Administração',
        educationDesired: 'Certificação Lean Six Sigma',
        behavioral: 'Visão sistêmica\nCapacidade analítica\nInfluência sem autoridade',
        focus: 'Melhoria contínua dos processos industriais.',
        mission: 'Promover a melhoria contínua dos processos, garantindo eficiência e padronização.',
        responsibilities: 'Mapear processos das áreas produtivas.',
        languageMin: 'Inglês intermediário',
        languageDesired: 'Espanhol básico',
        technicalMin: 'Mapeamento de processos (BPMN)',
        technicalDesired: 'Automação de processos',
        experienceMin: '3 anos em melhoria de processos',
        experienceDesired: '5 anos em ambiente industrial',
        history: [
          Flow.entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr'),
          Flow.entry('Enviado para aprovação', 'Gestor Demonstração', 'manager'),
          Flow.entry('Devolvido para correção: detalhar melhor as responsabilidades', 'Aprovador Demonstração', 'approver')
        ],
        comments: [Flow.comment('Detalhar melhor as responsabilidades, listando uma atividade por linha.', 'Aprovador Demonstração', 'approver')]
      })
    ]
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
let db = load(DB_FILE, seed);
let config = mergeConfig(load(CONFIG_FILE, defaultConfig));

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
