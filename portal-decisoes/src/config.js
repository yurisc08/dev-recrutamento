'use strict';
const path = require('path');

const raiz = path.resolve(__dirname, '..');

module.exports = {
  porta: Number(process.env.PORT || 3000),
  // 0.0.0.0 expõe na rede interna; use 127.0.0.1 quando houver proxy reverso no mesmo host.
  host: process.env.HOST || '0.0.0.0',
  bancoCaminho: process.env.DB_PATH || path.join(raiz, 'dados', 'portal.db'),
  // Em produção o cookie só deve trafegar sob HTTPS.
  cookieSeguro: String(process.env.COOKIE_SECURE || 'false') === 'true',
  horasSessao: Number(process.env.SESSION_HOURS || 8),
  maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 20),
  tentativasLogin: Number(process.env.LOGIN_MAX_TENTATIVAS || 5),
  janelaLoginMin: Number(process.env.LOGIN_JANELA_MIN || 15),
  raiz,
};
