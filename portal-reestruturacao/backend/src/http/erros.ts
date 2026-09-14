import type { NextFunction, Request, Response } from 'express';

export class ErroHttp extends Error {
  constructor(
    public status: number,
    mensagem: string,
    public detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

/** Encaminha rejeições de handlers async para o middleware de erro. */
export function rota(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function tratarErros(erro: unknown, req: Request, res: Response, _next: NextFunction): void {
  const http = erro as Partial<ErroHttp> & { code?: string };
  const status = http?.status ?? (erro instanceof SyntaxError ? 400 : 500);

  if (http?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ erro: 'Arquivo acima do tamanho máximo permitido.' });
    return;
  }
  if (status >= 500) console.error(`[erro] ${req.method} ${req.originalUrl}`, erro);

  res.status(status).json({
    erro: status >= 500 ? 'Erro interno. Procure o administrador do portal.' : (erro as Error).message,
    ...(http?.detalhes ? { detalhes: http.detalhes } : {}),
  });
}
