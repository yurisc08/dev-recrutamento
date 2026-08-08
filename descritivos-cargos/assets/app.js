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
  hr:       [
    { view: 'approvals', label: 'Validações' },
    { view: 'jobs', label: 'Cargos' },
    { view: 'admin', label: 'Administração' },
    { view: 'users', label: 'Usuários' },
    { view: 'config', label: 'Configurações' }
  ]
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
  ({
    jobs: jobsView,
    approvals: approvalsView,
    admin: adminView,
    users: usersView,
    config: configView,
    job: jobView,
    document: documentView
  }[view] || jobsView)();
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
    <button class="btn outline" data-action="reset">Restaurar dados de teste</button>`;

  $('#content').innerHTML = `
    ${API.smtpReady ? '' : `<div class="banner warn">O envio de e-mails ainda não está configurado — os avisos do fluxo não saem sozinhos. Ajuste em <b>Configurações</b>.</div>`}
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
              <p class="muted">Código de acesso: <b class="code">${esc(j.code)}</b></p>
            </div>
            ${badge(j.status)}
          </div>
          <div class="job-meta">${deadlineTag(j)}${mailNote}</div>
          <div class="actions mt-sm">
            <button class="btn primary" data-action="open" data-id="${j.id}">Abrir</button>
            <button class="btn secondary" data-action="${API.smtpReady ? 'resend' : 'mail'}" data-id="${j.id}">${API.smtpReady ? 'Reenviar código' : 'Preparar e-mail'}</button>
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
      const { job, mail } = await API.createJob(data);
      closeModal();
      show('admin');

      if (mail && mail.sent) {
        toast(`Cargo criado (${job.code}) e código enviado para ${job.managerEmail}`, 'success');
      } else {
        // Sem envio automático, abre o e-mail já escrito no cliente da pessoa.
        toast('Cargo criado com o código ' + job.code, 'success');
        prepareMail(job.id);
      }
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

/* =========================== VISÃO: USUÁRIOS ============================= */
/*
 * Só C&R chega aqui. São os acessos internos — aprovadores e a própria equipe
 * de C&R. Responsáveis pelo preenchimento não entram nesta lista: eles usam o
 * código de acesso do cargo.
 */
async function usersView() {
  if (session().role !== 'hr') return show('approvals');

  $('#title').textContent = 'Usuários internos';
  $('#subtitle').textContent = 'Aprovadores e equipe de Carreira & Recompensa';
  $('#topActions').innerHTML = `<button class="btn primary" data-action="user-new">Novo usuário</button>`;
  $('#content').innerHTML = `<div class="card"><div class="body empty">Carregando…</div></div>`;

  let users;
  try {
    users = await API.listUsers();
  } catch (err) {
    return toast(err.message, 'error');
  }

  $('#content').innerHTML = `
    <div class="banner">Os responsáveis pelo preenchimento não precisam de usuário: eles entram com o código de acesso enviado por e-mail.</div>
    <div class="card">
      <div class="body">
        <table class="list">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th></th></tr></thead>
          <tbody>${users.map(u => `
            <tr>
              <td><b>${esc(u.name)}</b></td>
              <td>${esc(u.email)}</td>
              <td>${ROLES[u.role].label}</td>
              <td class="right">
                <button class="btn secondary" data-action="user-edit" data-email="${esc(u.email)}">Editar</button>
                <button class="btn danger" data-action="user-delete" data-email="${esc(u.email)}">Excluir</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  // Guarda os dados para o modal de edição não precisar buscar de novo.
  usersView.cache = users;
}

function userModal(user) {
  const editing = Boolean(user);
  openModal(`
    <h2>${editing ? 'Editar usuário' : 'Novo usuário'}</h2>
    <div class="grid">
      <div class="field"><label for="uName">Nome <span class="req">*</span></label>
        <input id="uName" value="${esc(user ? user.name : '')}"></div>
      <div class="field"><label for="uEmail">E-mail <span class="req">*</span></label>
        <input id="uEmail" type="email" value="${esc(user ? user.email : '')}" ${editing ? 'disabled' : ''}></div>
      <div class="field"><label for="uRole">Perfil <span class="req">*</span></label>
        <select id="uRole">
          <option value="approver" ${user && user.role === 'approver' ? 'selected' : ''}>Aprovador</option>
          <option value="hr" ${user && user.role === 'hr' ? 'selected' : ''}>Carreira &amp; Recompensa</option>
        </select></div>
      <div class="field"><label for="uPassword">Senha ${editing ? '' : '<span class="req">*</span>'}</label>
        <input id="uPassword" type="password" placeholder="${editing ? 'deixe em branco para manter' : 'mínimo 8 caracteres, com letras e números'}"></div>
    </div>
    <p class="muted">O nome do aprovador precisa ser exatamente o mesmo informado no cadastro do cargo — é por ele que a fila de aprovação encontra os descritivos.</p>
    <button class="btn primary full mt" data-modal-action="save-user">Salvar</button>
  `);

  const button = $('#modalContent').querySelector('[data-modal-action="save-user"]');
  button.onclick = async () => {
    const data = {
      name: $('#uName').value.trim(),
      email: $('#uEmail').value.trim(),
      role: $('#uRole').value,
      password: $('#uPassword').value
    };

    button.disabled = true;
    try {
      if (editing) {
        const patch = { name: data.name, role: data.role };
        if (data.password) patch.password = data.password;
        await API.updateUser(user.email, patch);
      } else {
        await API.createUser(data);
      }
      closeModal();
      toast('Usuário salvo', 'success');
      usersView();
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
    }
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
        <label class="check"><input type="checkbox" id="cNotifications" ${checked(config.notificationsEnabled)}> Enviar avisos automáticos a cada etapa do fluxo</label>
        <label class="check"><input type="checkbox" id="cReminders" ${checked(config.remindersEnabled)}> Cobrar quem está com pendência perto do prazo</label>
        <div class="grid">
          <div class="field">
            <label for="cReminderDays">Começar a cobrar a quantos dias do prazo</label>
            <input id="cReminderDays" type="number" min="0" max="30" value="${esc(config.reminderDaysBefore)}">
            <small class="muted">Um lembrete por cargo por dia, incluindo os atrasados.</small>
          </div>
        </div>
      </div>
    </div>

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
    </div>`;
}

function collectConfig() {
  return {
    appUrl: $('#cAppUrl').value.trim(),
    notificationsEnabled: $('#cNotifications').checked,
    remindersEnabled: $('#cReminders').checked,
    reminderDaysBefore: Number($('#cReminderDays').value) || 0,
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
  const email = element ? element.dataset.email : null;

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
    case 'mail':
      return prepareMail(id);
    case 'resend':
      return run(API.resendCode(id));
    case 'export':
      return run(API.exportCsv(), 'Arquivo gerado');
    case 'new':
      return newJobModal();

    /* ------------------------------ Usuários ---------------------------- */
    case 'user-new':
      return userModal();
    case 'user-edit':
      return userModal((usersView.cache || []).find(u => u.email === email));
    case 'user-delete':
      return askText('Excluir usuário', `Digite EXCLUIR para remover o acesso de ${email}`, text => {
        if (text.trim().toUpperCase() !== 'EXCLUIR') return toast('Confirmação inválida', 'error');
        run(API.deleteUser(email), 'Usuário excluído');
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
