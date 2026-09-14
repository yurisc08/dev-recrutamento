export type Perfil = 'admin' | 'diretor' | 'gestor';

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

export interface Referencia { id: number; nome: string }

export interface Colaborador {
  id: number;
  chapa: string;
  nome: string | null;
  situacao: string | null;
  diretoria: Referencia | null;
  divisao: Referencia | null;
  dados: Record<string, any>;
  avaliacao: {
    acao: string | null;
    justificativa: string | null;
    destino: string | null;
    nova_diretoria: Referencia | null;
    nova_divisao: Referencia | null;
    status: 'pendente' | 'preenchida' | 'homologada';
    atualizado_em: string | null;
    atualizado_por: string | null;
    homologado_em: string | null;
    homologado_por: string | null;
  };
  alertas: Alerta[];
}

export interface Contexto {
  usuario: { id: number; usuario: string; nome: string; email: string | null; perfil: Perfil; perfil_descricao: string };
  permissoes: {
    administrar: boolean; homologar: boolean; avaliar: boolean;
    importar: boolean; exportar: boolean; ver_auditoria: boolean;
  };
  processo: { id: number; nome: string; data_base: string; prazo: string | null; aviso_confidencialidade: string | null };
  campos: Campo[];
  acoes: Acao[];
  regras: Regra[];
  diretorias: Referencia[];
  divisoes: Array<Referencia & { diretoria_id: number }>;
  todas_diretorias: Referencia[];
  todas_divisoes: Array<Referencia & { diretoria_id: number }>;
}

export interface Dashboard {
  processo: Contexto['processo'];
  campo_soma: { chave: string; rotulo: string } | null;
  totais: {
    total: number; avaliados: number; pendentes: number; homologadas: number;
    desligados_base: number; custo_total: number; custo_reducao: number; percentual: number;
  };
  acoes: Array<{ valor: string; cor: string; total: number; custo: number }>;
  por_diretoria: Array<Record<string, any>>;
  por_divisao: Array<Record<string, any>>;
  por_gestor: Array<Record<string, any>>;
  quebras: Array<{ chave: string; rotulo: string; linhas: Array<Record<string, any>> }>;
}
