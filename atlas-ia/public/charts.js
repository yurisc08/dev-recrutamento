/**
 * Gráficos em SVG puro — sem bibliotecas.
 *
 * Por que na mão: o Worker serve os arquivos estáticos direto, sem etapa de
 * build e sem CDN. Uma biblioteca de gráficos custaria centenas de KB para
 * desenhar três formas. Aqui cada função devolve um <svg> e um <table>
 * equivalente, que é a versão acessível do mesmo dado.
 *
 * Convenções visuais (valem para todos os gráficos):
 *   · marcas finas: linha de 2px, barra de no máximo 24px, ponto de raio ≥ 4
 *   · topo da barra arredondado em 4px, base quadrada na linha de base
 *   · 2px de respiro na cor da superfície separando marcas que se tocam
 *   · grade e eixos em fio de 1px, sólidos, um passo abaixo da superfície
 *   · rótulo direto só no ponto que importa — nunca um número em cada marca
 *   · texto sempre em tom de tinta, nunca na cor da série
 */

const NS = "http://www.w3.org/2000/svg";

/* ------------------------------------------------------------ formatação */

const nf = new Intl.NumberFormat("pt-BR");

export const fmt = {
  inteiro: (v) => nf.format(Math.round(v)),

  /** 1.284 · 12,9 mil · 1,3 mi — para eixos e valores compactos. */
  compacto(v) {
    const n = Math.abs(v);
    if (n >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    if (n >= 10_000) return `${(v / 1000).toFixed(1).replace(".", ",")} mil`;
    if (n >= 1000) return nf.format(Math.round(v));
    return nf.format(v);
  },

  moeda: (v) =>
    v >= 100
      ? `US$ ${nf.format(Math.round(v))}`
      : `US$ ${v.toFixed(2).replace(".", ",")}`,

  percentual: (v) =>
    v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`,

  segundos: (ms) =>
    ms == null ? "—" : `${(ms / 1000).toFixed(1).replace(".", ",")} s`,

  diaCurto(iso) {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  },
};

/* ---------------------------------------------------------------- escalas */

/**
 * Arredonda o topo do eixo para um número limpo (0 / 500 / 1.000…) e devolve
 * as marcações. Eixo terminando em "1.237" é ruído; em "1.500" se lê de relance.
 */
function escalaLimpa(maximo, alvoDeMarcas = 4) {
  if (!(maximo > 0)) return { topo: 1, marcas: [0, 1] };

  const bruto = maximo / alvoDeMarcas;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= bruto) * magnitude;

  const topo = Math.ceil(maximo / passo) * passo;
  const marcas = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) marcas.push(v);
  return { topo, marcas };
}


/**
 * Escolhe quais índices do eixo x recebem rótulo.
 *
 * Quantos cabem sai da largura real do gráfico, não de um número fixo: o mesmo
 * eixo tem espaço para seis datas no desktop e para três no celular. O último
 * ponto é sempre rotulado, e os anteriores só entram se não encostarem nele —
 * data sobreposta não fica "apertada", fica ilegível.
 */
function indicesComRotulo(total, larguraPorPonto, larguraPlot, larguraRotulo = 62) {
  if (total === 0) return [];
  const ultimo = total - 1;

  const cabem = Math.max(2, Math.floor(larguraPlot / (larguraRotulo + 14)));
  const passo = Math.max(1, Math.ceil(total / cabem));
  // Distância mínima entre o centro de um rótulo e o do último: metade da
  // largura deste + a largura inteira daquele (ancorado à direita) + respiro.
  const folga = larguraRotulo * 1.5 + 8;

  const escolhidos = [];
  for (let i = 0; i < ultimo; i += passo) {
    if ((ultimo - i) * larguraPorPonto >= folga) escolhidos.push(i);
  }
  escolhidos.push(ultimo);
  return escolhidos;
}

/* ------------------------------------------------------------- utilitários */

function svgEl(nome, atributos = {}) {
  const node = document.createElementNS(NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor !== null && valor !== undefined) node.setAttribute(chave, String(valor));
  }
  return node;
}

function texto(conteudo, atributos) {
  const node = svgEl("text", atributos);
  node.textContent = conteudo;
  return node;
}

/**
 * Corta um rótulo longo para caber na coluna reservada. Texto que invade a
 * área do gráfico é pior do que texto abreviado — o nome inteiro continua
 * disponível no <title>, no tooltip e na tabela.
 */
function recortar(texto, larguraDisponivel) {
  const maximo = Math.max(8, Math.floor((larguraDisponivel - 16) / 6.6));
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

/** Caminho de retângulo com o topo arredondado e a base quadrada. */
function barraArredondada(x, y, largura, altura, raio = 4) {
  const r = Math.max(0, Math.min(raio, largura / 2, altura));
  return [
    `M${x} ${y + altura}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    `H${x + largura - r}`,
    `A${r} ${r} 0 0 1 ${x + largura} ${y + r}`,
    `V${y + altura}`,
    "Z",
  ].join(" ");
}

function lerToken(nome, fallback) {
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(nome)
    .trim();
  return valor || fallback;
}

/** Tokens de cor lidos do CSS, para o gráfico acompanhar o tema. */
function tokens() {
  return {
    superficie: lerToken("--surface-1", "#ffffff"),
    grade: lerToken("--viz-grid", "#e2e5eb"),
    eixo: lerToken("--viz-axis", "#c3c2b7"),
    tintaFraca: lerToken("--viz-muted", "#898781"),
    tintaSecundaria: lerToken("--text-dim", "#52514e"),
    tintaPrimaria: lerToken("--text", "#0b0b0b"),
    serie: [
      lerToken("--series-1", "#2a78d6"),
      lerToken("--series-2", "#1baf7a"),
      lerToken("--series-3", "#eb6834"),
    ],
  };
}

/* -------------------------------------------------------------- tooltip */

function criarTooltip(hospedeiro) {
  const node = document.createElement("div");
  node.className = "viz-tooltip";
  node.setAttribute("role", "status");
  node.hidden = true;
  hospedeiro.append(node);

  return {
    mostrar(html, x, y) {
      node.innerHTML = html;
      node.hidden = false;
      const caixa = node.getBoundingClientRect();
      const limite = hospedeiro.clientWidth;
      const esquerda = Math.max(4, Math.min(x - caixa.width / 2, limite - caixa.width - 4));
      node.style.transform = `translate(${esquerda}px, ${y}px)`;
    },
    esconder() {
      node.hidden = true;
    },
  };
}

/* --------------------------------------------------------- tabela gêmea */

/**
 * Toda visualização vem com uma tabela equivalente. Não é um extra: é o que
 * garante que nenhum valor dependa de enxergar cor ou de passar o mouse.
 */
export function tabelaGemea(colunas, linhas) {
  const tabela = document.createElement("table");
  tabela.className = "viz-table";

  const thead = document.createElement("thead");
  const trCabecalho = document.createElement("tr");
  for (const coluna of colunas) {
    const th = document.createElement("th");
    th.textContent = coluna;
    trCabecalho.append(th);
  }
  thead.append(trCabecalho);

  const tbody = document.createElement("tbody");
  for (const linha of linhas) {
    const tr = document.createElement("tr");
    for (const celula of linha) {
      const td = document.createElement("td");
      td.textContent = celula;
      tr.append(td);
    }
    tbody.append(tr);
  }

  tabela.append(thead, tbody);
  return tabela;
}

/* ============================================================ ÁREA + LINHA */

/**
 * Uma série ao longo do tempo. Sem legenda de propósito: com uma cor só, o
 * título do cartão já diz o que está plotado, e uma caixa de legenda com um
 * único quadradinho só repete o título e come espaço.
 */
export function graficoArea(hospedeiro, { pontos, rotuloValor = fmt.inteiro, descricao }) {
  const largura = hospedeiro.clientWidth || 640;
  const altura = 240;
  const margem = { topo: 18, direita: 16, baixo: 28, esquerda: 44 };
  const t = tokens();

  const larguraPlot = Math.max(largura - margem.esquerda - margem.direita, 10);
  const alturaPlot = altura - margem.topo - margem.baixo;

  const valores = pontos.map((p) => p.valor);
  const { topo, marcas } = escalaLimpa(Math.max(...valores, 1));

  const x = (i) =>
    margem.esquerda +
    (pontos.length === 1 ? larguraPlot / 2 : (i / (pontos.length - 1)) * larguraPlot);
  const y = (v) => margem.topo + alturaPlot - (v / topo) * alturaPlot;

  const svg = svgEl("svg", {
    width: largura,
    height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    role: "img",
    "aria-label": descricao,
  });

  // Grade: fio de 1px, sólido, recuado — nunca tracejado.
  for (const marca of marcas) {
    svg.append(
      svgEl("line", {
        x1: margem.esquerda,
        x2: largura - margem.direita,
        y1: y(marca),
        y2: y(marca),
        stroke: marca === 0 ? t.eixo : t.grade,
        "stroke-width": 1,
      }),
    );
    svg.append(
      texto(fmt.compacto(marca), {
        x: margem.esquerda - 8,
        y: y(marca) + 4,
        "text-anchor": "end",
        class: "viz-tick",
        fill: t.tintaFraca,
      }),
    );
  }

  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.valor)}`).join(" ");

  // A área é um banho de ~10% da cor da série, nunca um bloco saturado.
  svg.append(
    svgEl("path", {
      d: `${linha} L${x(pontos.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`,
      fill: t.serie[0],
      "fill-opacity": 0.1,
    }),
  );
  svg.append(
    svgEl("path", {
      d: linha,
      fill: "none",
      stroke: t.serie[0],
      "stroke-width": 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }),
  );

  // Rótulo direto só na ponta: é o valor que o leitor procura primeiro.
  const ultimo = pontos.at(-1);
  svg.append(
    svgEl("circle", {
      cx: x(pontos.length - 1),
      cy: y(ultimo.valor),
      r: 4,
      fill: t.serie[0],
      stroke: t.superficie,
      "stroke-width": 2,
    }),
  );

  // Marcações do eixo x: só algumas, e nenhuma encostando na última.
  const espacoPorPonto = larguraPlot / Math.max(pontos.length - 1, 1);
  for (const i of indicesComRotulo(pontos.length, espacoPorPonto, larguraPlot)) {
    svg.append(
      texto(fmt.diaCurto(pontos[i].dia), {
        x: x(i),
        y: altura - 8,
        "text-anchor": i === pontos.length - 1 ? "end" : "middle",
        class: "viz-tick",
        fill: t.tintaFraca,
      }),
    );
  }

  // Camada de leitura: fio vertical + ponto + tooltip, com teclado no mesmo caminho.
  const foco = svgEl("g", { opacity: 0 });
  const fio = svgEl("line", {
    y1: margem.topo,
    y2: margem.topo + alturaPlot,
    stroke: t.eixo,
    "stroke-width": 1,
  });
  const pontoFoco = svgEl("circle", {
    r: 5,
    fill: t.serie[0],
    stroke: t.superficie,
    "stroke-width": 2,
  });
  foco.append(fio, pontoFoco);
  svg.append(foco);

  const tooltip = criarTooltip(hospedeiro);
  let indiceAtual = pontos.length - 1;

  const destacar = (i) => {
    indiceAtual = Math.max(0, Math.min(i, pontos.length - 1));
    const ponto = pontos[indiceAtual];
    foco.setAttribute("opacity", 1);
    fio.setAttribute("x1", x(indiceAtual));
    fio.setAttribute("x2", x(indiceAtual));
    pontoFoco.setAttribute("cx", x(indiceAtual));
    pontoFoco.setAttribute("cy", y(ponto.valor));
    tooltip.mostrar(
      `<strong>${fmt.diaCurto(ponto.dia)}</strong><span class="viz-row"><b>${rotuloValor(ponto.valor)}</b></span>`,
      x(indiceAtual),
      Math.max(y(ponto.valor) - 56, 0),
    );
  };

  const limpar = () => {
    foco.setAttribute("opacity", 0);
    tooltip.esconder();
  };

  svg.addEventListener("pointermove", (evento) => {
    const caixa = svg.getBoundingClientRect();
    const posicao = evento.clientX - caixa.left - margem.esquerda;
    const passo = larguraPlot / Math.max(pontos.length - 1, 1);
    destacar(Math.round(posicao / passo));
  });
  svg.addEventListener("pointerleave", limpar);

  svg.setAttribute("tabindex", "0");
  svg.addEventListener("focus", () => destacar(indiceAtual));
  svg.addEventListener("blur", limpar);
  svg.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowRight") destacar(indiceAtual + 1);
    else if (evento.key === "ArrowLeft") destacar(indiceAtual - 1);
    else return;
    evento.preventDefault();
  });

  hospedeiro.prepend(svg);
  return svg;
}

/* ========================================================= BARRAS EMPILHADAS */

/**
 * Várias séries que somam um total por dia. As séries se tocam, então a
 * separação vem de 2px de respiro na cor da superfície — nunca de um contorno
 * desenhado em volta da marca.
 */
export function graficoBarrasEmpilhadas(
  hospedeiro,
  { pontos, series, rotuloValor = fmt.compacto, descricao },
) {
  const largura = hospedeiro.clientWidth || 640;
  const altura = 240;
  const margem = { topo: 24, direita: 16, baixo: 28, esquerda: 44 };
  const t = tokens();

  const larguraPlot = Math.max(largura - margem.esquerda - margem.direita, 10);
  const alturaPlot = altura - margem.topo - margem.baixo;

  const totais = pontos.map((p) => series.reduce((soma, s) => soma + p[s.chave], 0));
  const { topo, marcas } = escalaLimpa(Math.max(...totais, 1));

  const faixa = larguraPlot / pontos.length;
  const larguraBarra = Math.min(24, Math.max(faixa - 4, 2));
  const y = (v) => margem.topo + alturaPlot - (v / topo) * alturaPlot;

  const svg = svgEl("svg", {
    width: largura,
    height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    role: "img",
    "aria-label": descricao,
  });

  for (const marca of marcas) {
    svg.append(
      svgEl("line", {
        x1: margem.esquerda,
        x2: largura - margem.direita,
        y1: y(marca),
        y2: y(marca),
        stroke: marca === 0 ? t.eixo : t.grade,
        "stroke-width": 1,
      }),
    );
    svg.append(
      texto(fmt.compacto(marca), {
        x: margem.esquerda - 8,
        y: y(marca) + 4,
        "text-anchor": "end",
        class: "viz-tick",
        fill: t.tintaFraca,
      }),
    );
  }

  const RESPIRO = 2;
  const indiceMaximo = totais.indexOf(Math.max(...totais));

  pontos.forEach((ponto, i) => {
    const x = margem.esquerda + i * faixa + (faixa - larguraBarra) / 2;
    let base = y(0);

    series.forEach((serie, ordem) => {
      const valor = ponto[serie.chave];
      if (!(valor > 0)) return;

      const alturaBruta = (valor / topo) * alturaPlot;
      // O respiro sai da altura do segmento, não do espaço entre as barras.
      const alturaSegmento = Math.max(alturaBruta - RESPIRO, 1);
      const y0 = base - alturaBruta;
      const ehTopo = series
        .slice(ordem + 1)
        .every((posterior) => !(ponto[posterior.chave] > 0));

      svg.append(
        svgEl("path", {
          d: ehTopo
            ? barraArredondada(x, y0, larguraBarra, alturaSegmento, 4)
            : `M${x} ${y0} h${larguraBarra} v${alturaSegmento} h${-larguraBarra} Z`,
          fill: t.serie[ordem % t.serie.length],
        }),
      );

      base = y0;
    });
  });

  // Rótulo direto só no dia de maior volume — o extremo é o que vale marcar.
  if (totais[indiceMaximo] > 0) {
    svg.append(
      texto(rotuloValor(totais[indiceMaximo]), {
        x: margem.esquerda + indiceMaximo * faixa + faixa / 2,
        y: y(totais[indiceMaximo]) - 8,
        "text-anchor": "middle",
        class: "viz-label",
        fill: t.tintaSecundaria,
      }),
    );
  }

  for (const i of indicesComRotulo(pontos.length, faixa, larguraPlot)) {
    svg.append(
      texto(fmt.diaCurto(pontos[i].dia), {
        x: margem.esquerda + i * faixa + faixa / 2,
        y: altura - 8,
        "text-anchor": i === pontos.length - 1 ? "end" : "middle",
        class: "viz-tick",
        fill: t.tintaFraca,
      }),
    );
  }

  // Área de acerto do mouse cobre a coluna inteira, não só a barra fina.
  const tooltip = criarTooltip(hospedeiro);
  pontos.forEach((ponto, i) => {
    const alvo = svgEl("rect", {
      x: margem.esquerda + i * faixa,
      y: margem.topo,
      width: faixa,
      height: alturaPlot,
      fill: "transparent",
    });
    alvo.addEventListener("pointerenter", () => {
      // Uma linha por série: chave colorida à esquerda, valor à direita.
      const linhas = series
        .map(
          (serie, ordem) =>
            `<span class="viz-row"><span class="viz-key"><i style="background:${t.serie[ordem % t.serie.length]}"></i>${serie.rotulo}</span><b>${rotuloValor(ponto[serie.chave])}</b></span>`,
        )
        .join("");
      tooltip.mostrar(
        `<strong>${fmt.diaCurto(ponto.dia)}</strong>${linhas}`,
        margem.esquerda + i * faixa + faixa / 2,
        Math.max(y(totais[i]) - 96, 0),
      );
    });
    alvo.addEventListener("pointerleave", () => tooltip.esconder());
    svg.append(alvo);
  });

  hospedeiro.prepend(svg);
  return svg;
}

/* ============================================================ BARRAS HORIZONTAIS */

/**
 * Comparação de magnitude entre categorias sem ordem natural (documentos).
 * Todas as barras usam a mesma cor de propósito: pintar cada uma de um tom
 * diferente conforme o tamanho repetiria em cor o que o comprimento já diz.
 */
export function graficoBarrasHorizontais(
  hospedeiro,
  { itens, rotuloValor = fmt.inteiro, descricao },
) {
  const largura = hospedeiro.clientWidth || 640;
  const alturaFaixa = 34;
  const margem = { topo: 6, direita: 56, baixo: 6, esquerda: 0 };
  const altura = margem.topo + itens.length * alturaFaixa + margem.baixo;
  const t = tokens();

  const larguraRotulo = Math.min(200, Math.max(120, Math.round(largura * 0.34)));
  const larguraPlot = Math.max(largura - larguraRotulo - margem.direita, 10);
  const maximo = Math.max(...itens.map((i) => i.valor), 1);

  const svg = svgEl("svg", {
    width: largura,
    height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    role: "img",
    "aria-label": descricao,
  });

  const tooltip = criarTooltip(hospedeiro);
  const ALTURA_BARRA = 14;

  itens.forEach((item, i) => {
    const y = margem.topo + i * alturaFaixa;
    const comprimento = Math.max((item.valor / maximo) * larguraPlot, 2);

    // Rotulo da categoria, com <title> para o nome completo quando cortado.
    const rotulo = texto(recortar(item.rotulo, larguraRotulo), {
      x: 0,
      y: y + alturaFaixa / 2 + 4,
      class: "viz-cat",
      fill: t.tintaSecundaria,
    });
    const titulo = svgEl("title");
    titulo.textContent = item.rotulo;
    rotulo.append(titulo);
    svg.append(rotulo);

    svg.append(
      svgEl("path", {
        // Barra horizontal: ponta arredondada, base quadrada no eixo.
        d: `M${larguraRotulo} ${y + (alturaFaixa - ALTURA_BARRA) / 2}
            h${comprimento - 4}
            a4 4 0 0 1 4 4
            v${ALTURA_BARRA - 8}
            a4 4 0 0 1 -4 4
            h${-(comprimento - 4)} Z`.replace(/\s+/g, " "),
        fill: t.serie[0],
      }),
    );

    // Valor na ponta da barra, fora dela: nunca corre o risco de ser cortado.
    svg.append(
      texto(rotuloValor(item.valor), {
        x: larguraRotulo + comprimento + 8,
        y: y + alturaFaixa / 2 + 4,
        class: "viz-label",
        fill: t.tintaSecundaria,
      }),
    );

    const alvo = svgEl("rect", {
      x: 0,
      y,
      width: largura,
      height: alturaFaixa,
      fill: "transparent",
    });
    alvo.addEventListener("pointerenter", () => {
      tooltip.mostrar(
        `<strong>${item.rotulo}</strong><span class="viz-row"><b>${rotuloValor(item.valor)}</b></span>${
          item.detalhe ? `<span class="viz-row">${item.detalhe}</span>` : ""
        }`,
        Math.min(larguraRotulo + comprimento, largura - 80),
        Math.max(y - 8, 0),
      );
    });
    alvo.addEventListener("pointerleave", () => tooltip.esconder());
    svg.append(alvo);
  });

  hospedeiro.prepend(svg);
  return svg;
}

/* =================================================================== SPARKLINE */

/** Linha mínima do cartão-indicador: contexto, não leitura precisa. */
export function sparkline(hospedeiro, valores) {
  const largura = 88;
  const altura = 28;
  const t = tokens();

  if (valores.length < 2) return null;

  const maximo = Math.max(...valores, 1);
  const minimo = Math.min(...valores, 0);
  const faixa = maximo - minimo || 1;

  const x = (i) => (i / (valores.length - 1)) * (largura - 4) + 2;
  const y = (v) => altura - 3 - ((v - minimo) / faixa) * (altura - 6);

  const svg = svgEl("svg", {
    width: largura,
    height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    "aria-hidden": "true",
    focusable: "false",
  });

  svg.append(
    svgEl("path", {
      d: valores.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(v)}`).join(" "),
      fill: "none",
      // A linha fica em tom neutro; só o ponto final usa a cor de destaque.
      stroke: t.tintaFraca,
      "stroke-width": 1.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      opacity: 0.75,
    }),
  );

  svg.append(
    svgEl("circle", {
      cx: x(valores.length - 1),
      cy: y(valores.at(-1)),
      r: 2.5,
      fill: t.serie[0],
    }),
  );

  hospedeiro.append(svg);
  return svg;
}
