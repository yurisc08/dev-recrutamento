import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { encerrarPool, pool } from './db/pool.js';
import { tratarErros, ErroHttp } from './http/erros.js';
import { exigirCabecalhoPortal, exigirLogin, sessao } from './http/auth.js';
import { rotasAutenticacao } from './rotas/autenticacao.js';
import { rotasColaboradores } from './rotas/colaboradores.js';
import { rotasDashboard } from './rotas/dashboard.js';
import { rotasConfiguracao } from './rotas/configuracao.js';
import { rotasUsuarios } from './rotas/usuarios.js';
import { rotasAuditoria } from './rotas/auditoria.js';
import { rotasImportacao } from './rotas/importacao.js';
import { rotasExportacao } from './rotas/exportacao.js';

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    // Em desenvolvimento o front roda em outra porta (Vite); em produção é servido pelo mesmo host.
    if (config.origemPermitida && req.headers.origin === config.origemPermitida) {
      res.setHeader('Access-Control-Allow-Origin', config.origemPermitida);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-portal');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/saude', (_req, res) => {
    res.json({ ok: true, agora: new Date().toISOString() });
  });

  app.use('/api', exigirCabecalhoPortal);
  app.use(sessao);
  app.use('/api/auth', rotasAutenticacao);
  app.use('/api/colaboradores', exigirLogin, rotasColaboradores);
  app.use('/api/dashboard', exigirLogin, rotasDashboard);
  app.use('/api/config', exigirLogin, rotasConfiguracao);
  app.use('/api/usuarios', exigirLogin, rotasUsuarios);
  app.use('/api/auditoria', exigirLogin, rotasAuditoria);
  app.use('/api/importacao', exigirLogin, rotasImportacao);
  app.use('/api/exportacao', exigirLogin, rotasExportacao);

  // Em produção o mesmo processo serve o front compilado (frontend/dist).
  const pastaFront = process.env.FRONTEND_DIR ?? path.join(process.cwd(), 'public');
  app.use(express.static(pastaFront, { index: 'index.html', maxAge: '5m' }));

  app.use('/api', (_req, _res, next) => next(new ErroHttp(404, 'Recurso não encontrado.')));
  app.get('*', (_req, res) => res.sendFile(path.join(pastaFront, 'index.html')));
  app.use(tratarErros);
  return app;
}

export async function iniciar() {
  await pool.query('SELECT 1');
  const app = criarApp();
  const servidor = app.listen(config.porta, config.host, () => {
    console.log(`API do Portal de Decisões em http://${config.host}:${config.porta}`);
  });
  const encerrar = () => {
    servidor.close(() => {
      encerrarPool().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
  return servidor;
}

if (require.main === module) {
  iniciar().catch((erro) => {
    console.error('Falha ao iniciar a API:', erro);
    process.exit(1);
  });
}
