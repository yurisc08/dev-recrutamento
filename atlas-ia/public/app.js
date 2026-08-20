/**
 * Atlas IA — front-end.
 *
 * Sem framework de proposito: o objetivo e deixar claro como falar com a API,
 * principalmente como consumir a resposta em streaming (SSE via fetch).
 */

const api = {
  async json(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Erro ${response.status}`);
    return body;
  },
};

const el = {
  messages: document.getElementById("messages"),
  emptyState: document.getElementById("empty-state"),
  composer: document.getElementById("composer"),
  input: document.getElementById("input"),
  send: document.getElementById("send"),
  newChat: document.getElementById("new-chat"),
  conversationList: document.getElementById("conversation-list"),
  documentList: document.getElementById("document-list"),
  addDoc: document.getElementById("add-doc"),
  docDialog: document.getElementById("doc-dialog"),
  docForm: document.getElementById("doc-form"),
  docTitle: document.getElementById("doc-title"),
  docUrl: document.getElementById("doc-url"),
  docContent: document.getElementById("doc-content"),
  docSave: document.getElementById("doc-save"),
  assistantName: document.getElementById("assistant-name"),
  modelName: document.getElementById("model-name"),
};

let conversationId = null;
let streaming = false;

/* ------------------------------------------------------------------ SSE */

/**
 * Le uma resposta text/event-stream e chama onEvent(nome, dados) por evento.
 * EventSource so faz GET, entao o parse e feito na mao aqui.
 */
async function readEventStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        /* linha incompleta ou nao-JSON: ignora */
      }
    }
  }
}

/* -------------------------------------------------------------- Render */

function addMessage(role, text = "") {
  el.emptyState?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${role}`;

  const label = document.createElement("div");
  label.className = "role";
  label.textContent = role === "user" ? "Você" : el.assistantName.textContent;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.append(label, bubble);
  el.messages.append(wrapper);
  scrollToBottom();

  return { wrapper, bubble };
}

function renderSources(wrapper, sources) {
  if (!sources?.length) return;
  const box = document.createElement("div");
  box.className = "sources";
  sources.forEach((source, i) => {
    const node = source.sourceUrl
      ? document.createElement("a")
      : document.createElement("span");
    if (source.sourceUrl) {
      node.href = source.sourceUrl;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
    }
    node.textContent = `[${i + 1}] ${source.title}`;
    node.title = `${source.excerpt}…\n\nsimilaridade: ${source.similarity}`;
    box.append(node);
  });
  wrapper.append(box);
}

function scrollToBottom() {
  el.messages.scrollTop = el.messages.scrollHeight;
}

/* ---------------------------------------------------------------- Chat */

async function sendMessage(text) {
  if (streaming || !text.trim()) return;
  streaming = true;
  el.send.disabled = true;

  addMessage("user", text);
  const assistant = addMessage("assistant");
  assistant.bubble.classList.add("cursor");

  let thinkingBox = null;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, conversationId }),
    });

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Erro ${response.status}`);
    }

    await readEventStream(response, (event, data) => {
      switch (event) {
        case "meta":
          if (data.conversationId !== conversationId) {
            conversationId = data.conversationId;
            loadConversations();
          }
          break;

        case "sources":
          renderSources(assistant.wrapper, data);
          break;

        case "thinking":
          if (!thinkingBox) {
            thinkingBox = document.createElement("div");
            thinkingBox.className = "thinking";
            assistant.wrapper.insertBefore(thinkingBox, assistant.bubble);
          }
          thinkingBox.textContent += data.text;
          break;

        case "delta":
          thinkingBox?.remove();
          thinkingBox = null;
          assistant.bubble.textContent += data.text;
          scrollToBottom();
          break;

        case "error":
          showError(assistant.wrapper, data.message);
          break;
      }
    });
  } catch (error) {
    showError(assistant.wrapper, error.message);
  } finally {
    assistant.bubble.classList.remove("cursor");
    thinkingBox?.remove();
    streaming = false;
    el.send.disabled = false;
    el.input.focus();
  }
}

function showError(wrapper, message) {
  const box = document.createElement("div");
  box.className = "error";
  box.textContent = message;
  wrapper.append(box);
}

/* ------------------------------------------------------- Barra lateral */

async function loadConversations() {
  try {
    const { conversations } = await api.json("/api/conversations");
    el.conversationList.replaceChildren();

    if (!conversations.length) {
      el.conversationList.append(listPlaceholder("Nenhuma conversa ainda"));
      return;
    }

    for (const conversation of conversations) {
      const item = document.createElement("li");
      if (conversation.id === conversationId) item.classList.add("active");

      const label = document.createElement("span");
      label.textContent = conversation.title;
      label.onclick = () => openConversation(conversation.id);

      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.title = "Excluir conversa";
      remove.onclick = async (event) => {
        event.stopPropagation();
        await api.json(`/api/conversations/${conversation.id}`, { method: "DELETE" });
        if (conversation.id === conversationId) startNewChat();
        loadConversations();
      };

      item.append(label, remove);
      el.conversationList.append(item);
    }
  } catch {
    el.conversationList.replaceChildren(listPlaceholder("Não foi possível carregar"));
  }
}

async function openConversation(id) {
  const conversation = await api.json(`/api/conversations/${id}`);
  conversationId = id;
  el.messages.replaceChildren();

  for (const message of conversation.messages) {
    const { wrapper } = addMessage(message.role, message.content);
    if (message.role === "assistant") renderSources(wrapper, message.sources);
  }

  loadConversations();
}

function startNewChat() {
  conversationId = null;
  el.messages.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML =
    "<h1>Em que posso ajudar?</h1><p>Faça uma pergunta sobre o conteúdo da base de conhecimento.</p>";
  el.messages.append(empty);
  el.emptyState = empty;
  loadConversations();
  el.input.focus();
}

async function loadDocuments() {
  try {
    const { documents } = await api.json("/api/documents");
    el.documentList.replaceChildren();

    if (!documents.length) {
      el.documentList.append(listPlaceholder("Base vazia — adicione conteúdo"));
      return;
    }

    for (const document_ of documents) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = document_.title;
      label.title = document_.sourceUrl ?? document_.title;

      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.title = "Remover da base";
      remove.onclick = async () => {
        await api.json(`/api/documents/${document_.id}`, { method: "DELETE" });
        loadDocuments();
      };

      item.append(label, remove);
      el.documentList.append(item);
    }
  } catch {
    el.documentList.replaceChildren(listPlaceholder("Não foi possível carregar"));
  }
}

function listPlaceholder(text) {
  const item = document.createElement("li");
  item.className = "muted";
  item.textContent = text;
  return item;
}

/* ------------------------------------------------------------- Eventos */

el.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = el.input.value;
  el.input.value = "";
  el.input.style.height = "auto";
  sendMessage(text);
});

el.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.composer.requestSubmit();
  }
});

el.input.addEventListener("input", () => {
  el.input.style.height = "auto";
  el.input.style.height = `${Math.min(el.input.scrollHeight, 180)}px`;
});

el.newChat.addEventListener("click", startNewChat);
el.addDoc.addEventListener("click", () => el.docDialog.showModal());

el.docForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();

  const payload = {
    title: el.docTitle.value,
    content: el.docContent.value,
    sourceUrl: el.docUrl.value || undefined,
  };
  if (!payload.title.trim() || !payload.content.trim()) return;

  el.docSave.disabled = true;
  el.docSave.textContent = "Indexando…";
  try {
    await api.json("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    el.docForm.reset();
    el.docDialog.close();
    loadDocuments();
  } catch (error) {
    alert(`Não foi possível indexar: ${error.message}`);
  } finally {
    el.docSave.disabled = false;
    el.docSave.textContent = "Salvar";
  }
});

/* -------------------------------------------------------------- Início */

(async function init() {
  try {
    const health = await api.json("/api/health");
    el.assistantName.textContent = health.assistantName;
    el.modelName.textContent = health.model;

    if (health.missing?.length) {
      el.modelName.textContent = "configuração incompleta";
      const aviso = document.createElement("div");
      aviso.className = "error";
      aviso.style.maxWidth = "620px";
      aviso.style.margin = "0 auto";
      aviso.textContent =
        "Faltam variáveis de ambiente: " +
        health.missing.map((m) => m.variable).join(", ") +
        ". Veja a seção Configuração do README.";
      el.messages.prepend(aviso);
    }
  } catch {
    el.modelName.textContent = "API indisponível";
  }
  loadConversations();
  loadDocuments();
  el.input.focus();
})();
