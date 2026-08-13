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

/*
 * Guardar dados no navegador nem sempre é possível: abrindo por file://, alguns
 * navegadores (e o modo anônimo) recusam gravar e devolvem "exceeded the quota"
 * já na primeira escrita. Em vez de quebrar, caímos para memória: a ferramenta
 * funciona igual e a tela avisa que o preenchido se perde ao recarregar.
 */
function safeStorage(kind) {
  const memory = new Map();
  let persistent = false;

  try {
    const probe = '__dc_probe__';
    window[kind].setItem(probe, '1');
    window[kind].removeItem(probe);
    persistent = true;
  } catch {
    persistent = false;
  }

  return {
    get persistent() { return persistent; },

    getItem(key) {
      if (persistent) {
        try { return window[kind].getItem(key); } catch { persistent = false; }
      }
      return memory.has(key) ? memory.get(key) : null;
    },

    setItem(key, value) {
      memory.set(key, value);
      if (!persistent) return;
      try {
        window[kind].setItem(key, value);
      } catch {
        // Cota estourou ou o navegador bloqueou: segue só em memória.
        persistent = false;
      }
    },

    removeItem(key) {
      memory.delete(key);
      if (!persistent) return;
      try { window[kind].removeItem(key); } catch { persistent = false; }
    }
  };
}

const localData = safeStorage('localStorage');
const sessionData = safeStorage('sessionStorage');

const LocalStore = {
  KEY: 'dc_local_v3',
  mode: 'local',
  // Marca de sessão ativa: mantém a pessoa logada ao recarregar a página,
  // igual ao modo servidor.
  token: sessionData.getItem('dc_local_session') ? 'local' : null,
  session: JSON.parse(sessionData.getItem('dc_local_session') || 'null'),
  /* Falso quando o navegador não deixa gravar: a tela avisa. */
  get persistent() { return localData.persistent; },
  jobs: [],
  smtpReady: false,

  /* ------------------------------ Persistência --------------------------- */
  read() {
    try {
      const stored = JSON.parse(localData.getItem(this.KEY));
      if (!stored) throw new Error('vazio');
      stored.jobs = (stored.jobs || []).map(normalizeJob);
      stored.keys = stored.keys || seedKeys();
      stored.config = stored.config || this.defaultConfig();
      stored.model = stored.model || Model.DEFAULT_SECTIONS;
      return stored;
    } catch {
      const fresh = this.firstRun();
      this.write(fresh);
      return fresh;
    }
  },

  /*
   * Primeira abertura. Se o arquivo foi gerado para compartilhar, ele traz os
   * dados reais embutidos (window.DC_SEED) — quem recebeu abre e encontra o
   * modelo e os cargos como estavam. Caso contrário, entra a demonstração.
   */
  firstRun() {
    const embutido = typeof window !== 'undefined' ? window.DC_SEED : null;

    if (embutido && Array.isArray(embutido.jobs) && Array.isArray(embutido.keys)) {
      return {
        jobs: embutido.jobs.map(normalizeJob),
        keys: embutido.keys,
        model: embutido.model || Model.DEFAULT_SECTIONS,
        config: { ...this.defaultConfig(), ...(embutido.config || {}) }
      };
    }

    return { jobs: seedJobs(), keys: seedKeys(), config: this.defaultConfig(), model: Model.DEFAULT_SECTIONS };
  },

  write(data) {
    localData.setItem(this.KEY, JSON.stringify(data));
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

  async isDemo() {
    return this.read().keys.some(k => k.id === 'demo-cr' || k.id === 'demo-ap');
  },

  /* ------------------------------- Sessão -------------------------------- */
  remember(session) {
    this.token = 'local';
    this.session = session;
    sessionData.setItem('dc_local_session', JSON.stringify(session));
    return session;
  },

  clear() {
    this.token = null;
    this.session = null;
    this.jobs = [];
    sessionData.removeItem('dc_local_session');
  },

  /* Mesma porta única do modo servidor: chave administrativa primeiro,
   * depois os códigos de responsável que vêm com os cargos. */
  async login(code) {
    const db = this.read();

    const key = db.keys.find(k => Hash.matches(k, code));
    if (key) {
      key.lastUsedAt = new Date().toISOString();
      this.write(db);
      return this.remember({ role: key.role, name: key.name, keyId: key.id });
    }

    const open = openForCode(db.jobs, code);
    if (open.length) {
      return this.remember({ role: 'manager', name: open[0].manager, jobIds: open.map(j => String(j.id)) });
    }

    if (anyForCode(db.jobs, code).length) {
      throw new Error('Este código já foi encerrado: os descritivos ligados a ele foram concluídos.');
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

    const required = [...FLOW_FIELDS, ...fieldsOf('hr').filter(f => f.key !== 'reviewDate')]
      .filter(f => f.required);
    const missing = required.filter(f => !String(data[f.key] || '').trim()).map(f => f.label);
    if (missing.length) throw new Error('Preencha: ' + missing.join(', '));

    // Sem servidor não há envio de e-mail: o código aparece uma vez para quem
    // cadastrou repassar ao gestor.
    const code = newAccessCode(max => Math.floor(Math.random() * max), 'manager');

    const job = this.change(db => {
      const created = normalizeJob({
        ...data,
        id: 'local-' + Date.now(),
        ...Hash.protect(code),
        status: 'editing',
        creationDate: data.creationDate || isoToday(),
        history: [entry('Cargo criado e código de acesso gerado', this.session.name, 'hr')],
        comments: []
      });

      db.jobs.push(created);
      return created;
    });

    await this.loadJobs();
    return { job, mail: { sent: 0, failed: 0 }, code };
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

  /* Gera um código novo para o cargo; o anterior perde a validade na hora. */
  async resendCode(id) {
    const code = newAccessCode(max => Math.floor(Math.random() * max), 'manager');
    this.change(db => {
      const job = db.jobs.find(j => String(j.id) === String(id));
      if (!job) throw new Error('Cargo não encontrado');
      Object.assign(job, Hash.protect(code));
      job.history.push(entry('Novo código de acesso gerado', this.session.name, 'hr'));
    });
    await this.loadJobs();
    return { code, aviso: 'Sem servidor não há envio automático: repasse o código você mesmo.' };
  },

  async exportCsv() {
    const columns = [
      { label: 'Código de acesso', value: j => j.code },
      { label: 'Situação', value: j => STAGES[j.status].label },
      { label: 'Responsável', value: j => j.manager },
      { label: 'E-mail do responsável', value: j => j.managerEmail },
      { label: 'Aprovador', value: j => j.approver },
      { label: 'Prazo', value: j => j.deadline },
      ...Model.allFields().map(f => ({ label: f.label, value: j => j[f.key] }))
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

  async downloadShare() {
    throw new Error('Para gerar o arquivo compartilhável, rode a ferramenta pelo atalho (com servidor).');
  },

  /* ---------------------------- Modelo do cargo -------------------------- */
  async loadModel() {
    const model = this.read().model;
    const applied = Model.setSections(model);
    if (!applied.ok) Model.resetSections();
    return Model.sections();
  },

  async saveModel(model) {
    const applied = Model.setSections(model);
    if (!applied.ok) throw new Error(applied.error);
    this.change(db => { db.model = Model.sections(); });
    return { model: Model.sections(), message: 'Modelo atualizado' };
  },

  async resetModel() {
    Model.resetSections();
    this.change(db => { db.model = Model.sections(); });
    return { model: Model.sections(), message: 'Modelo padrão restaurado' };
  },

  /* --------------------------- Códigos de acesso ------------------------- */
  /* A lista nunca devolve o código: ele não existe guardado, só o hash. */
  async listKeys() {
    return this.read().keys.map(k => ({
      id: k.id, name: k.name, role: k.role, email: k.email || '',
      createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || '', mask: Hash.maskFor(k.role)
    }));
  },

  async createKey({ name, role, email }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Informe o nome');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido');

    const kind = role === 'hr' ? 'hr' : 'approver';
    const code = newAccessCode(max => Math.floor(Math.random() * max), kind);

    return this.change(db => {
      if (db.keys.some(k => k.name === clean && k.role === kind)) {
        throw new Error('Já existe um acesso para essa pessoa neste perfil');
      }
      db.keys.push({
        id: 'key-' + Date.now(),
        name: clean, role: kind, email: String(email || '').trim(),
        createdAt: new Date().toISOString(), lastUsedAt: '',
        ...Hash.protect(code)
      });
      return { code };
    });
  },

  async updateKey(id, patch) {
    let novoCodigo;
    const resultado = this.change(db => {
      const key = db.keys.find(k => k.id === id);
      if (!key) throw new Error('Acesso não encontrado');

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
      if (patch.regenerate) {
        novoCodigo = newAccessCode(max => Math.floor(Math.random() * max), key.role);
        Object.assign(key, Hash.protect(novoCodigo));
      }
      return { message: patch.regenerate ? '' : 'Acesso atualizado' };
    });
    return { ...resultado, code: novoCodigo };
  },

  async deleteKey(id) {
    return this.change(db => {
      const key = db.keys.find(k => k.id === id);
      if (!key) throw new Error('Acesso não encontrado');
      if (key.id === this.session.keyId) throw new Error('Você não pode revogar o próprio acesso');
      const remaining = db.keys.filter(k => k.role === 'hr' && k.id !== key.id);
      if (key.role === 'hr' && !remaining.length) throw new Error('É preciso manter ao menos um acesso de C&R');

      db.keys = db.keys.filter(k => k !== key);
      return { message: 'Acesso revogado' };
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
    localData.removeItem(this.KEY);
    this.read();
    await this.loadJobs();
  }
};
