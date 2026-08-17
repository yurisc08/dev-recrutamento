/* Cores - quebra-cabeça de blocos coloridos que caem.

   Pares de blocos descem; grupos de quatro ou mais da mesma cor encostados
   somem, e o que estava em cima desaba — o que pode encadear e render
   combos. Mecânica de "juntar iguais conectados", com regras, arte e
   balanceamento próprios. */
(() => {
  "use strict";

  const A = window.Arcade;
  const canvas = document.getElementById("c");
  const view = A.createView(canvas, { minW: 460, minH: 520 });
  const ctx = view.ctx;
  const shell = A.mountShell("cores");

  const el = {
    start: document.getElementById("start"),
    over: document.getElementById("over"),
    play: document.getElementById("play"),
    again: document.getElementById("again"),
    nivel: document.getElementById("r-nivel"),
    combo: document.getElementById("r-combo"),
    score: document.getElementById("r-score"),
    record: document.getElementById("record"),
  };

  const COLS = 7;
  const ROWS = 13;
  const MIN_GRUPO = 4;
  const CORES = ["#ff5c39", "#ffce4d", "#5ec9a7", "#62a8ff", "#c77dff"];

  const STATE = { MENU: "menu", CAI: "cai", RESOLVE: "resolve", FIM: "fim" };
  let state = STATE.MENU;

  const gradeVazia = () => Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
  // criada já no carregamento: o draw() roda no menu, antes de reset()
  let grade = gradeVazia();  // grade[r][c] = índice de cor ou -1
  let peca = null;           // { c, r, giro, a, b }
  let proxima = null;
  let queda = 0;
  let intervalo = 0.72;
  let pontos = 0;
  let nivel = 1;
  let limpos = 0;
  let comboMax = 0;
  let cadeia = 0;
  let sumindo = [];
  let sumirT = 0;
  let cell = 34;
  let ox = 0;
  let oy = 0;
  let shake = 0;

  const CORES_USO = () => Math.min(CORES.length, 3 + Math.floor(nivel / 4));

  function layout() {
    const topo = 74;
    cell = Math.min((view.w * 0.9) / COLS, (view.h - topo - 20) / ROWS);
    ox = (view.w - cell * COLS) / 2;
    oy = topo + (view.h - topo - cell * ROWS) / 2;
  }
  view.onResize(layout);

  function reset() {
    grade = gradeVazia();
    pontos = 0;
    nivel = 1;
    limpos = 0;
    comboMax = 0;
    cadeia = 0;
    intervalo = 0.72;
    sumindo = [];
    shake = 0;
    proxima = novaPeca();
    soltar();
    layout();
  }

  const novaPeca = () => ({
    c: Math.floor(COLS / 2), r: 0, giro: 0,
    a: A.randInt(0, CORES_USO() - 1),
    b: A.randInt(0, CORES_USO() - 1),
  });

  /** Posição do segundo bloco, conforme o giro. */
  function segundo(p) {
    const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.giro % 4];
    return { c: p.c + d[0], r: p.r + d[1] };
  }

  const dentro = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const livre = (c, r) => dentro(c, r) && grade[r][c] === -1;

  function cabe(p) {
    const s = segundo(p);
    // acima do topo é tolerado enquanto a peça está entrando
    const ok = (c, r) => c >= 0 && c < COLS && r < ROWS && (r < 0 || grade[r][c] === -1);
    return ok(p.c, p.r) && ok(s.c, s.r);
  }

  function soltar() {
    peca = proxima;
    peca.c = Math.floor(COLS / 2);
    peca.r = 0;
    peca.giro = 0;
    proxima = novaPeca();
    queda = 0;
    if (!cabe(peca)) return fim();
    state = STATE.CAI;
  }

  function mover(dc) {
    if (state !== STATE.CAI) return;
    const teste = { ...peca, c: peca.c + dc };
    if (cabe(teste)) {
      peca.c += dc;
      A.sfx.blip();
    }
  }

  function girar() {
    if (state !== STATE.CAI) return;
    for (const desvio of [0, -1, 1]) {
      const teste = { ...peca, giro: (peca.giro + 1) % 4, c: peca.c + desvio };
      if (cabe(teste)) {
        peca.giro = teste.giro;
        peca.c = teste.c;
        A.sfx.bounce();
        return;
      }
    }
  }

  function descer() {
    const teste = { ...peca, r: peca.r + 1 };
    if (cabe(teste)) {
      peca.r++;
      return true;
    }
    fixar();
    return false;
  }

  function fixar() {
    const s = segundo(peca);
    if (peca.r >= 0) grade[peca.r][peca.c] = peca.a;
    if (s.r >= 0 && dentro(s.c, s.r)) grade[s.r][s.c] = peca.b;
    cadeia = 0;
    A.sfx.rumble();
    state = STATE.RESOLVE;
    resolver();
  }

  /** Faz tudo cair, depois procura grupos. Repete enquanto houver reação. */
  function resolver() {
    assentar();
    const grupos = acharGrupos();
    if (!grupos.length) {
      state = STATE.CAI;
      soltar();
      return;
    }
    cadeia++;
    comboMax = Math.max(comboMax, cadeia);
    let total = 0;
    sumindo = [];
    for (const g of grupos) {
      total += g.length;
      for (const [c, r] of g) sumindo.push({ c, r, cor: grade[r][c] });
    }
    // combo multiplica: reação em cadeia é o que faz a pontuação disparar
    pontos += total * 12 * cadeia + (total - MIN_GRUPO) * 8;
    limpos += total;
    nivel = 1 + Math.floor(limpos / 24);
    intervalo = Math.max(0.16, 0.72 - (nivel - 1) * 0.05);
    shake = Math.min(0.5, 0.12 * cadeia);
    A.sfx.pickup();
    if (cadeia > 1) A.sfx.power();
    sumirT = 0.24;
  }

  function assentar() {
    for (let c = 0; c < COLS; c++) {
      let escrita = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grade[r][c] !== -1) {
          const v = grade[r][c];
          grade[r][c] = -1;
          grade[escrita][c] = v;
          escrita--;
        }
      }
    }
  }

  /** Busca em largura por blocos da mesma cor encostados. */
  function acharGrupos() {
    const visto = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const grupos = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (visto[r][c] || grade[r][c] === -1) continue;
        const cor = grade[r][c];
        const fila = [[c, r]];
        const grupo = [];
        visto[r][c] = true;
        while (fila.length) {
          const [cc, rr] = fila.pop();
          grupo.push([cc, rr]);
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = cc + dc;
            const nr = rr + dr;
            if (dentro(nc, nr) && !visto[nr][nc] && grade[nr][nc] === cor) {
              visto[nr][nc] = true;
              fila.push([nc, nr]);
            }
          }
        }
        if (grupo.length >= MIN_GRUPO) grupos.push(grupo);
      }
    }
    return grupos;
  }

  function fim() {
    state = STATE.FIM;
    const record = shell.submit(pontos);
    el.nivel.textContent = String(nivel);
    el.combo.textContent = String(comboMax);
    el.score.textContent = A.fmt(pontos);
    el.record.textContent = record ? "🏆 Novo recorde!" : "";
    el.over.classList.remove("hidden");
    A.sfx.over();
  }

  // --------------------------------------------------------------- update

  function update(dt) {
    shake = Math.max(0, shake - dt * 2);

    if (state === STATE.RESOLVE) {
      sumirT -= dt;
      if (sumirT <= 0) {
        for (const s of sumindo) grade[s.r][s.c] = -1;
        sumindo = [];
        resolver();
      }
      return;
    }
    if (state !== STATE.CAI) return;

    const rapido = A.keys.down("ArrowDown", "KeyS");
    queda += dt * (rapido ? 9 : 1);
    if (queda >= intervalo) {
      queda = 0;
      if (descer() && rapido) pontos += 1;
    }
  }

  // -------------------------------------------------------------- desenho

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(A.rand(-1, 1) * shake * 7, A.rand(-1, 1) * shake * 7);

    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, "#121522");
    g.addColorStop(1, "#0b0d14");
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, view.w + 20, view.h + 20);

    // poço
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, cell * COLS, cell * ROWS);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cell, oy);
      ctx.lineTo(ox + c * cell, oy + cell * ROWS);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grade[r][c] !== -1) bloco(c, r, grade[r][c], 1);
      }
    }

    for (const s of sumindo) {
      const t = A.clamp(sumirT / 0.24, 0, 1);
      bloco(s.c, s.r, s.cor, t, true);
    }

    if (state === STATE.CAI && peca) {
      const s = segundo(peca);
      // sombra de onde a peça vai parar
      let fantasma = { ...peca };
      while (cabe({ ...fantasma, r: fantasma.r + 1 })) fantasma.r++;
      const fs = segundo(fantasma);
      bloco(fantasma.c, fantasma.r, peca.a, 0.16);
      bloco(fs.c, fs.r, peca.b, 0.16);

      bloco(peca.c, peca.r, peca.a, 1);
      bloco(s.c, s.r, peca.b, 1);
    }

    ctx.restore();
    hud();
  }

  function bloco(c, r, cor, alfa, brilho) {
    if (r < 0) return;
    const x = ox + c * cell;
    const y = oy + r * cell;
    const p = cell * 0.08;
    ctx.globalAlpha = alfa;
    ctx.fillStyle = CORES[cor % CORES.length];
    ctx.beginPath();
    const rr = cell * 0.2;
    ctx.moveTo(x + p + rr, y + p);
    ctx.arcTo(x + cell - p, y + p, x + cell - p, y + cell - p, rr);
    ctx.arcTo(x + cell - p, y + cell - p, x + p, y + cell - p, rr);
    ctx.arcTo(x + p, y + cell - p, x + p, y + p, rr);
    ctx.arcTo(x + p, y + p, x + cell - p, y + p, rr);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = brilho ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)";
    ctx.fillRect(x + p + rr * 0.4, y + p + cell * 0.09, cell - p * 2 - rr * 0.8, cell * 0.1);
    ctx.globalAlpha = 1;
  }

  function hud() {
    if (state === STATE.MENU) return;
    ctx.font = "700 16px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffce4d";
    ctx.fillText(A.fmt(pontos), 16, 46);
    ctx.fillStyle = "#5ec9a7";
    ctx.fillText("Nível " + nivel, 122, 46);

    // próxima peça
    ctx.textAlign = "right";
    ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#6d6a66";
    ctx.fillText("PRÓXIMA", view.w - 16, 42);
    if (proxima) {
      const s = Math.min(18, cell * 0.5);
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = CORES[(i ? proxima.b : proxima.a) % CORES.length];
        ctx.fillRect(view.w - 16 - s, 58 + i * (s + 3), s, s);
      }
    }

    if (cadeia > 1 && state === STATE.RESOLVE) {
      ctx.textAlign = "center";
      ctx.font = "800 26px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ffb03a";
      ctx.fillText("COMBO x" + cadeia, view.w / 2, view.h * 0.3);
    }
  }

  // -------------------------------------------------------------- entrada

  A.onPress((code) => {
    if ((code === "Enter" || code === "Space") && state !== STATE.CAI && state !== STATE.RESOLVE) return play();
    if (code === "ArrowLeft" || code === "KeyA") mover(-1);
    if (code === "ArrowRight" || code === "KeyD") mover(1);
    if (code === "ArrowUp" || code === "KeyW" || code === "Space") girar();
  });

  // toque: lado esquerdo/direito move, meio gira, arrastar para baixo acelera
  let inicio = null;
  A.bindPointer(view, {
    down(p) {
      if (state !== STATE.CAI) return;
      inicio = p;
    },
    up(p) {
      if (!inicio || !p || state !== STATE.CAI) return (inicio = null);
      const dx = p.x - inicio.x;
      const dy = p.y - inicio.y;
      if (dy > cell * 1.2 && Math.abs(dy) > Math.abs(dx)) {
        while (descer());
      } else if (Math.abs(dx) > cell * 0.5) {
        mover(Math.sign(dx));
      } else {
        girar();
      }
      inicio = null;
    },
  });

  function play() {
    reset();
    state = STATE.CAI;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
  }

  el.play.addEventListener("click", play);
  el.again.addEventListener("click", play);

  layout();
  A.loop(update, draw);
})();
