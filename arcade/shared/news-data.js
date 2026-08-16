/* Magicine - matérias do site.
   =========================================================================
   Este arquivo é a sua "redação" enquanto o Supabase não entra. Cada objeto
   vira um card na home e uma página em /noticias/artigo.html?slug=...

   Campos:
     slug          identificador na URL (sem acento, sem espaço) - OBRIGATÓRIO
     title         título da matéria                             - OBRIGATÓRIO
     excerpt       uma ou duas frases de chamada
     category      "Cinema", "Séries", "Games"... (vira filtro sozinho)
     tags          lista de palavras-chave, usada na busca
     author        quem assina
     published_at  "AAAA-MM-DD"
     cover         caminho ou URL da imagem de capa (opcional)
     featured      true coloca a matéria em destaque na home
     status        "draft" esconde do site
     body          blocos do texto:
                     { type: "p",     text: "..." }
                     { type: "h2",    text: "..." }
                     { type: "quote", text: "...", cite: "..." }
                     { type: "list",  items: ["...", "..."] }
                     { type: "img",   src: "...", alt: "...", caption: "..." }

   As três matérias abaixo são EXEMPLOS para você ver o layout funcionando.
   Apague quando publicar as suas. Escreva sempre texto próprio: copiar de
   outro site é violação de direito autoral e o AdSense recusa conteúdo
   copiado.
   ========================================================================= */
window.MAGICINE_POSTS = [
  {
    slug: "como-publicar-no-magicine",
    title: "Como publicar a sua primeira matéria no Magicine",
    excerpt:
      "Um passeio pelo formato de blocos que monta as páginas — e o caminho para trocar este arquivo pelo Supabase quando o volume crescer.",
    category: "Bastidores",
    tags: ["tutorial", "supabase", "publicação"],
    author: "Equipe Magicine",
    published_at: "2026-08-16",
    featured: true,
    body: [
      {
        type: "p",
        text: "Esta página não foi montada à mão. Ela nasceu de um objeto JavaScript dentro de shared/news-data.js, e o mesmo objeto gerou o card que você clicou na home. É esse o combinado do site: você escreve o conteúdo, o layout se monta sozinho.",
      },
      { type: "h2", text: "O texto é uma lista de blocos" },
      {
        type: "p",
        text: "Em vez de HTML solto, cada matéria tem um campo body com blocos identificados por tipo. Parágrafo é p, subtítulo é h2, citação é quote, e assim por diante. A vantagem aparece mais adiante: esse mesmo formato cabe numa coluna jsonb do Supabase sem nenhuma conversão.",
      },
      {
        type: "list",
        items: [
          "p — um parágrafo comum, como este",
          "h2 — um subtítulo para quebrar a leitura",
          "quote — um destaque com autoria opcional",
          "list — uma lista como esta aqui",
          "img — uma imagem com legenda",
        ],
      },
      { type: "h2", text: "Quando migrar para o Supabase" },
      {
        type: "p",
        text: "Enquanto forem poucas matérias por semana, editar o arquivo e publicar resolve. A troca vale a pena quando você quiser escrever de outro computador, ter mais de uma pessoa publicando, ou agendar publicações. O README traz o SQL da tabela e o passo a passo: são duas linhas para trocar em shared/news.js.",
      },
      {
        type: "quote",
        text: "O site inteiro conversa com uma única camada de dados. Trocar a fonte não deveria exigir mexer em nenhuma página — e não exige.",
        cite: "shared/news.js",
      },
    ],
  },
  {
    slug: "anatomia-de-uma-boa-critica",
    title: "Anatomia de uma boa crítica de série",
    excerpt:
      "O que separa um texto que ajuda o leitor a decidir de um que só conta a história de novo — cinco escolhas que fazem a diferença.",
    category: "Séries",
    tags: ["crítica", "escrita", "guia"],
    author: "Equipe Magicine",
    published_at: "2026-08-14",
    featured: true,
    body: [
      {
        type: "p",
        text: "Toda crítica responde, no fundo, a uma pergunta prática: vale o meu tempo? O texto pode ser bonito, erudito e bem construído, mas se o leitor termina sem saber disso, ele não fez o trabalho.",
      },
      { type: "h2", text: "Resumo não é análise" },
      {
        type: "p",
        text: "O erro mais comum é gastar dois terços do texto recontando o enredo. O leitor já viu a sinopse. O que ele não tem é o seu julgamento sobre o que a obra tentou fazer e se conseguiu.",
      },
      { type: "h2", text: "Diga de onde você está falando" },
      {
        type: "p",
        text: "Quem detesta terror vai avaliar um terror de forma diferente de quem ama o gênero. Deixar isso claro não enfraquece o texto: dá ao leitor a régua para calibrar a sua opinião contra o gosto dele.",
      },
      {
        type: "list",
        items: [
          "Diga cedo se recomenda ou não — sem enrolar até o último parágrafo",
          "Sustente cada elogio ou crítica com uma cena concreta",
          "Avise sobre spoilers antes, nunca depois",
          "Separe o que é defeito do que é só não ser para você",
          "Termine dizendo para quem a obra serve",
        ],
      },
      {
        type: "p",
        text: "Nenhuma dessas regras é obrigatória. Mas quando um texto não está funcionando, quase sempre é porque uma delas foi ignorada.",
      },
    ],
  },
  {
    slug: "cinco-marcas-da-fantasia",
    title: "Cinco marcas que quase toda fantasia carrega",
    excerpt:
      "Do mundo com regras próprias ao mentor que sai de cena na hora certa: os elementos que se repetem no gênero e por que continuam funcionando.",
    category: "Cinema",
    tags: ["fantasia", "gênero", "análise"],
    author: "Equipe Magicine",
    published_at: "2026-08-11",
    featured: false,
    body: [
      {
        type: "p",
        text: "Fantasia é um dos gêneros mais antigos que existem, e talvez por isso tenha desenvolvido um repertório tão reconhecível. Não são regras — são ferramentas que funcionam, e por isso voltam.",
      },
      { type: "h2", text: "1. Um mundo com regras que não se quebram" },
      {
        type: "p",
        text: "Magia sem limite não gera tensão. As obras que ficam são as que estabelecem cedo o que é possível e, principalmente, o que custa caro — e depois respeitam isso até o fim.",
      },
      { type: "h2", text: "2. O mentor que precisa sair de cena" },
      {
        type: "p",
        text: "Alguém experiente aparece para ensinar e, em algum momento, some. A função é estrutural: enquanto o mentor está por perto, o protagonista não é obrigado a decidir sozinho.",
      },
      { type: "h2", text: "3. Um objeto que concentra o conflito" },
      {
        type: "p",
        text: "Uma espada, um mapa, uma joia. O objeto dá forma física a uma disputa que seria abstrata, e cria um lugar concreto para a câmera apontar.",
      },
      { type: "h2", text: "4. A travessia" },
      {
        type: "p",
        text: "Quase sempre há um limite geográfico que separa o conhecido do perigoso. Atravessá-lo marca o ponto sem volta melhor do que qualquer diálogo faria.",
      },
      { type: "h2", text: "5. Um preço que não é revertido" },
      {
        type: "p",
        text: "As fantasias mais lembradas cobram alguma coisa que não volta. É o que separa uma aventura de uma história — e é a marca mais difícil de acertar.",
      },
    ],
  },
];
