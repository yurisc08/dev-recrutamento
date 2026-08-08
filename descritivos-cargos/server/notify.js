/*
 * server/notify.js
 * -----------------------------------------------------------------------------
 * Avisos automáticos do fluxo e cobrança de prazo.
 *
 * Regras de convivência:
 *   - e-mail nunca derruba o fluxo: se o envio falhar, a ação já foi gravada e
 *     a falha fica registrada no cargo (visível para C&R);
 *   - sem SMTP configurado, nada é enviado e a ferramenta segue funcionando
 *     com o botão "Preparar e-mail", que abre o cliente de e-mail da pessoa.
 */

const Model = require('../shared/model.js');
const db = require('./db.js');
const mailer = require('./mailer.js');

const MAX_LOG = 20;
const DAY = 24 * 60 * 60 * 1000;

const formatDate = iso => {
  if (!iso) return 'não definido';
  const [y, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

const daysLeft = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(Model.isoToday() + 'T00:00:00')) / DAY);

/* ----------------------------- Destinatários ----------------------------- */
const managerOf = job => (job.managerEmail ? [{ email: job.managerEmail, name: job.manager }] : []);

const approverOf = job => {
  const user = db.users.find(u => u.role === 'approver' && u.name === job.approver);
  return user ? [{ email: user.email, name: user.name }] : [];
};

const hrTeam = () => db.users.filter(u => u.role === 'hr').map(u => ({ email: u.email, name: u.name }));

function recipientsFor(role, job) {
  if (role === 'manager') return managerOf(job);
  if (role === 'approver') return approverOf(job);
  if (role === 'hr') return hrTeam();
  return [];
}

/* -------------------------------- Textos --------------------------------- */
function link() {
  const url = String(db.config.appUrl || '').trim();
  return url ? `\nEndereço da ferramenta: ${url}\n` : '';
}

const signature = '\n\nCarreira & Recompensa\n(mensagem automática — não responda este e-mail)';

/* Cada aviso devolve { role, subject, body } ou nulo quando não há aviso. */
const MESSAGES = {
  created: job => ({
    role: 'manager',
    subject: `Preenchimento de descritivo de cargo: ${job.name}`,
    body: `Olá, ${job.manager}!\n\n` +
      `Foi atribuído a você o preenchimento do descritivo do cargo ${job.name}.\n` +
      `Prazo: ${formatDate(job.deadline)}\n` + link() +
      `\nCódigo de acesso: ${job.code}\n\n` +
      `Informe somente esse código para entrar — não é necessário usuário nem senha.` + signature
  }),

  submit: job => ({
    role: 'approver',
    subject: `Descritivo aguardando sua aprovação: ${job.name}`,
    body: `Olá!\n\n` +
      `${job.manager} enviou o descritivo do cargo ${job.name} para sua aprovação.\n` + link() +
      `\nEntre com seu e-mail e senha para analisar, aprovar ou devolver.` + signature
  }),

  approve: job => ({
    role: 'hr',
    subject: `Descritivo aprovado, aguardando validação de C&R: ${job.name}`,
    body: `O descritivo do cargo ${job.name} foi aprovado pelo aprovador e está na fila de validação de C&R.\n` + link() + signature
  }),

  validate: job => ({
    role: 'manager',
    subject: `Descritivo aprovado: ${job.name}`,
    body: `Olá, ${job.manager}!\n\n` +
      `O descritivo do cargo ${job.name} foi validado por Carreira & Recompensa e está aprovado.\n` +
      `Obrigado pela colaboração.` + link() + signature
  }),

  return: (job, note) => ({
    role: 'manager',
    subject: `Descritivo devolvido para correção: ${job.name}`,
    body: `Olá, ${job.manager}!\n\n` +
      `O descritivo do cargo ${job.name} foi devolvido para ajustes.\n\n` +
      `Motivo:\n${note}\n\n` +
      `Prazo: ${formatDate(job.deadline)}\n` + link() +
      `\nCódigo de acesso: ${job.code}` + signature
  }),

  reopen: (job, note) => ({
    role: 'manager',
    subject: `Descritivo reaberto para revisão: ${job.name}`,
    body: `Olá, ${job.manager}!\n\n` +
      `O descritivo do cargo ${job.name} foi reaberto para revisão.\n\n` +
      `Motivo:\n${note}\n` + link() +
      `\nCódigo de acesso: ${job.code}` + signature
  }),

  cancel: (job, note) => ({
    role: 'manager',
    subject: `Descritivo cancelado: ${job.name}`,
    body: `Olá, ${job.manager}!\n\n` +
      `O descritivo do cargo ${job.name} foi cancelado por Carreira & Recompensa. ` +
      `Nenhuma ação é necessária da sua parte.\n\nMotivo:\n${note}` + signature
  })
};

function reminderMessage(job, role, left) {
  const prazo = left < 0
    ? `venceu há ${Math.abs(left)} dia(s)`
    : left === 0 ? 'vence hoje' : `vence em ${left} dia(s)`;

  const pedido = role === 'manager'
    ? `o preenchimento do descritivo do cargo ${job.name} ainda está pendente`
    : role === 'approver'
      ? `o descritivo do cargo ${job.name} está aguardando sua aprovação`
      : `o descritivo do cargo ${job.name} está aguardando a validação de C&R`;

  return {
    subject: `Lembrete — ${job.name} (prazo ${prazo})`,
    body: `Olá!\n\nUm lembrete de que ${pedido}. O prazo ${prazo} (${formatDate(job.deadline)}).\n` + link() +
      (role === 'manager' ? `\nCódigo de acesso: ${job.code}` : '') + signature
  };
}

/* --------------------------------- Envio --------------------------------- */
function record(job, entry) {
  job.notifications = [...(job.notifications || []), entry].slice(-MAX_LOG);
}

/* Envia e registra no cargo. Nunca lança: devolve o que aconteceu. */
async function deliver(job, recipients, { subject, body }) {
  const results = [];

  for (const person of recipients) {
    const entry = { to: person.email, subject, at: new Date().toISOString(), ok: true };
    try {
      await mailer.sendMail(db.config.smtp, { to: person.email, subject, text: body });
    } catch (err) {
      entry.ok = false;
      entry.error = err.message;
      console.error(`E-mail para ${person.email} falhou: ${err.message}`);
    }
    record(job, entry);
    results.push(entry);
  }

  return results;
}

/*
 * Dispara o aviso correspondente a uma transição do fluxo.
 * Devolve { sent, failed } para a interface avisar C&R quando algo falhar.
 */
async function onTransition(job, action, note) {
  const idle = { sent: 0, failed: 0 };
  if (!db.config.notificationsEnabled) return idle;
  if (!mailer.isConfigured(db.config.smtp)) return idle;

  const build = MESSAGES[action];
  if (!build) return idle;

  const message = build(job, note);
  const recipients = recipientsFor(message.role, job);
  if (!recipients.length) return idle;

  const results = await deliver(job, recipients, message);
  await db.persist();

  return {
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length
  };
}

/* Reenvia o código de acesso ao responsável, a pedido de C&R. */
async function resendCode(job) {
  if (!mailer.isConfigured(db.config.smtp)) throw new Error('SMTP não configurado');
  const message = MESSAGES.created(job);
  const [result] = await deliver(job, managerOf(job), message);
  await db.persist();
  if (!result) throw new Error('Cargo sem e-mail do responsável');
  if (!result.ok) throw new Error(result.error);
}

async function sendTest(to) {
  await mailer.sendMail(db.config.smtp, {
    to,
    subject: 'Teste de envio — Descritivos de Cargos',
    text: 'Se você recebeu esta mensagem, o envio de e-mails da ferramenta está funcionando.' + signature
  });
}

/* ---------------------------- Cobrança de prazo -------------------------- */
/*
 * Roda uma vez ao subir e depois de hora em hora. Cada cargo recebe no máximo
 * um lembrete por dia, para quem estiver devendo a ação naquela etapa.
 */
async function runReminders() {
  const config = db.config;
  if (!config.remindersEnabled || !config.notificationsEnabled) return { sent: 0 };
  if (!mailer.isConfigured(config.smtp)) return { sent: 0 };

  const today = Model.isoToday();
  let sent = 0;

  for (const job of db.jobs) {
    const role = Model.STAGES[job.status].owner;
    if (!role || !job.deadline) continue;
    if (job.lastReminderDate === today) continue;

    const left = daysLeft(job.deadline);
    if (left > Number(config.reminderDaysBefore || 3)) continue;

    const recipients = recipientsFor(role, job);
    if (!recipients.length) continue;

    const results = await deliver(job, recipients, reminderMessage(job, role, left));
    job.lastReminderDate = today;
    sent += results.filter(r => r.ok).length;
  }

  if (sent) await db.persist();
  return { sent };
}

function startReminders() {
  const tick = () => runReminders().catch(err => console.error('Lembretes:', err.message));
  setTimeout(tick, 10000).unref?.();
  setInterval(tick, 60 * 60 * 1000).unref?.();
}

module.exports = { onTransition, resendCode, sendTest, runReminders, startReminders };
