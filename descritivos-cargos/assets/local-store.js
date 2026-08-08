/*
 * assets/local-store.js
 * -----------------------------------------------------------------------------
 * Modo local: a ferramenta inteira funcionando sem servidor, guardando tudo no
 * localStorage do navegador. É o que roda quando você abre o index.html com um
 * duplo clique (endereço file://).
 *
 * Expõe exatamente a mesma interface do cliente de API (assets/api.js), então
 * a tela não sabe em qual modo está — só muda quem guarda os dados.
 *
 * Limites deste modo, avisados na própria tela:
 *   - os dados ficam neste navegador, nesta máquina;
 *   - não há envio automático de e-mail (o botão "Preparar e-mail" abre a
 *     mensagem pronta no cliente de e-mail da pessoa).
 */

const LocalStore = {
  KEY: 'dc_local_v3',
  mode: 'local',
  // Marca de sessão ativa: mantém a pessoa logada ao recarregar a página,
  // igual ao modo servidor.
  token: sessionStorage.getItem('dc_local_session') ? 'local' : null,
  session: JSON.parse(sessionStorage.getItem('dc_local_session') || 'null'),
  jobs: [],
  smtpReady: false,

  /* ------------------------------ Persistência --------------------------- */
  read() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.KEY));
      if (!stored) throw new Error('vazio');
      stored.jobs = (stored.jobs || []).map(normalizeJob);
      stored.users = stored.users || seedUsers();
      stored.config = stored.config || this.defaultConfig();
      return stored;
    } catch {
      const fresh = { jobs: seedJobs(), users: seedUsers(), config: this.defaultConfig() };
      this.write(fresh);
      return fresh;
    }
  },

  write(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
    return data;
  },

  defaultConfig() {
    return { appUrl: '', notificationsEnabled: false, remindersEnabled: false, reminderDaysBefore: 3 };
  },

  /* Aplica uma mudança e persiste; devolve o resultado do bloco. */
  change(fn) {
    const data = this.read();
    const result = fn(data);
    this.write(data);
    return result;
  },

  /* ------------------------------- Sessão -------------------------------- */
  remember(session) {
    this.token = 'local';
    this.session = session;
    sessionStorage.setItem('dc_local_session', JSON.stringify(session));
    return session;
  },

  clear() {
    this.token = null;
    this.session = null;
    this.jobs = [];
    sessionStorage.removeItem('dc_local_session');
  },

  async loginCode(code) {
    const wanted = String(code || '').trim().toUpperCase();
    const jobs = this.read().jobs.filter(j => j.code === wanted && j.status !== 'canceled');
    if (!jobs.length) throw new Error('Código não encontrado');
    return this.remember({ role: 'manager', name: jobs[0].manager, code: wanted });
  },

  async loginInternal(email, password) {
    const wanted = String(email || '').trim().toLowerCase();
    const user = this.read().users.find(u => u.email.toLowerCase() === wanted && u.password === password);
    if (!user) throw new Error('E-mail ou senha inválidos');
    return this.remember({ role: user.role, name: user.name, email: user.email });
  },

  async logout() {
    this.clear();
  },

  /* -------------------------------- Cargos ------------------------------- */
  async loadJobs() {
    this.jobs = visibleTo(this.read().jobs, this.session);
    return this.jobs;
  },

  getJob(id) {
    return this.jobs.find(j => String(j.id) === String(id));
  },

  pending() {
    return this.jobs.filter(j => isPending(j, this.session.role));
  },

  async createJob(data) {
    if (this.session.role !== 'hr') throw new Error('Apenas C&R pode criar cargos');

    const required = [...FLOW_FIELDS, ...fieldsOf('hr').filter(f => f.key !== 'reviewDate')];
    const missing = required.filter(f => !String(data[f.key] || '').trim()).map(f => f.label);
    if (missing.length) throw new Error('Preencha: ' + missing.join(', '));

    const job = this.change(db => {
      const email = String(data.managerEmail).toLowerCase();
      const existing = db.jobs.find(j => String(j.managerEmail).toLowerCase() === email);
      const code = existing ? existing.code : newAccessCode(max => Math.floor(Math.random() * max));

      const created = normalizeJob({
        ...data,
        id: 'local-' + Date.now(),
        code,
        status: 'editing',
        creationDate: data.creationDate || isoToday(),
        history: [entry('Cargo criado e código de acesso enviado ao responsável', this.session.name, 'hr')],
        comments: []
      });

      db.jobs.push(created);
      return created;
    });

    await this.loadJobs();
    return { job, mail: { sent: 0, failed: 0 } };
  },

  async saveFields(id, fields) {
    const result = this.change(db => {
      const job = db.jobs.find(j => String(j.id) === String(id));
      if (!job) return { ok: false, error: 'Cargo não encontrado' };
      return applyFields(job, this.session, fields);
    });
    if (!result.ok) throw new Error(result.error);
    await this.loadJobs();
  },

  async transition(id, action, { text, fields } = {}) {
    const result = this.change(db => {
      const job = db.jobs.find(j => String(j.id) === String(id));
      if (!job) return { ok: false, error: 'Cargo não encontrado' };
      if (fields) {
        const saved = applyFields(job, this.session, fields);
        if (!saved.ok) return saved;
      }
      return applyTransition(job, action, this.session, text);
    });
    if (!result.ok) throw new Error(result.error);
    await this.loadJobs();
    return { mail: { sent: 0, failed: 0 } };
  },

  async resendCode() {
    throw new Error('Sem servidor não há envio automático. Use "Preparar e-mail".');
  },

  async exportCsv() {
    const columns = [
      { label: 'Código de acesso', value: j => j.code },
      { label: 'Situação', value: j => STAGES[j.status].label },
      { label: 'Responsável', value: j => j.manager },
      { label: 'E-mail do responsável', value: j => j.managerEmail },
      { label: 'Aprovador', value: j => j.approver },
      { label: 'Prazo', value: j => j.deadline },
      ...ALL_FIELDS.map(f => ({ label: f.label, value: j => j[f.key] }))
    ];

    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      columns.map(c => escape(c.label)).join(';'),
      ...this.read().jobs.map(job => columns.map(c => escape(c.value(job))).join(';'))
    ];

    // BOM para o Excel abrir os acentos corretamente.
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { href: url, download: `descritivos-${isoToday()}.csv` });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  /* ------------------------------- Usuários ------------------------------ */
  async listUsers() {
    return this.read().users.map(u => ({ email: u.email, name: u.name, role: u.role }));
  },

  async createUser({ name, email, role, password }) {
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('E-mail inválido');
    if (!String(name || '').trim()) throw new Error('Informe o nome');
    if (String(password || '').length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('A senha precisa ter ao menos 8 caracteres, misturando letras e números');
    }

    return this.change(db => {
      if (db.users.some(u => u.email.toLowerCase() === clean)) throw new Error('Já existe um usuário com este e-mail');
      db.users.push({ email: clean, name: String(name).trim(), role: role === 'hr' ? 'hr' : 'approver', password });
      return { ok: true };
    });
  },

  async updateUser(email, patch) {
    return this.change(db => {
      const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
      if (!user) throw new Error('Usuário não encontrado');

      if (patch.name !== undefined) user.name = String(patch.name).trim();
      if (patch.role !== undefined) {
        const others = db.users.filter(u => u.role === 'hr' && u.email !== user.email);
        if (user.role === 'hr' && patch.role !== 'hr' && !others.length) {
          throw new Error('É preciso manter ao menos um usuário de C&R');
        }
        user.role = patch.role === 'hr' ? 'hr' : 'approver';
      }
      if (patch.password) {
        if (String(patch.password).length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres');
        user.password = patch.password;
      }
      return { ok: true };
    });
  },

  async deleteUser(email) {
    return this.change(db => {
      const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
      if (!user) throw new Error('Usuário não encontrado');
      if (user.email === this.session.email) throw new Error('Você não pode excluir o próprio usuário');
      const remaining = db.users.filter(u => u.role === 'hr' && u.email !== user.email);
      if (user.role === 'hr' && !remaining.length) throw new Error('É preciso manter ao menos um usuário de C&R');

      db.users = db.users.filter(u => u !== user);
      return { ok: true };
    });
  },

  /* ----------------------------- Configurações --------------------------- */
  async loadConfig() {
    const config = this.read().config;
    return { ...config, smtp: { host: '', port: 587, secure: false, user: '', from: '', hasPassword: false }, smtpReady: false };
  },

  async saveConfig(patch) {
    return this.change(db => {
      db.config = { ...db.config, appUrl: patch.appUrl || '' };
      return db.config;
    });
  },

  async testMail() {
    throw new Error('O envio de e-mail só funciona com o servidor rodando.');
  },

  async runReminders() {
    return { message: 'A cobrança automática só funciona com o servidor rodando.' };
  },

  async reset() {
    localStorage.removeItem(this.KEY);
    this.read();
    await this.loadJobs();
  }
};
