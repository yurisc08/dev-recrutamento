/* Magicine - camada de dados das noticias.
   =========================================================================
   O site inteiro fala com este arquivo, nunca direto com a fonte dos dados.
   Hoje as materias vêm de `news-data.js` (um array no proprio site). Quando
   voce ligar o Supabase, basta trocar SOURCE para "supabase" e preencher
   SUPABASE abaixo - nenhuma pagina precisa mudar.

   A tabela no Supabase deve ter estas colunas (SQL pronto no README):
     slug text primary key   title text          excerpt text
     cover text              category text       tags text[]
     author text             published_at date   featured bool
     body jsonb              status text ('published' | 'draft')
   ========================================================================= */
(function (global) {
  "use strict";

  /** "local" enquanto as materias moram no site; "supabase" depois. */
  const SOURCE = "local";

  const SUPABASE = {
    url: "",       // ex.: https://xxxxxxxxxxxx.supabase.co
    anonKey: "",   // a chave "anon public" do painel (pode ficar no cliente)
    table: "posts",
  };

  const PAGE_SIZE = 12;

  // ------------------------------------------------------------ utilidades

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  function sortByDate(list) {
    return list.slice().sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  }

  /**
   * Resolve o caminho de uma imagem. As matérias guardam caminhos relativos
   * à raiz do site ("img/capa.svg"), mas /noticias/ está um nível abaixo —
   * sem isso, a mesma matéria carregaria a capa na home e daria 404 na
   * listagem. Cada página declara a própria base em MAGICINE_BASE.
   */
  function media(src) {
    if (!src) return "";
    if (/^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("data:")) {
      return src;
    }
    return (global.MAGICINE_BASE || "") + src;
  }

  /** Data por extenso em pt-BR, tolerante a valor ausente. */
  function formatDate(value) {
    if (!value) return "";
    const d = new Date(String(value).length <= 10 ? value + "T12:00:00" : value);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  }

  /** Minutos de leitura, estimados pelo corpo da materia. */
  function readingTime(post) {
    const words = (post.body || [])
      .map((b) => b.text || (b.items || []).join(" ") || "")
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  // ------------------------------------------------------------ fonte local

  const localSource = {
    async all() {
      const posts = global.MAGICINE_POSTS || [];
      return sortByDate(posts.filter((p) => p.status !== "draft"));
    },
    async get(slug) {
      return (global.MAGICINE_POSTS || []).find((p) => p.slug === slug) || null;
    },
  };

  // --------------------------------------------------------- fonte Supabase

  const supabaseSource = {
    headers() {
      return {
        apikey: SUPABASE.anonKey,
        Authorization: "Bearer " + SUPABASE.anonKey,
        Accept: "application/json",
      };
    },
    async all() {
      const url =
        `${SUPABASE.url}/rest/v1/${SUPABASE.table}` +
        `?select=*&status=eq.published&order=published_at.desc`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error("Supabase respondeu " + res.status);
      return await res.json();
    },
    async get(slug) {
      const url =
        `${SUPABASE.url}/rest/v1/${SUPABASE.table}` +
        `?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error("Supabase respondeu " + res.status);
      const rows = await res.json();
      return rows[0] || null;
    },
  };

  function backend() {
    if (SOURCE === "supabase") {
      if (!SUPABASE.url || !SUPABASE.anonKey) {
        console.warn("[Magicine] SOURCE=supabase mas url/anonKey estão vazios; usando as matérias locais.");
        return localSource;
      }
      return supabaseSource;
    }
    return localSource;
  }

  // Uma chamada por carregamento de página; as telas reaproveitam a promessa.
  let cache = null;
  function all() {
    if (!cache) {
      cache = backend()
        .all()
        .catch((err) => {
          console.error("[Magicine] falha ao carregar as matérias:", err);
          cache = null;
          return [];
        });
    }
    return cache;
  }

  // ------------------------------------------------------------ API pública

  const News = {
    configured: () => SOURCE !== "supabase" || !!SUPABASE.url,
    source: () => SOURCE,

    /** Lista com filtro por categoria, busca em texto e paginação. */
    async list(opts) {
      const o = opts || {};
      let posts = await all();

      if (o.category && o.category !== "Todas") {
        posts = posts.filter((p) => p.category === o.category);
      }
      if (o.search) {
        const q = norm(o.search);
        posts = posts.filter((p) =>
          [p.title, p.excerpt, p.category, (p.tags || []).join(" ")]
            .some((f) => norm(f).includes(q))
        );
      }
      if (o.featured) posts = posts.filter((p) => p.featured);

      const start = o.offset || 0;
      const limit = o.limit || PAGE_SIZE;
      return { total: posts.length, items: posts.slice(start, start + limit) };
    },

    async get(slug) {
      if (SOURCE === "local") return localSource.get(slug);
      return backend().get(slug);
    },

    async categories() {
      const posts = await all();
      return ["Todas", ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))];
    },

    /** Outras matérias da mesma categoria, para o pé do artigo. */
    async related(post, limit) {
      const posts = await all();
      return posts
        .filter((p) => p.slug !== post.slug && p.category === post.category)
        .slice(0, limit || 3);
    },

    formatDate,
    readingTime,
    media,
    PAGE_SIZE,
  };

  global.MagicineNews = News;
})(window);
