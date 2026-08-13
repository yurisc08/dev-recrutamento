/*
 * server.js
 * -----------------------------------------------------------------------------
 * Servidor local da ferramenta de Descritivos de Cargos.
 *
 *   node server.js            -> http://localhost:3000
 *   PORT=8080 node server.js  -> outra porta
 *
 * Sem dependências: apenas módulos nativos do Node (>= 18). Os dados ficam em
 * data/, no computador que roda o servidor — é isso que permite ao gestor abrir
 * a ferramenta de outra máquina e enxergar o cargo que C&R criou.
 *
 * As regras do fluxo não são decididas aqui: vêm de shared/flow.js, o mesmo
 * arquivo que o navegador carrega. Aqui elas são aplicadas de verdade.
 */

const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const Model = require('./shared/model.js');
const Flow = require('./shared/flow.js');
const Hash = require('./shared/hash.js');
const db = require('./server/db.js');
const auth = require('./server/auth.js');
const notify = require('./server/notify.js');
const mailer = require('./server/mailer.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/* ============================== Utilidades ============================== */
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
const ok = (res, body = {}) => send(res, 200, { ok: true, ...body });
const fail = (res, status, error) => send(res, status, { ok: false, error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2e6) reject(new Error('Corpo da requisição muito grande'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const randomInt = max => crypto.randomInt(max);
const visible = session => Flow.visibleTo(db.jobs, session);
const findVisible = (session, id) => visible(session).find(j => String(j.id) === String(id));

/* Configuração sem a senha do SMTP; o cliente só sabe se ela está preenchida. */
function publicConfig() {
  const { smtp, ...rest } = db.config;
  return {
    ...rest,
    smtp: { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from, hasPassword: Boolean(smtp.pass) },
    smtpReady: mailer.isConfigured(smtp)
  };
}

/* =============================== Estáticos ============================== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* Só a pasta pública é servida — data/ e server/ nunca. */
const PUBLIC_DIRS = ['assets', 'shared'];

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);

  const allowed = file === path.join(ROOT, 'index.html') ||
    PUBLIC_DIRS.some(dir => file.startsWith(path.join(ROOT, dir) + path.sep));
  if (!allowed) return fail(res, 404, 'Não encontrado');

  try {
    const content = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    fail(res, 404, 'Não encontrado');
  }
}

/* ============================== Exportação ============================== */
function exportCsv(res) {
  const columns = [
    { label: 'Código de acesso', value: j => j.code },
    { label: 'Situação', value: j => Model.STAGES[j.status].label },
    { label: 'Responsável', value: j => j.manager },
    { label: 'E-mail do responsável', value: j => j.managerEmail },
    { label: 'Aprovador', value: j => j.approver },
    { label: 'Prazo', value: j => j.deadline },
    ...Model.allFields().map(f => ({ label: f.label, value: j => j[f.key] }))
  ];

  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    columns.map(c => escape(c.label)).join(';'),
    ...db.jobs.map(job => columns.map(c => escape(c.value(job))).join(';'))
  ];

  // BOM para o Excel abrir os acentos corretamente.
  const csv = '﻿' + lines.join('\r\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="descritivos-${Model.isoToday()}.csv"`
  });
  res.end(csv);
}

/* ================================== API ================================= */
async function handleApi(req, res, pathname) {
  const body = req.method === 'GET' ? {} : await readBody(req);

  /* ---------------------------- Autenticação --------------------------- */
  /*
   * Uma única porta de entrada: o código diz quem é a pessoa e o que ela pode.
   * Primeiro procura entre as chaves administrativas (C&R e aprovadores);
   * depois entre os códigos de responsável, que nascem junto com os cargos.
   */
  if (pathname === '/api/login' && req.method === 'POST') {
    const code = body.code;

    const key = db.findKey(code);
    if (key) {
      key.lastUsedAt = new Date().toISOString();
      await db.persist();
      const session = { role: key.role, name: key.name, keyId: key.id };
      return ok(res, { token: auth.openSession(session), session });
    }

    /* O código do gestor é exclusivo da atribuição: abre os cargos ligados a
     * ele, e a sessão guarda quais são. */
    const open = Flow.openForCode(db.jobs, code);
    if (open.length) {
      const session = {
        role: 'manager',
        name: open[0].manager,
        jobIds: open.map(j => String(j.id))
      };
      return ok(res, { token: auth.openSession(session), session });
    }

    // O código existe, mas já cumpriu seu papel: o cargo saiu do fluxo.
    // Melhor dizer isso do que "código inválido".
    const encerrados = Flow.anyForCode(db.jobs, code);
    if (encerrados.length) {
      return fail(res, 401, 'Este código já foi encerrado: os descritivos ligados a ele foram concluídos.');
    }

    return fail(res, 401, 'Código não encontrado. Confira com Carreira & Recompensa.');
  }

  /*
   * Único ponto público além do login: diz se os acessos de demonstração ainda
   * existem, para a tela de entrada saber se deve mostrá-los. Não revela mais
   * nada — nem quantidade de cargos, nem nomes.
   */
  if (pathname === '/api/status' && req.method === 'GET') {
    const demo = db.keys.some(k => k.id === 'demo-cr' || k.id === 'demo-ap');
    return ok(res, { demo });
  }

  /* Daqui em diante, tudo exige sessão. */
  const token = req.headers['x-session'];
  const session = auth.readSession(token);
  if (!session) return fail(res, 401, 'Sessão expirada. Entre novamente.');

  const requireHr = () => session.role === 'hr';

  if (pathname === '/api/logout' && req.method === 'POST') {
    auth.closeSession(token);
    return ok(res);
  }

  /* -------------------------------- Cargos ------------------------------ */
  if (pathname === '/api/jobs' && req.method === 'GET') {
    return ok(res, { jobs: visible(session), smtpReady: mailer.isConfigured(db.config.smtp) });
  }

  if (pathname === '/api/jobs' && req.method === 'POST') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode criar cargos');

    const data = body.job || {};
    const required = [...Model.FLOW_FIELDS, ...Model.fieldsOf('hr').filter(f => f.key !== 'reviewDate')]
      .filter(f => f.required);
    const missing = required.filter(f => !String(data[f.key] || '').trim()).map(f => f.label);
    if (missing.length) return fail(res, 400, 'Preencha: ' + missing.join(', '));

    /* Cada atribuição tem o seu código, gerado agora e guardado apenas como
     * hash. O texto do código existe somente nesta requisição: vai no e-mail
     * ao gestor e, se não houver e-mail configurado, é devolvido uma única vez
     * para quem cadastrou repassar. Depois disso, ninguém mais o recupera. */
    const code = Flow.newAccessCode(randomInt, 'manager');

    const job = Flow.normalizeJob({
      ...data,
      id: crypto.randomUUID(),
      ...Hash.protect(code),
      status: 'editing',
      creationDate: data.creationDate || Model.isoToday(),
      history: [Flow.entry('Cargo criado e código de acesso gerado', session.name, session.role)],
      comments: []
    });

    db.addJob(job);
    await db.persist();

    const mail = await notify.onTransition(job, 'created', '', code);
    if (mail.sent) {
      job.codeSentAt = new Date().toISOString();
      job.history.push(Flow.entry(`Código de acesso enviado para ${job.managerEmail}`, session.name, session.role));
      await db.persist();
    }

    // Só devolve o código quando ele não pôde ser entregue por e-mail.
    return ok(res, { job, mail, code: mail.sent ? undefined : code });
  }

  const jobRoute = pathname.match(/^\/api\/jobs\/([^/]+)\/(fields|transition|resend-code)$/);
  if (jobRoute) {
    const [, id, operation] = jobRoute;
    const job = findVisible(session, id);
    if (!job) return fail(res, 404, 'Cargo não encontrado');

    if (operation === 'fields' && req.method === 'PATCH') {
      const result = Flow.applyFields(job, session, body.fields || {});
      if (!result.ok) return fail(res, 403, result.error);
      await db.persist();
      return ok(res, { job });
    }

    if (operation === 'transition' && req.method === 'POST') {
      // Um envio pode trazer as últimas edições junto, para não perder o que
      // está na tela caso a pessoa não tenha salvo o rascunho antes.
      if (body.fields) {
        const saved = Flow.applyFields(job, session, body.fields);
        if (!saved.ok) return fail(res, 403, saved.error);
      }

      const result = Flow.applyTransition(job, body.action, session, body.text);
      if (!result.ok) return fail(res, 400, result.error);
      await db.persist();

      const mail = await notify.onTransition(job, body.action, String(body.text || '').trim());
      return ok(res, { job, mail });
    }

    /*
     * "Reenviar" é sempre gerar de novo: como só guardamos o hash, o código
     * antigo não pode ser consultado — ele é substituído e perde a validade na
     * hora, junto com a sessão de quem estivesse usando.
     */
    if (operation === 'resend-code' && req.method === 'POST') {
      if (!requireHr()) return fail(res, 403, 'Apenas C&R pode gerar o código');

      const code = Flow.newAccessCode(randomInt, 'manager');
      Object.assign(job, Hash.protect(code));
      auth.closeSessionsOf({ jobId: job.id });

      let enviado = false;
      let erro = '';
      try {
        await notify.sendCode(job, code);
        enviado = true;
        job.codeSentAt = new Date().toISOString();
      } catch (err) {
        erro = err.message;
      }

      job.history.push(Flow.entry(
        enviado ? `Novo código gerado e enviado para ${job.managerEmail}` : 'Novo código de acesso gerado',
        session.name, session.role
      ));
      await db.persist();

      return ok(res, {
        message: enviado ? `Novo código enviado para ${job.managerEmail}` : '',
        code: enviado ? undefined : code,
        aviso: enviado ? '' : `O e-mail não pôde ser enviado (${erro}). Repasse o código você mesmo.`
      });
    }
  }

  /*
   * Arquivo único para enviar a alguém: o index.html com os dados de hoje
   * embutidos. Quem receber abre e encontra o modelo e os cargos como estão,
   * sem servidor. A senha do SMTP fica de fora — não pode viajar no arquivo.
   */
  if (pathname === '/api/share' && req.method === 'GET') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode gerar o arquivo');

    const html = await fsp.readFile(path.join(ROOT, 'index.html'), 'utf8');
    const { smtp, ...config } = db.config;

    /*
     * A cópia não leva os códigos de ninguém — eles só existem como hash e não
     * podem ser recuperados. Em vez disso, criamos um acesso novo, exclusivo
     * daquela cópia, e devolvemos o código no cabeçalho para a tela mostrar
     * uma única vez a quem gerou.
     */
    const codigoDaCopia = Flow.newAccessCode(randomInt, 'hr');
    const acessoDaCopia = {
      id: crypto.randomUUID(),
      name: 'Acesso da cópia compartilhada',
      role: 'hr',
      email: '',
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      ...Hash.protect(codigoDaCopia)
    };

    /* Os cargos vão sem a verificação do código: na cópia, o único acesso é o
     * que acabamos de criar para ela. */
    const semCodigo = db.jobs.map(({ codeHash, codeSalt, codeSentAt, ...job }) => job);

    const seed = {
      jobs: semCodigo,
      keys: [acessoDaCopia],
      model: db.model,
      config: { ...config, notificationsEnabled: false, remindersEnabled: false }
    };

    const bloco = `<script>window.DC_SEED = ${JSON.stringify(seed).replace(/</g, '\\u003c')};</script>`;
    const saida = html.replace('<script>\n/* shared/model.js */', () => `${bloco}\n<script>\n/* shared/model.js */`);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Descritivos-de-Cargos.html"',
      'X-Share-Code': codigoDaCopia
    });
    return res.end(saida);
  }

  if (pathname === '/api/export.csv' && req.method === 'GET') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode exportar');
    return exportCsv(res);
  }

  /* ---------------------------- Modelo do cargo ------------------------- */
  /* Todo mundo lê (o formulário depende dele); só C&R altera. */
  if (pathname === '/api/model') {
    if (req.method === 'GET') return ok(res, { model: db.model });

    if (req.method === 'PUT') {
      if (!requireHr()) return fail(res, 403, 'Apenas C&R pode alterar o modelo');
      const applied = db.setModel(body.model);
      if (!applied.ok) return fail(res, 400, applied.error);
      await db.persist();
      return ok(res, { model: db.model, message: 'Modelo atualizado' });
    }

    if (req.method === 'DELETE') {
      if (!requireHr()) return fail(res, 403, 'Apenas C&R pode alterar o modelo');
      db.resetModel();
      await db.persist();
      return ok(res, { model: db.model, message: 'Modelo padrão restaurado' });
    }
  }

  /* --------------------------- Códigos de acesso ------------------------ */
  if (pathname === '/api/keys') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode gerenciar os códigos');

    /* A lista nunca devolve código nem hash — só o que a tela precisa mostrar. */
    if (req.method === 'GET') {
      return ok(res, {
        keys: db.keys.map(k => ({
          id: k.id, name: k.name, role: k.role, email: k.email || '',
          createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || '',
          mask: Hash.maskFor(k.role)
        }))
      });
    }

    if (req.method === 'POST') {
      const name = String(body.name || '').trim();
      const role = body.role === 'hr' ? 'hr' : 'approver';
      const email = String(body.email || '').trim();

      if (!name) return fail(res, 400, 'Informe o nome');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'E-mail inválido');
      if (db.keys.some(k => k.name === name && k.role === role)) {
        return fail(res, 400, 'Já existe um código para essa pessoa neste perfil');
      }

      const code = Flow.newAccessCode(randomInt, role);
      const key = db.addKey({
        id: crypto.randomUUID(),
        name, role, email,
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        ...Hash.protect(code)
      });

      await db.persist();
      // Único momento em que o código aparece. Depois, só gerando outro.
      return ok(res, { key: { id: key.id, name, role, email }, code });
    }
  }

  const keyRoute = pathname.match(/^\/api\/keys\/([^/]+)$/);
  if (keyRoute) {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode gerenciar os códigos');
    const key = db.findKeyById(decodeURIComponent(keyRoute[1]));
    if (!key) return fail(res, 404, 'Acesso não encontrado');

    if (req.method === 'PATCH') {
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return fail(res, 400, 'Informe o nome');
        // O nome do aprovador é o vínculo com os cargos; renomear leva junto.
        if (key.role === 'approver' && name !== key.name) {
          db.jobs.forEach(job => { if (job.approver === key.name) job.approver = name; });
        }
        key.name = name;
      }

      if (body.email !== undefined) {
        const email = String(body.email).trim();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'E-mail inválido');
        key.email = email;
      }

      // Trocar o código é o equivalente a trocar a senha: o antigo deixa de
      // valer na hora, e o novo aparece uma única vez.
      let novoCodigo;
      if (body.regenerate) {
        novoCodigo = Flow.newAccessCode(randomInt, key.role);
        Object.assign(key, Hash.protect(novoCodigo));
        auth.closeSessionsOf({ keyId: key.id });
      }

      await db.persist();
      return ok(res, {
        key: { id: key.id, name: key.name, role: key.role, email: key.email || '' },
        code: novoCodigo,
        message: novoCodigo ? '' : 'Acesso atualizado'
      });
    }

    if (req.method === 'DELETE') {
      if (key.id === session.keyId) return fail(res, 400, 'Você não pode revogar o próprio acesso');
      const remainingHr = db.keys.filter(k => k.role === 'hr' && k.id !== key.id);
      if (key.role === 'hr' && !remainingHr.length) return fail(res, 400, 'É preciso manter ao menos um acesso de C&R');

      db.removeKey(key.id);
      auth.closeSessionsOf({ keyId: key.id });
      await db.persist();
      return ok(res, { message: 'Acesso revogado' });
    }
  }

  /* ----------------------------- Configurações -------------------------- */
  if (pathname === '/api/config') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode ver as configurações');
    if (req.method === 'GET') return ok(res, { config: publicConfig() });

    if (req.method === 'PATCH') {
      const patch = body.config || {};
      const smtp = { ...(patch.smtp || {}) };
      // Senha em branco significa "manter a atual".
      if (!smtp.pass) delete smtp.pass;
      if (smtp.port !== undefined) smtp.port = Number(smtp.port) || 587;
      if (smtp.secure !== undefined) smtp.secure = Boolean(smtp.secure);

      db.updateConfig({ ...patch, smtp });
      await db.persistConfig();
      return ok(res, { config: publicConfig() });
    }
  }

  if (pathname === '/api/config/test' && req.method === 'POST') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode testar o envio');
    const to = String(body.to || session.email || '').trim();
    if (!to) return fail(res, 400, 'Informe o destinatário do teste');
    try {
      await notify.sendTest(to);
      return ok(res, { message: `E-mail de teste enviado para ${to}` });
    } catch (err) {
      return fail(res, 400, err.message);
    }
  }

  if (pathname === '/api/reminders/run' && req.method === 'POST') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode disparar os lembretes');
    const result = await notify.runReminders();
    return ok(res, { message: result.sent ? `${result.sent} lembrete(s) enviado(s)` : 'Nenhum lembrete a enviar agora' });
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    if (!requireHr()) return fail(res, 403, 'Apenas C&R pode restaurar os dados');
    await db.reset();
    return ok(res);
  }

  return fail(res, 404, 'Rota não encontrada');
}

/* ================================ Servidor ============================== */
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET') return fail(res, 405, 'Método não permitido');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    fail(res, 500, 'Erro interno do servidor');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Descritivos de Cargos rodando em http://localhost:${PORT}`);
  console.log(`Na rede local, use o IP desta máquina: http://<ip-da-maquina>:${PORT}`);
  console.log(`Dados em ${db.DATA_DIR}`);
  console.log(mailer.isConfigured(db.config.smtp)
    ? 'Envio de e-mail configurado.'
    : 'Envio de e-mail não configurado — em Administração > Configurações.');
  notify.startReminders();
});
