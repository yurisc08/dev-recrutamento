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
 * Todo mundo entra com um código — não existe usuário e senha em lugar nenhum.
 * O prefixo diz para que serve, o que ajuda quem administra:
 *
 *   DC-  responsável pelo preenchimento (vem junto com o cargo)
 *   AP-  aprovador
 *   CR-  Carreira & Recompensa (acesso administrativo)
 *
 * Os códigos são sorteados, nunca sequenciais, com alfabeto sem caracteres
 * ambíguos (0/O, 1/I) para poderem ser ditados por telefone sem erro.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PREFIX = { manager: 'DC', approver: 'AP', hr: 'CR' };

function newAccessCode(randomInt, role) {
  const pick = n => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${CODE_PREFIX[role] || 'DC'}-${pick(4)}-${pick(4)}`;
}

/*
 * Compara códigos pelo que a pessoa quis digitar, não pelo que digitou:
 * ignora maiúsculas, espaços, hífens e pontos. Assim "cr 00001", "CR-00001" e
 * "cr00001" abrem a mesma porta — evita o suporte de "meu código não entra".
 */
function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sameCode(a, b) {
  const left = normalizeCode(a);
  return Boolean(left) && left === normalizeCode(b);
}

/* ------------------------------- Visibilidade ---------------------------- */
function visibleTo(jobs, session) {
  if (session.role === 'manager') return jobs.filter(j => sameCode(j.code, session.code));
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
    from: ['approved', 'canceled'],
    role: 'hr',
    to: 'editing',
    log: 'Reaberto para preenchimento por Carreira & Recompensa',
    requiresComment: true
  },
  cancel: {
    from: ['editing', 'returned', 'manager_review', 'hr_review', 'approved'],
    role: 'hr',
    to: 'canceled',
    log: 'Cargo cancelado',
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

return {
  entry, comment, normalizeJob,
  newAccessCode, normalizeCode, sameCode, CODE_PREFIX,
  visibleTo, isPending,
  TRANSITIONS, applyTransition, applyFields
};

});
