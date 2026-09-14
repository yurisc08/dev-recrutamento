/** Configuração da API — tudo por variável de ambiente, nada sensível no código. */
export const config = {
  porta: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  bancoUrl:
    process.env.DATABASE_URL ??
    'postgres://portal:portal@localhost:5432/portal',
  cookieSeguro: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  horasSessao: Number(process.env.SESSION_HOURS ?? 8),
  maxUploadMB: Number(process.env.MAX_UPLOAD_MB ?? 25),
  loginMaxTentativas: Number(process.env.LOGIN_MAX_TENTATIVAS ?? 5),
  loginJanelaMin: Number(process.env.LOGIN_JANELA_MIN ?? 15),
  origemPermitida: process.env.CORS_ORIGIN ?? '',
  ambiente: process.env.NODE_ENV ?? 'development',
} as const;
