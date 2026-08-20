import type { Context } from "hono";
import type { Env, Variables } from "../env";
import { chunkText } from "../lib/chunk";
import { embed } from "../lib/embeddings";
import { HttpError, notFound, readJson, requireString, requireUuid } from "../lib/http";
import { serviceClient } from "../lib/supabase";
import { requireUser } from "../lib/auth";
import { bool } from "../env";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

interface CreateDocumentBody {
  title?: unknown;
  content?: unknown;
  sourceUrl?: unknown;
  metadata?: unknown;
}

const MAX_CONTENT_CHARS = 200_000;

/**
 * POST /api/documents — adiciona um texto a base de conhecimento.
 *
 * Quebra o texto em pedacos, gera um embedding para cada um e grava tudo.
 */
export async function createDocumentRoute(c: Ctx): Promise<Response> {
  // Escrever na base sempre exige usuario quando a autenticacao esta ligada.
  const user = bool(c.env.REQUIRE_AUTH, false) ? requireUser(c) : c.get("user");

  const body = await readJson<CreateDocumentBody>(c);
  const title = requireString(body.title, "title", { maxLength: 200 });
  const content = requireString(body.content, "content", {
    maxLength: MAX_CONTENT_CHARS,
  });
  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim().slice(0, 2000)
      : null;
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    throw new HttpError(400, "O conteudo enviado esta vazio.");
  }

  const db = serviceClient(c.env);

  const { data: document, error: insertError } = await db
    .from("documents")
    .insert({
      owner_id: user?.id ?? null,
      title,
      source_url: sourceUrl,
      metadata,
    })
    .select("id, title, created_at")
    .single();

  if (insertError) {
    throw new Error(`Falha ao criar o documento: ${insertError.message}`);
  }

  try {
    const vectors = await embed(c.env, chunks.map((chunk) => chunk.content));

    const rows = chunks.map((chunk, i) => ({
      document_id: document.id,
      owner_id: user?.id ?? null,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: vectors[i],
    }));

    const { error: chunkError } = await db.from("document_chunks").insert(rows);
    if (chunkError) {
      throw new Error(`Falha ao gravar os trechos: ${chunkError.message}`);
    }
  } catch (error) {
    // Sem os embeddings o documento seria invisivel para a busca — melhor
    // remove-lo do que deixar um registro orfao na base.
    await db.from("documents").delete().eq("id", document.id);
    throw error;
  }

  return c.json(
    {
      id: document.id,
      title: document.title,
      chunks: chunks.length,
      createdAt: document.created_at,
    },
    201,
  );
}

/** GET /api/documents — lista os documentos publicos e os do usuario. */
export async function listDocumentsRoute(c: Ctx): Promise<Response> {
  const user = c.get("user");
  const db = serviceClient(c.env);

  const filter = user
    ? `owner_id.is.null,owner_id.eq.${user.id}`
    : "owner_id.is.null";

  const { data, error } = await db
    .from("documents")
    .select("id, title, source_url, metadata, owner_id, created_at")
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Falha ao listar documentos: ${error.message}`);

  return c.json({
    documents: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      sourceUrl: row.source_url,
      metadata: row.metadata,
      isPublic: row.owner_id === null,
      createdAt: row.created_at,
    })),
  });
}

/** DELETE /api/documents/:id — remove um documento e seus trechos (cascade). */
export async function deleteDocumentRoute(c: Ctx): Promise<Response> {
  const user = c.get("user");
  const id = requireUuid(c.req.param("id"), "id");
  const db = serviceClient(c.env);

  const { data, error } = await db
    .from("documents")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar o documento: ${error.message}`);
  if (!data) throw notFound("Documento nao encontrado.");
  if ((data.owner_id ?? null) !== (user?.id ?? null)) {
    throw new HttpError(403, "Este documento pertence a outro usuario.");
  }

  const { error: deleteError } = await db.from("documents").delete().eq("id", id);
  if (deleteError) {
    throw new Error(`Falha ao remover o documento: ${deleteError.message}`);
  }

  return c.json({ deleted: id });
}
