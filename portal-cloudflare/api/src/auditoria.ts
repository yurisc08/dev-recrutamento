import type { Sql } from 'postgres';
import type { UsuarioSessao } from './tipos.js';

export interface Evento {
  usuario?: UsuarioSessao;
  tipo: string;
  entidade?: string;
  entidadeId?: string | number | null;
  chapa?: string | null;
  campo?: string | null;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  detalhes?: Record<string, unknown> | null;
  ip?: string;
}

const texto = (valor: unknown): string | null => {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
};

/** Insere na trilha. A tabela é somente-inserção no banco (gatilho + grants). */
export async function auditar(sql: Sql, evento: Evento): Promise<void> {
  await sql`
    INSERT INTO portal.auditoria
      (usuario_id, usuario_nome, perfil, tipo, entidade, entidade_id, chapa, campo, valor_anterior, valor_novo, detalhes, ip)
    VALUES (
      ${evento.usuario?.id ?? null}, ${evento.usuario?.nome ?? null}, ${evento.usuario?.perfil ?? null},
      ${evento.tipo}, ${evento.entidade ?? null},
      ${evento.entidadeId === null || evento.entidadeId === undefined ? null : String(evento.entidadeId)},
      ${evento.chapa ?? null}, ${evento.campo ?? null},
      ${texto(evento.valorAnterior)}, ${texto(evento.valorNovo)},
      ${evento.detalhes ? sql.json(evento.detalhes as never) : null}, ${evento.ip ?? null})`;
}
