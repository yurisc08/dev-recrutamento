import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, Env } from "../env";
import { num } from "../env";
import { embedOne } from "./embeddings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  sourceUrl: string | null;
  content: string;
  chunkIndex: number;
  similarity: number;
}

interface MatchRow {
  chunk_id: string;
  document_id: string;
  title: string;
  source_url: string | null;
  content: string;
  chunk_index: number;
  similarity: number;
}

/**
 * Busca semantica: transforma a pergunta em vetor e pede ao Postgres
 * os trechos mais proximos (funcao match_document_chunks do schema.sql).
 */
export async function retrieve(
  env: Env,
  db: SupabaseClient,
  query: string,
  user: AuthUser | null,
  options: { topK?: number; minSimilarity?: number } = {},
): Promise<RetrievedChunk[]> {
  const embedding = await embedOne(env, query);

  const { data, error } = await db.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: options.topK ?? num(env.RAG_TOP_K, 6),
    similarity_threshold:
      options.minSimilarity ?? num(env.RAG_MIN_SIMILARITY, 0.25),
    filter_owner_id: user?.id ?? null,
  });

  if (error) {
    throw new Error(`Falha na busca semantica: ${error.message}`);
  }

  return ((data ?? []) as MatchRow[]).map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    title: row.title,
    sourceUrl: row.source_url,
    content: row.content,
    chunkIndex: row.chunk_index,
    similarity: row.similarity,
  }));
}

/**
 * Monta a pergunta usada na busca vetorial.
 *
 * Perguntas curtas de acompanhamento ("e o prazo?") nao recuperam nada sozinhas.
 * Concatenar as ultimas falas do usuario da contexto ao vetor sem custar
 * uma chamada extra ao modelo.
 */
export function buildSearchQuery(
  currentMessage: string,
  previousUserMessages: string[],
): string {
  if (currentMessage.length > 80 || previousUserMessages.length === 0) {
    return currentMessage;
  }
  const context = previousUserMessages.slice(-2).join(" ");
  return `${context} ${currentMessage}`.trim().slice(0, 2000);
}

/** Formata os trechos recuperados para entrar no prompt do Claude. */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "Nenhum trecho relevante foi encontrado na base de conhecimento.";
  }

  return chunks
    .map((chunk, i) => {
      const origem = chunk.sourceUrl ? `\nOrigem: ${chunk.sourceUrl}` : "";
      return [
        `<trecho id="${i + 1}" documento="${escapeAttr(chunk.title)}">`,
        chunk.content.trim() + origem,
        `</trecho>`,
      ].join("\n");
    })
    .join("\n\n");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'").slice(0, 200);
}
