export type Perfil = 'admin' | 'diretor' | 'gestor';
export type TipoCampo = 'texto' | 'numero' | 'moeda' | 'data' | 'lista' | 'booleano';
export type Origem = 'base' | 'avaliacao';
export type EditavelPor = 'ninguem' | 'gestor' | 'diretor' | 'admin';
export type Severidade = 'info' | 'atencao' | 'critico';

export interface Campo {
  id: number;
  processo_id: number;
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes: string[] | null;
  grupo: string | null;
  origem: Origem;
  obrigatorio: boolean;
  somente_leitura: boolean;
  editavel_por: EditavelPor;
  visivel_lista: boolean;
  ativo: boolean;
  somar: boolean;
  agrupar: boolean;
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
  ordem: number;
  ativo: boolean;
}

export interface Regra {
  id: number;
  nome: string;
  campo: string;
  operador: 'preenchido' | 'vazio' | 'igual' | 'diferente' | 'contem' | 'data_futura' | 'data_passada' | 'maior_que' | 'menor_que';
  valor: string | null;
  mensagem: string;
  severidade: Severidade;
  aplica_acao: string | null;
  exige_justificativa: boolean;
  ordem: number;
  ativo: boolean;
}

export interface Alerta {
  regra: string;
  mensagem: string;
  severidade: Severidade;
  exige_justificativa: boolean;
  aplica_acao: string | null;
}

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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSessao;
      sessaoId?: string;
    }
  }
}
