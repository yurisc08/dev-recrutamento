/*
 * assets/api.js
 * -----------------------------------------------------------------------------
 * Cliente da API local. É a única camada do navegador que fala com o servidor;
 * a interface (app.js) lê sempre do cache preenchido aqui.
 *
 * O servidor é quem decide o que a sessão enxerga e o que ela pode escrever —
 * este arquivo só transporta.
 */

const API = {
  token: sessionStorage.getItem('dc_token') || null,
  session: JSON.parse(sessionStorage.getItem('dc_session') || 'null'),
  jobs: [],

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

  loginCode(code) {
    return this.request('POST', '/api/login/code', { code }).then(d => this.remember(d));
  },

  loginInternal(email, password) {
    return this.request('POST', '/api/login/internal', { email, password }).then(d => this.remember(d));
  },

  async logout() {
    if (this.token) await this.request('POST', '/api/logout').catch(() => {});
    this.clear();
  },

  /* -------------------------------- Cargos ------------------------------- */
  async loadJobs() {
    const data = await this.request('GET', '/api/jobs');
    this.jobs = data.jobs;
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
    return data.job;
  },

  async saveFields(id, fields) {
    await this.request('PATCH', `/api/jobs/${encodeURIComponent(id)}/fields`, { fields });
    await this.loadJobs();
  },

  async transition(id, action, { text, fields } = {}) {
    await this.request('POST', `/api/jobs/${encodeURIComponent(id)}/transition`, { action, text, fields });
    await this.loadJobs();
  },

  async reset() {
    await this.request('POST', '/api/reset');
    await this.loadJobs();
  }
};
