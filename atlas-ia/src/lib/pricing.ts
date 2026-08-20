/**
 * Tabela de precos por milhao de tokens (USD).
 *
 * Fica isolada aqui porque preco muda: quando mudar, altera-se este arquivo e
 * o dashboard inteiro passa a calcular certo, sem tocar em SQL nem em grafico.
 * Confira os valores atuais em https://www.anthropic.com/pricing
 */
export interface Pricing {
  /** Tokens de entrada que nao vieram do cache. */
  entrada: number;
  /** Tokens gravados no cache — custam ~1,25x a entrada normal. */
  cacheEscrita: number;
  /** Tokens lidos do cache — custam ~0,1x a entrada normal. */
  cacheLeitura: number;
  /** Tokens gerados pelo modelo. */
  saida: number;
}

const TABELA: Record<string, Pricing> = {
  "claude-opus-5": { entrada: 5, cacheEscrita: 6.25, cacheLeitura: 0.5, saida: 25 },
  "claude-opus-4-8": { entrada: 5, cacheEscrita: 6.25, cacheLeitura: 0.5, saida: 25 },
  "claude-sonnet-5": { entrada: 3, cacheEscrita: 3.75, cacheLeitura: 0.3, saida: 15 },
  "claude-sonnet-4-6": { entrada: 3, cacheEscrita: 3.75, cacheLeitura: 0.3, saida: 15 },
  "claude-haiku-4-5": { entrada: 1, cacheEscrita: 1.25, cacheLeitura: 0.1, saida: 5 },
};

const PADRAO = TABELA["claude-opus-5"] as Pricing;

export function precoDe(modelo: string | undefined): Pricing {
  if (!modelo) return PADRAO;
  return TABELA[modelo] ?? PADRAO;
}

export interface ContagemTokens {
  entradaNova: number;
  cacheEscrita: number;
  cacheLeitura: number;
  saida: number;
}

/** Custo em USD de um conjunto de tokens. */
export function custoUSD(tokens: ContagemTokens, preco: Pricing): number {
  const porMilhao =
    tokens.entradaNova * preco.entrada +
    tokens.cacheEscrita * preco.cacheEscrita +
    tokens.cacheLeitura * preco.cacheLeitura +
    tokens.saida * preco.saida;
  return porMilhao / 1_000_000;
}

/**
 * Quanto a mesma carga custaria sem cache de prompt.
 * E a metrica que justifica a complexidade do cache — vale mostrar no painel.
 */
export function custoSemCacheUSD(tokens: ContagemTokens, preco: Pricing): number {
  const entradaTotal = tokens.entradaNova + tokens.cacheEscrita + tokens.cacheLeitura;
  return (entradaTotal * preco.entrada + tokens.saida * preco.saida) / 1_000_000;
}
