import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      // Em desenvolvimento o front conversa com o Worker (wrangler dev) pelo proxy,
      // mantendo o cookie de sessão como same-site — igual à produção.
      proxy: {
        '/api': { target: env.API_URL || 'http://127.0.0.1:8787', changeOrigin: false },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
