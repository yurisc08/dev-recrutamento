import { api } from './api';
import { dataBR, dataHoraBR } from './formato';
import { baixarArquivo, montarXlsx, type AbaEscrita, type Celula } from './planilha';

/**
 * A API devolve apenas o que o usuário logado pode ver (o recorte é feito no
 * SQL, não na tela) e o navegador monta o .xlsx. Assim o Worker não precisa de
 * biblioteca de Excel e o arquivo nunca trafega pronto por nenhum outro lugar.
 */
interface DadosExportacao {
  processo: { nome: string; data_base: string; prazo: string | null };
  campos: Array<{ chave: string; rotulo: string; tipo: string }>;
  acoes: string[];
  itens: Array<{
    chapa: string;
    nome: string | null;
    situacao: string | null;
    diretoria: string | null;
    divisao: string | null;
    dados: Record<string, unknown>;
    acao: string | null;
    justificativa: string | null;
    destino_livre: string | null;
    status: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
    homologado_por: string | null;
    homologado_em: string | null;
    alertas: string[];
  }>;
  auditoria: Array<{
    criado_em: string; usuario_nome: string | null; perfil: string | null; tipo: string;
    chapa: string | null; campo: string | null; valor_anterior: string | null; valor_novo: string | null;
  }>;
}

const celula = (valor: unknown, tipo: string): Celula => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (tipo === 'data') return dataBR(String(valor));
  if (tipo === 'numero' || tipo === 'moeda') {
    const numero = Number(valor);
    return Number.isNaN(numero) ? String(valor) : numero;
  }
  if (tipo === 'booleano') return valor ? 'Sim' : 'Não';
  return String(valor);
};

const STATUS: Record<string, string> = {
  pendente: 'Sem decisão', preenchida: 'Decisão registrada', homologada: 'Homologada',
};

/** Baixa a planilha com o que o usuário enxerga, respeitando os filtros da tela. */
export async function exportarPlanilha(parametros = ''): Promise<void> {
  const caminho = parametros ? `/api/exportacao/dados?${parametros}` : '/api/exportacao/dados';
  const dados = await api.get<DadosExportacao>(caminho);

  const colunasBase = dados.campos.filter((campo) => !['chapa', 'nome', 'diretoria', 'divisao'].includes(campo.chave));

  const cabecalho: Celula[] = [
    'Matrícula', 'Nome', 'Diretoria', 'Divisão', 'Situação',
    ...colunasBase.map((campo) => campo.rotulo),
    'Ação Indicada', 'Nova área (transferência)', 'Justificativa', 'Status',
    'Preenchido por', 'Preenchido em', 'Homologado por', 'Homologado em', 'Alertas',
  ];

  const linhas: Celula[][] = [cabecalho];
  for (const item of dados.itens) {
    linhas.push([
      item.chapa, item.nome, item.diretoria, item.divisao, item.situacao,
      ...colunasBase.map((campo) => celula(item.dados[campo.chave], campo.tipo)),
      item.acao, item.destino_livre, item.justificativa, STATUS[item.status ?? 'pendente'] ?? item.status,
      item.atualizado_por, dataHoraBR(item.atualizado_em), item.homologado_por, dataHoraBR(item.homologado_em),
      item.alertas.join(' | '),
    ]);
  }

  const total = dados.itens.length;
  const comDecisao = dados.itens.filter((item) => item.acao).length;
  const porAcao = new Map<string, number>();
  for (const item of dados.itens) {
    if (item.acao) porAcao.set(item.acao, (porAcao.get(item.acao) ?? 0) + 1);
  }

  const resumo: Celula[][] = [
    ['Indicador', 'Valor'],
    ['Processo', dados.processo.nome],
    ['Data-base', dataBR(dados.processo.data_base)],
    ['Prazo', dataBR(dados.processo.prazo)],
    ['Gerado em', dataHoraBR(new Date().toISOString())],
    ['Colaboradores no recorte', total],
    ['Com decisão registrada', comDecisao],
    ['Sem decisão', total - comDecisao],
    ['Homologadas', dados.itens.filter((item) => item.status === 'homologada').length],
    [null, null],
    ['Ação Indicada', 'Quantidade'],
    ...[...porAcao.entries()].map(([acao, quantidade]) => [acao, quantidade] as Celula[]),
  ];

  const abas: AbaEscrita[] = [
    { nome: 'Resumo', linhas: resumo },
    {
      nome: 'Base Decisões',
      linhas,
      colunaLista: 5 + colunasBase.length + 1,
      opcoesLista: dados.acoes,
    },
  ];

  if (dados.auditoria?.length) {
    abas.push({
      nome: 'Auditoria',
      linhas: [
        ['Data', 'Usuário', 'Perfil', 'Evento', 'Matrícula', 'Campo', 'De', 'Para'],
        ...dados.auditoria.map((registro) => [
          dataHoraBR(registro.criado_em), registro.usuario_nome, registro.perfil, registro.tipo,
          registro.chapa, registro.campo, registro.valor_anterior, registro.valor_novo,
        ] as Celula[]),
      ],
    });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  baixarArquivo(montarXlsx(abas), `decisoes-${hoje}.xlsx`);
}
