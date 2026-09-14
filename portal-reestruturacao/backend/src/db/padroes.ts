/**
 * Estrutura inicial do processo, derivada da planilha "modelo_reestruturação".
 * Tudo aqui é apenas o ponto de partida: o RH pode renomear, desativar, reordenar
 * e acrescentar campos, ações e regras pelo próprio portal.
 */
export interface CampoPadrao {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'lista' | 'booleano';
  grupo: string;
  origem?: 'base' | 'avaliacao';
  visivel_lista?: boolean;
  agrupar?: boolean;
  somar?: boolean;
  obrigatorio?: boolean;
  editavel_por?: 'ninguem' | 'gestor' | 'diretor' | 'admin';
  ajuda?: string;
  opcoes?: string[];
}

export const CAMPOS_PADRAO: CampoPadrao[] = [
  { chave: 'concatenar', rotulo: 'CONCATENAR', tipo: 'texto', grupo: 'Controle' },
  { chave: 'competencia', rotulo: 'COMPETENCIA', tipo: 'texto', grupo: 'Controle' },
  { chave: 'area_ajustada', rotulo: 'ÁREA AJUSTADA', tipo: 'texto', grupo: 'Organização', agrupar: true },
  { chave: 'filial', rotulo: 'FILIAL', tipo: 'texto', grupo: 'Organização', agrupar: true },
  { chave: 'emp_cod', rotulo: 'EMP_COD', tipo: 'texto', grupo: 'Controle' },
  { chave: 'fil_cod', rotulo: 'FIL_COD', tipo: 'texto', grupo: 'Controle' },
  { chave: 'diretoria', rotulo: 'DIRETORIA', tipo: 'texto', grupo: 'Organização', visivel_lista: true, agrupar: true,
    ajuda: 'Define a Diretoria do colaborador — usada no controle de acesso do Diretor.' },
  { chave: 'divisao', rotulo: 'DIVISAO', tipo: 'texto', grupo: 'Organização', visivel_lista: true, agrupar: true,
    ajuda: 'Define a Divisão do colaborador — usada no controle de acesso do Gestor.' },
  { chave: 'departamento', rotulo: 'DEPARTAMENTO', tipo: 'texto', grupo: 'Organização', agrupar: true },
  { chave: 'uorg_cod', rotulo: 'UORG_COD', tipo: 'texto', grupo: 'Controle' },
  { chave: 'des_uo', rotulo: 'DES_UO', tipo: 'texto', grupo: 'Organização' },
  { chave: 'nome', rotulo: 'NOME', tipo: 'texto', grupo: 'Identificação', visivel_lista: true },
  { chave: 'chapa', rotulo: 'CHAPA', tipo: 'texto', grupo: 'Identificação', visivel_lista: true,
    ajuda: 'Matrícula — chave de atualização usada na importação.' },
  { chave: 'pessoa_fisica', rotulo: 'PESSOA_FISICA', tipo: 'texto', grupo: 'Identificação' },
  { chave: 'cpf', rotulo: 'CPF', tipo: 'texto', grupo: 'Identificação', ajuda: 'Dado pessoal sensível: mantenha fora das listas e exportações sempre que possível.' },
  { chave: 'cjca_cod', rotulo: 'CJCA_COD', tipo: 'texto', grupo: 'Cargo' },
  { chave: 'des_conjunto_cargo', rotulo: 'DES_CONJUNTO_CARGO', tipo: 'texto', grupo: 'Cargo' },
  { chave: 'car_cod', rotulo: 'CAR_COD', tipo: 'texto', grupo: 'Cargo' },
  { chave: 'des_cargo', rotulo: 'DES_CARGO', tipo: 'texto', grupo: 'Cargo', visivel_lista: true },
  { chave: 'segmento', rotulo: 'SEGMENTO', tipo: 'texto', grupo: 'Organização', agrupar: true },
  { chave: 'tur_cod', rotulo: 'TUR_COD', tipo: 'texto', grupo: 'Cargo' },
  { chave: 'mo', rotulo: 'MO', tipo: 'texto', grupo: 'Cargo', agrupar: true },
  { chave: 'natureza', rotulo: 'NATUREZA', tipo: 'texto', grupo: 'Cargo', agrupar: true },
  { chave: 'situacao', rotulo: 'SITUACAO', tipo: 'texto', grupo: 'Situação', visivel_lista: true, agrupar: true,
    ajuda: 'Situação na posição-base. "DESLIGADO" identifica quem já saiu no período.' },
  { chave: 'dt_admissao', rotulo: 'DT_ADMISSAO', tipo: 'data', grupo: 'Situação' },
  { chave: 'tempo_casa', rotulo: 'TEMPO_CASA', tipo: 'numero', grupo: 'Situação' },
  { chave: 'idade', rotulo: 'IDADE', tipo: 'numero', grupo: 'Situação' },
  { chave: 'dt_nasc', rotulo: 'DT_NASC', tipo: 'data', grupo: 'Situação' },
  { chave: 'dt_aposentadoria', rotulo: 'DT_APOSENTADORIA', tipo: 'data', grupo: 'Situação' },
  { chave: 'tipo_invalidez', rotulo: 'TIPO_INVALIDEZ', tipo: 'texto', grupo: 'Situação' },
  { chave: 'horario', rotulo: 'HORARIO', tipo: 'texto', grupo: 'Cargo' },
  { chave: 'hrs_teor_mes', rotulo: 'HRS_TEOR_MES', tipo: 'numero', grupo: 'Cargo' },
  { chave: 'tsal_cod', rotulo: 'TSAL_COD', tipo: 'texto', grupo: 'Remuneração' },
  { chave: 'fxsl_cod', rotulo: 'FXSL_COD', tipo: 'texto', grupo: 'Remuneração' },
  { chave: 'salario', rotulo: 'SALARIO', tipo: 'moeda', grupo: 'Remuneração' },
  { chave: 'evento_grat', rotulo: 'EVENTO_GRAT', tipo: 'moeda', grupo: 'Remuneração' },
  { chave: 'perc_grat', rotulo: 'PERC_GRAT', tipo: 'numero', grupo: 'Remuneração' },
  { chave: 'salario_total', rotulo: 'SALARIO_TOTAL', tipo: 'moeda', grupo: 'Remuneração', visivel_lista: true },
  { chave: 'vlr_mediana', rotulo: 'VLR_MEDIANA', tipo: 'moeda', grupo: 'Remuneração' },
  { chave: 'prm', rotulo: 'PRM', tipo: 'moeda', grupo: 'Remuneração' },
  { chave: 'avaliacao_performar', rotulo: 'DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR REGISTRADA', tipo: 'texto', grupo: 'Desempenho', visivel_lista: true },
  { chave: 'centro_custo_sap', rotulo: 'CENTRO DE CUSTO_SAP', tipo: 'texto', grupo: 'Remuneração' },
  { chave: 'estabilidade', rotulo: 'ESTABILIDADE', tipo: 'texto', grupo: 'Estabilidade', visivel_lista: true,
    ajuda: 'Qualquer condição de estabilidade/afastamento informada pelo RH.' },
  { chave: 'data_fim_estabilidade', rotulo: 'DATA FIM ESTABILIDADE', tipo: 'data', grupo: 'Estabilidade', visivel_lista: true },
  { chave: 'salario_anual', rotulo: 'SALÁRIO ANUAL', tipo: 'moeda', grupo: 'Remuneração', somar: true,
    ajuda: 'Base do cálculo de custo e de redução anual no dashboard.' },

  // Campos preenchidos no portal (a gravação acontece na tabela de avaliações).
  { chave: 'acao', rotulo: 'AÇÃO INDICADA', tipo: 'lista', grupo: 'Decisão', origem: 'avaliacao', visivel_lista: true, editavel_por: 'gestor' },
  { chave: 'destino', rotulo: 'EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE (SETOR/ÁREA/Nº PROCESSO)', tipo: 'texto', grupo: 'Decisão', origem: 'avaliacao', editavel_por: 'gestor' },
  { chave: 'justificativa', rotulo: 'JUSTIFICATIVA', tipo: 'texto', grupo: 'Decisão', origem: 'avaliacao', visivel_lista: true, editavel_por: 'gestor' },
];

export const ACOES_PADRAO = [
  { valor: 'ATIVO', cor: 'manter', exige_justificativa: false, exige_destino: false, considera_desligamento: false },
  { valor: 'DESLIGAMENTO', cor: 'desligamento', exige_justificativa: true, exige_destino: false, considera_desligamento: true },
  { valor: 'TRANSFERÊNCIA DE ÁREA', cor: 'transferencia', exige_justificativa: true, exige_destino: true, considera_desligamento: false },
  { valor: 'ESTABILIDADE', cor: 'atencao', exige_justificativa: true, exige_destino: false, considera_desligamento: false },
];

export const REGRAS_PADRAO = [
  {
    nome: 'Desligado na posição-base',
    campo: 'situacao',
    operador: 'igual' as const,
    valor: 'DESLIGADO',
    mensagem: 'Colaborador já desligado na posição-base. Confirme com o RH antes de registrar nova decisão.',
    severidade: 'info' as const,
    aplica_acao: null,
    exige_justificativa: false,
  },
  {
    nome: 'Estabilidade declarada',
    campo: 'estabilidade',
    operador: 'preenchido' as const,
    valor: null,
    mensagem: '⚠️ Atenção: este colaborador possui uma condição que requer validação do RH antes de eventual desligamento.',
    severidade: 'atencao' as const,
    aplica_acao: 'DESLIGAMENTO',
    exige_justificativa: true,
  },
  {
    nome: 'Estabilidade vigente',
    campo: 'data_fim_estabilidade',
    operador: 'data_futura' as const,
    valor: null,
    mensagem: 'Estabilidade vigente na data informada — o desligamento não pode ocorrer antes do término da vigência.',
    severidade: 'critico' as const,
    aplica_acao: 'DESLIGAMENTO',
    exige_justificativa: true,
  },
  {
    nome: 'Invalidez / afastamento',
    campo: 'tipo_invalidez',
    operador: 'preenchido' as const,
    valor: null,
    mensagem: 'Há registro de invalidez/afastamento. Validação do RH é obrigatória antes de qualquer ação.',
    severidade: 'atencao' as const,
    aplica_acao: null,
    exige_justificativa: false,
  },
  {
    nome: 'Aposentadoria prevista',
    campo: 'dt_aposentadoria',
    operador: 'preenchido' as const,
    valor: null,
    mensagem: 'Existe data de aposentadoria informada. Considere no planejamento da decisão.',
    severidade: 'info' as const,
    aplica_acao: null,
    exige_justificativa: false,
  },
];

export const PROCESSO_PADRAO = {
  nome: 'Reestruturação',
  data_base: '2026-07-31',
  prazo: '2026-09-11',
  aviso_confidencialidade:
    'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.',
};
