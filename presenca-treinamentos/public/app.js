/* Painel de controle de presenca — SPA em JS puro (sem build). */
(() => {
  'use strict';

  const app = document.getElementById('app');
  const state = { user: null, route: '', cache: {} };

  // ------------------------------------------------------------------ API ---
  async function api(path, options = {}) {
    const response = await fetch('/api' + path, {
      headers: options.body ? { 'content-type': 'application/json' } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401 && state.user) {
      state.user = null;
      renderLogin();
      throw new Error('Sessao expirada.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'Falha na requisicao.');
    return data;
  }

  // -------------------------------------------------------------- Helpers ---
  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    );

  const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
  const pct = (value) => `${Number(value ?? 0).toFixed(1).replace('.', ',')}%`;

  /** ISO (UTC) -> valor de <input type="datetime-local"> no fuso do navegador. */
  function toLocalInput(iso) {
    const date = iso ? new Date(iso) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }
  const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

  function statusBadge(status, flags = {}) {
    const labels = {
      presente: 'Presente',
      parcial: 'Parcial',
      ausente: 'Ausente',
      justificada: 'Abonada',
    };
    const marks = [];
    if (flags.late) marks.push('<span class="flag">atraso</span>');
    if (flags.left_early) marks.push('<span class="flag">saiu antes</span>');
    if (flags.missing_checkout) marks.push('<span class="flag">sem saida</span>');
    return `<span class="badge ${status}">${labels[status] || status}</span>${
      marks.length ? `<span class="flags">${marks.join('')}</span>` : ''
    }`;
  }

  function situacaoBadge(situacao) {
    const map = {
      aprovado: ['ok', 'Aprovado'],
      reprovado: ['err', 'Reprovado'],
      em_andamento: ['info', 'Em andamento'],
    };
    const [cls, label] = map[situacao] || ['neutro', situacao];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function bar(percent) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const level = value >= 75 ? '' : value >= 50 ? 'mid' : 'low';
    return `<div class="bar ${level}"><span style="width:${value}%"></span></div>`;
  }

  function toast(message, isError = false) {
    const node = document.createElement('div');
    node.className = 'toast' + (isError ? ' err' : '');
    node.textContent = message;
    document.getElementById('toast-root').appendChild(node);
    setTimeout(() => node.remove(), 3800);
  }

  /** Modal com formulario; onSubmit recebe os valores dos campos. */
  function modal({ title, fields, submitLabel = 'Salvar', onSubmit, extraHtml = '' }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>${esc(title)}</h2>
          <form id="modal-form">
            ${extraHtml}
            ${fields.map(renderField).join('')}
            <div class="modal-actions">
              <button type="button" class="btn" data-close>Cancelar</button>
              <button type="submit" class="btn primary">${esc(submitLabel)}</button>
            </div>
          </form>
        </div>
      </div>`;

    const close = () => (root.innerHTML = '');
    root.querySelector('[data-close]').onclick = close;
    root.querySelector('.modal-backdrop').onclick = (event) => {
      if (event.target.classList.contains('modal-backdrop')) close();
    };

    root.querySelector('#modal-form').onsubmit = async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button[type=submit]');
      button.disabled = true;
      const values = {};
      for (const field of fields) {
        const input = root.querySelector(`[name="${field.name}"]`);
        values[field.name] = field.type === 'checkbox' ? input.checked : input.value;
      }
      try {
        await onSubmit(values);
        close();
      } catch (error) {
        toast(error.message, true);
        button.disabled = false;
      }
    };

    const first = root.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function renderField(field) {
    const value = field.value ?? '';
    if (field.type === 'select') {
      return `<div class="field"><label>${esc(field.label)}</label><select name="${field.name}">
        ${field.options
          .map(
            (option) =>
              `<option value="${esc(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${esc(option.label)}</option>`,
          )
          .join('')}
      </select></div>`;
    }
    if (field.type === 'checkbox') {
      return `<div class="field"><label style="display:flex;gap:8px;align-items:center">
        <input type="checkbox" name="${field.name}" style="width:auto" ${value ? 'checked' : ''}/> ${esc(field.label)}
      </label></div>`;
    }
    if (field.type === 'textarea') {
      return `<div class="field"><label>${esc(field.label)}</label><textarea name="${field.name}" rows="3">${esc(value)}</textarea></div>`;
    }
    return `<div class="field"><label>${esc(field.label)}</label>
      <input type="${field.type || 'text'}" name="${field.name}" value="${esc(value)}"
        ${field.step ? `step="${field.step}"` : ''} ${field.required === false ? '' : 'required'} /></div>`;
  }

  async function confirmAction(message, action) {
    if (!window.confirm(message)) return;
    try {
      await action();
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------------------------------------------------------------- Login ---
  function renderLogin(needsSetup = false) {
    app.className = '';
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1>${needsSetup ? 'Primeiro acesso' : 'Controle de Presenca'}</h1>
          <p class="sub">${
            needsSetup
              ? 'Crie o usuario administrador do sistema.'
              : 'Treinamentos e turmas — leitura de crachas.'
          }</p>
          <div id="login-error"></div>
          <form id="login-form">
            ${needsSetup ? '<div class="field"><label>Nome</label><input name="name" required /></div>' : ''}
            <div class="field"><label>E-mail</label><input type="email" name="email" required /></div>
            <div class="field"><label>Senha</label><input type="password" name="password" required /></div>
            <button class="btn primary" style="width:100%" type="submit">
              ${needsSetup ? 'Criar administrador' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>`;

    document.getElementById('login-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const body = Object.fromEntries(form.entries());
      try {
        const data = await api(needsSetup ? '/auth/setup' : '/auth/login', { method: 'POST', body });
        state.user = data.user;
        location.hash = '#/painel';
        renderShell();
      } catch (error) {
        document.getElementById('login-error').innerHTML =
          `<div class="error-msg">${esc(error.message)}</div>`;
      }
    };
  }

  // ---------------------------------------------------------------- Shell ---
  const NAV = [
    ['#/painel', 'Painel'],
    ['#/turmas', 'Turmas'],
    ['#/agenda', 'Aulas'],
    ['#/pessoas', 'Pessoas'],
    ['#/treinamentos', 'Treinamentos'],
    ['#/salas', 'Salas'],
    ['#/dispositivos', 'Leitores'],
    ['#/leituras', 'Leituras'],
  ];

  function renderShell() {
    app.className = '';
    app.innerHTML = `
      <div class="shell">
        <nav class="sidebar">
          <div class="brand">Presenca<small>treinamentos e turmas</small></div>
          ${NAV.map(([href, label]) => `<a href="${href}" data-nav="${href}">${label}</a>`).join('')}
          <div class="spacer"></div>
          <div class="user">
            ${esc(state.user.name)}<br />${esc(state.user.email)}
            <br /><a href="#" id="logout" style="padding:6px 0;color:#8fa0bd">Sair</a>
          </div>
        </nav>
        <main class="main" id="view"></main>
      </div>`;

    document.getElementById('logout').onclick = async (event) => {
      event.preventDefault();
      await api('/auth/logout', { method: 'POST' });
      state.user = null;
      location.hash = '';
      renderLogin();
    };

    route();
  }

  function setActiveNav(route) {
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const base = '#/' + route.split('/')[1];
      link.classList.toggle('active', link.dataset.nav === base);
    });
  }

  const view = () => document.getElementById('view');
  const setView = (html) => (view().innerHTML = html);

  function pageHead(title, subtitle, actions = '') {
    return `<div class="page-head">
      <div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
      <div class="page-actions">${actions}</div>
    </div>`;
  }

  // --------------------------------------------------------------- Router ---
  const routes = [
    [/^\/painel$/, renderDashboard],
    [/^\/turmas$/, renderClasses],
    [/^\/turmas\/(.+)$/, renderClassDetail],
    [/^\/agenda$/, renderAgenda],
    [/^\/aulas\/(.+)$/, renderSession],
    [/^\/pessoas$/, renderPeople],
    [/^\/pessoas\/(.+)$/, renderPersonDetail],
    [/^\/treinamentos$/, renderCourses],
    [/^\/salas$/, renderRooms],
    [/^\/dispositivos$/, renderDevices],
    [/^\/leituras$/, renderScans],
  ];

  async function route() {
    const path = (location.hash || '#/painel').slice(1);
    state.route = path;
    setActiveNav(path);
    setView('<div class="empty">Carregando…</div>');

    for (const [pattern, handler] of routes) {
      const match = path.match(pattern);
      if (match) {
        try {
          await handler(...match.slice(1));
        } catch (error) {
          setView(`<div class="card"><div class="error-msg">${esc(error.message)}</div></div>`);
        }
        return;
      }
    }
    setView('<div class="card empty">Pagina nao encontrada.</div>');
  }

  // ------------------------------------------------------------- Dashboard --
  async function renderDashboard() {
    const data = await api('/dashboard');
    const counts = data.counts || {};

    const stat = (value, label, alert = false) =>
      `<div class="stat ${alert ? 'alert' : ''}"><div class="value">${value}</div><div class="label">${label}</div></div>`;

    setView(`
      ${pageHead('Painel', `Hoje, ${fmtDate(data.servidor.agora)} — fuso ${data.servidor.timezone}`)}
      <div class="grid cols-4" style="margin-bottom:18px">
        ${stat(counts.aulas_hoje ?? 0, 'Aulas hoje')}
        ${stat(counts.leituras_hoje ?? 0, 'Leituras de cracha hoje')}
        ${stat(counts.turmas_abertas ?? 0, 'Turmas abertas')}
        ${stat(counts.pessoas ?? 0, 'Pessoas cadastradas')}
        ${stat(counts.dispositivos ?? 0, 'Leitores ativos')}
        ${stat(counts.crachas_nao_identificados ?? 0, 'Crachas nao identificados', (counts.crachas_nao_identificados ?? 0) > 0)}
      </div>

      <div class="card">
        <h2>Aulas de hoje</h2>
        ${
          data.aulas_hoje.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Horario</th><th>Turma</th><th>Treinamento</th><th>Sala</th>
                  <th class="num">Presentes</th><th class="num">Matriculados</th><th></th></tr></thead>
                <tbody>${data.aulas_hoje
                  .map(
                    (session) => `<tr>
                      <td class="nowrap">${fmtTime(session.starts_at)} – ${fmtTime(session.ends_at)}</td>
                      <td><strong>${esc(session.class_code)}</strong></td>
                      <td>${esc(session.course_name)}</td>
                      <td>${esc(session.room_name || '—')}</td>
                      <td class="num">${session.presentes}</td>
                      <td class="num">${session.matriculados}</td>
                      <td class="right"><a class="btn small" href="#/aulas/${session.id}">Chamada</a></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhuma aula programada para hoje.</div>'
        }
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h2>Ultimas leituras</h2>
          ${
            data.ultimas_leituras.length
              ? `<div class="table-wrap"><table><tbody>${data.ultimas_leituras
                  .map(
                    (scan) => `<tr>
                      <td class="nowrap">${fmtDateTime(scan.scanned_at)}</td>
                      <td>${scan.full_name ? esc(scan.full_name) : `<span class="badge err">cracha ${esc(scan.badge_code)}</span>`}</td>
                      <td class="muted small">${esc(scan.device_name || 'manual')}</td>
                      <td>${scan.class_code ? `<span class="badge info">${esc(scan.class_code)}</span>` : '<span class="muted small">sem aula</span>'}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : '<div class="empty">Nenhuma leitura registrada ainda.</div>'
          }
        </div>
        <div class="card">
          <h2>Leitores sem comunicacao (1h+)</h2>
          ${
            data.dispositivos_sem_comunicacao.length
              ? `<table><tbody>${data.dispositivos_sem_comunicacao
                  .map(
                    (device) =>
                      `<tr><td>${esc(device.name)}</td><td class="muted small right">${
                        device.last_seen_at ? 'ultima: ' + fmtDateTime(device.last_seen_at) : 'nunca conectou'
                      }</td></tr>`,
                  )
                  .join('')}</tbody></table>`
              : '<div class="empty">Todos os leitores comunicando normalmente.</div>'
          }
        </div>
      </div>`);
  }

  // ---------------------------------------------------------------- Turmas --
  async function renderClasses() {
    const [{ classes }, { courses }, { rooms }] = await Promise.all([
      api('/classes'),
      api('/courses'),
      api('/rooms'),
    ]);

    setView(`
      ${pageHead('Turmas', 'Cada turma agrupa alunos e as aulas de um treinamento.',
        '<button class="btn primary" id="new-class">Nova turma</button>')}
      <div class="card">
        ${
          classes.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Codigo</th><th>Treinamento</th><th>Instrutor</th><th>Periodo</th>
                  <th class="num">Alunos</th><th class="num">Aulas</th><th>Situacao</th><th></th></tr></thead>
                <tbody>${classes
                  .map(
                    (turma) => `<tr>
                      <td><strong>${esc(turma.code)}</strong><br /><span class="muted small">${esc(turma.name || '')}</span></td>
                      <td>${esc(turma.course_name)}</td>
                      <td>${esc(turma.instructor || '—')}</td>
                      <td class="nowrap small">${turma.first_session ? `${fmtDate(turma.first_session)} a ${fmtDate(turma.last_session)}` : '—'}</td>
                      <td class="num">${turma.students}</td>
                      <td class="num">${turma.sessions}</td>
                      <td><span class="badge neutro">${esc(turma.status)}</span></td>
                      <td class="right"><a class="btn small" href="#/turmas/${turma.id}">Abrir</a></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhuma turma cadastrada. Comece criando um treinamento e depois uma turma.</div>'
        }
      </div>`);

    document.getElementById('new-class').onclick = () => {
      if (!courses.length) return toast('Cadastre um treinamento antes.', true);
      modal({
        title: 'Nova turma',
        fields: [
          { name: 'course_id', label: 'Treinamento', type: 'select',
            options: courses.map((course) => ({ value: course.id, label: course.name })) },
          { name: 'code', label: 'Codigo da turma (ex.: NR35-2026-01)' },
          { name: 'name', label: 'Nome/descricao', required: false },
          { name: 'instructor', label: 'Instrutor', required: false },
          { name: 'room_id', label: 'Sala padrao', type: 'select', required: false,
            options: [{ value: '', label: '— sem sala —' }, ...rooms.map((room) => ({ value: room.id, label: room.name }))] },
          { name: 'min_attendance_percent', label: 'Frequencia minima para aprovacao (%)', type: 'number', value: 75 },
        ],
        onSubmit: async (values) => {
          const { id } = await api('/classes', { method: 'POST', body: values });
          toast('Turma criada.');
          location.hash = `#/turmas/${id}`;
        },
      });
    };
  }

  async function renderClassDetail(id) {
    const [detail, report, { rooms }, { people }] = await Promise.all([
      api(`/classes/${id}`),
      api(`/classes/${id}/report`),
      api('/rooms'),
      api('/people'),
    ]);
    const turma = detail.turma;

    setView(`
      ${pageHead(
        `${turma.code} — ${turma.course_name}`,
        `${turma.instructor ? 'Instrutor: ' + turma.instructor + ' · ' : ''}Frequencia minima: ${pct(turma.min_attendance_percent)}`,
        `<button class="btn" id="add-session">Nova aula</button>
         <button class="btn" id="add-student">Matricular</button>
         <button class="btn" id="recompute">Recalcular</button>
         <a class="btn primary" href="/api/classes/${id}/report.csv">Baixar CSV</a>`,
      )}

      <div class="card">
        <h2>Frequencia consolidada</h2>
        ${
          report.students.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Aluno</th>
                  ${report.sessions.map((session) => `<th class="num" title="${esc(session.title || '')}">${fmtDate(session.starts_at)}</th>`).join('')}
                  <th class="num">Frequencia</th><th>Situacao</th></tr></thead>
                <tbody>${report.students
                  .map(
                    (student) => `<tr>
                      <td><a href="#/pessoas/${student.id}">${esc(student.full_name)}</a>
                        <br /><span class="muted small">${esc(student.department || '')}</span></td>
                      ${report.sessions
                        .map((session) => {
                          if (!session.realizada) return '<td class="num muted">·</td>';
                          const cell = student.sessions[session.id];
                          const marks = { presente: '✔', parcial: '◐', ausente: '✘', justificada: 'A' };
                          return `<td class="num"><span class="badge ${cell.status}" title="${pct(cell.percent)}">${marks[cell.status]}</span></td>`;
                        })
                        .join('')}
                      <td class="num">${pct(student.summary.percent)}<br />${bar(student.summary.percent)}</td>
                      <td>${situacaoBadge(student.summary.situacao)}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>
               <p class="muted small" style="margin:12px 0 0">✔ presente · ◐ parcial · ✘ ausente · A abonada · · aula ainda nao realizada.
                 A frequencia considera apenas as aulas ja encerradas${
                   report.minutos_pendentes > 0 ? ` (faltam ${report.minutos_pendentes} min de aula)` : ''
                 }.</p>`
            : '<div class="empty">Nenhum aluno matriculado nesta turma.</div>'
        }
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h2>Aulas</h2>
          ${
            detail.sessions.length
              ? `<div class="table-wrap"><table>
                  <thead><tr><th>Data</th><th>Horario</th><th>Titulo</th><th class="num">Presentes</th><th></th></tr></thead>
                  <tbody>${detail.sessions
                    .map(
                      (session) => `<tr ${session.canceled ? 'style="opacity:.5"' : ''}>
                        <td class="nowrap">${fmtDate(session.starts_at)}</td>
                        <td class="nowrap">${fmtTime(session.starts_at)}–${fmtTime(session.ends_at)}</td>
                        <td class="ellipsis" title="${esc(session.title || '')}">${esc(session.title || '—')} ${session.canceled ? '<span class="badge err">cancelada</span>' : ''}</td>
                        <td class="num">${session.presentes}</td>
                        <td class="right"><a class="btn small" href="#/aulas/${session.id}">Chamada</a></td>
                      </tr>`,
                    )
                    .join('')}</tbody></table></div>`
              : '<div class="empty">Nenhuma aula cadastrada.</div>'
          }
        </div>

        <div class="card">
          <h2>Alunos matriculados (${detail.students.length})</h2>
          ${
            detail.students.length
              ? `<div class="table-wrap"><table><tbody>${detail.students
                  .map(
                    (student) => `<tr>
                      <td><a href="#/pessoas/${student.id}">${esc(student.full_name)}</a></td>
                      <td class="mono muted small">${esc(student.badges || 'sem cracha')}</td>
                      <td class="right"><button class="btn small danger" data-unenroll="${student.id}">Remover</button></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : '<div class="empty">Ninguem matriculado ainda.</div>'
          }
        </div>
      </div>`);

    document.getElementById('add-session').onclick = () => {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 2 * 3600 * 1000);
      modal({
        title: 'Nova aula',
        fields: [
          { name: 'title', label: 'Titulo', required: false },
          { name: 'starts_at', label: 'Inicio', type: 'datetime-local', value: toLocalInput(start.toISOString()) },
          { name: 'ends_at', label: 'Fim', type: 'datetime-local', value: toLocalInput(end.toISOString()) },
          { name: 'room_id', label: 'Sala', type: 'select', required: false,
            options: [{ value: '', label: '— usar sala da turma —' }, ...rooms.map((room) => ({ value: room.id, label: room.name }))] },
          { name: 'tolerance_minutes', label: 'Tolerancia de atraso (min)', type: 'number', value: 10 },
          { name: 'min_presence_percent', label: 'Presenca minima na aula (%)', type: 'number', value: 75 },
          { name: 'require_checkout', label: 'Exigir leitura de saida', type: 'checkbox' },
          { name: 'repeat_weeks', label: 'Repetir por N semanas', type: 'number', value: 1 },
        ],
        onSubmit: async (values) => {
          await api(`/classes/${id}/sessions`, {
            method: 'POST',
            body: {
              ...values,
              starts_at: fromLocalInput(values.starts_at),
              ends_at: fromLocalInput(values.ends_at),
            },
          });
          toast('Aula(s) criada(s).');
          route();
        },
      });
    };

    document.getElementById('add-student').onclick = () => {
      const enrolled = new Set(detail.students.map((student) => student.id));
      const options = people
        .filter((person) => !enrolled.has(person.id))
        .map((person) => ({ value: person.id, label: `${person.full_name}${person.department ? ' — ' + person.department : ''}` }));
      if (!options.length) return toast('Todas as pessoas ja estao matriculadas.', true);

      modal({
        title: 'Matricular aluno',
        fields: [{ name: 'person_id', label: 'Pessoa', type: 'select', options }],
        onSubmit: async (values) => {
          await api(`/classes/${id}/enrollments`, { method: 'POST', body: values });
          toast('Aluno matriculado.');
          route();
        },
      });
    };

    document.getElementById('recompute').onclick = async () => {
      await api(`/classes/${id}/recompute`, { method: 'POST' });
      toast('Presencas recalculadas.');
      route();
    };

    view().querySelectorAll('[data-unenroll]').forEach((button) => {
      button.onclick = () =>
        confirmAction('Remover a matricula deste aluno?', async () => {
          await api(`/classes/${id}/enrollments/${button.dataset.unenroll}`, { method: 'DELETE' });
          toast('Matricula removida.');
          route();
        });
    });
  }

  // ---------------------------------------------------------------- Agenda --
  async function renderAgenda() {
    const today = new Date();
    const from = new Date(today.getTime() - 7 * 86400000).toISOString();
    const to = new Date(today.getTime() + 30 * 86400000).toISOString();
    const { sessions } = await api(`/sessions?from=${from}&to=${to}`);

    setView(`
      ${pageHead('Aulas', 'Ultimos 7 dias e proximos 30 dias.')}
      <div class="card">
        ${
          sessions.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Data</th><th>Horario</th><th>Turma</th><th>Treinamento</th><th>Sala</th>
                  <th class="num">Presentes</th><th class="num">Matriculados</th><th></th></tr></thead>
                <tbody>${sessions
                  .map(
                    (session) => `<tr>
                      <td class="nowrap">${fmtDate(session.starts_at)}</td>
                      <td class="nowrap">${fmtTime(session.starts_at)}–${fmtTime(session.ends_at)}</td>
                      <td><strong>${esc(session.class_code)}</strong></td>
                      <td>${esc(session.course_name)}</td>
                      <td>${esc(session.room_name || '—')}</td>
                      <td class="num">${session.presentes}</td>
                      <td class="num">${session.matriculados}</td>
                      <td class="right"><a class="btn small" href="#/aulas/${session.id}">Chamada</a></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhuma aula neste periodo.</div>'
        }
      </div>`);
  }

  // ----------------------------------------------------------- Chamada -----
  async function renderSession(id) {
    const data = await api(`/sessions/${id}`);
    const session = data.session;
    const presentes = data.attendance.filter((row) => ['presente', 'justificada'].includes(row.status)).length;

    setView(`
      ${pageHead(
        `Chamada — ${session.class_code}`,
        `${esc(session.course_name)} · ${fmtDate(session.starts_at)} · ${fmtTime(session.starts_at)}–${fmtTime(session.ends_at)}`,
        `<button class="btn" id="manual">Marcar presenca manual</button>
         <button class="btn" id="recompute">Recalcular</button>
         <a class="btn primary" href="/api/sessions/${id}/report.csv">Baixar CSV</a>
         <a class="btn" href="#/turmas/${session.class_id}">Ver turma</a>`,
      )}

      <div class="card">
        <div class="session-meta">
          <div><span>Sala</span>${esc(session.room_name || '—')}</div>
          <div><span>Tolerancia</span>${session.tolerance_minutes} min</div>
          <div><span>Presenca minima</span>${pct(session.min_presence_percent)}</div>
          <div><span>Leitura de saida</span>${session.require_checkout ? 'obrigatoria' : 'opcional'}</div>
          <div><span>Presentes</span><strong>${presentes} de ${data.attendance.length}</strong></div>
        </div>
      </div>

      <div class="card">
        <h2>Lista de chamada</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Aluno</th><th>Entrada</th><th>Saida</th><th class="num">Tempo</th>
            <th class="num">% da aula</th><th>Situacao</th><th>Ajuste manual</th></tr></thead>
          <tbody>${
            data.attendance.length
              ? data.attendance
                  .map(
                    (row) => `<tr>
                      <td><a href="#/pessoas/${row.person_id}">${esc(row.full_name)}</a>
                        ${row.source === 'manual' ? '<br /><span class="muted small">ajustado manualmente</span>' : ''}
                        ${row.note ? `<br /><span class="muted small">${esc(row.note)}</span>` : ''}</td>
                      <td class="nowrap">${fmtTime(row.first_seen_at)}</td>
                      <td class="nowrap">${
                        row.scan_count > 1
                          ? fmtTime(row.last_seen_at)
                          : '<span class="muted" title="nao houve leitura de saida">—</span>'
                      }</td>
                      <td class="num">${row.minutes_present ?? 0} min</td>
                      <td class="num">${pct(row.percent)}</td>
                      <td>${statusBadge(row.status, row)}</td>
                      <td><div class="status-actions">
                        <button class="btn small" data-set="presente" data-person="${row.person_id}">P</button>
                        <button class="btn small" data-set="justificada" data-person="${row.person_id}">Abono</button>
                        <button class="btn small" data-set="ausente" data-person="${row.person_id}">F</button>
                        ${row.source === 'manual' ? `<button class="btn small danger" data-clear="${row.person_id}">↺</button>` : ''}
                      </div></td>
                    </tr>`,
                  )
                  .join('')
              : '<tr><td colspan="7" class="empty">Nenhum aluno matriculado nesta turma.</td></tr>'
          }</tbody>
        </table></div>
      </div>

      ${
        data.visitors.length
          ? `<div class="card">
              <h2>Crachas lidos fora da lista (${data.visitors.length})</h2>
              <p class="muted small" style="margin-top:-8px">Pessoas que passaram o cracha na sala mas nao estao matriculadas nesta turma.</p>
              <div class="table-wrap"><table>
                <thead><tr><th>Cracha</th><th>Pessoa</th><th>Primeira leitura</th><th>Ultima leitura</th><th class="num">Leituras</th></tr></thead>
                <tbody>${data.visitors
                  .map(
                    (visitor) => `<tr>
                      <td class="mono">${esc(visitor.badge_code)}</td>
                      <td>${visitor.full_name ? esc(visitor.full_name) : '<span class="badge err">nao cadastrado</span>'}</td>
                      <td>${fmtDateTime(visitor.first_seen_at)}</td>
                      <td>${fmtDateTime(visitor.last_seen_at)}</td>
                      <td class="num">${visitor.scans}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>
            </div>`
          : ''
      }`);

    view().querySelectorAll('[data-set]').forEach((button) => {
      button.onclick = async () => {
        const status = button.dataset.set;
        const justification =
          status === 'justificada' ? window.prompt('Justificativa (atestado, convocacao...):', '') : null;
        if (status === 'justificada' && justification === null) return;
        try {
          await api(`/sessions/${id}/attendance/${button.dataset.person}`, {
            method: 'PUT',
            body: { status, justification },
          });
          toast('Presenca ajustada.');
          route();
        } catch (error) {
          toast(error.message, true);
        }
      };
    });

    view().querySelectorAll('[data-clear]').forEach((button) => {
      button.onclick = async () => {
        await api(`/sessions/${id}/attendance/${button.dataset.clear}`, { method: 'DELETE' });
        toast('Voltou ao calculo automatico.');
        route();
      };
    });

    document.getElementById('recompute').onclick = async () => {
      await api(`/sessions/${id}/recompute`, { method: 'POST' });
      toast('Chamada recalculada.');
      route();
    };

    document.getElementById('manual').onclick = () => {
      const options = data.attendance.map((row) => ({ value: row.person_id, label: row.full_name }));
      if (!options.length) return toast('Nenhum aluno matriculado.', true);
      modal({
        title: 'Registrar leitura manual',
        extraHtml: '<p class="muted small">Use quando o aluno esquecer o cracha ou o leitor estiver fora do ar.</p>',
        fields: [
          { name: 'person_id', label: 'Aluno', type: 'select', options },
          { name: 'scanned_at', label: 'Momento da marcacao', type: 'datetime-local', value: toLocalInput(session.starts_at) },
        ],
        onSubmit: async (values) => {
          await api('/scans/manual', {
            method: 'POST',
            body: { person_id: values.person_id, scanned_at: fromLocalInput(values.scanned_at), session_id: id },
          });
          toast('Leitura registrada.');
          route();
        },
      });
    };
  }

  // --------------------------------------------------------------- Pessoas --
  async function renderPeople() {
    const query = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
    const { people } = await api(`/people?q=${encodeURIComponent(query)}`);

    setView(`
      ${pageHead('Pessoas', 'Colaboradores e seus crachas.',
        '<button class="btn primary" id="new-person">Nova pessoa</button>')}
      <div class="card">
        <div class="inline-form" style="margin-bottom:14px">
          <div class="field" style="flex:1"><input id="search" placeholder="Buscar por nome, documento, setor…" value="${esc(query)}" /></div>
          <button class="btn" id="do-search">Buscar</button>
        </div>
        ${
          people.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Nome</th><th>Documento</th><th>Setor</th><th>Crachas</th><th>Ativo</th><th></th></tr></thead>
                <tbody>${people
                  .map(
                    (person) => `<tr>
                      <td><a href="#/pessoas/${person.id}">${esc(person.full_name)}</a></td>
                      <td class="muted">${esc(person.document || '—')}</td>
                      <td>${esc(person.department || '—')}</td>
                      <td class="mono small">${esc(person.badges || '—')}</td>
                      <td>${person.active ? '<span class="badge ok">sim</span>' : '<span class="badge neutro">nao</span>'}</td>
                      <td class="right"><a class="btn small" href="#/pessoas/${person.id}">Abrir</a></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhuma pessoa encontrada.</div>'
        }
      </div>`);

    const search = () => {
      location.hash = `#/pessoas?q=${encodeURIComponent(document.getElementById('search').value)}`;
      route();
    };
    document.getElementById('do-search').onclick = search;
    document.getElementById('search').onkeydown = (event) => event.key === 'Enter' && search();

    document.getElementById('new-person').onclick = () =>
      modal({
        title: 'Nova pessoa',
        fields: [
          { name: 'full_name', label: 'Nome completo' },
          { name: 'document', label: 'Documento / matricula', required: false },
          { name: 'email', label: 'E-mail', type: 'email', required: false },
          { name: 'department', label: 'Setor', required: false },
          { name: 'job_title', label: 'Cargo', required: false },
          { name: 'badge_code', label: 'Numero do cracha', required: false },
        ],
        onSubmit: async (values) => {
          await api('/people', { method: 'POST', body: values });
          toast('Pessoa cadastrada.');
          route();
        },
      });
  }

  async function renderPersonDetail(id) {
    const data = await api(`/people/${id}`);
    const person = data.person;

    setView(`
      ${pageHead(person.full_name, `${person.department || 'sem setor'} · ${person.job_title || 'sem cargo'}`,
        `<button class="btn" id="edit">Editar</button>
         <button class="btn" id="add-badge">Adicionar cracha</button>
         <button class="btn danger" id="remove">Excluir</button>`)}

      <div class="grid cols-2">
        <div class="card">
          <h2>Crachas</h2>
          ${
            data.badges.length
              ? `<table><tbody>${data.badges
                  .map(
                    (badge) => `<tr>
                      <td class="mono">${esc(badge.code)}</td>
                      <td>${badge.active ? '<span class="badge ok">ativo</span>' : '<span class="badge neutro">inativo</span>'}</td>
                      <td class="muted small">${esc(badge.label || '')}</td>
                      <td class="right">${badge.active ? `<button class="btn small danger" data-badge="${badge.id}">Desativar</button>` : ''}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table>`
              : '<div class="empty">Sem cracha vinculado — as leituras nao serao identificadas.</div>'
          }
        </div>
        <div class="card">
          <h2>Turmas</h2>
          ${
            data.classes.length
              ? `<table><tbody>${data.classes
                  .map(
                    (turma) => `<tr>
                      <td><a href="#/turmas/${turma.id}">${esc(turma.code)}</a></td>
                      <td>${esc(turma.course_name)}</td>
                      <td class="right"><span class="badge neutro">${esc(turma.status)}</span></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table>`
              : '<div class="empty">Nao esta matriculado em nenhuma turma.</div>'
          }
        </div>
      </div>`);

    document.getElementById('edit').onclick = () =>
      modal({
        title: 'Editar pessoa',
        fields: [
          { name: 'full_name', label: 'Nome completo', value: person.full_name },
          { name: 'document', label: 'Documento / matricula', value: person.document, required: false },
          { name: 'email', label: 'E-mail', type: 'email', value: person.email, required: false },
          { name: 'department', label: 'Setor', value: person.department, required: false },
          { name: 'job_title', label: 'Cargo', value: person.job_title, required: false },
          { name: 'active', label: 'Ativo', type: 'checkbox', value: !!person.active },
        ],
        onSubmit: async (values) => {
          await api(`/people/${id}`, { method: 'PUT', body: values });
          toast('Dados atualizados.');
          route();
        },
      });

    document.getElementById('add-badge').onclick = () =>
      modal({
        title: 'Adicionar cracha',
        extraHtml: '<p class="muted small">Leituras antigas com este numero serao vinculadas automaticamente.</p>',
        fields: [
          { name: 'code', label: 'Numero do cracha' },
          { name: 'label', label: 'Observacao', required: false },
        ],
        onSubmit: async (values) => {
          await api(`/people/${id}/badges`, { method: 'POST', body: values });
          toast('Cracha vinculado.');
          route();
        },
      });

    document.getElementById('remove').onclick = () =>
      confirmAction('Excluir esta pessoa e todo o historico de presenca?', async () => {
        await api(`/people/${id}`, { method: 'DELETE' });
        location.hash = '#/pessoas';
      });

    view().querySelectorAll('[data-badge]').forEach((button) => {
      button.onclick = async () => {
        await api(`/people/${id}/badges/${button.dataset.badge}`, { method: 'DELETE' });
        toast('Cracha desativado.');
        route();
      };
    });
  }

  // ---------------------------------------------------------- Treinamentos --
  async function renderCourses() {
    const { courses } = await api('/courses');

    setView(`
      ${pageHead('Treinamentos', 'Catalogo de cursos. Cada treinamento pode ter varias turmas.',
        '<button class="btn primary" id="new-course">Novo treinamento</button>')}
      <div class="card">
        ${
          courses.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Nome</th><th>Codigo</th><th class="num">Carga (min)</th>
                  <th class="num">Frequencia min.</th><th class="num">Turmas</th><th></th></tr></thead>
                <tbody>${courses
                  .map(
                    (course) => `<tr>
                      <td><strong>${esc(course.name)}</strong><br /><span class="muted small">${esc(course.description || '')}</span></td>
                      <td>${esc(course.code || '—')}</td>
                      <td class="num">${course.workload_minutes ?? '—'}</td>
                      <td class="num">${pct(course.min_attendance_percent)}</td>
                      <td class="num">${course.classes_count}</td>
                      <td class="right"><button class="btn small" data-edit="${course.id}">Editar</button></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhum treinamento cadastrado.</div>'
        }
      </div>`);

    const form = (course) => ({
      title: course ? 'Editar treinamento' : 'Novo treinamento',
      fields: [
        { name: 'name', label: 'Nome', value: course?.name },
        { name: 'code', label: 'Codigo', value: course?.code, required: false },
        { name: 'description', label: 'Descricao', type: 'textarea', value: course?.description, required: false },
        { name: 'workload_minutes', label: 'Carga horaria (minutos)', type: 'number', value: course?.workload_minutes, required: false },
        { name: 'min_attendance_percent', label: 'Frequencia minima (%)', type: 'number', value: course?.min_attendance_percent ?? 75 },
      ],
      onSubmit: async (values) => {
        await api(course ? `/courses/${course.id}` : '/courses', {
          method: course ? 'PUT' : 'POST',
          body: { ...values, active: 1 },
        });
        toast('Treinamento salvo.');
        route();
      },
    });

    document.getElementById('new-course').onclick = () => modal(form(null));
    view().querySelectorAll('[data-edit]').forEach((button) => {
      button.onclick = () => modal(form(courses.find((course) => course.id === button.dataset.edit)));
    });
  }

  // ----------------------------------------------------------------- Salas --
  async function renderRooms() {
    const { rooms } = await api('/rooms');

    setView(`
      ${pageHead('Salas', 'A sala liga o leitor de cracha as aulas que acontecem nela.',
        '<button class="btn primary" id="new-room">Nova sala</button>')}
      <div class="card">
        ${
          rooms.length
            ? `<table>
                <thead><tr><th>Nome</th><th>Local</th><th class="num">Capacidade</th><th class="num">Leitores</th><th></th></tr></thead>
                <tbody>${rooms
                  .map(
                    (room) => `<tr>
                      <td>${esc(room.name)}</td>
                      <td class="muted">${esc(room.location || '—')}</td>
                      <td class="num">${room.capacity ?? '—'}</td>
                      <td class="num">${room.devices_count}</td>
                      <td class="right"><button class="btn small" data-edit="${room.id}">Editar</button></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table>`
            : '<div class="empty">Nenhuma sala cadastrada.</div>'
        }
      </div>`);

    const form = (room) => ({
      title: room ? 'Editar sala' : 'Nova sala',
      fields: [
        { name: 'name', label: 'Nome', value: room?.name },
        { name: 'location', label: 'Local / predio', value: room?.location, required: false },
        { name: 'capacity', label: 'Capacidade', type: 'number', value: room?.capacity, required: false },
      ],
      onSubmit: async (values) => {
        await api(room ? `/rooms/${room.id}` : '/rooms', { method: room ? 'PUT' : 'POST', body: values });
        toast('Sala salva.');
        route();
      },
    });

    document.getElementById('new-room').onclick = () => modal(form(null));
    view().querySelectorAll('[data-edit]').forEach((button) => {
      button.onclick = () => modal(form(rooms.find((room) => room.id === button.dataset.edit)));
    });
  }

  // ------------------------------------------------------------- Leitores ---
  async function renderDevices() {
    const [{ devices }, { rooms }] = await Promise.all([api('/devices'), api('/rooms')]);
    const origin = location.origin;

    setView(`
      ${pageHead('Leitores de cracha', 'Cada maquininha usa uma chave propria para enviar as leituras.',
        '<button class="btn primary" id="new-device">Novo leitor</button>')}

      <div class="card">
        ${
          devices.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Nome</th><th>Sala</th><th>Sentido</th><th>Chave</th>
                  <th>Ultima comunicacao</th><th class="num">Leituras</th><th></th></tr></thead>
                <tbody>${devices
                  .map(
                    (device) => `<tr>
                      <td><strong>${esc(device.name)}</strong><br /><span class="muted small">${esc(device.serial || '')}</span></td>
                      <td>${esc(device.room_name || '—')}</td>
                      <td><span class="badge neutro">${esc(device.direction)}</span></td>
                      <td class="mono muted">${esc(device.key_prefix)}…</td>
                      <td class="small">${
                        device.last_seen_at
                          ? fmtDateTime(device.last_seen_at)
                          : '<span class="badge warn">nunca conectou</span>'
                      }</td>
                      <td class="num">${device.scans_count}</td>
                      <td class="right nowrap">
                        <button class="btn small" data-edit="${device.id}">Editar</button>
                        <button class="btn small" data-rotate="${device.id}">Nova chave</button>
                      </td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhum leitor cadastrado.</div>'
        }
      </div>

      <div class="card">
        <h2>Como ligar a maquininha</h2>
        <p class="small muted">Configure o leitor para enviar cada leitura por HTTP POST para a URL abaixo,
          com a chave do dispositivo no cabecalho <code>X-Device-Key</code>.</p>
        <pre class="snippet">POST ${origin}/api/ingest
X-Device-Key: dev_sua_chave_aqui
Content-Type: application/json

{"badge":"0001234","timestamp":"2026-08-16T13:02:10-03:00","direction":"entrada"}

# Lote (o leitor acumulou leituras offline):
{"events":[{"badge":"0001234","timestamp":"..."},{"badge":"0005678","timestamp":"..."}]}

# Leitor que so faz GET:
GET ${origin}/api/ingest?key=dev_sua_chave&amp;badge=0001234

# Teste de conexao:
GET ${origin}/api/ingest/ping?key=dev_sua_chave</pre>
      </div>`);

    const roomOptions = [{ value: '', label: '— sem sala —' }, ...rooms.map((room) => ({ value: room.id, label: room.name }))];
    const directions = [
      { value: 'ambos', label: 'Entrada e saida (mesmo leitor)' },
      { value: 'entrada', label: 'Somente entrada' },
      { value: 'saida', label: 'Somente saida' },
    ];

    document.getElementById('new-device').onclick = () =>
      modal({
        title: 'Novo leitor',
        fields: [
          { name: 'name', label: 'Nome (ex.: Leitor Sala 1)' },
          { name: 'serial', label: 'Numero de serie', required: false },
          { name: 'room_id', label: 'Sala', type: 'select', options: roomOptions, required: false },
          { name: 'direction', label: 'Sentido', type: 'select', options: directions },
        ],
        onSubmit: async (values) => {
          const data = await api('/devices', { method: 'POST', body: values });
          showKey(data.key);
        },
      });

    view().querySelectorAll('[data-edit]').forEach((button) => {
      const device = devices.find((item) => item.id === button.dataset.edit);
      button.onclick = () =>
        modal({
          title: 'Editar leitor',
          fields: [
            { name: 'name', label: 'Nome', value: device.name },
            { name: 'serial', label: 'Numero de serie', value: device.serial, required: false },
            { name: 'room_id', label: 'Sala', type: 'select', options: roomOptions, value: device.room_id, required: false },
            { name: 'direction', label: 'Sentido', type: 'select', options: directions, value: device.direction },
            { name: 'active', label: 'Ativo', type: 'checkbox', value: !!device.active },
          ],
          onSubmit: async (values) => {
            await api(`/devices/${device.id}`, { method: 'PUT', body: values });
            toast('Leitor atualizado.');
            route();
          },
        });
    });

    view().querySelectorAll('[data-rotate]').forEach((button) => {
      button.onclick = () =>
        confirmAction('Gerar nova chave? A atual deixa de funcionar imediatamente.', async () => {
          const data = await api(`/devices/${button.dataset.rotate}/rotate-key`, { method: 'POST' });
          showKey(data.key);
        });
    });

    function showKey(key) {
      document.getElementById('modal-root').innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <h2>Chave do leitor</h2>
            <p class="small muted">Copie agora: por seguranca ela nao sera exibida novamente.</p>
            <pre class="snippet">${esc(key)}</pre>
            <div class="modal-actions">
              <button class="btn primary" id="close-key">Ja copiei</button>
            </div>
          </div>
        </div>`;
      document.getElementById('close-key').onclick = () => {
        document.getElementById('modal-root').innerHTML = '';
        route();
      };
    }
  }

  // ------------------------------------------------------------- Leituras ---
  async function renderScans() {
    const [{ scans }, { badges }] = await Promise.all([api('/scans?limit=120'), api('/scans/unknown')]);

    setView(`
      ${pageHead('Leituras de cracha', 'Fluxo bruto vindo dos leitores — atualiza a cada 15 segundos.',
        '<button class="btn" id="refresh">Atualizar</button>')}

      ${
        badges.length
          ? `<div class="card">
              <h2>Crachas nao identificados (${badges.length})</h2>
              <p class="muted small" style="margin-top:-8px">Numeros lidos que ainda nao pertencem a ninguem. Vincule na ficha da pessoa.</p>
              <table><tbody>${badges
                .map(
                  (badge) => `<tr>
                    <td class="mono">${esc(badge.badge_code)}</td>
                    <td class="num">${badge.leituras} leituras</td>
                    <td class="muted small">ultima em ${fmtDateTime(badge.ultima)}</td>
                    <td class="right"><a class="btn small" href="#/pessoas">Vincular</a></td>
                  </tr>`,
                )
                .join('')}</tbody></table>
            </div>`
          : ''
      }

      <div class="card">
        <h2>Ultimas leituras</h2>
        ${
          scans.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Horario</th><th>Cracha</th><th>Pessoa</th><th>Leitor</th>
                  <th>Sentido</th><th>Aula</th><th>Origem</th></tr></thead>
                <tbody>${scans
                  .map(
                    (scan) => `<tr>
                      <td class="nowrap">${fmtDateTime(scan.scanned_at)}</td>
                      <td class="mono">${esc(scan.badge_code)}</td>
                      <td>${
                        scan.full_name
                          ? `<a href="#/pessoas/${scan.person_id}">${esc(scan.full_name)}</a>`
                          : '<span class="badge err">nao identificado</span>'
                      }</td>
                      <td>${esc(scan.device_name || '—')}${scan.room_name ? `<br /><span class="muted small">${esc(scan.room_name)}</span>` : ''}</td>
                      <td class="small">${esc(scan.direction)}</td>
                      <td>${
                        scan.session_id
                          ? `<a class="badge info" href="#/aulas/${scan.session_id}">${esc(scan.class_code || 'aula')}</a>`
                          : '<span class="muted small">sem aula</span>'
                      }</td>
                      <td class="small muted">${esc(scan.source)}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhuma leitura registrada ainda.</div>'
        }
      </div>`);

    document.getElementById('refresh').onclick = route;

    // Atualizacao automatica enquanto a tela estiver aberta.
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (state.route === '/leituras') route();
      else clearInterval(state.pollTimer);
    }, 15000);
  }

  // ----------------------------------------------------------------- Boot ---
  window.addEventListener('hashchange', () => {
    if (state.user) route();
  });

  (async () => {
    try {
      const status = await api('/auth/status');
      if (status.needs_setup) return renderLogin(true);
      if (!status.user) return renderLogin(false);
      state.user = status.user;
      renderShell();
    } catch (error) {
      app.innerHTML = `<div class="card" style="margin:40px"><div class="error-msg">${esc(error.message)}</div></div>`;
    }
  })();
})();
