import type { Context } from "hono";
import type { Env, Variables } from "../env";
import { num } from "../env";
import { readJson, requireString } from "../lib/http";
import { retrieve } from "../lib/rag";
import { serviceClient } from "../lib/supabase";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * POST /api/search — busca semantica pura, sem passar pelo modelo de linguagem.
 * Util para autocomplete, "conteudos relacionados" ou para depurar o RAG.
 */
export async function searchRoute(c: Ctx): Promise<Response> {
  const body = await readJson<{ query?: unknown; topK?: unknown }>(c);
  const query = requireString(body.query, "query", { maxLength: 2000 });
  const topK = Math.min(
    Math.max(num(String(body.topK ?? ""), num(c.env.RAG_TOP_K, 6)), 1),
    20,
  );

  const results = await retrieve(c.env, serviceClient(c.env), query, c.get("user"), {
    topK,
  });

  return c.json({
    query,
    results: results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      title: r.title,
      sourceUrl: r.sourceUrl,
      content: r.content,
      similarity: Number(r.similarity.toFixed(4)),
    })),
  });
}
