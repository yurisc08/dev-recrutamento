import type { Sql } from 'postgres';
import type { Acao, Alerta, Campo, Perfil, Regra, UsuarioSessao } from './tipos.js';

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string, public detalhes?: unknown) {
    super(mensagem);
  }
}

export interface Processo {
  id: number;
  nome: string;
  data_base: string;
  prazo: string | null;
  aviso_confidencialidade: string | null;
}

export interface Contexto {
  processo: Processo;
  campos: Campo[];
  acoes: Acao[];
  regras: Regra[];
}

const paraISO = (valor: unknown): string =>
  valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor ?? '').slice(0, 10);

export async function carregarContexto(sql: Sql): Promise<Contexto> {
  const [processo] = await sql<Processo[]>`
    SELECT id, nome, data_base, prazo, aviso_confidencialidade
      FROM portal.processos WHERE ativo ORDER BY id LIMIT 1`;
  if (!processo) throw new ErroApi(500, 'Nenhum processo ativo configurado. Rode a carga inicial no Supabase.');

  const [campos, acoes, regras] = await Promise.all([
    sql<Campo[]>`SELECT * FROM portal.campos WHERE processo_id = ${processo.id} ORDER BY ordem, id`,
    sql<Acao[]>`SELECT * FROM portal.acoes WHERE processo_id = ${processo.id} ORDER BY ordem, id`,
    sql<Regra[]>`SELECT * FROM portal.regras WHERE processo_id = ${processo.id} ORDER BY ordem, id`,
  ]);

  return {
    processo: { ...processo, data_base: paraISO(processo.data_base), prazo: processo.prazo ? paraISO(processo.prazo) : null },
    campos: campos as Campo[],
    acoes: acoes as Acao[],
    regras: regras as Regra[],
  };
}

/* ------------------------------ valores ------------------------------- */
export const normalizar = (texto: unknown): string =>
  String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/[R$\s ]/gi, '');
  if (!texto) return null;
  if (/,\d{1,2}$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else texto = texto.replace(/,/g, '');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export function paraDataISO(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return null;
}

export function converter(valor: unknown, campo: Pick<Campo, 'tipo' | 'rotulo' | 'opcoes'>): { valor: unknown; erro?: string } {
  const bruto = typeof valor === 'string' ? valor.trim() : valor;
  if (bruto === '' || bruto === null || bruto === undefined) return { valor: null };
  switch (campo.tipo) {
    case 'numero':
    case 'moeda': {
      const numero = paraNumero(bruto);
      if (numero === null) return { valor: null, erro: `"${campo.rotulo}" deve ser numérico.` };
      return { valor: numero };
    }
    case 'data': {
      const data = paraDataISO(bruto);
      if (!data) return { valor: null, erro: `"${campo.rotulo}" deve ser uma data válida.` };
      return { valor: data };
    }
    case 'booleano': {
      const texto = normalizar(bruto);
      if (['sim', 's', 'true', '1', 'x'].includes(texto)) return { valor: true };
      if (['nao', 'n', 'false', '0'].includes(texto)) return { valor: false };
      return { valor: null, erro: `"${campo.rotulo}" deve ser Sim ou Não.` };
    }
    case 'lista': {
      const opcoes = campo.opcoes ?? [];
      if (opcoes.length === 0) return { valor: String(bruto) };
      const achado = opcoes.find((o) => normalizar(o) === normalizar(bruto));
      if (!achado) return { valor: null, erro: `"${String(bruto)}" não é opção válida de "${campo.rotulo}".` };
      return { valor: achado };
    }
    default:
      return { valor: String(bruto) };
  }
}

/* ------------------------------- alertas ------------------------------ */
export function avaliarAlertas(dados: Record<string, unknown>, regras: Regra[]): Alerta[] {
  const hoje = new Date().toISOString().slice(0, 10);
  return regras
    .filter((regra) => {
      if (!regra.ativo) return false;
      const valor = dados[regra.campo];
      const vazio = valor === null || valor === undefined || String(valor).trim() === '';
      switch (regra.operador) {
        case 'preenchido': return !vazio;
        case 'vazio': return vazio;
        case 'igual': return normalizar(valor) === normalizar(regra.valor);
        case 'diferente': return !vazio && normalizar(valor) !== normalizar(regra.valor);
        case 'contem': return !vazio && normalizar(valor).includes(normalizar(regra.valor));
        case 'data_futura': return !vazio && String(valor).slice(0, 10) >= hoje;
        case 'data_passada': return !vazio && String(valor).slice(0, 10) < hoje;
        default: return false;
      }
    })
    .map((regra) => ({
      regra: regra.nome,
      mensagem: regra.mensagem,
      severidade: regra.severidade,
      exige_justificativa: regra.exige_justificativa,
      aplica_acao: regra.aplica_acao,
    }));
}

export interface EntradaAvaliacao {
  acao: string | null;
  justificativa: string | null;
  destino: string | null;
  nova_diretoria_id: number | null;
}

export function validarAvaliacao(
  entrada: EntradaAvaliacao,
  contexto: { acoes: Acao[]; campos: Campo[]; alertas: Alerta[] },
): void {
  if (entrada.acao === null) return;
  const configurada = contexto.acoes.find((a) => a.valor === entrada.acao && a.ativo);
  if (!configurada) {
    const disponiveis = contexto.acoes.filter((a) => a.ativo).map((a) => a.valor).join(', ');
    throw new ErroApi(422, `Ação inválida. Opções disponíveis: ${disponiveis}.`);
  }

  const semJustificativa = !entrada.justificativa || entrada.justificativa.trim() === '';
  const campoJust = contexto.campos.find((c) => c.chave === 'justificativa');
  const alertaExige = contexto.alertas.some(
    (a) => a.exige_justificativa && (a.aplica_acao === null || a.aplica_acao === entrada.acao),
  );
  if (semJustificativa && (configurada.exige_justificativa || campoJust?.obrigatorio || alertaExige)) {
    throw new ErroApi(422, alertaExige
      ? 'Este colaborador possui alerta que exige justificativa para esta ação.'
      : `A ação "${entrada.acao}" exige o preenchimento da justificativa.`);
  }
  if (configurada.exige_destino && !entrada.nova_diretoria_id && !(entrada.destino && entrada.destino.trim())) {
    throw new ErroApi(422, `A ação "${entrada.acao}" exige a indicação do destino (nova Diretoria ou setor).`);
  }
}

/* -------------------------------- escopo ------------------------------ */
export function dentroDoEscopo(
  usuario: UsuarioSessao,
  colaborador: { diretoria_id: number | null; divisao_id: number | null; responsavel_id?: number | null },
): boolean {
  if (usuario.perfil === 'admin') return true;
  if (usuario.perfil === 'diretor') {
    return colaborador.diretoria_id !== null && usuario.diretorias.includes(colaborador.diretoria_id);
  }
  // Gestor responde por quem está sob ele: por vínculo direto (gestor imediato)
  // ou pela Divisão que lhe foi atribuída.
  if (colaborador.responsavel_id && colaborador.responsavel_id === usuario.id) return true;
  return colaborador.divisao_id !== null && usuario.divisoes.includes(colaborador.divisao_id);
}

const NIVEL: Record<Perfil, number> = { gestor: 1, diretor: 2, admin: 3 };
const EXIGIDO: Record<string, number> = { ninguem: 9, gestor: 1, diretor: 2, admin: 3 };

export function podeEditarCampo(usuario: UsuarioSessao, campo: Campo): boolean {
  if (!campo.ativo || campo.somente_leitura || campo.editavel_por === 'ninguem') return false;
  return NIVEL[usuario.perfil] >= EXIGIDO[campo.editavel_por];
}

export function exigirPerfil(usuario: UsuarioSessao | undefined, ...perfis: Perfil[]): UsuarioSessao {
  if (!usuario) throw new ErroApi(401, 'Sessão expirada. Faça login novamente.');
  if (!perfis.includes(usuario.perfil)) throw new ErroApi(403, 'Seu perfil não tem permissão para esta operação.');
  return usuario;
}
