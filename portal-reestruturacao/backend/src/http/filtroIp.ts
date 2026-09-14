import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { criarFiltroIp } from './rede.js';
import { ipDe } from './auditoria.js';

const filtro = criarFiltroIp(config.ipsPermitidos);

if (filtro.ativo) {
  console.log(`Acesso restrito às origens: ${filtro.regras.join(', ')}`);
} else if (config.ambiente === 'production') {
  console.warn('ATENÇÃO: IPS_PERMITIDOS está vazio — o portal aceita conexões de qualquer origem.');
}

/** Bloqueia o que vem de fora das faixas autorizadas, exceto o teste de saúde do provedor. */
export function restringirPorIp(req: Request, res: Response, next: NextFunction): void {
  if (!filtro.ativo || req.path === '/api/saude') {
    next();
    return;
  }
  const origem = ipDe(req) || req.ip || '';
  if (filtro.permitido(origem)) {
    next();
    return;
  }
  res.status(403).json({
    erro: 'Acesso permitido apenas pela rede da empresa. Conecte-se à VPN corporativa e tente novamente.',
  });
}
