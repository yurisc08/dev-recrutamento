export interface Ambiente {
  DATABASE_URL: string;
  DB_SSL?: string;
  IPS_PERMITIDOS?: string;
  ACCESS_DOMINIO?: string;
  ACCESS_AUD?: string;
  SESSAO_HORAS?: string;
  COOKIE_SEGURO?: string;
}

export type Perfil = 'admin' | 'diretor' | 'gestor';

export interface UsuarioSessao {
  id: number;
  usuario: string;
  nome: string;
  email: string | null;
  perfil: Perfil;
  trocar_senha: boolean;
  diretorias: number[];
  divisoes: number[];
}

export interface Campo {
  id: number;
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'lista' | 'booleano';
  opcoes: string[] | null;
  grupo: string | null;
  origem: 'base' | 'avaliacao';
  obrigatorio: boolean;
  somente_leitura: boolean;
  editavel_por: 'ninguem' | 'gestor' | 'diretor' | 'admin';
  visivel_lista: boolean;
  ativo: boolean;
  somar: boolean;
  agrupar: boolean;
  sensivel: boolean;
  ordem: number;
  ajuda: string | null;
}

export interface Acao {
  id: number;
  valor: string;
  cor: string;
  exige_justificativa: boolean;
  exige_destino: boolean;
  considera_desligamento: boolean;
  ativo: boolean;
}

export interface Regra {
  id: number;
  nome: string;
  campo: string;
  operador: string;
  valor: string | null;
  mensagem: string;
  severidade: 'info' | 'atencao' | 'critico';
  aplica_acao: string | null;
  exige_justificativa: boolean;
  ativo: boolean;
}

export interface Alerta {
  regra: string;
  mensagem: string;
  severidade: 'info' | 'atencao' | 'critico';
  exige_justificativa: boolean;
  aplica_acao: string | null;
}

export interface Variaveis {
  sql: import('postgres').Sql;
  usuario?: UsuarioSessao;
  sessaoId?: string;
  ip: string;
}
