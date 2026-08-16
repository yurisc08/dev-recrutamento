/* Nebula Arcade - monta a home: cards dos jogos, recordes e noticias. */
(() => {
  "use strict";

  // --------------------------------------------------------------- jogos
  // `best` lista as chaves de recorde do jogo (o Voo tem uma por mundo).

  const GAMES = [
    {
      id: "trilha",
      name: "Trilha Radical",
      genre: "Corrida",
      tint: "#f59e0b",
      desc: "Moto de trilha em montanhas geradas na hora. Acelere, incline no ar e não capote.",
      path: "games/trilha/",
      unit: "pts",
      best: ["trilha"],
      thumb: `
        <defs>
          <linearGradient id="t-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#17204a"/><stop offset="1" stop-color="#c98b6b"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#t-sky)"/>
        <circle cx="243" cy="112" r="26" fill="#ffd6a0" opacity=".8"/>
        <path d="M0 130 L60 104 L118 126 L180 96 L246 122 L320 100 L320 180 L0 180Z" fill="#3c4372"/>
        <path d="M0 148 L54 132 L120 152 L192 128 L264 150 L320 134 L320 180 L0 180Z" fill="#5c4028"/>
        <path d="M0 148 L54 132 L120 152 L192 128 L264 150 L320 134" stroke="#79a44a" stroke-width="5" fill="none"/>
        <g transform="translate(120 126)">
          <circle cx="-16" cy="8" r="9" fill="#1a1a20" stroke="#606878" stroke-width="2"/>
          <circle cx="16" cy="4" r="9" fill="#1a1a20" stroke="#606878" stroke-width="2"/>
          <path d="M-16 8 L-3 -3 L11 -1 L16 4" stroke="#e63946" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M-5 -6 L2 -16 L11 -8" stroke="#f1faee" stroke-width="3.4" fill="none" stroke-linecap="round"/>
          <circle cx="3" cy="-20" r="5" fill="#ffd166"/>
        </g>
      `,
    },
    {
      id: "voo",
      name: "Voo Rasante",
      genre: "4 mundos",
      tint: "#38bdf8",
      desc: "Bata as asas entre os obstáculos em quatro mundos: clássico, magia, mitologia grega e alta fantasia.",
      path: "games/voo/",
      unit: "pts",
      best: ["voo.classico", "voo.magia", "voo.olimpo", "voo.fantasia"],
      thumb: `
        <defs>
          <linearGradient id="v-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2b1e57"/><stop offset="1" stop-color="#4ec0ca"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#v-sky)"/>
        <circle cx="262" cy="40" r="17" fill="#f2e9c9"/><circle cx="255" cy="35" r="15" fill="#2b1e57"/>
        <g fill="#6b6480" stroke="#2a2538" stroke-width="2">
          <rect x="58" y="0" width="42" height="58"/><rect x="52" y="58" width="54" height="15"/>
          <rect x="58" y="128" width="42" height="52"/><rect x="52" y="113" width="54" height="15"/>
        </g>
        <g fill="#7fd456" stroke="#2f6b1f" stroke-width="2">
          <rect x="220" y="0" width="42" height="42"/><rect x="214" y="42" width="54" height="15"/>
          <rect x="220" y="112" width="42" height="68"/><rect x="214" y="97" width="54" height="15"/>
        </g>
        <g transform="translate(160 86)">
          <ellipse rx="15" ry="12" fill="#f7d51d" stroke="#c8880c" stroke-width="2"/>
          <ellipse cx="-3" cy="-4" rx="7" ry="5" fill="#fff" stroke="#c8880c" stroke-width="1.6"/>
          <circle cx="7" cy="-5" r="4.4" fill="#fff"/><circle cx="8.6" cy="-5" r="2" fill="#222"/>
          <path d="M12 0 L23 2 L12 6Z" fill="#f4761a"/>
        </g>
      `,
    },
    {
      id: "serpente",
      name: "Serpente Neon",
      genre: "Arcade",
      tint: "#4cc9f0",
      desc: "A cobrinha de sempre, agora correndo dentro de um circuito luminoso.",
      path: "games/serpente/",
      unit: "pts",
      best: ["serpente"],
      thumb: `
        <rect width="320" height="180" fill="#070b16"/>
        <g stroke="#4cc9f0" stroke-opacity=".14" stroke-width="1">
          ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 29}" y1="0" x2="${i * 29}" y2="180"/>`).join("")}
          ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 29}" x2="320" y2="${i * 29}"/>`).join("")}
        </g>
        <g fill="#3fa8d8">
          <rect x="58" y="112" width="24" height="24" rx="5"/><rect x="87" y="112" width="24" height="24" rx="5"/>
          <rect x="116" y="112" width="24" height="24" rx="5"/><rect x="116" y="83" width="24" height="24" rx="5"/>
          <rect x="116" y="54" width="24" height="24" rx="5"/><rect x="145" y="54" width="24" height="24" rx="5"/>
        </g>
        <rect x="174" y="54" width="24" height="24" rx="7" fill="#4cc9f0"/>
        <circle cx="192" cy="61" r="2.4" fill="#061018"/><circle cx="192" cy="71" r="2.4" fill="#061018"/>
        <circle cx="248" cy="66" r="9" fill="#f72585"/>
        <circle cx="245" cy="63" r="3" fill="#fff" opacity=".85"/>
      `,
    },
    {
      id: "blocos",
      name: "Quebra-Blocos",
      genre: "Arcade",
      tint: "#f72585",
      desc: "Rebata a bola, limpe a parede e avance de fase — cada uma vem mais rápida.",
      path: "games/blocos/",
      unit: "pts",
      best: ["blocos"],
      thumb: `
        <rect width="320" height="180" fill="#0d1430"/>
        <g>
          ${["#f72585", "#b5179e", "#7209b7", "#4361ee"].map((c, r) =>
            Array.from({ length: 7 }, (_, i) =>
              `<rect x="${20 + i * 41}" y="${22 + r * 18}" width="36" height="13" fill="${c}"/>`
            ).join("")
          ).join("")}
        </g>
        <circle cx="188" cy="120" r="6" fill="#fff"/>
        <rect x="126" y="150" width="70" height="10" rx="5" fill="#4cc9f0"/>
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
        <g fill="#c8dcff">
          ${Array.from({ length: 26 }, (_, i) =>
            `<rect x="${(i * 73) % 320}" y="${(i * 41) % 180}" width="1.6" height="1.6" opacity="${0.3 + (i % 4) * 0.16}"/>`
          ).join("")}
        </g>
        <g>
          ${[0, 1, 2].map((r) =>
            Array.from({ length: 6 }, (_, c) => {
              const col = ["#f72585", "#b5179e", "#4ad66d"][r];
              const x = 42 + c * 42, y = 26 + r * 30;
              return `<g fill="${col}"><rect x="${x}" y="${y}" width="16" height="10"/><rect x="${x - 3}" y="${y + 4}" width="22" height="6"/><rect x="${x - 6}" y="${y + 7}" width="3" height="5"/><rect x="${x + 19}" y="${y + 7}" width="3" height="5"/></g>`;
            }).join("")
          ).join("")}
        </g>
        <rect x="158" y="112" width="3" height="12" fill="#ffd166"/>
        <path d="M160 138 L174 158 L166 158 L160 150 L154 158 L146 158Z" fill="#4cc9f0"/>
        <rect x="0" y="172" width="320" height="8" fill="#14204a"/>
      `,
    },
    {
      id: "rebatida",
      name: "Rebatida",
      genre: "Duelo",
      tint: "#a78bfa",
      desc: "O duelo de raquetes que começou tudo. Três níveis de computador, melhor de 7 pontos.",
      path: "games/rebatida/",
      unit: "vitórias",
      best: ["rebatida"],
      thumb: `
        <rect width="320" height="180" fill="#0c1330"/>
        <g fill="#ffffff" opacity=".14">
          ${Array.from({ length: 6 }, (_, i) => `<rect x="158" y="${10 + i * 30}" width="4" height="16"/>`).join("")}
        </g>
        <rect x="26" y="58" width="10" height="64" rx="5" fill="#4cc9f0"/>
        <rect x="284" y="82" width="10" height="64" rx="5" fill="#f72585"/>
        <circle cx="196" cy="104" r="7" fill="#fff"/>
        <circle cx="176" cy="98" r="5" fill="#4cc9f0" opacity=".35"/>
        <circle cx="160" cy="93" r="3.4" fill="#4cc9f0" opacity=".2"/>
        <text x="118" y="46" font-family="Segoe UI, sans-serif" font-size="34" font-weight="700" fill="#ffffff" opacity=".2">3</text>
        <text x="182" y="46" font-family="Segoe UI, sans-serif" font-size="34" font-weight="700" fill="#ffffff" opacity=".2">2</text>
      `,
    },
  ];

  /**
   * NOTICIAS DE CINEMA E SERIES
   * ---------------------------
   * Deixei a seção pronta e vazia de propósito: é você quem escreve as
   * matérias. Para publicar, basta acrescentar objetos neste array —
   * a home monta os cards sozinha.
   *
   *   { kicker: "Série", title: "...", excerpt: "...",
   *     date: "2026-08-16", url: "noticias/minha-materia.html" }
   *
   * Só publique texto seu ou devidamente licenciado, e use imagens de
   * banco livre ou dos materiais de divulgação com o crédito exigido.
   */
  const NOTICIAS = [];

  // ------------------------------------------------------------- helpers

  function bestOf(keys) {
    return keys.reduce((sum, k) => {
      const raw = localStorage.getItem("arcade.best." + k);
      const n = raw === null ? 0 : Number(JSON.parse(raw)) || 0;
      return sum + n;
    }, 0);
  }

  const fmt = (n) => Math.floor(n).toLocaleString("pt-BR");

  // --------------------------------------------------------------- cards

  const grid = document.getElementById("grid");
  const filters = document.getElementById("filters");
  let active = "Todos";

  function render() {
    grid.innerHTML = "";
    const list = active === "Todos" ? GAMES : GAMES.filter((g) => g.genre === active);

    for (const g of list) {
      const best = bestOf(g.best);
      const card = document.createElement("a");
      card.className = "card";
      card.href = g.path;
      card.style.setProperty("--tint", g.tint);
      card.innerHTML = `
        <div class="thumb"><svg viewBox="0 0 320 180" role="img" aria-label="Cena do jogo ${g.name}">${g.thumb}</svg></div>
        <div class="card-body">
          <div class="card-top">
            <h3>${g.name}</h3>
            <span class="genre">${g.genre}</span>
          </div>
          <p>${g.desc}</p>
          <div class="card-foot">
            <span>${best > 0 ? `Seu recorde <b>${fmt(best)}</b> ${g.unit}` : "Você ainda não jogou"}</span>
            <span class="play-hint">Jogar →</span>
          </div>
        </div>`;
      grid.appendChild(card);
    }

    const total = GAMES.reduce((s, g) => s + bestOf(g.best), 0);
    document.getElementById("stat-points").textContent = fmt(total);
    document.getElementById("stat-games").textContent = String(GAMES.length);
  }

  function buildFilters() {
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
        buildFilters();
        render();
      });
      filters.appendChild(b);
    }
  }

  // ------------------------------------------------------------ noticias

  function renderNews() {
    const box = document.getElementById("news");
    box.innerHTML = "";

    if (!NOTICIAS.length) {
      box.innerHTML = `
        <div class="news-empty">
          <h3>Espaço reservado para cinema &amp; séries</h3>
          <p>
            A seção já está montada e responsiva. Para publicar a primeira
            matéria, adicione um item no array <code>NOTICIAS</code> dentro de
            <code>app.js</code> — os cards aparecem aqui automaticamente.
          </p>
        </div>`;
      return;
    }

    for (const n of NOTICIAS) {
      const a = document.createElement(n.url ? "a" : "div");
      a.className = "post";
      if (n.url) a.href = n.url;
      const date = n.date
        ? new Date(n.date + "T12:00:00").toLocaleDateString("pt-BR", {
            day: "2-digit", month: "long", year: "numeric",
          })
        : "";
      a.innerHTML = `
        <div class="post-cover"${n.cover ? ` style="background-image:url('${n.cover}');background-size:cover;background-position:center"` : ""}></div>
        <div class="post-body">
          <span class="post-kicker">${n.kicker || "Notícia"}</span>
          <h3>${n.title}</h3>
          <p>${n.excerpt || ""}</p>
          ${date ? `<time datetime="${n.date}">${date}</time>` : ""}
        </div>`;
      box.appendChild(a);
    }
  }

  // ---------------------------------------------------------------- init

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Apagar todos os seus recordes salvos neste navegador?")) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith("arcade.best."))
      .forEach((k) => localStorage.removeItem(k));
    render();
  });

  buildFilters();
  render();
  renderNews();
})();
