/*
 * server/mailer.js
 * -----------------------------------------------------------------------------
 * Cliente SMTP mínimo, escrito sobre node:net e node:tls — sem dependências.
 *
 * Cobre o que um envio de aviso precisa: EHLO, STARTTLS, AUTH (PLAIN ou LOGIN),
 * MAIL FROM, RCPT TO, DATA e QUIT. Corpo em UTF-8, codificado em base64, para
 * que acentos cheguem certos em qualquer servidor.
 *
 * Portas usuais:
 *   587 + secure:false -> STARTTLS (o mais comum)
 *   465 + secure:true  -> TLS direto
 *    25 + secure:false -> servidor interno sem autenticação
 */

const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');

const TIMEOUT = 20000;

/* ----------------------------- Diálogo SMTP ------------------------------ */
class Conversation {
  constructor(socket) {
    this.buffer = '';
    this.waiting = null;
    this.failure = null;
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.setTimeout(TIMEOUT);
    socket.on('data', chunk => { this.buffer += chunk; this.flush(); });
    socket.on('error', err => this.abort(err));
    socket.on('timeout', () => this.abort(new Error('Tempo esgotado ao falar com o servidor de e-mail')));
    socket.on('close', () => this.abort(new Error('Conexão encerrada pelo servidor de e-mail')));
  }

  abort(err) {
    this.failure = err;
    if (this.waiting) {
      const { reject } = this.waiting;
      this.waiting = null;
      reject(err);
    }
  }

  /* Uma resposta termina na linha "250 texto"; "250-texto" é continuação. */
  flush() {
    if (!this.waiting) return;
    const lines = this.buffer.split(/\r?\n/);
    const end = lines.findIndex(line => /^\d{3} /.test(line));
    if (end < 0) return;

    const used = lines.slice(0, end + 1);
    this.buffer = lines.slice(end + 1).join('\r\n');
    const { resolve } = this.waiting;
    this.waiting = null;
    resolve({ code: Number(used[used.length - 1].slice(0, 3)), text: used.join('\n') });
  }

  read() {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.flush();
    });
  }

  write(line) {
    this.socket.write(line + '\r\n');
  }

  /* Envia um comando e confere o código de resposta. */
  async command(line, expected, label) {
    this.write(line);
    const response = await this.read();
    if (!expected.includes(response.code)) {
      throw new Error(`${label}: ${response.text.split('\n').pop() || response.code}`);
    }
    return response;
  }
}

/* ------------------------------ Codificação ------------------------------ */
const encodeHeader = value => `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
const encodeBody = text => Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8')
  .toString('base64').replace(/(.{76})/g, '$1\r\n');

const addressOf = value => {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(value || '')).trim();
};

function buildMessage({ from, to, subject, text }) {
  const headers = [
    `From: ${/</.test(from) ? from.replace(/^([^<]+)/, m => encodeHeader(m.trim()) + ' ') : from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${os.hostname() || 'descritivos'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ];
  return headers.join('\r\n') + '\r\n\r\n' + encodeBody(text);
}

/* --------------------------------- Envio --------------------------------- */
function connect(smtp) {
  return new Promise((resolve, reject) => {
    const options = { host: smtp.host, port: Number(smtp.port) || 587 };
    const socket = smtp.secure
      ? tls.connect({ ...options, servername: smtp.host }, () => resolve(socket))
      : net.connect(options, () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(TIMEOUT, () => {
      socket.destroy();
      reject(new Error('Não foi possível conectar ao servidor de e-mail'));
    });
  });
}

function upgrade(socket, smtp) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: smtp.host }, () => resolve(secure));
    secure.once('error', reject);
  });
}

function isConfigured(smtp) {
  return Boolean(smtp && smtp.host && (smtp.from || smtp.user));
}

async function sendMail(smtp, message) {
  if (!isConfigured(smtp)) throw new Error('SMTP não configurado');

  const from = smtp.from || smtp.user;
  const socket = await connect(smtp);
  const talk = new Conversation(socket);

  try {
    const greeting = await talk.read();
    if (greeting.code !== 220) throw new Error(`Servidor recusou a conexão: ${greeting.text}`);

    const hostname = os.hostname() || 'localhost';
    let capabilities = (await talk.command(`EHLO ${hostname}`, [250], 'EHLO')).text;

    if (!smtp.secure && /STARTTLS/i.test(capabilities)) {
      await talk.command('STARTTLS', [220], 'STARTTLS');
      talk.attach(await upgrade(socket, smtp));
      capabilities = (await talk.command(`EHLO ${hostname}`, [250], 'EHLO')).text;
    }

    if (smtp.user) {
      if (/AUTH[^\n]*PLAIN/i.test(capabilities)) {
        const credentials = Buffer.from(`\0${smtp.user}\0${smtp.pass || ''}`, 'utf8').toString('base64');
        await talk.command(`AUTH PLAIN ${credentials}`, [235], 'Autenticação');
      } else {
        await talk.command('AUTH LOGIN', [334], 'Autenticação');
        await talk.command(Buffer.from(smtp.user, 'utf8').toString('base64'), [334], 'Autenticação (usuário)');
        await talk.command(Buffer.from(smtp.pass || '', 'utf8').toString('base64'), [235], 'Autenticação (senha)');
      }
    }

    await talk.command(`MAIL FROM:<${addressOf(from)}>`, [250], 'Remetente');
    await talk.command(`RCPT TO:<${addressOf(message.to)}>`, [250, 251], 'Destinatário');
    await talk.command('DATA', [354], 'DATA');

    talk.socket.write(buildMessage({ ...message, from }) + '\r\n.\r\n');
    const stored = await talk.read();
    if (stored.code !== 250) throw new Error(`Mensagem recusada: ${stored.text}`);

    talk.write('QUIT');
  } finally {
    talk.socket.destroy();
  }
}

module.exports = { sendMail, isConfigured, buildMessage };
