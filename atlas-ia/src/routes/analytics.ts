import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, Env, Variables } from "../env";
import { badRequest } from "../lib/http";
import { serviceClient } from "../lib/supabase";
import {
  custoSemCacheUSD,
  custoUSD,
  precoDe,
  type ContagemTokens,
} from "../lib/pricing";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

const PERIODOS_VALIDOS = [7, 14, 30, 90] as const;
const DIA_MS = 86_400_000;

interface LinhaDiaria {
  dia: string;
  perguntas: number;
  tokens_entrada_novos: number;
  tokens_cache_escrita: number;
  tokens_cache_leitura: number;
  tokens_saida: number;
  latencia_media_ms: number | null;
  respostas_embasadas: number;
}

interface LinhaResumo {
  perguntas: number;
  conversas: number;
  tokens_entrada_novos: number;
  tokens_cache_escrita: number;
  tokens_cache_leitura: number;
  tokens_saida: number;
  latencia_media_ms: number | null;
  latencia_p95_ms: number | null;
  respostas_embasadas: number;
  similaridade_media: number | null;
}

/**
 * GET /api/analytics?dias=30
 *
 * Devolve tudo o que o dashboard precisa em uma unica requisicao: totais do
 * periodo, os mesmos totais do periodo anterior (para calcular as variacoes),
 * a serie diaria, os documentos mais citados e as lacunas da base.
 */
export async function analyticsRoute(c: Ctx): Promise<Response> {
  const dias = Number(c.req.query("dias") ?? 30);
  if (!PERIODOS_VALIDOS.includes(dias as (typeof PERIODOS_VALIDOS)[number])) {
    throw badRequest(`O parametro "dias" deve ser um de: ${PERIODOS_VALIDOS.join(", ")}.`);
  }

  const user = c.get("user");
  const db = serviceClient(c.env);
  const preco = precoDe(c.env.CLAUDE_MODEL ?? "claude-opus-5");

  // A janela comeca a meia-noite de (hoje - dias + 1) para que "30 dias"
  // produza exatamente 30 pontos no grafico, contando o dia de hoje.
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA_MS);
  inicio.setUTCHours(0, 0, 0, 0);
  const inicioAnterior = new Date(inicio.getTime() - dias * DIA_MS);

  const [resumo, resumoAnterior, diario, documentos, lacunas] = await Promise.all([
    buscarResumo(db, inicio, fim, user),
    buscarResumo(db, inicioAnterior, inicio, user),
    buscarDiario(db, inicio, fim, user),
    buscarDocumentos(db, inicio, fim, user),
    buscarLacunas(db, inicio, fim, user),
  ]);

  const tokens = contarTokens(resumo);
  const tokensAnterior = contarTokens(resumoAnterior);

  const custo = custoUSD(tokens, preco);
  const custoAnterior = custoUSD(tokensAnterior, preco);
  const custoSemCache = custoSemCacheUSD(tokens, preco);

  const entradaTotal =
    tokens.entradaNova + tokens.cacheEscrita + tokens.cacheLeitura;
  const entradaTotalAnterior =
    tokensAnterior.entradaNova + tokensAnterior.cacheEscrita + tokensAnterior.cacheLeitura;

  return c.json({
    periodo: {
      dias,
      de: inicio.toISOString(),
      ate: fim.toISOString(),
      modelo: c.env.CLAUDE_MODEL ?? "claude-opus-5",
    },

    // Cada indicador traz o valor atual e o do periodo anterior; a variacao
    // percentual e calculada no front-end, junto com a formatacao.
    indicadores: {
      perguntas: { atual: resumo.perguntas, anterior: resumoAnterior.perguntas },
      conversas: { atual: resumo.conversas, anterior: resumoAnterior.conversas },
      custoUSD: { atual: custo, anterior: custoAnterior },
      economiaCacheUSD: { atual: Math.max(custoSemCache - custo, 0), anterior: null },
      latenciaMediaMs: {
        atual: resumo.latencia_media_ms,
        anterior: resumoAnterior.latencia_media_ms,
      },
      latenciaP95Ms: { atual: resumo.latencia_p95_ms, anterior: null },
      // Fracao das perguntas que encontraram algum trecho relevante na base.
      cobertura: {
        atual: taxa(resumo.respostas_embasadas, resumo.perguntas),
        anterior: taxa(resumoAnterior.respostas_embasadas, resumoAnterior.perguntas),
      },
      // Fracao dos tokens de entrada que veio do cache em vez de ser cobrada cheia.
      aproveitamentoCache: {
        atual: taxa(tokens.cacheLeitura, entradaTotal),
        anterior: taxa(tokensAnterior.cacheLeitura, entradaTotalAnterior),
      },
      similaridadeMedia: {
        atual: resumo.similaridade_media,
        anterior: resumoAnterior.similaridade_media,
      },
    },

    serie: diario.map((linha) => ({
      dia: linha.dia,
      perguntas: Number(linha.perguntas),
      latenciaMediaMs: linha.latencia_media_ms,
      tokens: {
        entradaNova: Number(linha.tokens_entrada_novos),
        cacheEscrita: Number(linha.tokens_cache_escrita),
        cacheLeitura: Number(linha.tokens_cache_leitura),
        saida: Number(linha.tokens_saida),
      },
      custoUSD: custoUSD(
        {
          entradaNova: Number(linha.tokens_entrada_novos),
          cacheEscrita: Number(linha.tokens_cache_escrita),
          cacheLeitura: Number(linha.tokens_cache_leitura),
          saida: Number(linha.tokens_saida),
        },
        preco,
      ),
    })),

    documentos,
    lacunas,
  });
}

/* ---------------------------------------------------------------- consultas */

async function buscarResumo(
  db: SupabaseClient,
  de: Date,
  ate: Date,
  user: AuthUser | null,
): Promise<LinhaResumo> {
  const { data, error } = await db.rpc("analytics_summary", {
    from_ts: de.toISOString(),
    to_ts: ate.toISOString(),
    filter_owner_id: user?.id ?? null,
  });

  if (error) throw new Error(`Falha ao resumir o periodo: ${error.message}`);

  const linha = (data as LinhaResumo[] | null)?.[0];
  return linha ?? RESUMO_VAZIO;
}

async function buscarDiario(
  db: SupabaseClient,
  de: Date,
  ate: Date,
  user: AuthUser | null,
): Promise<LinhaDiaria[]> {
  const { data, error } = await db.rpc("analytics_daily", {
    from_ts: de.toISOString(),
    to_ts: ate.toISOString(),
    filter_owner_id: user?.id ?? null,
  });

  if (error) throw new Error(`Falha ao carregar a serie diaria: ${error.message}`);
  return (data ?? []) as LinhaDiaria[];
}

async function buscarDocumentos(
  db: SupabaseClient,
  de: Date,
  ate: Date,
  user: AuthUser | null,
) {
  const { data, error } = await db.rpc("analytics_top_documents", {
    from_ts: de.toISOString(),
    to_ts: ate.toISOString(),
    filter_owner_id: user?.id ?? null,
    max_rows: 8,
  });

  if (error) throw new Error(`Falha ao listar os documentos: ${error.message}`);

  return ((data ?? []) as Array<{
    document_id: string;
    titulo: string;
    citacoes: number;
    similaridade_media: number | null;
  }>).map((linha) => ({
    documentId: linha.document_id,
    titulo: linha.titulo,
    citacoes: Number(linha.citacoes),
    similaridadeMedia: linha.similaridade_media,
  }));
}

async function buscarLacunas(
  db: SupabaseClient,
  de: Date,
  ate: Date,
  user: AuthUser | null,
) {
  const { data, error } = await db.rpc("analytics_knowledge_gaps", {
    from_ts: de.toISOString(),
    to_ts: ate.toISOString(),
    filter_owner_id: user?.id ?? null,
    max_rows: 10,
    limiar: 0.45,
  });

  if (error) throw new Error(`Falha ao listar as lacunas: ${error.message}`);

  return ((data ?? []) as Array<{
    pergunta: string;
    ocorrencias: number;
    melhor_similaridade: number | null;
    ultima_vez: string;
  }>).map((linha) => ({
    pergunta: linha.pergunta,
    ocorrencias: Number(linha.ocorrencias),
    melhorSimilaridade: linha.melhor_similaridade,
    ultimaVez: linha.ultima_vez,
  }));
}

/* ------------------------------------------------------------------ apoio */

const RESUMO_VAZIO: LinhaResumo = {
  perguntas: 0,
  conversas: 0,
  tokens_entrada_novos: 0,
  tokens_cache_escrita: 0,
  tokens_cache_leitura: 0,
  tokens_saida: 0,
  latencia_media_ms: null,
  latencia_p95_ms: null,
  respostas_embasadas: 0,
  similaridade_media: null,
};

function contarTokens(resumo: LinhaResumo): ContagemTokens {
  return {
    entradaNova: Number(resumo.tokens_entrada_novos),
    cacheEscrita: Number(resumo.tokens_cache_escrita),
    cacheLeitura: Number(resumo.tokens_cache_leitura),
    saida: Number(resumo.tokens_saida),
  };
}

function taxa(parte: number, total: number): number | null {
  const t = Number(total);
  return t > 0 ? Number(parte) / t : null;
}
