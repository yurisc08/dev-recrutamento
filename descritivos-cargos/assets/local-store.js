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
      stored.keys = stored.keys || seedKeys();
      stored.config = stored.config || this.defaultConfig();
      return stored;
    } catch {
      const fresh = { jobs: seedJobs(), keys: seedKeys(), config: this.defaultConfig() };
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

  /* Mesma porta única do modo servidor: chave administrativa primeiro,
   * depois os códigos de responsável que vêm com os cargos. */
  async login(code) {
    const db = this.read();

    const key = db.keys.find(k => sameCode(k.code, code));
    if (key) {
      key.lastUsedAt = new Date().toISOString();
      this.write(db);
      return this.remember({ role: key.role, name: key.name, code: key.code });
    }

    const jobs = db.jobs.filter(j => sameCode(j.code, code) && j.status !== 'canceled');
    if (jobs.length) {
      return this.remember({ role: 'manager', name: jobs[0].manager, code: jobs[0].code });
    }

    throw new Error('Código não encontrado. Confira com Carreira & Recompensa.');
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
      const code = existing ? existing.code : newAccessCode(max => Math.floor(Math.random() * max), 'manager');

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

  /* --------------------------- Códigos de acesso ------------------------- */
  async listKeys() {
    return this.read().keys;
  },

  async createKey({ name, role, email }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Informe o nome');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido');

    return this.change(db => {
      const kind = role === 'hr' ? 'hr' : 'approver';
      if (db.keys.some(k => k.name === clean && k.role === kind)) {
        throw new Error('Já existe um código para essa pessoa neste perfil');
      }
      const key = {
        code: newAccessCode(max => Math.floor(Math.random() * max), kind),
        name: clean,
        role: kind,
        email: String(email || '').trim(),
        createdAt: new Date().toISOString(),
        lastUsedAt: ''
      };
      db.keys.push(key);
      return { key, message: `Código criado: ${key.code}` };
    });
  },

  async updateKey(code, patch) {
    return this.change(db => {
      const key = db.keys.find(k => sameCode(k.code, code));
      if (!key) throw new Error('Código não encontrado');

      if (patch.name !== undefined) {
        const name = String(patch.name).trim();
        if (!name) throw new Error('Informe o nome');
        // O nome do aprovador é o vínculo com os cargos; renomear leva junto.
        if (key.role === 'approver' && name !== key.name) {
          db.jobs.forEach(job => { if (job.approver === key.name) job.approver = name; });
        }
        key.name = name;
      }
      if (patch.email !== undefined) key.email = String(patch.email).trim();
      if (patch.regenerate) key.code = newAccessCode(max => Math.floor(Math.random() * max), key.role);

      return { key, message: patch.regenerate ? `Novo código: ${key.code}` : 'Código atualizado' };
    });
  },

  async deleteKey(code) {
    return this.change(db => {
      const key = db.keys.find(k => sameCode(k.code, code));
      if (!key) throw new Error('Código não encontrado');
      if (sameCode(key.code, this.session.code)) throw new Error('Você não pode revogar o próprio código');
      const remaining = db.keys.filter(k => k.role === 'hr' && !sameCode(k.code, key.code));
      if (key.role === 'hr' && !remaining.length) throw new Error('É preciso manter ao menos um código de C&R');

      db.keys = db.keys.filter(k => k !== key);
      return { message: 'Código revogado' };
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
