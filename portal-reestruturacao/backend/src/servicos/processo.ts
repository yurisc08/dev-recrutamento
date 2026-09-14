import { consultar, consultarUm } from '../db/pool.js';
import { ErroHttp } from '../http/erros.js';
import type { Acao, Campo, Regra } from '../dominio/tipos.js';

export interface Processo {
  id: number;
  nome: string;
  data_base: string;
  prazo: string | null;
  aviso_confidencialidade: string | null;
  ativo: boolean;
}

export interface ContextoProcesso {
  processo: Processo;
  campos: Campo[];
  acoes: Acao[];
  regras: Regra[];
}

function dataISO(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor ?? '').slice(0, 10);
}

export async function processoAtivo(): Promise<Processo> {
  const processo = await consultarUm<Processo>(
    'SELECT * FROM processos WHERE ativo = true ORDER BY id LIMIT 1',
  );
  if (!processo) throw new ErroHttp(500, 'Nenhum processo ativo configurado. Execute a carga inicial.');
  return { ...processo, data_base: dataISO(processo.data_base), prazo: processo.prazo ? dataISO(processo.prazo) : null };
}

export async function carregarContexto(): Promise<ContextoProcesso> {
  const processo = await processoAtivo();
  const [campos, acoes, regras] = await Promise.all([
    consultar<Campo>('SELECT * FROM campos WHERE processo_id = $1 ORDER BY ordem, id', [processo.id]),
    consultar<Acao>('SELECT * FROM acoes WHERE processo_id = $1 ORDER BY ordem, id', [processo.id]),
    consultar<Regra>('SELECT * FROM regras WHERE processo_id = $1 ORDER BY ordem, id', [processo.id]),
  ]);
  return { processo, campos, acoes, regras };
}

export function camposAtivos(campos: Campo[], origem?: 'base' | 'avaliacao'): Campo[] {
  return campos.filter((campo) => campo.ativo && (origem ? campo.origem === origem : true));
}
