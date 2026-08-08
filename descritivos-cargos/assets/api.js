/*
 * assets/api.js
 * -----------------------------------------------------------------------------
 * Cliente da API local. É a única camada do navegador que fala com o servidor;
 * a interface (app.js) lê sempre do cache preenchido aqui.
 *
 * O servidor é quem decide o que a sessão enxerga e o que ela pode escrever —
 * este arquivo só transporta.
 */

const RemoteStore = {
  mode: 'server',
  token: sessionStorage.getItem('dc_token') || null,
  session: JSON.parse(sessionStorage.getItem('dc_session') || 'null'),
  jobs: [],
  smtpReady: false,

  async request(method, path, body) {
    let response;
    try {
      response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { 'X-Session': this.token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new Error('Servidor indisponível. Verifique se ele está rodando.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      if (response.status === 401 && this.token) this.clear();
      throw new Error(data.error || 'Falha na comunicação com o servidor');
    }
    return data;
  },

  /* ------------------------------- Sessão -------------------------------- */
  remember(data) {
    this.token = data.token;
    this.session = data.session;
    sessionStorage.setItem('dc_token', data.token);
    sessionStorage.setItem('dc_session', JSON.stringify(data.session));
    return data.session;
  },

  clear() {
    this.token = null;
    this.session = null;
    this.jobs = [];
    sessionStorage.removeItem('dc_token');
    sessionStorage.removeItem('dc_session');
  },

  /* Uma única porta: o código diz o papel de quem entrou. */
  login(code) {
    return this.request('POST', '/api/login', { code }).then(d => this.remember(d));
  },

  async logout() {
    if (this.token) await this.request('POST', '/api/logout').catch(() => {});
    this.clear();
  },

  /* -------------------------------- Cargos ------------------------------- */
  async loadJobs() {
    const data = await this.request('GET', '/api/jobs');
    this.jobs = data.jobs;
    this.smtpReady = Boolean(data.smtpReady);
    return this.jobs;
  },

  getJob(id) {
    return this.jobs.find(j => String(j.id) === String(id));
  },

  pending() {
    return this.jobs.filter(j => isPending(j, this.session.role));
  },

  async createJob(job) {
    const data = await this.request('POST', '/api/jobs', { job });
    await this.loadJobs();
    return data;
  },

  async saveFields(id, fields) {
    await this.request('PATCH', `/api/jobs/${encodeURIComponent(id)}/fields`, { fields });
    await this.loadJobs();
  },

  async transition(id, action, { text, fields } = {}) {
    const data = await this.request('POST', `/api/jobs/${encodeURIComponent(id)}/transition`, { action, text, fields });
    await this.loadJobs();
    return data;
  },

  resendCode(id) {
    return this.request('POST', `/api/jobs/${encodeURIComponent(id)}/resend-code`);
  },

  /* Baixa o CSV passando pelo cabeçalho de sessão. */
  async exportCsv() {
    const response = await fetch('/api/export.csv', { headers: { 'X-Session': this.token } });
    if (!response.ok) throw new Error('Não foi possível exportar');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), {
      href: url,
      download: `descritivos-${new Date().toISOString().slice(0, 10)}.csv`
    });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  /* --------------------------- Códigos de acesso ------------------------- */
  listKeys() {
    return this.request('GET', '/api/keys').then(d => d.keys);
  },
  createKey(key) {
    return this.request('POST', '/api/keys', key);
  },
  updateKey(code, patch) {
    return this.request('PATCH', `/api/keys/${encodeURIComponent(code)}`, patch);
  },
  deleteKey(code) {
    return this.request('DELETE', `/api/keys/${encodeURIComponent(code)}`);
  },

  /* ----------------------------- Configurações --------------------------- */
  loadConfig() {
    return this.request('GET', '/api/config').then(d => d.config);
  },
  saveConfig(config) {
    return this.request('PATCH', '/api/config', { config }).then(d => d.config);
  },
  testMail(to) {
    return this.request('POST', '/api/config/test', { to });
  },
  runReminders() {
    return this.request('POST', '/api/reminders/run');
  },

  async reset() {
    await this.request('POST', '/api/reset');
    await this.loadJobs();
  }
};

/*
 * Escolha do modo, feita uma vez ao carregar:
 *   file://  -> modo local, tudo no navegador (duplo clique no index.html)
 *   http(s) -> modo servidor, dados compartilhados entre as pessoas
 */
const API = location.protocol === 'file:' ? LocalStore : RemoteStore;
