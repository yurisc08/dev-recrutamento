'use strict';
const path = require('path');
const express = require('express');
const config = require('./src/config');
const { obter } = require('./src/db');
const auth = require('./src/auth');
const { ErroHttp } = require('./src/util');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Portal interno: nada é carregado de fora da rede, nem indexado, nem embutido em iframe.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(auth.carregarSessao);
app.use('/api', auth.exigirCabecalhoAjax);

app.use('/api/auth', require('./src/rotas/auth').router);

const protegido = [auth.exigirLogin];
app.use('/api/colaboradores', protegido, require('./src/rotas/colaboradores'));
app.use('/api/colunas', protegido, require('./src/rotas/colunas'));
app.use('/api/config', protegido, require('./src/rotas/config'));
app.use('/api/resumo', protegido, require('./src/rotas/resumo').router);
app.use('/api/usuarios', protegido, require('./src/rotas/usuarios'));
app.use('/api/historico', protegido, require('./src/rotas/historico'));
app.use('/api/planilha', protegido, require('./src/rotas/planilha'));

app.get('/api/saude', (req, res) => res.json({ ok: true, agora: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '5m' }));

app.use('/api', (req, res, next) => next(new ErroHttp(404, 'Recurso não encontrado.')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  const status = erro.status || (erro instanceof SyntaxError ? 400 : 500);
  if (status >= 500) console.error(`[erro] ${req.method} ${req.originalUrl}`, erro);
  if (erro?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ erro: `Arquivo maior que o limite de ${config.maxUploadMB} MB.` });
  }
  res.status(status).json({
    erro: status >= 500 ? 'Erro interno. Procure o administrador do portal.' : erro.message,
    ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
  });
});

function iniciar() {
  obter();
  const servidor = app.listen(config.porta, config.host, () => {
    console.log(`Portal de Decisões em http://${config.host}:${config.porta}`);
    console.log(`Banco: ${config.bancoCaminho}`);
  });
  const encerrar = () => servidor.close(() => process.exit(0));
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
  return servidor;
}

if (require.main === module) iniciar();

module.exports = { app, iniciar };
