import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';

export type TipoEvento =
  | 'login' | 'login_falha' | 'logout' | 'senha'
  | 'avaliacao' | 'homologacao'
  | 'importacao' | 'exportacao'
  | 'usuario' | 'permissao'
  | 'config' | 'campo' | 'estrutura' | 'dado';

export interface EventoAuditoria {
  tipo: TipoEvento;
  entidade?: string;
  entidadeId?: string | number | null;
  chapa?: string | null;
  campo?: string | null;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  detalhes?: Record<string, unknown> | null;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}

export function ipDe(req: Request): string {
  const encaminhado = String(req.headers['x-forwarded-for'] ?? '');
  return (encaminhado.split(',')[0] || req.socket.remoteAddress || '').trim();
}

/**
 * Registra um evento na trilha de auditoria. A tabela é somente de inserção:
 * nenhuma rota da aplicação altera ou apaga registros de auditoria.
 */
export async function auditar(
  req: Request,
  evento: EventoAuditoria,
  cliente?: PoolClient,
): Promise<void> {
  const executor = cliente ?? pool;
  await executor.query(
    `INSERT INTO auditoria (usuario_id, usuario_nome, perfil, tipo, entidade, entidade_id, chapa,
                            campo, valor_anterior, valor_novo, detalhes, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      req.usuario?.id ?? null,
      req.usuario?.nome ?? null,
      req.usuario?.perfil ?? null,
      evento.tipo,
      evento.entidade ?? null,
      evento.entidadeId === null || evento.entidadeId === undefined ? null : String(evento.entidadeId),
      evento.chapa ?? null,
      evento.campo ?? null,
      texto(evento.valorAnterior),
      texto(evento.valorNovo),
      evento.detalhes ? JSON.stringify(evento.detalhes) : null,
      ipDe(req),
    ],
  );
}
