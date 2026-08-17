/* Magicine - home: capa, últimas, blocos por editoria e arcade. */
(() => {
  "use strict";

  const News = window.MagicineNews;

  /** Cor de cada editoria; entra como --tint nos cards e nos títulos. */
  const TINT = {
    Cinema: "var(--c-cinema)",
    "Séries": "var(--c-series)",
    Games: "var(--c-games)",
    Bastidores: "var(--c-bastidores)",
  };

  const tintOf = (cat) => TINT[cat] || "var(--amber)";

  // ---------------------------------------------------------------- jogos

  const GAMES = [
    {
      id: "dragao", name: "Fuga do Dragão", genre: "Corrida", tint: "#ff5c39",
      desc: "Carrinho a toda nos trilhos de uma caverna, com um dragão cuspindo fogo colado atrás.",
      path: "games/dragao/", unit: "pts", best: ["dragao"],
      thumb: `
        <defs>
          <linearGradient id="d-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0a0710"/><stop offset="1" stop-color="#3a1810"/></linearGradient>
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
          <path d="M36 8 L39 15 L42 8 L45 15 L48 8" stroke="#fff4e0" stroke-width="2.5" fill="none"/></g>
        <g transform="translate(176 116)">
          <path d="M-20 -18 L20 -18 L16 0 L-16 0Z" fill="#6d4526"/>
          <circle cx="-13" cy="4" r="7" fill="#1b1418"/><circle cx="13" cy="4" r="7" fill="#1b1418"/>
          <path d="M0 -18 L0 -34 M0 -30 L-9 -40 M0 -30 L9 -40" stroke="#e9dcc8" stroke-width="3.4" stroke-linecap="round"/>
          <circle cx="0" cy="-41" r="5.5" fill="#f0c9a0"/></g>
        <path d="M258 96 L265 106 L258 117 L251 106Z" fill="#6ee7ff"/>
      `,
    },
    {
      id: "guardioes", name: "Guardiões", genre: "Estratégia", tint: "#5ec9a7",
      desc: "Defesa de torre: posicione guardiões, melhore com o ouro dos abates e segure ondas que evoluem a cada rodada.",
      path: "games/guardioes/", unit: "pts", best: ["guardioes"],
      thumb: `
        <rect width="320" height="180" fill="#141a16"/>
        <g fill="rgba(255,255,255,.04)">
          ${[0,1,2,3,4].map((r) => [0,1,2,3,4,5,6,7].map((c) =>
            (r + c) % 2 ? `<rect x="${c * 40 + 1}" y="${r * 36 + 1}" width="38" height="34"/>` : "").join("")).join("")}
        </g>
        <path d="M0 90 L96 90 L96 26 L200 26 L200 148 L272 148 L272 74 L320 74"
              stroke="#3d3222" stroke-width="26" fill="none" stroke-linejoin="round"/>
        <path d="M0 90 L96 90 L96 26 L200 26 L200 148 L272 148 L272 74 L320 74"
              stroke="rgba(255,176,58,.22)" stroke-width="2" fill="none" stroke-dasharray="6 9"/>
        <g>
          <circle cx="48" cy="42" r="14" fill="#22262e" stroke="#5ec9a7" stroke-width="2.5"/>
          <circle cx="48" cy="42" r="6" fill="#5ec9a7"/><rect x="48" y="39" width="16" height="6" fill="#5ec9a7"/>
          <circle cx="150" cy="112" r="14" fill="#22262e" stroke="#62a8ff" stroke-width="2.5"/>
          <circle cx="150" cy="112" r="6" fill="#62a8ff"/><rect x="150" y="109" width="16" height="6" fill="#62a8ff"/>
          <circle cx="240" cy="42" r="14" fill="#22262e" stroke="#ff5c39" stroke-width="2.5"/>
          <circle cx="240" cy="42" r="6" fill="#ff5c39"/><rect x="240" y="39" width="16" height="6" fill="#ff5c39"/>
        </g>
        <g><circle cx="120" cy="26" r="9" fill="#c9a227"/><circle cx="200" cy="80" r="8" fill="#5ec9a7"/>
           <circle cx="236" cy="148" r="10" fill="#8d9aa8"/><circle cx="236" cy="148" r="5" fill="none" stroke="#dfe6ef" stroke-width="2"/></g>
        <path d="M300 60 L316 74 L300 88 L284 74Z" fill="#ffb03a"/>
        <circle cx="300" cy="74" r="5" fill="#141a16"/>
      `,
    },
    {
      id: "cores", name: "Cores", genre: "Puzzle", tint: "#c77dff",
      desc: "Blocos coloridos caem aos pares. Junte quatro ou mais da mesma cor e veja a pilha desabar em combo.",
      path: "games/cores/", unit: "pts", best: ["cores"],
      thumb: `
        <rect width="320" height="180" fill="#121522"/>
        <rect x="96" y="8" width="128" height="164" fill="rgba(0,0,0,.34)" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
        ${(() => {
          const C = ["#ff5c39", "#ffce4d", "#5ec9a7", "#62a8ff", "#c77dff"];
          const campo = [[2, 2, 0, 1, 3, 4, 0], [1, 2, 2, 1, 3, 3, 0], [1, 0, 4, 4, 3, 1, 2]];
          return campo.map((linha, r) => linha.map((v, c) =>
            `<rect x="${100 + c * 17}" y="${112 + r * 19}" width="15" height="17" rx="4" fill="${C[v]}"/>`
          ).join("")).join("");
        })()}
        <rect x="134" y="30" width="15" height="17" rx="4" fill="#5ec9a7"/>
        <rect x="134" y="50" width="15" height="17" rx="4" fill="#5ec9a7"/>
        <g opacity=".18"><rect x="134" y="74" width="15" height="17" rx="4" fill="#5ec9a7"/>
           <rect x="134" y="93" width="15" height="17" rx="4" fill="#5ec9a7"/></g>
        <text x="262" y="62" font-family="Segoe UI,sans-serif" font-size="15" font-weight="800" fill="#ffb03a" text-anchor="middle">COMBO</text>
        <text x="262" y="88" font-family="Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#ffb03a" text-anchor="middle">x3</text>
      `,
    },
    {
      id: "memoria", name: "Memória", genre: "Puzzle", tint: "#ffb03a",
      desc: "Encontre os pares antes de errar demais. O tabuleiro cresce a cada rodada limpa.",
      path: "games/memoria/", unit: "pts", best: ["memoria"],
      thumb: `
        <rect width="320" height="180" fill="#161219"/>
        ${(() => {
          const cor = ["#ffb03a", "#ff5c39", "#5ec9a7", "#62a8ff", "#c77dff", "#e8dcc8", "#4ad66d", "#ffce4d"];
          const cartas = [[0, 1], [1, 0], [2, 1], [3, 0], [4, 0], [5, 1], [6, 0], [7, 1]];
          return cartas.map(([i, aberta], k) => {
            const x = 26 + (k % 4) * 72, y = 26 + Math.floor(k / 4) * 68;
            return aberta
              ? `<rect x="${x}" y="${y}" width="60" height="56" rx="10" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.22)" stroke-width="2"/><circle cx="${x + 30}" cy="${y + 28}" r="15" fill="${cor[i]}"/>`
              : `<rect x="${x}" y="${y}" width="60" height="56" rx="10" fill="#2b2333" stroke="rgba(255,176,58,.28)" stroke-width="2"/><circle cx="${x + 30}" cy="${y + 28}" r="5" fill="rgba(255,176,58,.5)"/>`;
          }).join("");
        })()}
      `,
    },
    {
      id: "fliperama", name: "Fliperama", genre: "Pinball", tint: "#ff5c39",
      desc: "Pinball com física de verdade: bumpers, alvos que apagam e multiplicador por acertos seguidos.",
      path: "games/fliperama/", unit: "pts", best: ["fliperama"],
      thumb: `
        <rect width="320" height="180" fill="#141026"/>
        <g stroke="#4a3a5c" stroke-width="4" stroke-linecap="round" fill="none">
          <path d="M22 20 L22 118"/><path d="M298 20 L298 96"/>
          <path d="M22 20 L52 6 L268 6 L298 20"/>
          <path d="M22 118 L112 158"/><path d="M298 96 L246 122 L208 158"/>
        </g>
        <g><circle cx="106" cy="62" r="17" fill="#2a2038" stroke="#ffb03a" stroke-width="3"/>
           <circle cx="106" cy="62" r="7" fill="#ff5c39"/>
           <circle cx="214" cy="62" r="17" fill="#2a2038" stroke="#ffb03a" stroke-width="3"/>
           <circle cx="214" cy="62" r="7" fill="#ff5c39"/>
           <circle cx="160" cy="34" r="14" fill="#2a2038" stroke="#ffb03a" stroke-width="3"/></g>
        <g fill="#5ec9a7"><rect x="46" y="88" width="22" height="8"/><rect x="46" y="104" width="22" height="8"/>
           <rect x="252" y="88" width="22" height="8"/><rect x="252" y="104" width="22" height="8"/></g>
        <g stroke="#ff5c39" stroke-width="11" stroke-linecap="round">
          <path d="M120 160 L162 148"/><path d="M200 160 L158 148"/></g>
        <circle cx="160" cy="104" r="8" fill="#fff"/>
      `,
    },
    {
      id: "colosso", name: "Colosso", genre: "Escalada", tint: "#ffb03a",
      desc: "O gorila gigante sobe a torre. Desvie do entulho e derrube os aviões que chegam perto.",
      path: "games/colosso/", unit: "pts", best: ["colosso"],
      thumb: `
        <defs><linearGradient id="k-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b1024"/><stop offset="1" stop-color="#c98b6b"/></linearGradient></defs>
        <rect width="320" height="180" fill="url(#k-sky)"/>
        <circle cx="264" cy="34" r="15" fill="#fff0d2" opacity=".9"/>
        <rect x="110" y="0" width="100" height="180" fill="#20242e"/>
        <rect x="110" y="0" width="7" height="180" fill="#2b303c"/>
        <rect x="203" y="0" width="7" height="180" fill="#2b303c"/>
        ${[0,1,2,3,4].map((r) => [0,1,2,3].map((c) =>
          `<rect x="${124 + c * 20}" y="${14 + r * 34}" width="13" height="17" fill="${(r + c) % 4 === 0 ? "rgba(255,196,110,.75)" : "rgba(255,255,255,.06)"}"/>`).join("")).join("")}
        <g transform="translate(160 104)">
          <ellipse rx="21" ry="25" fill="#4a3b34"/>
          <ellipse cy="3" rx="13" ry="16" fill="#6b574c"/>
          <path d="M9 -5 L34 -26" stroke="#3a2f2a" stroke-width="11" stroke-linecap="round"/>
          <path d="M-10 -2 L-25 15" stroke="#3a2f2a" stroke-width="10" stroke-linecap="round"/>
          <circle cx="2" cy="-25" r="14" fill="#4a3b34"/>
          <ellipse cx="5" cy="-22" rx="8" ry="6" fill="#8a7062"/>
          <circle cx="6" cy="-30" r="2" fill="#1a1410"/><circle cx="0" cy="-30" r="2" fill="#1a1410"/>
        </g>
        <g transform="translate(60 60)" fill="#c9d2de">
          <path d="M-18 0 L12 -4 L20 0 L12 4Z"/><rect x="-8" y="-10" width="6" height="20" fill="#8b96a6"/></g>
        <g fill="#7c6a58"><rect x="238" y="120" width="14" height="10" transform="rotate(20 245 125)"/></g>
      `,
    },
    {
      id: "linhafrente", name: "Linha de Frente", genre: "Tiro", tint: "#3fd8ff",
      desc: "Tiro de arena em vista de cima: ondas convergem para você e apertam a cada rodada.",
      path: "games/linhafrente/", unit: "pts", best: ["linhafrente"],
      thumb: `
        <rect width="320" height="180" fill="#101216"/>
        <g stroke="#ffb03a" stroke-opacity=".08" stroke-width="1">
          ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 36}" y1="0" x2="${i * 36}" y2="180"/>`).join("")}
          ${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${i * 36}" x2="320" y2="${i * 36}"/>`).join("")}</g>
        <g transform="translate(160 96) rotate(-20)" fill="#3fd8ff">
          <path d="M19 0 L-12 -13 L-5 0 L-12 13Z"/><rect x="2" y="-3" width="12" height="6" fill="#0f1a20"/></g>
        <g fill="#ffce4d">
          <circle cx="196" cy="76" r="3.4"/><circle cx="222" cy="66" r="3.4"/><circle cx="248" cy="56" r="3.4"/></g>
        <g fill="#ff5c39">
          <path d="M262 40 L246 32 L250 40 L246 48Z" transform="rotate(160 254 40)"/>
          <path d="M64 132 L48 124 L52 132 L48 140Z" transform="rotate(-20 56 132)"/>
          <path d="M78 44 L62 36 L66 44 L62 52Z" transform="rotate(35 70 44)"/></g>
        <path d="M270 122 L254 114 L258 122 L254 130Z" transform="rotate(200 262 122)" fill="#c1121f"/>
        <g fill="#5ec9a7"><rect x="92" y="60" width="5" height="16"/><rect x="86" y="66" width="16" height="5"/></g>
      `,
    },
    {
      id: "voo", name: "Voo Rasante", genre: "4 mundos", tint: "#ffb03a",
      desc: "Bata as asas entre os obstáculos em quatro mundos: clássico, magia, mitologia grega e alta fantasia.",
      path: "games/voo/", unit: "pts",
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
      id: "serpente", name: "Serpente Neon", genre: "Arcade", tint: "#5ec9a7",
      desc: "A cobrinha de sempre, correndo dentro de um circuito luminoso.",
      path: "games/serpente/", unit: "pts", best: ["serpente"],
      thumb: `
        <rect width="320" height="180" fill="#070b16"/>
        <g stroke="#5ec9a7" stroke-opacity=".14" stroke-width="1">
          ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 29}" y1="0" x2="${i * 29}" y2="180"/>`).join("")}
          ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 29}" x2="320" y2="${i * 29}"/>`).join("")}</g>
        <g fill="#3f9c85">
          <rect x="58" y="112" width="24" height="24" rx="5"/><rect x="87" y="112" width="24" height="24" rx="5"/>
          <rect x="116" y="112" width="24" height="24" rx="5"/><rect x="116" y="83" width="24" height="24" rx="5"/>
          <rect x="116" y="54" width="24" height="24" rx="5"/><rect x="145" y="54" width="24" height="24" rx="5"/></g>
        <rect x="174" y="54" width="24" height="24" rx="7" fill="#5ec9a7"/>
        <circle cx="192" cy="61" r="2.4" fill="#061018"/><circle cx="192" cy="71" r="2.4" fill="#061018"/>
        <circle cx="248" cy="66" r="9" fill="#ff5c39"/>
        <circle cx="245" cy="63" r="3" fill="#fff" opacity=".85"/>
      `,
    },
    {
      id: "blocos", name: "Quebra-Blocos", genre: "Arcade", tint: "#c77dff",
      desc: "Rebata a bola, limpe a parede e avance de fase — cada uma vem mais rápida.",
      path: "games/blocos/", unit: "pts", best: ["blocos"],
      thumb: `
        <rect width="320" height="180" fill="#141020"/>
        ${["#ff5c39", "#ffb03a", "#c77dff", "#62a8ff"].map((c, r) =>
          Array.from({ length: 7 }, (_, i) =>
            `<rect x="${20 + i * 41}" y="${22 + r * 18}" width="36" height="13" fill="${c}"/>`).join("")).join("")}
        <circle cx="188" cy="120" r="6" fill="#fff"/>
        <rect x="126" y="150" width="70" height="10" rx="5" fill="#ffb03a"/>
      `,
    },
    {
      id: "invasores", name: "Invasores", genre: "Tiro", tint: "#62a8ff",
      desc: "Segure a formação alienígena onda após onda antes que ela alcance a superfície.",
      path: "games/invasores/", unit: "pts", best: ["invasores"],
      thumb: `
        <rect width="320" height="180" fill="#05070f"/>
        <g fill="#c8dcff">${Array.from({ length: 26 }, (_, i) =>
          `<rect x="${(i * 73) % 320}" y="${(i * 41) % 180}" width="1.6" height="1.6" opacity="${0.3 + (i % 4) * 0.16}"/>`).join("")}</g>
        ${[0, 1, 2].map((r) => Array.from({ length: 6 }, (_, c) => {
          const col = ["#ff5c39", "#c77dff", "#5ec9a7"][r];
          const x = 42 + c * 42, y = 26 + r * 30;
          return `<g fill="${col}"><rect x="${x}" y="${y}" width="16" height="10"/><rect x="${x - 3}" y="${y + 4}" width="22" height="6"/><rect x="${x - 6}" y="${y + 7}" width="3" height="5"/><rect x="${x + 19}" y="${y + 7}" width="3" height="5"/></g>`;
        }).join("")).join("")}
        <rect x="158" y="112" width="3" height="12" fill="#ffb03a"/>
        <path d="M160 138 L174 158 L166 158 L160 150 L154 158 L146 158Z" fill="#62a8ff"/>
        <rect x="0" y="172" width="320" height="8" fill="#14204a"/>
      `,
    },
    {
      id: "rebatida", name: "Rebatida", genre: "Duelo", tint: "#ffb03a",
      desc: "O duelo de raquetes que começou tudo. Três níveis de computador, melhor de 7 pontos.",
      path: "games/rebatida/", unit: "vitórias", best: ["rebatida"],
      thumb: `
        <rect width="320" height="180" fill="#12100c"/>
        <g fill="#fff" opacity=".12">${Array.from({ length: 6 }, (_, i) =>
          `<rect x="158" y="${10 + i * 30}" width="4" height="16"/>`).join("")}</g>
        <rect x="26" y="58" width="10" height="64" rx="5" fill="#ffb03a"/>
        <rect x="284" y="82" width="10" height="64" rx="5" fill="#ff5c39"/>
        <circle cx="196" cy="104" r="7" fill="#fff"/>
        <circle cx="176" cy="98" r="5" fill="#ffb03a" opacity=".35"/>
        <circle cx="160" cy="93" r="3.4" fill="#ffb03a" opacity=".2"/>
      `,
    },
  ];

  // ------------------------------------------------------------- helpers

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmt = (n) => Math.floor(n).toLocaleString("pt-BR");
  const link = (p) => `noticias/artigo.html?slug=${encodeURIComponent(p.slug)}`;
  const cover = (p) => (p.cover ? ` style="background-image:url('${esc(News.media(p.cover))}')"` : "");

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

  function postCard(p) {
    return `
      <a class="post" href="${link(p)}" style="--tint:${tintOf(p.category)}">
        <div class="cover"${cover(p)}></div>
        <div class="post-body">
          <span class="kicker">${esc(p.category || "Matéria")}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt || "")}</p>
          <div class="meta">
            <span>${esc(News.formatDate(p.published_at))}</span>
            <span>${News.readingTime(p)} min</span>
          </div>
        </div>
      </a>`;
  }

  // ------------------------------------------------------------- notícias

  async function renderNews() {
    const top = document.getElementById("top");
    const editorias = document.getElementById("editorias");
    const { items: todas, total } = await News.list({ limit: 60 });

    if (!total) {
      top.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <h3>A redação ainda está vazia</h3>
          <p>Adicione a primeira matéria no array <code>MAGICINE_POSTS</code> em
          <code>shared/news-data.js</code> — a capa se monta sozinha.</p>
        </div>`;
      return;
    }

    // capa: a matéria em destaque mais recente, ou simplesmente a mais nova
    const capa = todas.find((p) => p.featured) || todas[0];
    const ultimas = todas.filter((p) => p.slug !== capa.slug).slice(0, 5);

    top.innerHTML =
      postCard(capa) +
      `<aside class="latest">
         <h2>Últimas</h2>
         <div class="latest-list">
           ${ultimas.map((p, i) => `
             <a class="latest-item" href="${link(p)}" style="--tint:${tintOf(p.category)}">
               <span class="num">${String(i + 1).padStart(2, "0")}</span>
               <div>
                 <h4>${esc(p.title)}</h4>
                 <span>${esc(p.category || "")} · ${esc(News.formatDate(p.published_at))}</span>
               </div>
             </a>`).join("")}
         </div>
       </aside>`;

    // Agrupa por editoria. Só ganha seção própria quem tem material para
    // encher a linha: uma editoria com uma matéria só deixaria duas colunas
    // vazias ao lado. O resto vai junto numa grade, que preenche bonito.
    const MIN_SECAO = 3;
    const porCategoria = new Map();
    for (const p of todas) {
      if (p.slug === capa.slug) continue;
      const k = p.category || "Geral";
      if (!porCategoria.has(k)) porCategoria.set(k, []);
      porCategoria.get(k).push(p);
    }

    const comSecao = [...porCategoria.entries()]
      .filter(([, list]) => list.length >= MIN_SECAO)
      .sort((a, b) => b[1].length - a[1].length);

    const usados = new Set(comSecao.flatMap(([, list]) => list.slice(0, 3).map((p) => p.slug)));
    const resto = todas.filter((p) => p.slug !== capa.slug && !usados.has(p.slug));

    let html = "";

    if (resto.length) {
      html += `
        <section class="section" style="--tint:var(--amber)">
          <div class="section-head">
            <h2>Últimas matérias</h2>
            <a class="more" href="noticias/">Ver todas →</a>
          </div>
          <div class="grid">${resto.slice(0, 8).map(postCard).join("")}</div>
        </section>`;
    }

    html += comSecao.map(([cat, list]) => `
      <section class="section" style="--tint:${tintOf(cat)}">
        <div class="section-head">
          <h2>${esc(cat)}</h2>
          <a class="more" href="noticias/?cat=${encodeURIComponent(cat)}">Ver tudo de ${esc(cat)} →</a>
        </div>
        <div class="row-feature">${list.slice(0, 3).map(postCard).join("")}</div>
      </section>`).join("");

    editorias.innerHTML = html;

    // o menu do topo lista todas as editorias que existem de fato
    const nav = document.getElementById("nav-cats");
    const cats = [...porCategoria.keys()].sort();
    nav.innerHTML =
      cats.map((cat) => `<a href="noticias/?cat=${encodeURIComponent(cat)}">${esc(cat)}</a>`).join("") +
      `<a href="noticias/">Todas</a><a class="is-arcade" href="#jogos">🎮 Arcade</a>`;
  }

  // ----------------------------------------------------------------- jogos

  const grid = document.getElementById("grid");
  const filters = document.getElementById("filters");
  let active = "Todos";

  function renderGames() {
    const list = active === "Todos" ? GAMES : GAMES.filter((g) => g.genre === active);
    grid.innerHTML = list.map((g) => {
      const best = bestOf(g.best);
      return `
        <a class="game" href="${g.path}" style="--tint:${g.tint}">
          <div class="thumb"><svg viewBox="0 0 320 180" role="img" aria-label="Cena do jogo ${esc(g.name)}">${g.thumb}</svg></div>
          <div class="game-body">
            <div class="game-top"><h3>${esc(g.name)}</h3><span class="badge">${esc(g.genre)}</span></div>
            <p>${esc(g.desc)}</p>
            <div class="meta"><span>${
              best > 0 ? `Seu recorde <b>${fmt(best)}</b> ${g.unit}` : "Você ainda não jogou"
            }</span></div>
          </div>
        </a>`;
    }).join("");
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
