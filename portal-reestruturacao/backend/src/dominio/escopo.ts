import type { Construtor } from '../db/construtor.js';
import type { UsuarioSessao } from './tipos.js';

/**
 * Recorte de visibilidade aplicado no banco, nunca só na tela:
 *  - gestor  → apenas colaboradores das suas Divisões;
 *  - diretor → apenas colaboradores das suas Diretorias;
 *  - admin   → toda a empresa.
 */
export function condicaoEscopo(usuario: UsuarioSessao, construtor: Construtor, alias = 'c'): string {
  if (usuario.perfil === 'admin') return 'true';
  if (usuario.perfil === 'diretor') {
    if (usuario.diretorias.length === 0) return 'false';
    return `${alias}.diretoria_id = ANY(${construtor.p(usuario.diretorias)}::int[])`;
  }
  if (usuario.divisoes.length === 0) return 'false';
  return `${alias}.divisao_id = ANY(${construtor.p(usuario.divisoes)}::int[])`;
}

export function podeVerTudo(usuario: UsuarioSessao): boolean {
  return usuario.perfil === 'admin';
}

/** Confere se um colaborador específico está dentro do escopo do usuário. */
export function dentroDoEscopo(
  usuario: UsuarioSessao,
  colaborador: { diretoria_id: number | null; divisao_id: number | null },
): boolean {
  if (usuario.perfil === 'admin') return true;
  if (usuario.perfil === 'diretor') {
    return colaborador.diretoria_id !== null && usuario.diretorias.includes(colaborador.diretoria_id);
  }
  return colaborador.divisao_id !== null && usuario.divisoes.includes(colaborador.divisao_id);
}
