export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Protege o disparo manual de /jobs/processar. */
  WORKER_API_KEY: string;
  /** Tokens dos sistemas de destino, referenciados por `integracao_destinos.segredo_env`. */
  RSDATA_TOKEN?: string;
  FOLHA_TOKEN?: string;
  BI_TOKEN?: string;
  [chave: string]: string | undefined;
}

export interface Destino {
  id: string;
  chave: string;
  nome: string;
  conector: 'rsdata' | 'webhook' | 'simulado' | string;
  endpoint_url: string | null;
  metodo: string;
  cabecalhos: Record<string, string>;
  segredo_env: string | null;
  mapeamento: Record<string, string>;
  max_tentativas: number;
  ativo: boolean;
}

export interface Job {
  id: string;
  atestado_id: string;
  destino_id: string;
  status: string;
  tentativas: number;
  max_tentativas: number;
  payload: PayloadAtestado;
}

export interface PayloadAtestado {
  protocolo: string;
  tipo: string;
  status: string;
  colaborador: {
    matricula: string;
    nome: string;
    cpf: string | null;
    cargo: string | null;
    setor: string | null;
    unidade: string | null;
  };
  afastamento: {
    data_emissao: string;
    data_inicio: string;
    data_fim: string;
    dias: number;
    horas: number | null;
    afasta_inss: boolean;
  };
  cid: { codigo: string | null; descricao: string | null };
  emitente: {
    nome: string | null;
    conselho: string | null;
    registro: string | null;
    uf: string | null;
    instituicao: string | null;
  };
  validacao: {
    parecer: string | null;
    restricao: string | null;
    validado_em: string | null;
    validado_por: string | null;
  };
  anexos: Array<{ nome: string; path: string; mime: string | null }>;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  resposta: unknown;
  erro?: string;
  referencia?: string;
}

export type Conector = (
  job: Job,
  destino: Destino,
  env: Env,
) => Promise<ResultadoEnvio>;
