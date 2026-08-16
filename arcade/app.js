/* Magicine - home: destaques de notícias, últimas matérias e o arcade. */
(() => {
  "use strict";

  const News = window.MagicineNews;

  // ---------------------------------------------------------------- jogos

  const GAMES = [
    {
      id: "dragao",
      name: "Fuga do Dragão",
      genre: "Corrida",
      tint: "#ff6b3d",
      desc: "Carrinho a toda nos trilhos de uma caverna, com um dragão cuspindo fogo colado atrás.",
      path: "games/dragao/",
      unit: "pts",
      best: ["dragao"],
      thumb: `
        <defs>
          <linearGradient id="d-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0a0710"/><stop offset="1" stop-color="#3a1810"/>
          </linearGradient>
          <radialGradient id="d-fire"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#ff7a1a" stop-opacity=".7"/><stop offset="1" stop-color="#ff3000" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="320" height="180" fill="url(#d-bg)"/>
        <path d="M0 0 L0 34 L22 58 L44 30 L66 60 L88 32 L110 58 L132 30 L154 56 L176 30 L198 58 L220 32 L242 60 L264 32 L286 56 L308 30 L320 44 L320 0Z" fill="#221422"/>
        <path d="M0 150 Q80 132 160 142 T320 134 L320 180 L0 180Z" fill="#2c1a24"/>
        <path d="M0 128 Q80 112 160 120 T320 112" stroke="#8d9aa8" stroke-width="3" fill="none"/>
        <ellipse cx="46" cy="112" rx="70" ry="42" fill="url(#d-fire)"/>
        <g transform="translate(18 104)">
          <path d="M0 0 Q26 -16 54 -8 L54 6 Q28 14 0 8Z" fill="#9c2033"/>
          <path d="M22 -10 L28 -26 L33 -9Z" fill="#e8d5b0"/>
          <circle cx="38" cy="-2" r="4" fill="#ffd166"/>
          <path d="M36 8 L39 15 L42 8 L45 15 L48 8" stroke="#fff4e0" stroke-width="2.5" fill="none"/>
        </g>
        <g transform="translate(176 116)">
          <path d="M-20 -18 L20 -18 L16 0 L-16 0Z" fill="#6d4526"/>
          <circle cx="-13" cy="4" r="7" fill="#1b1418"/><circle cx="13" cy="4" r="7" fill="#1b1418"/>
          <path d="M0 -18 L0 -34 M0 -30 L-9 -40 M0 -30 L9 -40" stroke="#e9dcc8" stroke-width="3.4" stroke-linecap="round"/>
          <circle cx="0" cy="-41" r="5.5" fill="#f0c9a0"/>
        </g>
        <g fill="#6ee7ff"><path d="M258 96 L265 106 L258 117 L251 106Z"/></g>
      `,
    },
    {
      id: "voo",
      name: "Voo Rasante",
      genre: "4 mundos",
      tint: "#3fd8ff",
      desc: "Bata as asas entre os obstáculos em quatro mundos: clássico, magia, mitologia grega e alta fantasia.",
      path: "games/voo/",
      unit: "pts",
      best: ["voo.classico", "voo.magia", "voo.olimpo", "voo.fantasia"],
      thumb: `
        <defs><linearGradient id="v-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b1e57"/><stop offset="1" stop-color="#4ec0ca"/></linearGradient></defs>
        <rect width="320" height="180" fill="url(#v-sky)"/>
        <circle cx="262" cy="40" r="17" fill="#f2e9c9"/><circle cx="255" cy="35" r="15" fill="#2b1e57"/>
        <g fill="#6b6480" stroke="#2a2538" stroke-width="2">
          <rect x="58" y="0" width="42" height="58"/><rect x="52" y="58" width="54" height="15"/>
          <rect x="58" y="128" width="42" height="52"/><rect x="52" y="113" width="54" height="15"/></g>
        <g fill="#7fd456" stroke="#2f6b1f" stroke-width="2">
          <rect x="220" y="0" width="42" height="42"/><rect x="214" y="42" width="54" height="15"/>
          <rect x="220" y="112" width="42" height="68"/><rect x="214" y="97" width="54" height="15"/></g>
        <g transform="translate(160 86)">
          <ellipse rx="15" ry="12" fill="#f7d51d" stroke="#c8880c" stroke-width="2"/>
          <ellipse cx="-3" cy="-4" rx="7" ry="5" fill="#fff" stroke="#c8880c" stroke-width="1.6"/>
          <circle cx="7" cy="-5" r="4.4" fill="#fff"/><circle cx="8.6" cy="-5" r="2" fill="#222"/>
          <path d="M12 0 L23 2 L12 6Z" fill="#f4761a"/></g>
      `,
    },
    {
      id: "serpente",
      name: "Serpente Neon",
      genre: "Arcade",
      tint: "#3fd8ff",
      desc: "A cobrinha de sempre, agora correndo dentro de um circuito luminoso.",
      path: "games/serpente/",
      unit: "pts",
      best: ["serpente"],
      thumb: `
        <rect width="320" height="180" fill="#070b16"/>
        <g stroke="#3fd8ff" stroke-opacity=".14" stroke-width="1">
          ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 29}" y1="0" x2="${i * 29}" y2="180"/>`).join("")}
          ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 29}" x2="320" y2="${i * 29}"/>`).join("")}
        </g>
        <g fill="#3fa8d8">
          <rect x="58" y="112" width="24" height="24" rx="5"/><rect x="87" y="112" width="24" height="24" rx="5"/>
          <rect x="116" y="112" width="24" height="24" rx="5"/><rect x="116" y="83" width="24" height="24" rx="5"/>
          <rect x="116" y="54" width="24" height="24" rx="5"/><rect x="145" y="54" width="24" height="24" rx="5"/></g>
        <rect x="174" y="54" width="24" height="24" rx="7" fill="#3fd8ff"/>
        <circle cx="192" cy="61" r="2.4" fill="#061018"/><circle cx="192" cy="71" r="2.4" fill="#061018"/>
        <circle cx="248" cy="66" r="9" fill="#ff2e88"/>
        <circle cx="245" cy="63" r="3" fill="#fff" opacity=".85"/>
      `,
    },
    {
      id: "blocos",
      name: "Quebra-Blocos",
      genre: "Arcade",
      tint: "#ff2e88",
      desc: "Rebata a bola, limpe a parede e avance de fase — cada uma vem mais rápida.",
      path: "games/blocos/",
      unit: "pts",
      best: ["blocos"],
      thumb: `
        <rect width="320" height="180" fill="#0d1430"/>
        ${["#ff2e88", "#b5179e", "#7209b7", "#4361ee"].map((c, r) =>
          Array.from({ length: 7 }, (_, i) =>
            `<rect x="${20 + i * 41}" y="${22 + r * 18}" width="36" height="13" fill="${c}"/>`).join("")).join("")}
        <circle cx="188" cy="120" r="6" fill="#fff"/>
        <rect x="126" y="150" width="70" height="10" rx="5" fill="#3fd8ff"/>
      `,
    },
    {
      id: "invasores",
      name: "Invasores",
      genre: "Tiro",
      tint: "#4ad66d",
      desc: "Segure a formação alienígena onda após onda antes que ela alcance a superfície.",
      path: "games/invasores/",
      unit: "pts",
      best: ["invasores"],
      thumb: `
        <rect width="320" height="180" fill="#05070f"/>
        <g fill="#c8dcff">${Array.from({ length: 26 }, (_, i) =>
          `<rect x="${(i * 73) % 320}" y="${(i * 41) % 180}" width="1.6" height="1.6" opacity="${0.3 + (i % 4) * 0.16}"/>`).join("")}</g>
        ${[0, 1, 2].map((r) => Array.from({ length: 6 }, (_, c) => {
          const col = ["#ff2e88", "#b5179e", "#4ad66d"][r];
          const x = 42 + c * 42, y = 26 + r * 30;
          return `<g fill="${col}"><rect x="${x}" y="${y}" width="16" height="10"/><rect x="${x - 3}" y="${y + 4}" width="22" height="6"/><rect x="${x - 6}" y="${y + 7}" width="3" height="5"/><rect x="${x + 19}" y="${y + 7}" width="3" height="5"/></g>`;
        }).join("")).join("")}
        <rect x="158" y="112" width="3" height="12" fill="#ffce4d"/>
        <path d="M160 138 L174 158 L166 158 L160 150 L154 158 L146 158Z" fill="#3fd8ff"/>
        <rect x="0" y="172" width="320" height="8" fill="#14204a"/>
      `,
    },
    {
      id: "rebatida",
      name: "Rebatida",
      genre: "Duelo",
      tint: "#9b6cff",
      desc: "O duelo de raquetes que começou tudo. Três níveis de computador, melhor de 7 pontos.",
      path: "games/rebatida/",
      unit: "vitórias",
      best: ["rebatida"],
      thumb: `
        <rect width="320" height="180" fill="#0c1330"/>
        <g fill="#fff" opacity=".14">${Array.from({ length: 6 }, (_, i) =>
          `<rect x="158" y="${10 + i * 30}" width="4" height="16"/>`).join("")}</g>
        <rect x="26" y="58" width="10" height="64" rx="5" fill="#3fd8ff"/>
        <rect x="284" y="82" width="10" height="64" rx="5" fill="#ff2e88"/>
        <circle cx="196" cy="104" r="7" fill="#fff"/>
        <circle cx="176" cy="98" r="5" fill="#3fd8ff" opacity=".35"/>
        <circle cx="160" cy="93" r="3.4" fill="#3fd8ff" opacity=".2"/>
      `,
    },
  ];

  // ------------------------------------------------------------- helpers

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmt = (n) => Math.floor(n).toLocaleString("pt-BR");

  function bestOf(keys) {
    return keys.reduce((sum, k) => {
      try {
        const raw = localStorage.getItem("magicine.best." + k);
        return sum + (raw === null ? 0 : Number(JSON.parse(raw)) || 0);
      } catch (_) {
        return sum;
      }
    }, 0);
  }

  const coverStyle = (p) =>
    p.cover ? ` style="background-image:url('${esc(p.cover)}')"` : "";

  function postCard(p) {
    return `
      <a class="post" href="noticias/artigo.html?slug=${encodeURIComponent(p.slug)}">
        <div class="cover"${coverStyle(p)}></div>
        <div class="post-body">
          <span class="kicker">${esc(p.category || "Matéria")}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt || "")}</p>
          <div class="meta">
            <span>${esc(News.formatDate(p.published_at))}</span>
            <span>${News.readingTime(p)} min de leitura</span>
          </div>
        </div>
      </a>`;
  }

  function miniCard(p) {
    return `
      <a class="mini" href="noticias/artigo.html?slug=${encodeURIComponent(p.slug)}">
        <div class="cover"${coverStyle(p)}></div>
        <div>
          <h4>${esc(p.title)}</h4>
          <span>${esc(p.category || "")} · ${esc(News.formatDate(p.published_at))}</span>
        </div>
      </a>`;
  }

  // -------------------------------------------------------------- notícias

  async function renderNews() {
    const featured = document.getElementById("featured");
    const recent = document.getElementById("recent");

    const destaque = await News.list({ featured: true, limit: 3 });
    const todas = await News.list({ limit: 7 });

    if (!todas.total) {
      featured.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <h3>A redação ainda está vazia</h3>
          <p>
            Adicione a primeira matéria no array <code>MAGICINE_POSTS</code> em
            <code>shared/news-data.js</code> — os destaques e a listagem se
            montam sozinhos. Quando o volume crescer, troque para o Supabase
            em <code>shared/news.js</code>.
          </p>
        </div>`;
      document.getElementById("recentes").hidden = true;
      return;
    }

    // sem matéria marcada como destaque, usa as mais novas
    const top = destaque.items.length ? destaque.items : todas.items.slice(0, 3);
    featured.innerHTML =
      postCard(top[0]) +
      (top.length > 1
        ? `<div class="stack">${top.slice(1, 3).map(postCard).join("")}</div>`
        : "");

    const usados = new Set(top.map((p) => p.slug));
    const resto = todas.items.filter((p) => !usados.has(p.slug));
    if (resto.length) {
      recent.innerHTML = resto.map(miniCard).join("");
    } else {
      document.getElementById("recentes").hidden = true;
    }
  }

  // ----------------------------------------------------------------- jogos

  const grid = document.getElementById("grid");
  const filters = document.getElementById("filters");
  let active = "Todos";

  function renderGames() {
    const list = active === "Todos" ? GAMES : GAMES.filter((g) => g.genre === active);

    grid.innerHTML = list
      .map((g) => {
        const best = bestOf(g.best);
        return `
          <a class="game" href="${g.path}" style="--tint:${g.tint}">
            <div class="thumb"><svg viewBox="0 0 320 180" role="img" aria-label="Cena do jogo ${esc(g.name)}">${g.thumb}</svg></div>
            <div class="game-body">
              <div class="game-top"><h3>${esc(g.name)}</h3><span class="badge">${esc(g.genre)}</span></div>
              <p>${esc(g.desc)}</p>
              <div class="meta">
                <span class="${best > 0 ? "has-record" : ""}">${
                  best > 0 ? `Seu recorde <b>${fmt(best)}</b> ${g.unit}` : "Você ainda não jogou"
                }</span>
              </div>
            </div>
          </a>`;
      })
      .join("");

    document.getElementById("stat-games").textContent = String(GAMES.length);
    document.getElementById("stat-points").textContent = fmt(
      GAMES.reduce((s, g) => s + bestOf(g.best), 0)
    );
  }

  function renderFilters() {
    const genres = ["Todos", ...new Set(GAMES.map((g) => g.genre))];
    filters.innerHTML = "";
    for (const gen of genres) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter";
      b.textContent = gen;
      b.setAttribute("aria-pressed", String(gen === active));
      b.addEventListener("click", () => {
        active = gen;
        renderFilters();
        renderGames();
      });
      filters.appendChild(b);
    }
  }

  // ------------------------------------------------------------------ init

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Apagar todos os seus recordes salvos neste navegador?")) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith("magicine.best."))
      .forEach((k) => localStorage.removeItem(k));
    renderGames();
  });

  renderFilters();
  renderGames();
  renderNews();
})();
