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

/*
 * O código só existe neste instante: o servidor guarda apenas o hash. Esta
 * caixa é a única chance de copiá-lo — por isso ela é explícita quanto a isso.
 */
function revealCode(titulo, code, { job, aviso } = {}) {
  openModal(`
    <h2>${esc(titulo)}</h2>
    ${aviso ? `<div class="banner warn">${esc(aviso)}</div>` : ''}
    <p class="muted">Este código aparece <b>uma única vez</b>. Ele não fica guardado em lugar nenhum: se for perdido, o caminho é gerar outro.</p>
    <div class="reveal"><b class="code">${esc(code)}</b></div>
    <div class="actions mt">
      <button class="btn primary" data-action="copy" data-code="${esc(code)}">Copiar código</button>
      ${job ? `<button class="btn secondary" data-modal-action="mail">Abrir e-mail para ${esc(job.manager)}</button>` : ''}
    </div>
  `);

  const botaoEmail = $('#modalContent').querySelector('[data-modal-action="mail"]');
  if (botaoEmail) botaoEmail.onclick = () => prepareMail(job, code);
}

/* ================================ LOGIN ================================== */
/*
 * Uma porta só: a pessoa digita o código que recebeu e a ferramenta descobre
 * quem ela é. Não existe usuário nem senha em lugar nenhum.
 */
$('#accessCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#enter').click(); });

/*
 * Os códigos de demonstração só aparecem enquanto a demonstração existir.
 * Revogados os acessos CR-00001 e AP-00001, o bloco some — ninguém precisa
 * lembrar de apagar nada.
 */
API.isDemo().then(demo => {
  if (demo) $('#demoCodes').classList.remove('hide');
});

/* Os códigos de demonstração preenchem o campo com um clique. */
$$('[data-demo-code]').forEach(button => {
  button.onclick = () => {
    $('#accessCode').value = button.dataset.demoCode;
    $('#accessCode').focus();
  };
});

$('#enter').onclick = async e => {
  const code = $('#accessCode').value.trim();
  if (!code) return toast('Informe o código de acesso', 'error');

  const button = e.currentTarget;
  button.disabled = true;
  try {
    await API.login(code);
    await enter();
  } catch (err) {
    toast(err.message, 'error');
    $('#accessCode').select();
  } finally {
    button.disabled = false;
  }
};

$('#logout').onclick = async () => {
  await API.logout();
  state.jobId = null;
  closeModal();
  $('#accessCode').value = '';
  $('#application').classList.add('hide');
  $('#login').classList.remove('hide');
};

/* ============================== NAVEGAÇÃO ================================ */
const ICONS = {
  flow:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="5" height="12" rx="1.4"/><rect x="10" y="6" width="5" height="8" rx="1.4"/><rect x="17" y="6" width="4" height="5" rx="1.4"/></svg>',
  jobs:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
  approvals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  admin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>',
  users:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c.6-3.4 3.3-5.4 6.5-5.4s5.9 2 6.5 5.4M17 8.2a3 3 0 010 5.6M18.5 20c-.2-1.6-.7-2.9-1.5-3.9"/></svg>',
  model:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18.5" cy="15.5" r="2.6"/></svg>',
  config:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/></svg>'
};

/*
 * A ferramenta roda em dois modos e a tela avisa em qual deles está:
 *   local    -> index.html aberto direto, dados só neste navegador
 *   servidor -> node server.js, dados compartilhados entre as pessoas
 */
function renderModeNote() {
  const note = $('#modeNote');
  if (!note) return;

  if (API.mode !== 'local') return void (note.innerHTML = '');

  note.innerHTML = API.persistent
    ? `<div class="banner warn"><b>Modo local.</b> Os dados ficam guardados neste navegador, nesta máquina, e os e-mails são preparados no seu cliente de e-mail. Para o fluxo funcionar entre pessoas, rode <code>node server.js</code> e acesse pelo endereço da máquina.</div>`
    : `<div class="banner warn"><b>Modo de teste, sem gravação.</b> Este navegador não está deixando guardar dados em arquivos abertos direto do disco, então tudo funciona normalmente <b>mas se perde ao recarregar a página</b>. Para guardar de verdade, rode <code>node server.js</code> (ou o atalho <code>abrir.bat</code>) e acesse por <code>http://localhost:3000</code>.</div>`;
}

const NAV = {
  manager:  [{ view: 'jobs', label: 'Meus descritivos' }],
  approver: [
    { view: 'flow', label: 'Fluxo' },
    { view: 'approvals', label: 'Aprovações' }
  ],
  /* O painel do Fluxo já lista todos os cargos, com busca — não há uma aba
   * "Cargos" separada para quem administra. */
  hr:       [
    { view: 'flow', label: 'Fluxo' },
    { view: 'approvals', label: 'Aprovações' },
    { view: 'admin', label: 'Administração' },
    { view: 'users', label: 'Códigos' },
    { view: 'model', label: 'Modelo' },
    { view: 'config', label: 'Ajustes' }
  ]
};

const HOME = { manager: 'jobs', approver: 'flow', hr: 'flow' };

async function enter(view) {
  // O modelo vem antes dos cargos: o formulário inteiro depende dele.
  await API.loadModel();
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
    return `<button data-view="${item.view}" class="${state.view === item.view ? 'active' : ''}">${ICONS[item.view] || ''}<span>${item.label}</span>${badge}</button>`;
  }).join('');
  $$('#nav [data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
}

const VIEWS = {
  flow: flowView,
  jobs: jobsView,
  approvals: approvalsView,
  admin: adminView,
  users: usersView,
  model: modelView,
  config: configView,
  job: jobView,
  document: documentView
};

/* Telas de lista: podem ser redesenhadas a qualquer momento sem atrapalhar
 * ninguém. A tela do cargo fica de fora porque tem texto sendo digitado. */
const LIST_VIEWS = ['flow', 'jobs', 'approvals', 'admin'];

function render() {
  $('#topActions').innerHTML = '';
  renderNav();
  renderModeNote();
  (VIEWS[state.view] || jobsView)();
}

function show(view, jobId) {
  state.view = view;
  if (jobId !== undefined) state.jobId = jobId;
  render();

  // Outra pessoa pode ter mexido no fluxo desde o último carregamento: ao
  // abrir uma lista, busca o estado atual e redesenha se algo mudou.
  if (LIST_VIEWS.includes(view)) refreshJobs();
}

/* Busca silenciosa: erro aqui não deve incomodar quem está usando. */
function refreshJobs() {
  if (API.mode !== 'server') return;
  const viewAtStart = state.view;
  API.loadJobs()
    .then(() => { if (state.view === viewAtStart && LIST_VIEWS.includes(state.view)) render(); })
    .catch(() => {});
}

/* Enquanto uma lista estiver aberta, acompanha o fluxo sem precisar recarregar
 * a página — importante para quem fica esperando algo cair na fila. */
setInterval(() => {
  if (!API.session) return;
  if (!LIST_VIEWS.includes(state.view)) return;
  if (!$('#modal').classList.contains('hide')) return;
  refreshJobs();
}, 30000);

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

/* A primeira seção (identificação) vira a tabela do topo do documento; as
 * demais viram blocos. Assim campos criados por C&R entram no documento sem
 * precisar de configuração extra. */
function identificationId() {
  const table = Model.sections().find(s => s.layout === 'table') || Model.sections()[0];
  return table ? table.id : null;
}

/* ---------------------------- Trilha do fluxo ---------------------------- */
const FLOW_STEPS = [
  { label: 'Preenchimento do gestor', stages: ['editing', 'returned'] },
  { label: 'Aprovação do aprovador',  stages: ['manager_review'] },
  { label: 'Aprovação de C&R',        stages: ['hr_review'] },
  { label: 'Aprovado',                stages: ['approved'] }
];

/* Um cargo sem aprovador pula a etapa do meio: a trilha não mostra o que não
 * vai acontecer. */
function stepsFor(job) {
  return String(job.approver || '').trim()
    ? FLOW_STEPS
    : FLOW_STEPS.filter(step => !step.stages.includes('manager_review'));
}

/* Mostra em que ponto do fluxo o cargo está — é o resumo visual da etapa. */
function stepper(job) {
  if (job.status === 'canceled') {
    return `<div class="stepper"><div class="step alert" style="flex:1">
      <small>Situação</small><b>Cargo cancelado — C&R pode reabrir</b></div></div>`;
  }

  const steps = stepsFor(job);
  const current = steps.findIndex(step => step.stages.includes(job.status));
  return `<div class="stepper">${steps.map((step, i) => {
    const done = job.status === 'approved' || i < current;
    const tone = done ? 'done' : i === current ? (job.status === 'returned' ? 'alert' : 'current') : '';
    const caption = done ? 'concluído' : i === current ? STAGES[job.status].label : 'a fazer';
    return `<div class="step ${tone}"><small>${caption}</small><b>${step.label}</b></div>`;
  }).join('')}</div>`;
}

/* ============================ VISÃO: FLUXO =============================== */
/*
 * O fluxo desenhado na horizontal, uma coluna por etapa: bate o olho e vê onde
 * cada cargo parou e de quem se está esperando. É a tela inicial de C&R.
 */
const BOARD = [
  { id: 'fill',     label: 'Preenchimento do gestor', stages: ['editing', 'returned'], owner: 'manager' },
  { id: 'approver', label: 'Aprovação do aprovador',  stages: ['manager_review'],      owner: 'approver' },
  { id: 'review',   label: 'Aprovação de C&R',        stages: ['hr_review'],           owner: 'hr' },
  { id: 'done',     label: 'Aprovado',                stages: ['approved'],            owner: null }
];

const boardFilter = { term: '' };

function flowView() {
  if (session().role === 'manager') return show('jobs');

  const canceled = API.jobs.filter(j => j.status === 'canceled');
  const columns = canceled.length
    ? [...BOARD, { id: 'canceled', label: 'Cancelado', stages: ['canceled'], owner: null }]
    : BOARD;

  $('#title').textContent = 'Fluxo';
  $('#subtitle').textContent = `${API.jobs.length} cargo(s) no fluxo • ${API.pending().length} aguardando você`;
  $('#topActions').innerHTML = session().role === 'hr'
    ? `<button class="btn primary" data-action="new">Novo cargo</button>` : '';

  $('#content').innerHTML = `
    <div class="toolbar">
      <input id="boardSearch" placeholder="Procurar cargo, gestor ou código" value="${esc(boardFilter.term)}">
    </div>
    <div class="board">${columns.map(column => renderColumn(column)).join('')}</div>`;

  $('#boardSearch').oninput = e => {
    boardFilter.term = e.target.value;
    $$('.board-col').forEach((el, i) => {
      el.outerHTML = renderColumn(columns[i]);
    });
  };
}

function renderColumn(column) {
  const term = boardFilter.term.trim().toLowerCase();
  const jobs = API.jobs
    .filter(j => column.stages.includes(j.status))
    .filter(j => !term || [j.name, j.manager, j.code, j.jobCode].some(v => String(v || '').toLowerCase().includes(term)));

  const mine = column.owner === session().role && jobs.length > 0;

  return `
    <section class="board-col${mine ? ' mine' : ''}">
      <header>
        <b>${column.label}</b>
        <span class="count">${jobs.length}</span>
      </header>
      ${mine && jobs.length ? '<p class="board-note">Sua ação é necessária</p>' : ''}
      <div class="board-cards">
        ${jobs.length ? jobs.map(job => `
          <article class="board-card${job.status === 'returned' ? ' returned' : ''}" data-action="open" data-id="${job.id}" tabindex="0">
            <b>${esc(job.name)}</b>
            <p class="muted">${esc(job.manager)}</p>
            ${job.status === 'returned' ? '<span class="tag late">Devolvido para correção</span>' : ''}
            ${deadlineTag(job)}
            ${column.id === 'fill' ? progressBar(job) : ''}
          </article>`).join('') : '<p class="board-empty">—</p>'}
      </div>
    </section>`;
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

  const sections = Model.sections().map(section => {
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
        ${stepper(job)}
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
  if (role === 'hr' && ['approved', 'canceled'].includes(job.status)) {
    buttons.push(`<button class="btn outline" data-action="reopen" data-id="${job.id}">Reabrir para preenchimento</button>`);
  }
  if (role === 'hr' && job.status !== 'canceled') {
    buttons.push(`<button class="btn danger" data-action="cancel" data-id="${job.id}">Cancelar cargo</button>`);
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
const adminFilter = { term: '', status: '' };

function adminView() {
  if (session().role !== 'hr') return show('approvals');
  const jobs = API.jobs;
  const byStage = Object.keys(STAGES).map(k => ({ k, n: jobs.filter(j => j.status === k).length }));

  $('#title').textContent = 'Administração';
  $('#subtitle').textContent = `${jobs.length} cargo(s) cadastrados`;
  $('#topActions').innerHTML = `
    <button class="btn primary" data-action="new">Novo cargo</button>
    <button class="btn secondary" data-action="export">Exportar CSV</button>
    ${API.mode === 'server' ? '<button class="btn secondary" data-action="share">Arquivo para compartilhar</button>' : ''}
    <button class="btn outline" data-action="reset">Restaurar dados de teste</button>`;

  $('#content').innerHTML = `
    ${API.smtpReady || API.mode === 'local' ? '' : `<div class="banner warn">O envio de e-mails ainda não está configurado — os avisos do fluxo não saem sozinhos. Ajuste em <b>Configurações</b>.</div>`}
    <div class="metrics">${byStage.map(s => `
      <div class="metric ${adminFilter.status === s.k ? 'selected' : ''}" data-filter="${s.k}">
        <b>${s.n}</b><span>${STAGES[s.k].label}</span>
      </div>`).join('')}</div>
    <div class="toolbar">
      <input id="adminSearch" placeholder="Buscar por cargo, responsável, e-mail ou código" value="${esc(adminFilter.term)}">
      ${adminFilter.status ? `<button class="btn outline" data-filter="">Limpar filtro: ${STAGES[adminFilter.status].label}</button>` : ''}
    </div>
    <div id="adminList"></div>`;

  $('#adminSearch').oninput = e => { adminFilter.term = e.target.value; renderAdminList(); };
  $$('#content [data-filter]').forEach(el => el.onclick = () => {
    adminFilter.status = el.dataset.filter === adminFilter.status ? '' : el.dataset.filter;
    adminView();
    $('#adminSearch').focus();
  });

  renderAdminList();
}

function renderAdminList() {
  const term = adminFilter.term.trim().toLowerCase();
  const jobs = API.jobs.filter(j => {
    if (adminFilter.status && j.status !== adminFilter.status) return false;
    if (!term) return true;
    return [j.name, j.manager, j.managerEmail, j.code, j.jobCode].some(v => String(v || '').toLowerCase().includes(term));
  });

  $('#adminList').innerHTML = jobs.length
    ? `<div class="cards">${jobs.map(j => {
        const lastMail = (j.notifications || []).at(-1);
        const mailNote = lastMail
          ? `<span class="tag ${lastMail.ok ? '' : 'late'}">${lastMail.ok ? 'Último e-mail enviado' : 'Falha no envio'} • ${formatDateTime(lastMail.at)}</span>`
          : '';
        return `
        <article class="job">
          <div class="job-head">
            <div>
              <b>${esc(j.name)}</b>
              <p class="muted">${esc(j.manager)} • ${esc(j.managerEmail)}</p>
              <p class="muted">${j.codeSentAt
                ? 'Código enviado ao gestor em ' + formatDateTime(j.codeSentAt)
                : 'Código gerado na criação do cargo'}</p>
            </div>
            ${badge(j.status)}
          </div>
          <div class="job-meta">${deadlineTag(j)}${mailNote}</div>
          <div class="actions mt-sm">
            <button class="btn primary" data-action="open" data-id="${j.id}">Abrir</button>
            <button class="btn secondary" data-action="resend" data-id="${j.id}">Gerar novo código</button>
            <button class="btn outline" data-action="doc" data-id="${j.id}">Documento</button>
            ${j.status === 'canceled'
              ? `<button class="btn outline" data-action="reopen" data-id="${j.id}">Reabrir</button>`
              : `<button class="btn danger" data-action="cancel" data-id="${j.id}">Cancelar</button>`}
          </div>
        </article>`;
      }).join('')}</div>`
    : `<div class="card"><div class="body empty">Nenhum cargo encontrado com esse filtro.</div></div>`;
}

/* Valores sugeridos no cadastro, para agilizar o uso no dia a dia. */
const CREATION_DEFAULTS = {
  creationDate: isoToday(),
  company: 'Empresa Exemplo'
};

async function newJobModal() {
  const hrFields = fieldsOf('hr').filter(f => f.key !== 'reviewDate');

  // O aprovador vira uma lista dos códigos de aprovador já cadastrados: evita
  // erro de digitação no nome, que é o vínculo usado pela fila de aprovação.
  let approvers = [];
  try {
    approvers = (await API.listKeys()).filter(k => k.role === 'approver');
  } catch { /* segue com campo livre */ }

  const render = f => {
    const id = 'n_' + f.key;
    const preset = esc(CREATION_DEFAULTS[f.key] || '');
    const type = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text';

    const control = f.key === 'approver'
      ? `<select id="${id}" data-new="${f.key}">
           <option value="">Sem aprovador — vai direto para C&amp;R</option>
           ${approvers.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('')}
         </select>`
      : f.type === 'textarea'
        ? `<textarea id="${id}" data-new="${f.key}" rows="3">${preset}</textarea>`
        : `<input id="${id}" data-new="${f.key}" type="${type}" value="${preset}">`;

    const hint = f.hint ? `<small class="muted">${esc(f.hint)}</small>` : '';
    const req = f.required ? ' <span class="req">*</span>' : '';

    return `<div class="field${f.full ? ' full' : ''}"><label for="${id}">${esc(f.label)}${req}</label>${control}${hint}</div>`;
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
      const { job, mail, code } = await API.createJob(data);
      closeModal();
      show('flow');

      if (mail && mail.sent) {
        // O código foi direto para o gestor: ninguém mais precisa vê-lo.
        toast(`Cargo criado e código de acesso enviado para ${job.managerEmail}`, 'success');
      } else {
        revealCode('Cargo criado — repasse o código ao gestor', code, {
          job,
          aviso: 'O envio automático de e-mail não está configurado, então o código não foi entregue.'
        });
      }
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
    }
  };
}

function prepareMail(job, code) {
  const subject = encodeURIComponent(`Preenchimento de descritivo de cargo: ${job.name}`);
  const body = encodeURIComponent(
    `Olá, ${job.manager}!\n\n` +
    `Foi atribuído a você o preenchimento do descritivo do cargo ${job.name}.\n` +
    `Prazo: ${formatDate(job.deadline)}\n\n` +
    `Acesse ${location.origin} e informe o código abaixo — não é necessário usuário nem senha.\n\n` +
    `Código de acesso: ${code}\n\n` +
    `Esse código é exclusivo deste descritivo e deixa de valer quando ele for aprovado.\n\n` +
    `Carreira & Recompensa`
  );
  window.location.href = `mailto:${job.managerEmail}?subject=${subject}&body=${body}`;
}

/* ======================= VISÃO: CÓDIGOS DE ACESSO ======================== */
/*
 * Só C&R chega aqui. Duas listas:
 *   - códigos administrativos (C&R e aprovadores), criados nesta tela;
 *   - códigos dos responsáveis, que nascem junto com o cargo.
 */
async function usersView() {
  if (session().role !== 'hr') return show('approvals');

  $('#title').textContent = 'Códigos de acesso';
  $('#subtitle').textContent = 'Toda entrada na ferramenta é por código — não há usuário nem senha';
  $('#topActions').innerHTML = `<button class="btn primary" data-action="key-new">Novo código</button>`;
  $('#content').innerHTML = `<div class="card"><div class="body empty">Carregando…</div></div>`;

  let keys;
  try {
    keys = await API.listKeys();
  } catch (err) {
    return toast(err.message, 'error');
  }
  usersView.cache = keys;

  /* Um cargo por linha: o código é individual, então cada atribuição tem o seu. */
  const atribuicoes = API.jobs.filter(j => !['approved', 'canceled'].includes(j.status));

  $('#content').innerHTML = `
    <div class="banner">
      <b>Os códigos não ficam guardados.</b> A ferramenta grava apenas uma verificação (hash), então nem quem tem acesso ao arquivo de dados descobre o código de alguém.
      Perdeu o código? Gere outro: o anterior deixa de valer na hora.
    </div>

    <div class="card">
      <div class="head"><b>Acesso administrativo</b><span class="muted">${keys.length} acesso(s)</span></div>
      <div class="body">
        <table class="list">
          <thead><tr><th>Pessoa</th><th>Perfil</th><th>Código</th><th>Último acesso</th><th></th></tr></thead>
          <tbody>${keys.map(k => `
            <tr>
              <td><b>${esc(k.name)}</b>${k.email ? `<br><span class="muted">${esc(k.email)}</span>` : ''}</td>
              <td>${ROLES[k.role].label}</td>
              <td><span class="code muted">${esc(k.mask)}</span></td>
              <td class="muted">${k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'nunca usado'}</td>
              <td class="right">
                <button class="btn secondary" data-action="key-edit" data-id="${esc(k.id)}">Editar</button>
                <button class="btn danger" data-action="key-delete" data-id="${esc(k.id)}">Revogar</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="head"><b>Códigos dos gestores</b><span class="muted">um por atribuição</span></div>
      <div class="body">
        ${atribuicoes.length ? `<table class="list">
          <thead><tr><th>Cargo</th><th>Gestor</th><th>Código enviado</th><th></th></tr></thead>
          <tbody>${atribuicoes.map(j => `
            <tr>
              <td><b>${esc(j.name)}</b><br><span class="muted">${STAGES[j.status].label}</span></td>
              <td>${esc(j.manager)}<br><span class="muted">${esc(j.managerEmail)}</span></td>
              <td class="muted">${j.codeSentAt ? formatDateTime(j.codeSentAt) : 'não enviado por e-mail'}</td>
              <td class="right">
                <button class="btn secondary" data-action="resend" data-id="${j.id}">Gerar novo código</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div class="empty">Nenhuma atribuição em aberto.</div>'}
      </div>
    </div>`;
}

function userModal(key) {
  const editing = Boolean(key);
  openModal(`
    <h2>${editing ? 'Editar código' : 'Novo código de acesso'}</h2>
    <div class="grid">
      <div class="field"><label for="uName">Pessoa ou área <span class="req">*</span></label>
        <input id="uName" value="${esc(key ? key.name : '')}" placeholder="Ex.: Maria Silva"></div>
      <div class="field"><label for="uRole">Perfil <span class="req">*</span></label>
        <select id="uRole" ${editing ? 'disabled' : ''}>
          <option value="approver" ${key && key.role === 'approver' ? 'selected' : ''}>Aprovador</option>
          <option value="hr" ${key && key.role === 'hr' ? 'selected' : ''}>Carreira &amp; Recompensa</option>
        </select></div>
      <div class="field full"><label for="uEmail">E-mail (opcional)</label>
        <input id="uEmail" type="email" value="${esc(key && key.email ? key.email : '')}" placeholder="para receber os avisos do fluxo">
      </div>
    </div>
    ${editing ? `
      <div class="field full">
        <label>Código de acesso</label>
        <p class="muted">Não é possível consultar o código atual — ele não fica guardado.</p>
        <label class="check"><input type="checkbox" id="uRegenerate"> Gerar um código novo (o atual deixa de valer imediatamente)</label>
      </div>` : '<p class="muted">O código é sorteado ao salvar e mostrado uma única vez, para você repassar à pessoa.</p>'}
    <p class="muted">Aprovador: o nome precisa ser o mesmo escolhido no cadastro do cargo — a fila de aprovação usa esse vínculo. Ao renomear aqui, os cargos são atualizados junto.</p>
    <button class="btn primary full mt" data-modal-action="save-user">Salvar</button>
  `);

  const button = $('#modalContent').querySelector('[data-modal-action="save-user"]');
  button.onclick = async () => {
    const data = { name: $('#uName').value.trim(), email: $('#uEmail').value.trim() };

    button.disabled = true;
    try {
      const result = editing
        ? await API.updateKey(key.id, { ...data, regenerate: $('#uRegenerate').checked })
        : await API.createKey({ ...data, role: $('#uRole').value });
      closeModal();

      if (result.code) revealCode(`Código de ${data.name}`, result.code);
      else toast(result.message || 'Acesso salvo', 'success');
      usersView();
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
    }
  };
}

/* =========================== VISÃO: MODELO =============================== */
/*
 * C&R monta o descritivo: cria seções, cria campos, escolhe quem preenche cada
 * um e se é obrigatório. "Quem preenche" é o que tranca o campo — o que for de
 * C&R aparece bloqueado para o responsável, e vice-versa.
 *
 * A edição é imediata: cada ação grava o modelo inteiro e redesenha.
 */
const PROTECTED_KEYS = ['name'];

function modelView() {
  if (session().role !== 'hr') return show('approvals');
  const sections = Model.sections();

  $('#title').textContent = 'Modelo do descritivo';
  $('#subtitle').textContent = `${sections.length} seção(ões) • ${Model.allFields().length} campo(s)`;
  $('#topActions').innerHTML = `
    <button class="btn primary" data-action="section-new">Nova seção</button>
    <button class="btn outline" data-action="model-reset">Restaurar modelo padrão</button>`;

  $('#content').innerHTML = `
    <div class="banner">Alterações valem para os próximos preenchimentos e para o documento. Cargos já preenchidos mantêm o que foi escrito; campos removidos apenas deixam de aparecer.</div>
    ${sections.map((section, si) => `
      <div class="card">
        <div class="head">
          <div>
            <b>${esc(section.title)}</b>
            <p class="muted">Padrão da seção: ${ROLES[section.owner] ? ROLES[section.owner].label : '—'}${section.layout === 'table' ? ' • vira a tabela de identificação do documento' : ''}</p>
          </div>
          <div class="actions">
            <button class="btn outline" data-action="section-move" data-index="${si}" data-dir="-1" ${si === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn outline" data-action="section-move" data-index="${si}" data-dir="1" ${si === sections.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn secondary" data-action="section-edit" data-index="${si}">Editar</button>
            <button class="btn danger" data-action="section-del" data-index="${si}">Excluir</button>
          </div>
        </div>
        <div class="body">
          <table class="list">
            <thead><tr><th>Campo</th><th>Tipo</th><th>Quem preenche</th><th>Obrigatório</th><th></th></tr></thead>
            <tbody>${section.fields.map((field, fi) => `
              <tr>
                <td><b>${esc(field.label)}</b>${field.hint ? `<br><span class="muted">${esc(field.hint)}</span>` : ''}</td>
                <td class="muted">${({ text: 'Texto curto', textarea: 'Texto longo', date: 'Data' })[field.type || 'text']}</td>
                <td>${ROLES[field.owner || section.owner].label}${(field.owner || section.owner) === 'hr' ? ' <span class="lock" title="Bloqueado para o responsável">🔒</span>' : ''}</td>
                <td class="muted">${field.required ? 'Sim' : 'Não'}</td>
                <td class="right">
                  <button class="btn outline" data-action="field-move" data-index="${si}" data-field-index="${fi}" data-dir="-1" ${fi === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn outline" data-action="field-move" data-index="${si}" data-field-index="${fi}" data-dir="1" ${fi === section.fields.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="btn secondary" data-action="field-edit" data-index="${si}" data-field-index="${fi}">Editar</button>
                  <button class="btn danger" data-action="field-del" data-index="${si}" data-field-index="${fi}">Excluir</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="actions mt"><button class="btn secondary" data-action="field-new" data-index="${si}">Novo campo nesta seção</button></div>
        </div>
      </div>`).join('')}`;
}

/* Trabalha sobre uma cópia e grava o modelo inteiro. */
async function updateModel(change, message) {
  const draft = JSON.parse(JSON.stringify(Model.sections()));
  try {
    change(draft);
    const result = await API.saveModel(draft);
    toast(message || result.message || 'Modelo atualizado', 'success');
    modelView();
  } catch (err) {
    toast(err.message, 'error');
    modelView();
  }
}

function sectionModal(index) {
  const editing = index !== undefined;
  const section = editing ? Model.sections()[index] : { title: '', owner: 'manager' };

  openModal(`
    <h2>${editing ? 'Editar seção' : 'Nova seção'}</h2>
    <div class="grid">
      <div class="field"><label for="sTitle">Título da seção <span class="req">*</span></label>
        <input id="sTitle" value="${esc(section.title)}" placeholder="Ex.: Responsabilidades"></div>
      <div class="field"><label for="sOwner">Quem preenche, por padrão</label>
        <select id="sOwner">
          <option value="manager" ${section.owner === 'manager' ? 'selected' : ''}>Responsável pelo cargo</option>
          <option value="hr" ${section.owner === 'hr' ? 'selected' : ''}>Carreira &amp; Recompensa (bloqueado para o responsável)</option>
        </select></div>
    </div>
    <button class="btn primary full mt" data-modal-action="save-section">Salvar</button>
  `);

  $('#modalContent').querySelector('[data-modal-action="save-section"]').onclick = () => {
    const title = $('#sTitle').value.trim();
    const owner = $('#sOwner').value;
    if (!title) return toast('Informe o título', 'error');
    closeModal();

    updateModel(draft => {
      if (editing) Object.assign(draft[index], { title, owner });
      else draft.push({ id: 'sec_' + Date.now(), title, owner, fields: [] });
    }, editing ? 'Seção atualizada' : 'Seção criada — agora inclua os campos');
  };
}

function fieldModal(sectionIndex, fieldIndex) {
  const section = Model.sections()[sectionIndex];
  const editing = fieldIndex !== undefined;
  const field = editing ? section.fields[fieldIndex] : { label: '', type: 'text', owner: section.owner, required: true, hint: '' };
  const protectedKey = editing && PROTECTED_KEYS.includes(field.key);

  openModal(`
    <h2>${editing ? 'Editar campo' : 'Novo campo'}</h2>
    <p class="muted">Seção: ${esc(section.title)}</p>
    <div class="grid">
      <div class="field full"><label for="fLabel">Rótulo <span class="req">*</span></label>
        <input id="fLabel" value="${esc(field.label)}" placeholder="Ex.: Principais entregas"></div>
      <div class="field"><label for="fType">Tipo</label>
        <select id="fType">
          <option value="text" ${(field.type || 'text') === 'text' ? 'selected' : ''}>Texto curto</option>
          <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Texto longo</option>
          <option value="date" ${field.type === 'date' ? 'selected' : ''}>Data</option>
        </select></div>
      <div class="field"><label for="fOwner">Quem preenche</label>
        <select id="fOwner" ${protectedKey ? 'disabled' : ''}>
          <option value="manager" ${(field.owner || section.owner) === 'manager' ? 'selected' : ''}>Responsável pelo cargo</option>
          <option value="hr" ${(field.owner || section.owner) === 'hr' ? 'selected' : ''}>Carreira &amp; Recompensa (bloqueado para o responsável)</option>
        </select></div>
      <div class="field full"><label for="fHint">Dica para quem preenche (opcional)</label>
        <input id="fHint" value="${esc(field.hint || '')}" placeholder="Ex.: uma responsabilidade por linha"></div>
    </div>
    <label class="check"><input type="checkbox" id="fRequired" ${field.required ? 'checked' : ''}> Obrigatório para avançar no fluxo</label>
    ${protectedKey ? '<p class="muted">Este campo identifica o cargo na lista e no e-mail, por isso continua sendo de C&R.</p>' : ''}
    <button class="btn primary full mt" data-modal-action="save-field">Salvar</button>
  `);

  $('#modalContent').querySelector('[data-modal-action="save-field"]').onclick = () => {
    const label = $('#fLabel').value.trim();
    if (!label) return toast('Informe o rótulo', 'error');

    const data = {
      label,
      type: $('#fType').value,
      owner: protectedKey ? field.owner : $('#fOwner').value,
      required: $('#fRequired').checked,
      hint: $('#fHint').value.trim()
    };
    if (data.type === 'textarea') data.full = true;
    closeModal();

    updateModel(draft => {
      const target = draft[sectionIndex];
      if (editing) {
        Object.assign(target.fields[fieldIndex], data);
      } else {
        const taken = draft.flatMap(s => s.fields.map(f => f.key));
        target.fields.push({ key: Model.keyFromLabel(label, taken), ...data });
      }
    }, editing ? 'Campo atualizado' : 'Campo criado');
  };
}

/* ========================= VISÃO: CONFIGURAÇÕES ========================== */
async function configView() {
  if (session().role !== 'hr') return show('approvals');

  $('#title').textContent = 'Configurações';
  $('#subtitle').textContent = 'Envio de e-mail, avisos do fluxo e cobrança de prazo';
  $('#content').innerHTML = `<div class="card"><div class="body empty">Carregando…</div></div>`;

  let config;
  try {
    config = await API.loadConfig();
  } catch (err) {
    return toast(err.message, 'error');
  }

  const checked = value => (value ? 'checked' : '');
  $('#content').innerHTML = `
    <div class="card">
      <div class="head"><b>Endereço e avisos</b>${config.smtpReady ? '<span class="status approved">E-mail configurado</span>' : '<span class="status returned">E-mail não configurado</span>'}</div>
      <div class="body">
        <div class="grid">
          <div class="field full">
            <label for="cAppUrl">Endereço da ferramenta</label>
            <input id="cAppUrl" value="${esc(config.appUrl)}" placeholder="http://192.168.0.42:3000">
            <small class="muted">Vai nos e-mails, para a pessoa clicar e chegar até aqui. Use o IP ou o nome desta máquina na rede.</small>
          </div>
        </div>
        <label class="check"><input type="checkbox" id="cNotifications" ${checked(config.notificationsEnabled)} ${API.mode === 'local' ? 'disabled' : ''}> Enviar avisos automáticos a cada etapa do fluxo</label>
        <label class="check"><input type="checkbox" id="cReminders" ${checked(config.remindersEnabled)} ${API.mode === 'local' ? 'disabled' : ''}> Cobrar quem está com pendência perto do prazo</label>
        <div class="grid">
          <div class="field">
            <label for="cReminderDays">Começar a cobrar a quantos dias do prazo</label>
            <input id="cReminderDays" type="number" min="0" max="30" value="${esc(config.reminderDaysBefore)}">
            <small class="muted">Um lembrete por cargo por dia, incluindo os atrasados.</small>
          </div>
        </div>
      </div>
    </div>

    ${API.mode === 'local' ? `
    <div class="card">
      <div class="head"><b>Servidor de e-mail (SMTP)</b></div>
      <div class="body">
        <p class="muted">O envio automático de e-mails depende do servidor. Rode <code>node server.js</code> e acesse pelo endereço da máquina para configurar o SMTP, os avisos de cada etapa e a cobrança de prazo.</p>
        <p class="muted">No modo local, use o botão <b>Preparar e-mail</b> em Administração: ele abre a mensagem pronta, com o código de acesso, no seu cliente de e-mail.</p>
      </div>
    </div>` : `
    <div class="card">
      <div class="head"><b>Servidor de e-mail (SMTP)</b></div>
      <div class="body">
        <div class="grid">
          <div class="field"><label for="cHost">Servidor</label><input id="cHost" value="${esc(config.smtp.host)}" placeholder="smtp.empresa.com"></div>
          <div class="field"><label for="cPort">Porta</label><input id="cPort" type="number" value="${esc(config.smtp.port)}"></div>
          <div class="field"><label for="cUser">Usuário</label><input id="cUser" value="${esc(config.smtp.user)}" autocomplete="off"></div>
          <div class="field"><label for="cPass">Senha</label><input id="cPass" type="password" autocomplete="new-password" placeholder="${config.smtp.hasPassword ? 'gravada — deixe em branco para manter' : 'senha do e-mail'}"></div>
          <div class="field full"><label for="cFrom">Remetente</label><input id="cFrom" value="${esc(config.smtp.from)}" placeholder="Carreira &amp; Recompensa &lt;rh@empresa.com&gt;"></div>
        </div>
        <label class="check"><input type="checkbox" id="cSecure" ${checked(config.smtp.secure)}> Conexão TLS direta (porta 465). Deixe desmarcado na porta 587, que usa STARTTLS.</label>
        <div class="actions mt">
          <button class="btn primary" data-action="config-save">Salvar configurações</button>
          <button class="btn secondary" data-action="config-test">Enviar e-mail de teste</button>
          <button class="btn outline" data-action="reminders-run">Rodar cobrança agora</button>
        </div>
      </div>
    </div>`}`;
}

function collectConfig() {
  const base = {
    appUrl: $('#cAppUrl').value.trim(),
    notificationsEnabled: $('#cNotifications').checked,
    remindersEnabled: $('#cReminders').checked,
    reminderDaysBefore: Number($('#cReminderDays').value) || 0
  };

  // Os campos de SMTP só existem no modo servidor.
  if (!$('#cHost')) return base;

  return {
    ...base,
    smtp: {
      host: $('#cHost').value.trim(),
      port: Number($('#cPort').value) || 587,
      user: $('#cUser').value.trim(),
      pass: $('#cPass').value,
      from: $('#cFrom').value.trim(),
      secure: $('#cSecure').checked
    }
  };
}

/* ========================== VISÃO: DOCUMENTO ============================= */
function documentView() {
  const job = API.getJob(state.jobId);
  if (!job) return show('jobs');

  const rows = (Model.sections().find(s => s.layout === 'table') || Model.sections()[0]).fields
    .map(f => `<tr><th>${esc(f.label)}</th><td>${esc(f.type === 'date' ? formatDate(job[f.key]) : job[f.key] || '—')}</td></tr>`)
    .join('');

  const blocks = Model.allFields().filter(f => f.section !== identificationId())
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
  const code = element ? element.dataset.code : null;

  /* Executa uma chamada à API cuidando de erro, botão travado e re-render. */
  const run = async (promise, successMessage) => {
    if (element) element.disabled = true;
    try {
      const result = await promise;
      const mail = result && result.mail;
      if (mail && mail.failed) {
        toast(`${successMessage || 'Feito'} — mas ${mail.failed} e-mail(s) não saíram. Confira em Configurações.`, 'error');
      } else if (result && result.message) {
        toast(result.message, 'success');
      } else if (successMessage) {
        toast(successMessage, 'success');
      }
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
    case 'cancel':
      return askText('Cancelar cargo', 'Motivo do cancelamento',
        text => run(API.transition(id, 'cancel', { text }), 'Cargo cancelado'));
    case 'doc':
      return show('document', id);
    case 'print':
      return window.print();
    case 'resend': {
      const job = API.getJob(id) || (API.jobs || []).find(j => String(j.id) === String(id));
      return askText('Gerar novo código',
        `Digite GERAR para criar um código novo para "${job ? job.name : 'este cargo'}". O código atual deixa de valer na hora.`,
        async text => {
          if (text.trim().toUpperCase() !== 'GERAR') return toast('Confirmação inválida', 'error');
          try {
            const resultado = await API.resendCode(id);
            if (resultado.code) revealCode('Novo código de acesso', resultado.code, { job, aviso: resultado.aviso });
            else toast(resultado.message, 'success');
            show(state.view);
          } catch (err) {
            toast(err.message, 'error');
          }
        });
    }
    case 'export':
      return run(API.exportCsv(), 'Arquivo gerado');
    case 'share':
      return API.downloadShare()
        .then(codigo => revealCode('Arquivo gerado — guarde o código de acesso dele', codigo, {
          aviso: 'A cópia não leva os códigos de ninguém. Este é o acesso de C&R exclusivo do arquivo que você vai enviar.'
        }))
        .catch(err => toast(err.message, 'error'));
    case 'new':
      return newJobModal();

    /* -------------------------- Códigos de acesso ------------------------ */
    case 'key-new':
      return userModal();
    case 'key-edit':
      return userModal((usersView.cache || []).find(k => k.id === id));
    case 'key-delete': {
      const key = (usersView.cache || []).find(k => k.id === id);
      return askText('Revogar acesso', `Digite REVOGAR para tirar o acesso de ${key ? key.name : 'esta pessoa'}`, text => {
        if (text.trim().toUpperCase() !== 'REVOGAR') return toast('Confirmação inválida', 'error');
        run(API.deleteKey(id), 'Acesso revogado');
      });
    }
    case 'copy':
      return navigator.clipboard.writeText(code)
        .then(() => toast('Código copiado: ' + code, 'success'))
        .catch(() => toast('Copie manualmente: ' + code));

    /* ------------------------------ Modelo ------------------------------ */
    case 'section-new':
      return sectionModal();
    case 'section-edit':
      return sectionModal(Number(element.dataset.index));
    case 'section-move':
      return updateModel(draft => {
        const from = Number(element.dataset.index);
        const to = from + Number(element.dataset.dir);
        [draft[from], draft[to]] = [draft[to], draft[from]];
      }, 'Ordem atualizada');
    case 'section-del': {
      const index = Number(element.dataset.index);
      const section = Model.sections()[index];
      return askText('Excluir seção', `Digite EXCLUIR para remover "${section.title}" e seus ${section.fields.length} campo(s)`, text => {
        if (text.trim().toUpperCase() !== 'EXCLUIR') return toast('Confirmação inválida', 'error');
        updateModel(draft => draft.splice(index, 1), 'Seção excluída');
      });
    }
    case 'field-new':
      return fieldModal(Number(element.dataset.index));
    case 'field-edit':
      return fieldModal(Number(element.dataset.index), Number(element.dataset.fieldIndex));
    case 'field-move':
      return updateModel(draft => {
        const fields = draft[Number(element.dataset.index)].fields;
        const from = Number(element.dataset.fieldIndex);
        const to = from + Number(element.dataset.dir);
        [fields[from], fields[to]] = [fields[to], fields[from]];
      }, 'Ordem atualizada');
    case 'field-del': {
      const si = Number(element.dataset.index);
      const fi = Number(element.dataset.fieldIndex);
      const field = Model.sections()[si].fields[fi];
      if (PROTECTED_KEYS.includes(field.key)) return toast('Este campo não pode ser removido: identifica o cargo', 'error');
      return updateModel(draft => draft[si].fields.splice(fi, 1), 'Campo excluído');
    }
    case 'model-reset':
      return askText('Restaurar modelo padrão', 'Digite RESTAURAR para voltar ao MAPA DE CARREIRA original', text => {
        if (text.trim().toUpperCase() !== 'RESTAURAR') return toast('Confirmação inválida', 'error');
        run(API.resetModel(), 'Modelo padrão restaurado');
      });

    /* --------------------------- Configurações -------------------------- */
    case 'config-save':
      return run(API.saveConfig(collectConfig()), 'Configurações salvas');
    case 'config-test':
      return askText('Enviar e-mail de teste', 'Para qual endereço?', to => run(API.testMail(to.trim())));
    case 'reminders-run':
      return run(API.runReminders());

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

/* -------------------------- Aviso de modo no login ----------------------- */
if (API.mode === 'local') {
  $('#loginModeNote').innerHTML = API.persistent
    ? 'Modo local: os dados ficam neste navegador. Para usar entre várias pessoas, rode <code>node server.js</code>.'
    : 'Modo de teste: este navegador não está guardando dados de arquivos abertos do disco — dá para navegar por tudo, mas o preenchido se perde ao recarregar. Para guardar, use o atalho <code>abrir.bat</code>.';
}
