/*
 * store.js
 * -----------------------------------------------------------------------------
 * Persistência (localStorage) e regras de transição do fluxo.
 * Nenhuma função aqui toca no DOM.
 */

const STORAGE_KEY = 'descritivos_cargos_v2';

/* ------------------------------ Dados iniciais --------------------------- */
function seed() {
  const today = isoToday();
  return {
    sequence: 3,
    users: [
      { email: 'rh@empresa.com',        password: 'Rh@2026!', name: 'Carreira & Recompensa', role: 'hr' },
      { email: 'aprovador@empresa.com', password: 'Ap@2026!', name: 'Aprovador Demonstração', role: 'approver' }
    ],
    jobs: [
      normalizeJob({
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
        deadline: addDays(today, 12),
        status: 'editing',
        educationMin: 'Superior completo em Estatística, Sistemas de Informação ou correlatos',
        educationDesired: 'Pós-graduação em Análise de Dados',
        behavioral: 'Trabalho em equipe\nOrientação a resultados\nComunicação assertiva',
        history: [entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr')]
      }),
      normalizeJob({
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
        deadline: addDays(today, 14),
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
          entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr'),
          entry('Enviado para aprovação', 'Gestor Demonstração', 'manager'),
          entry('Devolvido para correção: detalhar melhor as responsabilidades', 'Aprovador Demonstração', 'approver')
        ],
        comments: [comment('Detalhar melhor as responsabilidades, listando uma atividade por linha.', 'Aprovador Demonstração', 'approver')]
      })
    ]
  };
}

/* --------------------------------- Datas --------------------------------- */
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
function daysLeft(iso) {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  const today = new Date(isoToday() + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

/* ------------------------- Registros de histórico ------------------------ */
function entry(text, author, role) {
  return { text, author, role, at: new Date().toISOString() };
}
function comment(text, author, role) {
  return { text, author, role, at: new Date().toISOString() };
}

/* ------------------------------ Normalização ----------------------------- */
function normalizeJob(job) {
  return Object.assign(
    blankJob(),
    { status: 'editing', history: [], comments: [], code: '', deadline: '', approver: '', manager: '', managerEmail: '' },
    job
  );
}

/* -------------------------------- Storage -------------------------------- */
function getDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const db = JSON.parse(raw);
    db.jobs = (db.jobs || []).map(normalizeJob);
    db.users = db.users || seed().users;
    db.sequence = db.sequence || db.jobs.length + 1;
    return db;
  } catch (e) {
    return seed();
  }
}
function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
function resetDB() {
  localStorage.removeItem(STORAGE_KEY);
  saveDB(seed());
}
function getJob(id) {
  return getDB().jobs.find(j => String(j.id) === String(id));
}
/* Aplica uma alteração em um cargo e persiste. */
function updateJob(id, mutator) {
  const db = getDB();
  const job = db.jobs.find(j => String(j.id) === String(id));
  if (!job) return null;
  mutator(job);
  saveDB(db);
  return job;
}

if (!localStorage.getItem(STORAGE_KEY)) saveDB(seed());

/* ------------------------------- Visibilidade ---------------------------- */
/* Cargos que o usuário logado enxerga. */
function visibleJobs(session) {
  const jobs = getDB().jobs;
  if (session.role === 'manager') return jobs.filter(j => j.code === session.code);
  if (session.role === 'approver') return jobs.filter(j => j.approver === session.name);
  return jobs;
}
/* Fila de pendências do papel. */
function pendingJobs(session) {
  return visibleJobs(session).filter(j => STAGES[j.status].owner === session.role);
}

/* ------------------------------- Transições ------------------------------ */
/*
 * Cada transição devolve { ok, error } e já grava histórico + comentário.
 * As regras de quem pode fazer o quê ficam concentradas aqui.
 */
const TRANSITIONS = {
  submit: {
    from: ['editing', 'returned'],
    role: 'manager',
    to: 'manager_review',
    log: 'Enviado para aprovação'
  },
  approve: {
    from: ['manager_review'],
    role: 'approver',
    to: 'hr_review',
    log: 'Aprovado pelo aprovador'
  },
  validate: {
    from: ['hr_review'],
    role: 'hr',
    to: 'approved',
    log: 'Validado e aprovado por Carreira & Recompensa'
  },
  return: {
    from: ['manager_review', 'hr_review'],
    role: null, // aprovador ou C&R, conforme a etapa
    to: 'returned',
    log: 'Devolvido para correção',
    requiresComment: true
  },
  reopen: {
    from: ['approved'],
    role: 'hr',
    to: 'editing',
    log: 'Reaberto para revisão por Carreira & Recompensa',
    requiresComment: true
  }
};

function transition(id, action, session, text) {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, error: 'Ação desconhecida' };

  const job = getJob(id);
  if (!job) return { ok: false, error: 'Cargo não encontrado' };
  if (!rule.from.includes(job.status)) return { ok: false, error: 'Ação indisponível nesta etapa' };
  if (rule.role && rule.role !== session.role) return { ok: false, error: 'Sem permissão para esta ação' };
  if (!rule.role && STAGES[job.status].owner !== session.role) return { ok: false, error: 'Sem permissão para esta ação' };
  if (rule.requiresComment && !String(text || '').trim()) return { ok: false, error: 'Informe o motivo' };

  // Validação de conteúdo antes de avançar no fluxo.
  if (action === 'submit') {
    const missing = missingFields(job, 'manager');
    if (missing.length) return { ok: false, error: 'Preencha: ' + missing.map(f => f.label).join(', ') };
  }
  if (action === 'validate') {
    const missing = [...missingFields(job, 'hr'), ...missingFields(job, 'manager')];
    if (missing.length) return { ok: false, error: 'Campos pendentes: ' + missing.map(f => f.label).join(', ') };
  }

  updateJob(id, j => {
    j.status = rule.to;
    if (action === 'validate') j.reviewDate = isoToday();
    const note = String(text || '').trim();
    j.history.push(entry(rule.log + (note ? ': ' + note : ''), session.name, session.role));
    if (note) j.comments.push(comment(note, session.name, session.role));
  });

  return { ok: true };
}

/* Grava os campos editáveis do papel logado. */
function saveFields(id, session, values) {
  const editable = fieldsOf(session.role);
  const job = getJob(id);
  if (!job) return { ok: false, error: 'Cargo não encontrado' };
  if (!canEdit(job, session.role)) return { ok: false, error: 'Edição bloqueada nesta etapa' };

  updateJob(id, j => {
    editable.forEach(f => {
      if (Object.prototype.hasOwnProperty.call(values, f.key)) j[f.key] = values[f.key];
    });
  });
  return { ok: true };
}

/* Cria um cargo: gera código de acesso reaproveitando o do mesmo responsável. */
function createJob(data, session) {
  const db = getDB();
  const existing = db.jobs.find(j => j.managerEmail.toLowerCase() === String(data.managerEmail || '').toLowerCase());
  const code = existing ? existing.code : 'DC-' + String(db.sequence++).padStart(5, '0');

  const job = normalizeJob({
    ...data,
    id: Date.now(),
    code,
    status: 'editing',
    creationDate: data.creationDate || isoToday(),
    history: [entry('Cargo criado e código de acesso enviado ao responsável', session.name, session.role)],
    comments: []
  });

  db.jobs.push(job);
  saveDB(db);
  return job;
}
