/**
 * Painel do Atlas IA.
 *
 * Busca /api/analytics uma vez por período escolhido e desenha tudo a partir
 * dessa resposta. Nenhum cálculo pesado acontece aqui: as somas vêm agregadas
 * do Postgres, e o front-end só formata e desenha.
 */

import {
  fmt,
  graficoArea,
  graficoBarrasEmpilhadas,
  graficoBarrasHorizontais,
  sparkline,
  tabelaGemea,
} from "/charts.js";

const el = (id) => document.getElementById(id);

const SERIES_TOKENS = [
  { chave: "entradaNova", rotulo: "Entrada nova" },
  { chave: "cacheLeitura", rotulo: "Lido do cache" },
  { chave: "saida", rotulo: "Saída" },
];

let dadosAtuais = null;
let diasAtuais = 30;

/* ------------------------------------------------------------- indicadores */

/**
 * Cartões-indicadores. `bomSubir` diz se crescer é bom — é o que decide a cor
 * da variação: mais perguntas é ótimo, mais latência não é.
 */
function definirKpis(dados) {
  const i = dados.indicadores;
  return [
    {
      rotulo: "Custo estimado",
      valor: fmt.moeda(i.custoUSD.atual),
      anterior: i.custoUSD.anterior,
      atual: i.custoUSD.atual,
      bomSubir: false,
      nota: `economia de ${fmt.moeda(i.economiaCacheUSD.atual)} com o cache de prompt`,
      serie: dados.serie.map((d) => d.custoUSD),
    },
    {
      rotulo: "Latência média",
      valor: fmt.segundos(i.latenciaMediaMs.atual),
      anterior: i.latenciaMediaMs.anterior,
      atual: i.latenciaMediaMs.atual,
      bomSubir: false,
      nota: `p95 em ${fmt.segundos(i.latenciaP95Ms.atual)}`,
      serie: dados.serie.map((d) => d.latenciaMediaMs ?? 0),
    },
    {
      rotulo: "Cobertura da base",
      valor: fmt.percentual(i.cobertura.atual),
      anterior: i.cobertura.anterior,
      atual: i.cobertura.atual,
      bomSubir: true,
      nota: "perguntas que acharam trecho relevante",
      serie: null,
    },
    {
      rotulo: "Aproveitamento do cache",
      valor: fmt.percentual(i.aproveitamentoCache.atual),
      anterior: i.aproveitamentoCache.anterior,
      atual: i.aproveitamentoCache.atual,
      bomSubir: true,
      nota: "dos tokens de entrada vieram do cache",
      serie: null,
    },
  ];
}

function variacao(atual, anterior) {
  if (atual == null || anterior == null || anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/**
 * A variação nunca depende só da cor: vem sempre com uma seta e o texto
 * "vs. período anterior", então quem não distingue verde de vermelho lê igual.
 */
function montarDelta(atual, anterior, bomSubir) {
  const node = document.createElement("span");
  node.className = "delta";

  const v = variacao(atual, anterior);
  if (v === null) {
    node.classList.add("neutro");
    node.textContent = "sem base de comparação";
    return node;
  }

  const subiu = v > 0;
  const positivo = subiu === bomSubir;
  node.classList.add(Math.abs(v) < 0.005 ? "neutro" : positivo ? "bom" : "ruim");

  const seta = Math.abs(v) < 0.005 ? "→" : subiu ? "↑" : "↓";
  node.textContent = `${seta} ${Math.abs(v * 100).toFixed(1).replace(".", ",")}% vs. período anterior`;
  return node;
}

function renderKpis(dados) {
  const alvo = el("kpis");
  alvo.replaceChildren();

  for (const kpi of definirKpis(dados)) {
    const cartao = document.createElement("article");
    cartao.className = "card kpi";

    const rotulo = document.createElement("p");
    rotulo.className = "kpi-label";
    rotulo.textContent = kpi.rotulo;

    const valor = document.createElement("p");
    valor.className = "kpi-value";
    valor.textContent = kpi.valor;

    const rodape = document.createElement("div");
    rodape.className = "kpi-foot";
    rodape.append(montarDelta(kpi.atual, kpi.anterior, kpi.bomSubir));

    const nota = document.createElement("p");
    nota.className = "kpi-note";
    nota.textContent = kpi.nota;

    cartao.append(rotulo, valor, rodape, nota);

    if (kpi.serie?.some((v) => v > 0)) {
      const caixa = document.createElement("div");
      caixa.className = "kpi-spark";
      cartao.append(caixa);
      sparkline(caixa, kpi.serie);
    }

    alvo.append(cartao);
  }
}

/* ------------------------------------------------------------------ gráficos */

function renderHero(dados) {
  const i = dados.indicadores;
  el("hero-value").textContent = fmt.inteiro(i.perguntas.atual);

  const delta = montarDelta(i.perguntas.atual, i.perguntas.anterior, true);
  el("hero-delta").replaceWith(delta);
  delta.id = "hero-delta";

  el("hero-context").textContent =
    `em ${fmt.inteiro(i.conversas.atual)} conversas · similaridade média ${
      i.similaridadeMedia.atual == null
        ? "—"
        : i.similaridadeMedia.atual.toFixed(2).replace(".", ",")
    }`;

  const spark = el("hero-spark");
  spark.replaceChildren();
  sparkline(spark, dados.serie.map((d) => d.perguntas));
}

function renderVolume(dados) {
  const alvo = el("plot-volume");
  alvo.replaceChildren();

  graficoArea(alvo, {
    pontos: dados.serie.map((d) => ({ dia: d.dia, valor: d.perguntas })),
    rotuloValor: (v) => `${fmt.inteiro(v)} perguntas`,
    descricao: `Perguntas respondidas por dia nos últimos ${dados.periodo.dias} dias.`,
  });

  el("table-volume").replaceChildren(
    tabelaGemea(
      ["Dia", "Perguntas"],
      dados.serie.map((d) => [fmt.diaCurto(d.dia), fmt.inteiro(d.perguntas)]),
    ),
  );
}

function renderTokens(dados) {
  const alvo = el("plot-tokens");
  alvo.replaceChildren();

  const pontos = dados.serie.map((d) => ({
    dia: d.dia,
    entradaNova: d.tokens.entradaNova + d.tokens.cacheEscrita,
    cacheLeitura: d.tokens.cacheLeitura,
    saida: d.tokens.saida,
  }));

  graficoBarrasEmpilhadas(alvo, {
    pontos,
    series: SERIES_TOKENS,
    rotuloValor: fmt.compacto,
    descricao: `Tokens por dia, separados entre entrada nova, leitura de cache e saída.`,
  });

  // Legenda sempre presente quando há duas ou mais séries: a identidade nunca
  // pode depender só de reconhecer a cor.
  const legenda = el("legend-tokens");
  legenda.replaceChildren();
  SERIES_TOKENS.forEach((serie, ordem) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("i");
    swatch.style.background = `var(--series-${ordem + 1})`;
    item.append(swatch, document.createTextNode(serie.rotulo));
    legenda.append(item);
  });

  el("table-tokens").replaceChildren(
    tabelaGemea(
      ["Dia", "Entrada nova", "Lido do cache", "Saída"],
      pontos.map((p) => [
        fmt.diaCurto(p.dia),
        fmt.inteiro(p.entradaNova),
        fmt.inteiro(p.cacheLeitura),
        fmt.inteiro(p.saida),
      ]),
    ),
  );
}

function renderDocumentos(dados) {
  const alvo = el("plot-documentos");
  alvo.replaceChildren();

  if (dados.documentos.length === 0) {
    alvo.append(vazio("Nenhuma resposta citou documentos neste período."));
    el("table-documentos").replaceChildren();
    return;
  }

  graficoBarrasHorizontais(alvo, {
    itens: dados.documentos.map((d) => ({
      rotulo: d.titulo,
      valor: d.citacoes,
      detalhe:
        d.similaridadeMedia == null
          ? null
          : `similaridade média ${d.similaridadeMedia.toFixed(2).replace(".", ",")}`,
    })),
    rotuloValor: fmt.inteiro,
    descricao: "Documentos que mais sustentaram respostas no período.",
  });

  el("table-documentos").replaceChildren(
    tabelaGemea(
      ["Documento", "Citações", "Similaridade média"],
      dados.documentos.map((d) => [
        d.titulo,
        fmt.inteiro(d.citacoes),
        d.similaridadeMedia == null
          ? "—"
          : d.similaridadeMedia.toFixed(2).replace(".", ","),
      ]),
    ),
  );
}

function renderLacunas(dados) {
  const alvo = el("gaps");
  alvo.replaceChildren();

  if (dados.lacunas.length === 0) {
    alvo.append(
      vazio("Nenhuma lacuna no período — toda pergunta encontrou contexto relevante."),
    );
    return;
  }

  const lista = document.createElement("ul");
  lista.className = "gap-list";

  for (const lacuna of dados.lacunas) {
    const item = document.createElement("li");

    const pergunta = document.createElement("p");
    pergunta.className = "gap-question";
    pergunta.textContent = lacuna.pergunta;

    const meta = document.createElement("p");
    meta.className = "gap-meta";
    const qualidade =
      lacuna.melhorSimilaridade == null
        ? "nenhum trecho recuperado"
        : `melhor similaridade ${lacuna.melhorSimilaridade.toFixed(2).replace(".", ",")}`;
    meta.textContent =
      lacuna.ocorrencias > 1
        ? `${fmt.inteiro(lacuna.ocorrencias)}× · ${qualidade}`
        : qualidade;

    item.append(pergunta, meta);
    lista.append(item);
  }

  alvo.append(lista);
}

function vazio(mensagem) {
  const node = document.createElement("p");
  node.className = "empty-note";
  node.textContent = mensagem;
  return node;
}

/* --------------------------------------------------------------- orquestração */

function renderTudo(dados) {
  dadosAtuais = dados;
  renderHero(dados);
  renderKpis(dados);
  renderVolume(dados);
  renderTokens(dados);
  renderDocumentos(dados);
  renderLacunas(dados);

  el("period-note").textContent =
    `${dados.periodo.dias} dias · modelo ${dados.periodo.modelo}`;
}

async function carregar(dias) {
  diasAtuais = dias;
  const conteudo = el("board-content");
  const estado = el("board-state");

  // Em refetch, o painel anterior fica visível esmaecido: sem "esqueleto"
  // piscando e sem a página pulando de altura.
  if (dadosAtuais) conteudo.classList.add("recarregando");
  else estado.textContent = "Carregando o painel…";

  try {
    const resposta = await fetch(`/api/analytics?dias=${dias}`);
    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo.error ?? `Erro ${resposta.status}`);

    // Revela o painel ANTES de desenhar: um container `hidden` tem largura
    // zero, e os gráficos são gerados no tamanho real do elemento.
    conteudo.hidden = false;
    estado.hidden = true;
    renderTudo(corpo);
  } catch (erro) {
    estado.hidden = false;
    estado.className = "board-state erro";
    estado.textContent = `Não foi possível carregar o painel: ${erro.message}`;
  } finally {
    conteudo.classList.remove("recarregando");
  }
}

/* -------------------------------------------------------------------- eventos */

document.querySelectorAll(".period button").forEach((botao) => {
  botao.addEventListener("click", () => {
    document
      .querySelectorAll(".period button")
      .forEach((outro) => outro.classList.toggle("active", outro === botao));
    carregar(Number(botao.dataset.dias));
  });
});

// Alternância gráfico ↔ tabela: a tabela é a leitura garantida de todo valor.
document.querySelectorAll(".toggle").forEach((botao) => {
  botao.addEventListener("click", () => {
    const alvo = botao.dataset.target;
    const tabela = el(`table-${alvo}`);
    const grafico = el(`plot-${alvo}`);
    const mostrandoTabela = tabela.hidden;

    tabela.hidden = !mostrandoTabela;
    grafico.hidden = mostrandoTabela;
    botao.textContent = mostrandoTabela ? "Ver gráfico" : "Ver tabela";

    const legenda = el(`legend-${alvo}`);
    if (legenda) legenda.hidden = mostrandoTabela;
  });
});

// Redesenha nas mudanças de largura — o SVG é gerado no tamanho real, sem
// esticar o texto junto.
let redesenho;
window.addEventListener("resize", () => {
  if (!dadosAtuais) return;
  clearTimeout(redesenho);
  redesenho = setTimeout(() => renderTudo(dadosAtuais), 180);
});

// O tema troca as cores das marcas, então os gráficos precisam ser redesenhados.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (dadosAtuais) renderTudo(dadosAtuais);
});

(async function init() {
  try {
    const saude = await (await fetch("/api/health")).json();
    el("assistant-name").textContent = saude.assistantName ?? "Atlas";
    el("model-name").textContent = saude.model ?? "";
    if (saude.missing?.length) {
      el("model-name").textContent = "configuração incompleta";
    }
  } catch {
    el("model-name").textContent = "API indisponível";
  }
  carregar(diasAtuais);
})();
