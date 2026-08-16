import { Hono } from 'hono';
import type { Env, Variables } from './types';
import { HttpError } from './lib/http';
import { requireAuth, requireWrite } from './lib/auth';
import { authRoutes } from './routes/auth';
import { classRoutes, sessionRoutes } from './routes/classes';
import { courseRoutes, roomRoutes } from './routes/catalog';
import { dashboardRoutes } from './routes/dashboard';
import { deviceRoutes } from './routes/devices';
import { ingestRoutes } from './routes/ingest';
import { peopleRoutes } from './routes/people';
import { scanRoutes } from './routes/scans';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'presenca-treinamentos' }));

// Ingestao das maquininhas: autenticada por chave do dispositivo, sem cookie.
app.route('/api/ingest', ingestRoutes);

// Login do painel.
app.route('/api/auth', authRoutes);

// Demais rotas exigem sessao; perfil "leitura" nao pode alterar dados.
const api = new Hono<{ Bindings: Env; Variables: Variables }>();
api.use('*', requireAuth);
api.use('*', requireWrite);
api.route('/dashboard', dashboardRoutes);
api.route('/people', peopleRoutes);
api.route('/courses', courseRoutes);
api.route('/rooms', roomRoutes);
api.route('/classes', classRoutes);
api.route('/sessions', sessionRoutes);
api.route('/devices', deviceRoutes);
api.route('/scans', scanRoutes);
app.route('/api', api);

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.code, message: error.message }, error.status);
  }
  console.error('erro_inesperado', error);
  return c.json({ error: 'erro_interno', message: 'Falha ao processar a requisicao.' }, 500);
});

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'rota_nao_encontrada' }, 404);
  }
  // Qualquer outra rota devolve o painel (SPA com navegacao por hash).
  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});

export default app;
