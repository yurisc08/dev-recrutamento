import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./env";
import { authMiddleware } from "./lib/auth";
import { configIssues } from "./lib/config";
import { HttpError } from "./lib/http";
import { chatRoute } from "./routes/chat";
import {
  createDocumentRoute,
  deleteDocumentRoute,
  listDocumentsRoute,
} from "./routes/documents";
import {
  deleteConversationRoute,
  getConversationRoute,
  listConversationsRoute,
} from "./routes/conversations";
import { searchRoute } from "./routes/search";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- CORS ---------------------------------------------------------------
app.use("/api/*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin: (origin) => {
      if (allowed.includes("*")) return origin || "*";
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next);
});

// --- Rate limiting ------------------------------------------------------
// Protege a chave da Anthropic: sem isso qualquer um pode gastar seus tokens.
app.use("/api/*", async (c, next) => {
  if (!c.env.RATE_LIMITER) return next();

  const ip = c.req.header("CF-Connecting-IP") ?? "desconhecido";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json(
      { error: "Muitas requisicoes. Aguarde alguns segundos e tente de novo." },
      429,
    );
  }
  return next();
});

// --- Configuracao -------------------------------------------------------
// Falha cedo e com uma mensagem util quando falta credencial.
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next();

  const issues = configIssues(c.env);
  if (issues.length > 0) {
    return c.json(
      {
        error: "Configuracao incompleta. Veja README.md -> Configuracao.",
        missing: issues,
      },
      503,
    );
  }
  return next();
});

// --- Autenticacao (opcional, conforme REQUIRE_AUTH) ---------------------
app.use("/api/*", authMiddleware);

// --- Rotas --------------------------------------------------------------
app.get("/api/health", (c) => {
  const issues = configIssues(c.env);
  return c.json({
    status: issues.length === 0 ? "ok" : "configuracao-incompleta",
    missing: issues,
    model: c.env.CLAUDE_MODEL ?? "claude-opus-5",
    embeddingModel: c.env.EMBEDDING_MODEL ?? "@cf/baai/bge-m3",
    requireAuth: c.env.REQUIRE_AUTH === "true",
    assistantName: c.env.ASSISTANT_NAME ?? "Atlas",
  });
});

app.post("/api/chat", chatRoute);
app.post("/api/search", searchRoute);

app.get("/api/documents", listDocumentsRoute);
app.post("/api/documents", createDocumentRoute);
app.delete("/api/documents/:id", deleteDocumentRoute);

app.get("/api/conversations", listConversationsRoute);
app.get("/api/conversations/:id", getConversationRoute);
app.delete("/api/conversations/:id", deleteConversationRoute);

// --- Erros --------------------------------------------------------------
app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status as 400);
  }
  console.error("Erro nao tratado:", error);
  const detail = error instanceof Error ? error.message : String(error);
  // Erros de configuracao ajudam mais visiveis do que escondidos.
  const isConfig =
    detail.includes("ANTHROPIC_API_KEY") ||
    detail.includes("SUPABASE") ||
    detail.includes("dimensoes");
  return c.json(
    { error: isConfig ? detail : "Erro interno. Consulte os logs do Worker." },
    500,
  );
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Rota nao encontrada." }, 404);
  }
  // Qualquer outra coisa e o front-end estatico.
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
