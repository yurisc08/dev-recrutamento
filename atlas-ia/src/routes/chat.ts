import type Anthropic from "@anthropic-ai/sdk";
import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, Env, Variables } from "../env";
import { num } from "../env";
import { anthropicClient, baseSystemPrompt, buildStreamParams } from "../lib/anthropic";
import { HttpError, notFound, optionalUuid, readJson, requireString } from "../lib/http";
import { buildSearchQuery, formatContext, retrieve, type RetrievedChunk } from "../lib/rag";
import { serviceClient } from "../lib/supabase";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

interface ChatBody {
  message?: unknown;
  conversationId?: unknown;
}

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}

/**
 * POST /api/chat — responde em streaming (Server-Sent Events).
 *
 * Eventos emitidos:
 *   meta     { conversationId }
 *   sources  RetrievedChunk[]  (trechos usados, enviados antes da resposta)
 *   thinking { text }          (resumo do raciocinio, quando houver)
 *   delta    { text }          (pedacos da resposta)
 *   done     { usage, stopReason, model }
 *   error    { message }
 */
export async function chatRoute(c: Ctx): Promise<Response> {
  const body = await readJson<ChatBody>(c);
  const message = requireString(body.message, "message", { maxLength: 4000 });
  const requestedConversation = optionalUuid(body.conversationId, "conversationId");

  const user = c.get("user");
  const db = serviceClient(c.env);

  const conversationId = requestedConversation
    ? await assertConversation(db, requestedConversation, user)
    : await createConversation(db, user, message);

  // Historico anterior (nao inclui a mensagem atual, que ainda nao foi gravada).
  const history = await loadHistory(db, conversationId, num(c.env.HISTORY_TURNS, 10));

  // Busca semantica na base de conhecimento.
  const searchQuery = buildSearchQuery(
    message,
    history.filter((m) => m.role === "user").map((m) => m.content),
  );
  const chunks = await retrieve(c.env, db, searchQuery, user);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const client = anthropicClient(c.env);
  const params = buildStreamParams(c.env, {
    stableSystem: baseSystemPrompt(c.env),
    context: formatContext(chunks),
    messages,
  });

  // Grava a pergunta antes de comecar a responder, para nao perde-la se o
  // streaming cair no meio.
  await db.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let answer = "";

      // Metricas de latencia que alimentam o dashboard.
      const inicio = Date.now();
      let primeiroToken: number | null = null;

      try {
        send("meta", { conversationId });
        send("sources", chunks.map(toPublicSource));

        const stream = client.beta.messages.stream(params);

        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") {
            primeiroToken ??= Date.now() - inicio;
            answer += event.delta.text;
            send("delta", { text: event.delta.text });
          } else if (event.delta.type === "thinking_delta") {
            send("thinking", { text: event.delta.thinking });
          }
        }

        const final = await stream.finalMessage();

        // Uma recusa dos classificadores chega como HTTP 200 com stop_reason
        // "refusal" — precisa ser tratada antes de ler o conteudo.
        if (final.stop_reason === "refusal") {
          send("error", {
            message:
              "Nao foi possivel responder a esta mensagem por politica de uso do modelo.",
          });
          controller.close();
          return;
        }

        await db.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: answer,
          sources: chunks.map(toPublicSource),
          usage: {
            input_tokens: final.usage.input_tokens,
            output_tokens: final.usage.output_tokens,
            cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
          },
          model: final.model,
          latency_ms: Date.now() - inicio,
          first_token_ms: primeiroToken,
          // Melhor similaridade recuperada: NULL quando a base nao tinha nada
          // relevante. E esse NULL que vira "lacuna de conhecimento" no painel.
          top_similarity: chunks[0]?.similarity ?? null,
        });

        send("done", {
          stopReason: final.stop_reason,
          model: final.model,
          usage: final.usage,
        });
      } catch (error) {
        console.error("Erro no streaming do chat:", error);
        send("error", { message: describeError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Evita que proxies intermediarios segurem o buffer do streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

function toPublicSource(chunk: RetrievedChunk) {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    title: chunk.title,
    sourceUrl: chunk.sourceUrl,
    similarity: Number(chunk.similarity.toFixed(4)),
    excerpt: chunk.content.slice(0, 240),
  };
}

async function assertConversation(
  db: SupabaseClient,
  conversationId: string,
  user: AuthUser | null,
): Promise<string> {
  const { data, error } = await db
    .from("conversations")
    .select("id, owner_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a conversa: ${error.message}`);
  if (!data) throw notFound("Conversa nao encontrada.");
  if ((data.owner_id ?? null) !== (user?.id ?? null)) {
    throw new HttpError(403, "Esta conversa pertence a outro usuario.");
  }
  return data.id as string;
}

async function createConversation(
  db: SupabaseClient,
  user: AuthUser | null,
  firstMessage: string,
): Promise<string> {
  const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "..." : "");
  const { data, error } = await db
    .from("conversations")
    .insert({ owner_id: user?.id ?? null, title })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao criar a conversa: ${error.message}`);
  return data.id as string;
}

async function loadHistory(
  db: SupabaseClient,
  conversationId: string,
  turns: number,
): Promise<MessageRow[]> {
  const { data, error } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(turns * 2);

  if (error) throw new Error(`Falha ao carregar o historico: ${error.message}`);

  const rows = ((data ?? []) as MessageRow[]).reverse();

  // A API exige que a conversa comece com uma mensagem do usuario.
  while (rows.length > 0 && rows[0]?.role !== "user") rows.shift();
  return rows;
}

function describeError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
    return error.message;
  }
  return "Erro ao gerar a resposta. Tente novamente em instantes.";
}
