import { ErroHttp } from '../http/erros.js';
import type { Acao, Alerta, Campo, Regra } from './tipos.js';
import { normalizar, paraNumero } from './valores.js';

type Dados = Record<string, unknown>;

function atende(regra: Regra, valor: unknown): boolean {
  const vazio = valor === null || valor === undefined || String(valor).trim() === '';
  switch (regra.operador) {
    case 'preenchido': return !vazio;
    case 'vazio': return vazio;
    case 'igual': return normalizar(valor) === normalizar(regra.valor);
    case 'diferente': return !vazio && normalizar(valor) !== normalizar(regra.valor);
    case 'contem': return !vazio && normalizar(valor).includes(normalizar(regra.valor));
    case 'data_futura': return !vazio && String(valor).slice(0, 10) >= new Date().toISOString().slice(0, 10);
    case 'data_passada': return !vazio && String(valor).slice(0, 10) < new Date().toISOString().slice(0, 10);
    case 'maior_que': return !vazio && (paraNumero(valor) ?? 0) > (paraNumero(regra.valor) ?? 0);
    case 'menor_que': return !vazio && (paraNumero(valor) ?? 0) < (paraNumero(regra.valor) ?? 0);
    default: return false;
  }
}

/**
 * Avalia as regras cadastradas pelo RH e devolve os alertas do colaborador.
 * O portal apenas sinaliza — nenhuma decisão trabalhista é tomada automaticamente.
 */
export function avaliarAlertas(dados: Dados, regras: Regra[]): Alerta[] {
  return regras
    .filter((regra) => regra.ativo && atende(regra, dados[regra.campo]))
    .sort((a, b) => a.ordem - b.ordem)
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
  nova_divisao_id: number | null;
}

/**
 * Validação da avaliação conforme a configuração do processo:
 * ação existente, justificativa obrigatória (por ação, por regra ou por campo)
 * e destino informado nas transferências.
 */
export function validarAvaliacao(
  entrada: EntradaAvaliacao,
  contexto: { acoes: Acao[]; campos: Campo[]; alertas: Alerta[] },
): void {
  const { acao, justificativa, destino, nova_diretoria_id: novaDiretoria } = entrada;
  if (acao === null) return;

  const configurada = contexto.acoes.find((item) => item.valor === acao && item.ativo);
  if (!configurada) {
    const disponiveis = contexto.acoes.filter((item) => item.ativo).map((item) => item.valor).join(', ');
    throw new ErroHttp(422, `Ação inválida. Opções disponíveis: ${disponiveis}.`);
  }

  const semJustificativa = !justificativa || justificativa.trim() === '';
  const campoJustificativa = contexto.campos.find((campo) => campo.chave === 'justificativa');
  const alertaExige = contexto.alertas.some(
    (alerta) => alerta.exige_justificativa && (alerta.aplica_acao === null || alerta.aplica_acao === acao),
  );

  if (semJustificativa && (configurada.exige_justificativa || campoJustificativa?.obrigatorio || alertaExige)) {
    throw new ErroHttp(
      422,
      alertaExige
        ? 'Este colaborador possui alerta que exige justificativa para esta ação.'
        : `A ação "${acao}" exige o preenchimento da justificativa.`,
    );
  }

  if (configurada.exige_destino && !novaDiretoria && !(destino && destino.trim())) {
    throw new ErroHttp(422, `A ação "${acao}" exige a indicação do destino (nova Diretoria/Divisão ou setor).`);
  }
}
