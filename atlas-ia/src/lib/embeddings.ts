import type { Env } from "../env";

const DEFAULT_MODEL = "@cf/baai/bge-m3";

/** Dimensao do vetor do bge-m3. Precisa bater com `vector(N)` no schema.sql. */
export const EMBEDDING_DIM = 1024;

interface WorkersAiEmbeddingResponse {
  shape?: number[];
  data?: number[][];
}

/**
 * Gera embeddings via Workers AI.
 *
 * O bge-m3 e multilingue e lida bem com portugues — importante, porque a maioria
 * dos modelos de embedding open-source e treinada so em ingles.
 */
export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (inputs.length === 0) return [];

  const model = env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
  const vectors: number[][] = [];

  // A Workers AI limita o tamanho do lote; 50 e um valor conservador e seguro.
  const BATCH = 50;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    const raw = (await env.AI.run(model as keyof AiModels, {
      text: batch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as WorkersAiEmbeddingResponse;

    const data = raw?.data;
    if (!Array.isArray(data) || data.length !== batch.length) {
      throw new Error(
        `Resposta inesperada do modelo de embedding "${model}". ` +
          `Esperava ${batch.length} vetores.`,
      );
    }

    for (const vector of data) {
      if (vector.length !== EMBEDDING_DIM) {
        throw new Error(
          `O modelo "${model}" devolveu vetores de ${vector.length} dimensoes, ` +
            `mas o banco espera ${EMBEDDING_DIM}. Ajuste EMBEDDING_DIM e o schema.sql.`,
        );
      }
      vectors.push(vector);
    }
  }

  return vectors;
}

/** Atalho para uma unica string. */
export async function embedOne(env: Env, text: string): Promise<number[]> {
  const [vector] = await embed(env, [text]);
  if (!vector) throw new Error("Nao foi possivel gerar o embedding do texto.");
  return vector;
}
