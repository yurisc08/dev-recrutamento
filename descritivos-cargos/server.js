/*
 * server.js
 * -----------------------------------------------------------------------------
 * Servidor local da ferramenta de Descritivos de Cargos.
 *
 *   node server.js            -> http://localhost:3000
 *   PORT=8080 node server.js  -> outra porta
 *
 * Sem dependências: usa apenas os módulos nativos do Node (>= 18).
 * Os dados ficam em data/db.json, no computador que roda o servidor — é isso
 * que permite ao gestor abrir a ferramenta de outra máquina e enxergar o
 * cargo que C&R criou.
 *
 * As regras do fluxo NÃO são decididas aqui: vêm de shared/flow.js, o mesmo
 * arquivo que o navegador carrega. Aqui é onde elas são aplicadas de verdade.
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const Model = require('./shared/model.js');
const Flow = require('./shared/flow.js');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/* ============================ Banco em arquivo =========================== */
function seed() {
  const today = Model.isoToday();
  return {
    users: [
      { email: 'rh@empresa.com',        password: 'Rh@2026!', name: 'Carreira & Recompensa', role: 'hr' },
      { email: 'aprovador@empresa.com', password: 'Ap@2026!', name: 'Aprovador Demonstração', role: 'approver' }
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

function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.jobs = (db.jobs || []).map(Flow.normalizeJob);
    return db;
  } catch {
    return seed();
  }
}

let db = loadDB();

/* Escrita atômica: grava num temporário e renomeia, para não corromper o
 * arquivo se o processo cair no meio da gravação. */
let writing = Promise.resolve();
function persist() {
  writing = writing.then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
    await fsp.rename(tmp, DB_FILE);
  }).catch(err => console.error('Falha ao gravar o banco:', err));
  return writing;
}

if (!fs.existsSync(DB_FILE)) persist();

/* ================================ Sessões =============================== */
/* Em memória: reiniciar o servidor apenas obriga a entrar de novo. */
const sessions = new Map();

function openSession(data) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, data);
  return token;
}

function sessionOf(req) {
  const token = req.headers['x-session'];
  return token ? sessions.get(token) : null;
}

/* ============================== Utilidades ============================== */
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}
const ok = (res, body = {}) => send(res, 200, { ok: true, ...body });
const fail = (res, status, error) => send(res, status, { ok: false, error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Corpo da requisição muito grande'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const randomInt = max => crypto.randomInt(max);

/* Jobs que a sessão enxerga, já filtrados pela regra do fluxo. */
const visible = session => Flow.visibleTo(db.jobs, session);
const findVisible = (session, id) => visible(session).find(j => String(j.id) === String(id));

/* =============================== Estáticos ============================== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* Só serve a pasta pública, e nunca o banco. */
const PUBLIC_DIRS = ['assets', 'shared'];

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);

  const allowed = file === path.join(ROOT, 'index.html') ||
    PUBLIC_DIRS.some(dir => file.startsWith(path.join(ROOT, dir) + path.sep));
  if (!allowed) return fail(res, 404, 'Não encontrado');

  try {
    const content = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    fail(res, 404, 'Não encontrado');
  }
}

/* ================================== API ================================= */
async function handleApi(req, res, pathname) {
  const body = req.method === 'GET' ? {} : await readBody(req);

  /* ---------------------------- Autenticação --------------------------- */
  if (pathname === '/api/login/code' && req.method === 'POST') {
    const code = String(body.code || '').trim().toUpperCase();
    const jobs = db.jobs.filter(j => j.code === code);
    if (!jobs.length) return fail(res, 401, 'Código não encontrado');
    const session = { role: 'manager', name: jobs[0].manager, code };
    return ok(res, { token: openSession(session), session });
  }

  if (pathname === '/api/login/internal' && req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = db.users.find(u => u.email === email && u.password === body.password);
    if (!user) return fail(res, 401, 'E-mail ou senha inválidos');
    const session = { role: user.role, name: user.name, email: user.email };
    return ok(res, { token: openSession(session), session });
  }

  /* Daqui em diante, tudo exige sessão. */
  const session = sessionOf(req);
  if (!session) return fail(res, 401, 'Sessão expirada. Entre novamente.');

  if (pathname === '/api/logout' && req.method === 'POST') {
    sessions.delete(req.headers['x-session']);
    return ok(res);
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    return ok(res, { jobs: visible(session) });
  }

  if (pathname === '/api/jobs' && req.method === 'POST') {
    if (session.role !== 'hr') return fail(res, 403, 'Apenas C&R pode criar cargos');

    const data = body.job || {};
    const required = [...Model.FLOW_FIELDS, ...Model.fieldsOf('hr').filter(f => f.key !== 'reviewDate')];
    const missing = required.filter(f => !String(data[f.key] || '').trim()).map(f => f.label);
    if (missing.length) return fail(res, 400, 'Preencha: ' + missing.join(', '));

    // Um mesmo responsável mantém um único código, para todos os seus cargos.
    const email = String(data.managerEmail).toLowerCase();
    const existing = db.jobs.find(j => String(j.managerEmail).toLowerCase() === email);
    const code = existing ? existing.code : Flow.newAccessCode(randomInt);

    const job = Flow.normalizeJob({
      ...data,
      id: crypto.randomUUID(),
      code,
      status: 'editing',
      creationDate: data.creationDate || Model.isoToday(),
      history: [Flow.entry('Cargo criado e código de acesso enviado ao responsável', session.name, session.role)],
      comments: []
    });

    db.jobs.push(job);
    await persist();
    return ok(res, { job });
  }

  const fieldsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/fields$/);
  if (fieldsMatch && req.method === 'PATCH') {
    const job = findVisible(session, fieldsMatch[1]);
    if (!job) return fail(res, 404, 'Cargo não encontrado');
    const result = Flow.applyFields(job, session, body.fields || {});
    if (!result.ok) return fail(res, 403, result.error);
    await persist();
    return ok(res, { job });
  }

  const transitionMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/transition$/);
  if (transitionMatch && req.method === 'POST') {
    const job = findVisible(session, transitionMatch[1]);
    if (!job) return fail(res, 404, 'Cargo não encontrado');

    // Um envio pode trazer as últimas edições junto, para não perder o que
    // está na tela caso o usuário não tenha salvo o rascunho antes.
    if (body.fields) {
      const saved = Flow.applyFields(job, session, body.fields);
      if (!saved.ok) return fail(res, 403, saved.error);
    }

    const result = Flow.applyTransition(job, body.action, session, body.text);
    if (!result.ok) return fail(res, 400, result.error);
    await persist();
    return ok(res, { job });
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    if (session.role !== 'hr') return fail(res, 403, 'Apenas C&R pode restaurar os dados');
    db = seed();
    await persist();
    return ok(res);
  }

  return fail(res, 404, 'Rota não encontrada');
}

/* ================================ Servidor ============================== */
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET') return fail(res, 405, 'Método não permitido');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    fail(res, 500, 'Erro interno do servidor');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Descritivos de Cargos rodando em http://localhost:${PORT}`);
  console.log(`Na rede local, use o IP desta máquina: http://<ip-da-maquina>:${PORT}`);
  console.log(`Dados em ${DB_FILE}`);
});
