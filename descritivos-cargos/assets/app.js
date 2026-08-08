/*
 * assets/app.js
 * -----------------------------------------------------------------------------
 * Interface: login, navegação por papel, formulário guiado pelo modelo, filas
 * de aprovação, administração e documento final.
 *
 * Todo dado vem de API.jobs (preenchido pelo servidor) e toda ação passa pela
 * API — a interface não decide permissão, apenas reflete o que o servidor
 * permite, escondendo o que não cabe ao papel.
 */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const state = { view: 'jobs', jobId: null };
const session = () => API.session;

/* ------------------------------ Datas (exibição) ------------------------- */
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function daysLeft(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date(isoToday() + 'T00:00:00')) / 86400000);
}

/* ------------------------------- Toast ----------------------------------- */
let toastTimer = null;
function toast(text, tone) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast' + (tone ? ' ' + tone : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hide'), 3600);
}

/* ------------------------------- Modal ----------------------------------- */
function openModal(html) {
  $('#modalContent').innerHTML = html;
  $('#modal').classList.remove('hide');
}
function closeModal() {
  $('#modal').classList.add('hide');
  $('#modalContent').innerHTML = '';
}
$('#closeModal').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* Caixa de justificativa (devolução, reabertura, restauração). */
function askText(title, label, onConfirm) {
  openModal(`
    <h2>${esc(title)}</h2>
    <div class="field">
      <label for="askInput">${esc(label)}</label>
      <textarea id="askInput" rows="4"></textarea>
    </div>
    <button class="btn primary full" data-modal-action="confirm">Confirmar</button>
  `);
  $('#askInput').focus();
  $('#modalContent').querySelector('[data-modal-action="confirm"]').onclick = () => {
    const value = $('#askInput').value.trim();
    if (!value) return toast('Escreva uma justificativa', 'error');
    closeModal();
    onConfirm(value);
  };
}

/* ================================ LOGIN ================================== */
$('#testCode').onclick      = () => { $('#accessCode').value = 'DC-00001'; toast('Código preenchido'); };
$('#showInternal').onclick  = () => { $('#managerLogin').classList.add('hide');  $('#internalLogin').classList.remove('hide'); };
$('#backToManager').onclick = () => { $('#internalLogin').classList.add('hide'); $('#managerLogin').classList.remove('hide'); };
$('#testHr').onclick        = () => { $('#email').value = 'rh@empresa.com';        $('#password').value = 'Rh@2026!'; };
$('#testApprover').onclick  = () => { $('#email').value = 'aprovador@empresa.com'; $('#password').value = 'Ap@2026!'; };

async function attemptLogin(button, promise, view) {
  button.disabled = true;
  try {
    await promise;
    await enter(view);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

$('#managerEnter').onclick = e => {
  const code = $('#accessCode').value.trim().toUpperCase();
  if (!code) return toast('Informe o código de acesso', 'error');
  attemptLogin(e.currentTarget, API.loginCode(code), 'jobs');
};

$('#internalEnter').onclick = e => {
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return toast('Informe e-mail e senha', 'error');
  attemptLogin(e.currentTarget, API.loginInternal(email, password), null);
};

$('#accessCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#managerEnter').click(); });
$('#password').addEventListener('keydown', e => { if (e.key === 'Enter') $('#internalEnter').click(); });

$('#logout').onclick = async () => {
  await API.logout();
  state.jobId = null;
  closeModal();
  ['#accessCode', '#email', '#password'].forEach(sel => $(sel).value = '');
  $('#internalLogin').classList.add('hide');
  $('#managerLogin').classList.remove('hide');
  $('#application').classList.add('hide');
  $('#login').classList.remove('hide');
};

/* ============================== NAVEGAÇÃO ================================ */
const NAV = {
  manager:  [{ view: 'jobs', label: 'Meus descritivos' }],
  approver: [{ view: 'approvals', label: 'Aprovações' }, { view: 'jobs', label: 'Cargos' }],
  hr:       [{ view: 'approvals', label: 'Validações' }, { view: 'jobs', label: 'Cargos' }, { view: 'admin', label: 'Administração' }]
};

const HOME = { manager: 'jobs', approver: 'approvals', hr: 'admin' };

async function enter(view) {
  await API.loadJobs();
  $('#login').classList.add('hide');
  $('#application').classList.remove('hide');

  const roleLabel = ROLES[session().role].label;
  $('#identity').innerHTML = `<b>${esc(session().name)}</b>` +
    (session().name === roleLabel ? '' : `<br><span class="muted">${roleLabel}</span>`);

  show(view || HOME[session().role]);
}

function renderNav() {
  const pending = API.pending().length;
  $('#nav').innerHTML = NAV[session().role].map(item => {
    const showsBadge = item.view === 'approvals' || (session().role === 'manager' && item.view === 'jobs');
    const badge = showsBadge && pending ? `<span class="pill">${pending}</span>` : '';
    return `<button data-view="${item.view}" class="${state.view === item.view ? 'active' : ''}">${item.label}${badge}</button>`;
  }).join('');
  $$('#nav [data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
}

function show(view, jobId) {
  state.view = view;
  if (jobId !== undefined) state.jobId = jobId;
  $('#topActions').innerHTML = '';
  renderNav();
  ({ jobs: jobsView, approvals: approvalsView, admin: adminView, job: jobView, document: documentView }[view] || jobsView)();
}

/* ----------------------------- Componentes ------------------------------- */
function badge(status) {
  const stage = STAGES[status];
  return `<span class="status ${stage.tone}">${stage.label}</span>`;
}

function deadlineTag(job) {
  if (job.status === 'approved' || !job.deadline) return '';
  const left = daysLeft(job.deadline);
  const tone = left < 0 ? 'late' : left <= 3 ? 'soon' : '';
  const text = left < 0 ? `Atrasado ${Math.abs(left)} dia(s)` : left === 0 ? 'Vence hoje' : `Faltam ${left} dia(s)`;
  return `<span class="tag ${tone}">${text} • prazo ${formatDate(job.deadline)}</span>`;
}

function progressBar(job) {
  const pct = completion(job, 'manager');
  return `<div class="progress" title="${pct}% do conteúdo do responsável preenchido"><span style="width:${pct}%"></span></div>`;
}

function jobCard(job, actions) {
  return `
    <article class="job">
      <div class="job-head">
        <div>
          <b>${esc(job.name)}</b>
          <p class="muted">${esc(job.company)} • ${esc(job.jobCode || 'sem código')} • responsável: ${esc(job.manager)}</p>
        </div>
        ${badge(job.status)}
      </div>
      <div class="job-meta">${deadlineTag(job)}</div>
      ${progressBar(job)}
      <div class="actions mt-sm">${actions}</div>
    </article>`;
}

/* ============================ VISÃO: CARGOS ============================== */
function jobsView() {
  const jobs = API.jobs;
  const pending = API.pending();

  $('#title').textContent = session().role === 'manager' ? 'Meus descritivos' : 'Cargos';
  $('#subtitle').textContent = `${jobs.length} cargo(s) • ${pending.length} aguardando você`;

  const banner = pending.length && session().role === 'manager'
    ? `<div class="banner">Você tem <b>${pending.length}</b> descritivo(s) aguardando preenchimento ou correção.</div>` : '';

  $('#content').innerHTML = banner + (jobs.length
    ? `<div class="cards">${jobs.map(j => jobCard(j, `
        <button class="btn primary" data-action="open" data-id="${j.id}">Abrir descritivo</button>
        ${j.status === 'approved' ? `<button class="btn outline" data-action="doc" data-id="${j.id}">Documento</button>` : ''}
      `)).join('')}</div>`
    : `<div class="card"><div class="body empty">Nenhum cargo atribuído a você.</div></div>`);
}

/* ========================= VISÃO: DETALHE DO CARGO ======================= */
function jobView() {
  const job = API.getJob(state.jobId);
  if (!job) return show('jobs');

  const role = session().role;
  const editable = canEdit(job, role);
  const stage = STAGES[job.status];

  $('#title').textContent = job.name;
  $('#subtitle').innerHTML = `${esc(job.company)} • ${esc(job.jobCode || '—')} • ${stage.label}`;
  $('#topActions').innerHTML = `<button class="btn outline" data-action="back">Voltar</button>`;

  const returnedNote = job.status === 'returned' && job.comments.length
    ? `<div class="banner warn"><b>Correção solicitada.</b> ${nl2br(job.comments.at(-1).text)}</div>` : '';

  const sections = SECTIONS.map(section => {
    const fields = section.fields
      .map(f => inputField(f, job[f.key], editable && (f.owner || section.owner) === role))
      .join('');
    return `
      <section class="block">
        <div class="block-head">
          <h3>${section.title}</h3>
          <span class="owner">Preenchimento: ${ROLES[section.owner].label}</span>
        </div>
        <div class="grid">${fields}</div>
      </section>`;
  }).join('');

  $('#content').innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <b>${esc(job.name)}</b>
          <p class="muted">${stage.hint}</p>
        </div>
        ${badge(job.status)}
      </div>
      <div class="body">
        ${returnedNote}
        <div class="job-meta">${deadlineTag(job)}<span class="tag">Aprovador: ${esc(job.approver || '—')}</span></div>
        ${progressBar(job)}
        ${sections}
        <div class="actions sticky-actions">${jobActions(job, role, editable)}</div>
      </div>
    </div>
    ${commentsCard(job)}
    ${historyCard(job)}`;
}

function inputField(field, value, editable) {
  const id = 'f_' + field.key;
  const lock = editable ? '' : ' <span class="lock" title="Somente leitura nesta etapa">🔒</span>';
  const req = field.required ? ' <span class="req">*</span>' : '';
  const hint = field.hint ? `<small class="muted">${esc(field.hint)}</small>` : '';
  const attrs = `id="${id}" data-field="${field.key}" ${editable ? '' : 'disabled'}`;
  const control = field.type === 'textarea'
    ? `<textarea ${attrs} rows="4">${esc(value)}</textarea>`
    : `<input ${attrs} type="${field.type === 'date' ? 'date' : 'text'}" value="${esc(value)}">`;
  return `<div class="field${field.full || field.type === 'textarea' ? ' full' : ''}">
      <label for="${id}">${esc(field.label)}${req}${lock}</label>${control}${hint}
    </div>`;
}

function jobActions(job, role, editable) {
  const buttons = [];
  if (editable) {
    buttons.push(`<button class="btn secondary" data-action="save" data-id="${job.id}">Salvar rascunho</button>`);
  }
  if (role === 'manager' && ['editing', 'returned'].includes(job.status)) {
    buttons.push(`<button class="btn primary" data-action="submit" data-id="${job.id}">${job.status === 'returned' ? 'Reenviar para aprovação' : 'Enviar para aprovação'}</button>`);
  }
  if (role === 'approver' && job.status === 'manager_review') {
    buttons.push(`<button class="btn danger" data-action="return" data-id="${job.id}">Devolver</button>`);
    buttons.push(`<button class="btn primary" data-action="approve" data-id="${job.id}">Aprovar</button>`);
  }
  if (role === 'hr' && job.status === 'hr_review') {
    buttons.push(`<button class="btn danger" data-action="return" data-id="${job.id}">Devolver</button>`);
    buttons.push(`<button class="btn primary" data-action="validate" data-id="${job.id}">Validar e aprovar</button>`);
  }
  if (role === 'hr' && job.status === 'approved') {
    buttons.push(`<button class="btn outline" data-action="reopen" data-id="${job.id}">Reabrir para revisão</button>`);
  }
  if (job.status === 'approved') {
    buttons.push(`<button class="btn primary" data-action="doc" data-id="${job.id}">Ver documento</button>`);
  }
  return buttons.join('');
}

function commentsCard(job) {
  if (!job.comments.length) return '';
  return `
    <div class="card">
      <div class="head"><b>Comentários</b></div>
      <div class="body">${job.comments.map(c => `
        <div class="comment">
          <div class="comment-head"><b>${esc(c.author)}</b> <span class="muted">${ROLES[c.role] ? ROLES[c.role].label : ''} • ${formatDateTime(c.at)}</span></div>
          <p>${nl2br(c.text)}</p>
        </div>`).join('')}</div>
    </div>`;
}

function historyCard(job) {
  return `
    <div class="card">
      <div class="head"><b>Histórico do fluxo</b></div>
      <div class="body">
        <ol class="timeline">${job.history.map(h => `
          <li><b>${esc(h.text)}</b><br><span class="muted">${esc(h.author)} • ${formatDateTime(h.at)}</span></li>`).join('')}
        </ol>
      </div>
    </div>`;
}

/* Lê os campos editáveis presentes na tela. */
function collectFields() {
  const values = {};
  $$('#content [data-field]').forEach(el => { if (!el.disabled) values[el.dataset.field] = el.value; });
  return values;
}

/* ========================== VISÃO: APROVAÇÕES ============================ */
function approvalsView() {
  if (session().role === 'manager') return show('jobs');
  const queue = API.pending();
  const isHr = session().role === 'hr';

  $('#title').textContent = isHr ? 'Validações de C&R' : 'Aprovações';
  $('#subtitle').textContent = `${queue.length} descritivo(s) na sua fila`;

  $('#content').innerHTML = queue.length
    ? `<div class="cards">${queue.map(j => jobCard(j, `
        <button class="btn primary" data-action="open" data-id="${j.id}">Analisar</button>
        <button class="btn secondary" data-action="${isHr ? 'validate' : 'approve'}" data-id="${j.id}">${isHr ? 'Validar e aprovar' : 'Aprovar'}</button>
        <button class="btn danger" data-action="return" data-id="${j.id}">Devolver</button>
      `)).join('')}</div>`
    : `<div class="card"><div class="body empty">Nenhuma pendência no momento.</div></div>`;
}

/* ========================= VISÃO: ADMINISTRAÇÃO ========================== */
function adminView() {
  if (session().role !== 'hr') return show('approvals');
  const jobs = API.jobs;
  const byStage = Object.keys(STAGES).map(k => ({ k, n: jobs.filter(j => j.status === k).length }));

  $('#title').textContent = 'Administração';
  $('#subtitle').textContent = `${jobs.length} cargo(s) cadastrados`;
  $('#topActions').innerHTML = `
    <button class="btn primary" data-action="new">Novo cargo</button>
    <button class="btn outline" data-action="reset">Restaurar dados de teste</button>`;

  $('#content').innerHTML = `
    <div class="metrics">${byStage.map(s => `
      <div class="metric"><b>${s.n}</b><span>${STAGES[s.k].label}</span></div>`).join('')}</div>
    <div class="cards">${jobs.map(j => `
      <article class="job">
        <div class="job-head">
          <div>
            <b>${esc(j.name)}</b>
            <p class="muted">${esc(j.manager)} • ${esc(j.managerEmail)}</p>
            <p class="muted">Código de acesso: <b class="code">${esc(j.code)}</b></p>
          </div>
          ${badge(j.status)}
        </div>
        <div class="job-meta">${deadlineTag(j)}</div>
        <div class="actions mt-sm">
          <button class="btn primary" data-action="open" data-id="${j.id}">Abrir</button>
          <button class="btn secondary" data-action="mail" data-id="${j.id}">Preparar e-mail</button>
          <button class="btn outline" data-action="doc" data-id="${j.id}">Documento</button>
        </div>
      </article>`).join('')}</div>`;
}

/* Valores sugeridos no cadastro, para agilizar o uso no dia a dia. */
const CREATION_DEFAULTS = {
  creationDate: isoToday(),
  company: 'Empresa Exemplo',
  approver: 'Aprovador Demonstração'
};

function newJobModal() {
  const hrFields = fieldsOf('hr').filter(f => f.key !== 'reviewDate');
  const render = f => {
    const id = 'n_' + f.key;
    const preset = esc(CREATION_DEFAULTS[f.key] || '');
    const type = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text';
    const control = f.type === 'textarea'
      ? `<textarea id="${id}" data-new="${f.key}" rows="3">${preset}</textarea>`
      : `<input id="${id}" data-new="${f.key}" type="${type}" value="${preset}">`;
    return `<div class="field${f.full ? ' full' : ''}"><label for="${id}">${esc(f.label)} <span class="req">*</span></label>${control}</div>`;
  };

  openModal(`
    <h2>Novo cargo</h2>
    <p class="muted">C&amp;R preenche a identificação e os blocos normativos. O restante do modelo é preenchido pelo responsável.</p>
    <h3>Fluxo</h3>
    <div class="grid">${FLOW_FIELDS.map(render).join('')}</div>
    <h3>Modelo</h3>
    <div class="grid">${hrFields.map(render).join('')}</div>
    <button class="btn primary full mt" data-modal-action="create">Criar, gerar código e preparar e-mail</button>
  `);

  const button = $('#modalContent').querySelector('[data-modal-action="create"]');
  button.onclick = async () => {
    const data = {};
    $$('#modalContent [data-new]').forEach(el => data[el.dataset.new] = el.value.trim());

    button.disabled = true;
    try {
      const job = await API.createJob(data);
      closeModal();
      show('admin');
      toast('Cargo criado com o código ' + job.code, 'success');
      prepareMail(job.id);
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
    }
  };
}

function prepareMail(id) {
  const job = API.getJob(id);
  const subject = encodeURIComponent(`Preenchimento de descritivo de cargo: ${job.name}`);
  const body = encodeURIComponent(
    `Olá, ${job.manager}!\n\n` +
    `Foi atribuído a você o preenchimento do descritivo do cargo ${job.name}.\n` +
    `Prazo: ${formatDate(job.deadline)}\n\n` +
    `Acesse ${location.origin} e informe o código abaixo — não é necessário usuário nem senha.\n\n` +
    `Código de acesso: ${job.code}\n\n` +
    `Carreira & Recompensa`
  );
  window.location.href = `mailto:${job.managerEmail}?subject=${subject}&body=${body}`;
}

/* ========================== VISÃO: DOCUMENTO ============================= */
function documentView() {
  const job = API.getJob(state.jobId);
  if (!job) return show('jobs');

  const rows = SECTIONS[0].fields
    .map(f => `<tr><th>${esc(f.label)}</th><td>${esc(f.type === 'date' ? formatDate(job[f.key]) : job[f.key] || '—')}</td></tr>`)
    .join('');

  const blocks = ALL_FIELDS.filter(f => f.docHead)
    .map(f => `<h2>${esc(f.docHead)}</h2><p>${nl2br(job[f.key] || 'Não informado')}</p>`)
    .join('');

  $('#title').textContent = 'Documento';
  $('#subtitle').textContent = job.name;
  $('#topActions').innerHTML = `
    <button class="btn outline" data-action="back">Voltar</button>
    <button class="btn primary" data-action="print">Imprimir / salvar PDF</button>`;

  $('#content').innerHTML = `
    ${job.status !== 'approved' ? '<div class="banner warn">Pré-visualização: este descritivo ainda não foi aprovado.</div>' : ''}
    <div class="card document">
      <div class="body">
        <h1 class="doc-title">MAPA DE CARREIRA</h1>
        <table class="doc-table">${rows}</table>
        ${blocks}
        <p class="doc-foot muted">Situação: ${STAGES[job.status].label} • Revisão: ${formatDate(job.reviewDate)}</p>
      </div>
    </div>`;
}

/* ============================ AÇÕES (delegação) ========================== */
async function handleAction(action, id, element) {
  /* Executa uma chamada à API cuidando de erro, botão travado e re-render. */
  const run = async (promise, successMessage) => {
    if (element) element.disabled = true;
    try {
      await promise;
      if (successMessage) toast(successMessage, 'success');
      show(state.view);
    } catch (err) {
      toast(err.message, 'error');
      if (!API.session) location.reload();
    } finally {
      if (element) element.disabled = false;
    }
  };

  switch (action) {
    case 'open':
      return show('job', id);
    case 'back':
      return show(HOME[session().role]);
    case 'save':
      return run(API.saveFields(id, collectFields()), 'Rascunho salvo');
    case 'submit':
      return run(API.transition(id, 'submit', { fields: collectFields() }), 'Enviado para aprovação');
    case 'approve':
      return run(API.transition(id, 'approve'), 'Descritivo aprovado');
    case 'validate':
      return run(API.transition(id, 'validate'), 'Descritivo validado e aprovado');
    case 'return':
      return askText('Devolver para correção', 'Descreva o que precisa ser ajustado',
        text => run(API.transition(id, 'return', { text }), 'Devolvido para correção'));
    case 'reopen':
      return askText('Reabrir para revisão', 'Motivo da reabertura',
        text => run(API.transition(id, 'reopen', { text }), 'Reaberto para revisão'));
    case 'doc':
      return show('document', id);
    case 'print':
      return window.print();
    case 'mail':
      return prepareMail(id);
    case 'new':
      return newJobModal();
    case 'reset':
      return askText('Restaurar dados de teste', 'Digite RESTAURAR para confirmar', text => {
        if (text.trim().toUpperCase() !== 'RESTAURAR') return toast('Confirmação inválida', 'error');
        run(API.reset(), 'Dados de teste restaurados');
      });
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el) handleAction(el.dataset.action, el.dataset.id, el);
});

/* ---------------------- Retomada de sessão ao recarregar ----------------- */
if (API.token && API.session) {
  enter().catch(() => {
    API.clear();
    $('#application').classList.add('hide');
    $('#login').classList.remove('hide');
  });
}
