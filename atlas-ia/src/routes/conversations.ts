import type { Context } from "hono";
import type { Env, Variables } from "../env";
import { HttpError, notFound, requireUuid } from "../lib/http";
import { serviceClient } from "../lib/supabase";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

/** GET /api/conversations — lista as conversas do usuario atual. */
export async function listConversationsRoute(c: Ctx): Promise<Response> {
  const user = c.get("user");
  const db = serviceClient(c.env);

  let query = db
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  query = user ? query.eq("owner_id", user.id) : query.is("owner_id", null);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);

  return c.json({
    conversations: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

/** GET /api/conversations/:id — historico completo de uma conversa. */
export async function getConversationRoute(c: Ctx): Promise<Response> {
  const user = c.get("user");
  const id = requireUuid(c.req.param("id"), "id");
  const db = serviceClient(c.env);

  const { data: conversation, error } = await db
    .from("conversations")
    .select("id, title, owner_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a conversa: ${error.message}`);
  if (!conversation) throw notFound("Conversa nao encontrada.");
  if ((conversation.owner_id ?? null) !== (user?.id ?? null)) {
    throw new HttpError(403, "Esta conversa pertence a outro usuario.");
  }

  const { data: messages, error: messagesError } = await db
    .from("messages")
    .select("id, role, content, sources, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw new Error(`Falha ao carregar as mensagens: ${messagesError.message}`);
  }

  return c.json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      createdAt: m.created_at,
    })),
  });
}

/** DELETE /api/conversations/:id */
export async function deleteConversationRoute(c: Ctx): Promise<Response> {
  const user = c.get("user");
  const id = requireUuid(c.req.param("id"), "id");
  const db = serviceClient(c.env);

  const { data, error } = await db
    .from("conversations")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a conversa: ${error.message}`);
  if (!data) throw notFound("Conversa nao encontrada.");
  if ((data.owner_id ?? null) !== (user?.id ?? null)) {
    throw new HttpError(403, "Esta conversa pertence a outro usuario.");
  }

  const { error: deleteError } = await db.from("conversations").delete().eq("id", id);
  if (deleteError) {
    throw new Error(`Falha ao remover a conversa: ${deleteError.message}`);
  }

  return c.json({ deleted: id });
}
