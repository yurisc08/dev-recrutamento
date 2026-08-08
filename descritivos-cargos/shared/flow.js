/*
 * shared/flow.js
 * -----------------------------------------------------------------------------
 * Regras do fluxo: quem enxerga o quê, quem pode escrever em qual campo e
 * quais transições de etapa são permitidas.
 *
 * Este arquivo é a autoridade do fluxo e roda NO SERVIDOR. O navegador também
 * o carrega, mas apenas para exibir a interface — nenhuma decisão depende do
 * que o cliente envia.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    const api = factory(root.Model);
    root.Flow = api;
    Object.assign(root, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model) {

const { STAGES, fieldsOf, missingFields, canEdit, blankJob, isoToday } = Model;

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

/* ---------------------------- Código de acesso --------------------------- */
/*
 * O código é a única credencial do responsável, então é sorteado — não
 * sequencial. Alfabeto sem caracteres ambíguos (0/O, 1/I) para ser ditado por
 * telefone sem erro.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newAccessCode(randomInt) {
  const pick = n => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `DC-${pick(4)}-${pick(4)}`;
}

/* ------------------------------- Visibilidade ---------------------------- */
function visibleTo(jobs, session) {
  if (session.role === 'manager') return jobs.filter(j => j.code === session.code);
  if (session.role === 'approver') return jobs.filter(j => j.approver === session.name);
  return jobs;
}

function isPending(job, role) {
  return STAGES[job.status].owner === role;
}

/* ------------------------------- Transições ------------------------------ */
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

/* Aplica a transição no objeto recebido. Devolve { ok, error }. */
function applyTransition(job, action, session, text) {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, error: 'Ação desconhecida' };
  if (!rule.from.includes(job.status)) return { ok: false, error: 'Ação indisponível nesta etapa' };
  if (rule.role && rule.role !== session.role) return { ok: false, error: 'Sem permissão para esta ação' };
  if (!rule.role && STAGES[job.status].owner !== session.role) return { ok: false, error: 'Sem permissão para esta ação' };

  const note = String(text || '').trim();
  if (rule.requiresComment && !note) return { ok: false, error: 'Informe o motivo' };

  // Validação de conteúdo antes de avançar no fluxo.
  if (action === 'submit') {
    const missing = missingFields(job, 'manager');
    if (missing.length) return { ok: false, error: 'Preencha: ' + missing.map(f => f.label).join(', ') };
  }
  if (action === 'validate') {
    const missing = [...missingFields(job, 'hr'), ...missingFields(job, 'manager')];
    if (missing.length) return { ok: false, error: 'Campos pendentes: ' + missing.map(f => f.label).join(', ') };
  }

  job.status = rule.to;
  if (action === 'validate') job.reviewDate = isoToday();
  job.history.push(entry(rule.log + (note ? ': ' + note : ''), session.name, session.role));
  if (note) job.comments.push(comment(note, session.name, session.role));

  return { ok: true };
}

/* Escreve apenas os campos que pertencem ao papel, e só se a etapa permitir. */
function applyFields(job, session, values) {
  if (!canEdit(job, session.role)) return { ok: false, error: 'Edição bloqueada nesta etapa' };
  fieldsOf(session.role).forEach(f => {
    if (Object.prototype.hasOwnProperty.call(values, f.key)) job[f.key] = String(values[f.key] ?? '');
  });
  return { ok: true };
}

return { entry, comment, normalizeJob, newAccessCode, visibleTo, isPending, TRANSITIONS, applyTransition, applyFields };

});
