/* Magicine - matérias do site.
   =========================================================================
   Esta é a sua redação enquanto o Supabase não entra. Cada objeto vira um
   card na home e uma página em /noticias/artigo.html?slug=...

   Campos:
     slug          endereço na URL (sem acento, sem espaço)   - OBRIGATÓRIO
     title         título                                      - OBRIGATÓRIO
     excerpt       uma ou duas frases de chamada
     category      "Cinema" | "Séries" | "Games" | "Anime" | "Quadrinhos" | "Bastidores"
     tags          palavras-chave, usadas na busca
     author        quem assina
     published_at  "AAAA-MM-DD"
     cover         caminho ou URL da imagem (opcional; sem ela entra um
                   fundo gerado com a cor da editoria)
     featured      true manda para a capa
     status        "draft" esconde do site
     body          blocos: p | h2 | quote | list | img

   As matérias abaixo são textos originais escritos para este site, de
   análise atemporal — servem para o site não nascer vazio e para você ver
   o layout cheio. Edite, reaproveite ou apague à vontade.
   ========================================================================= */
window.MAGICINE_POSTS = [
  {
    slug: "terceiro-ato-onde-os-filmes-desabam",
    title: "O terceiro ato é onde quase todo filme desaba",
    excerpt:
      "Roteiros que passam duas horas construindo uma pergunta interessante costumam gastar os últimos vinte minutos respondendo a pergunta errada.",
    category: "Cinema",
    tags: ["roteiro", "análise", "estrutura"],
    author: "Redação Magicine",
    published_at: "2026-08-16",
    featured: true,
    body: [
      {
        type: "p",
        text: "Existe um padrão que fica difícil de ignorar depois que você repara nele: filmes que funcionam muito bem até os dois terços frequentemente escorregam no trecho final. Não é falta de orçamento nem pressa de montagem. É uma troca de perguntas.",
      },
      { type: "h2", text: "A pergunta dramática e a pergunta logística" },
      {
        type: "p",
        text: "Um bom primeiro ato instala uma pergunta dramática: essa pessoa vai conseguir perdoar o irmão? ela vai admitir que estava errada? o grupo sobrevive junto ou se estilhaça? São perguntas sobre gente. O terceiro ato, com uma frequência incômoda, responde outra coisa: quem vence a luta, se o botão é apertado a tempo, se a nave escapa.",
      },
      {
        type: "p",
        text: "A troca acontece porque a pergunta logística é mais fácil de filmar. Ela tem cronômetro, tem lugar, tem efeito visual. A pergunta dramática precisa de uma cena em que duas pessoas conversam — e isso assusta produção.",
      },
      { type: "h2", text: "O sintoma: o clímax que poderia ser trocado" },
      {
        type: "p",
        text: "Um teste rápido: se o clímax do filme pudesse ser transplantado para outro filme do mesmo gênero sem que nada se perdesse, ele não é o clímax daquela história. É só uma sequência de ação ocupando o lugar dela.",
      },
      {
        type: "quote",
        text: "O final não precisa ser grande. Precisa ser sobre a mesma coisa que o começo prometeu.",
      },
      { type: "h2", text: "Quando dá certo" },
      {
        type: "p",
        text: "Os terceiros atos que ficam na memória quase sempre resolvem as duas perguntas ao mesmo tempo, e usam a logística como veículo da emoção. A escolha física que o protagonista faz sob pressão é a resposta à pergunta dramática — não um evento paralelo a ela.",
      },
      {
        type: "list",
        items: [
          "A decisão final custa alguma coisa ao protagonista",
          "A habilidade usada foi estabelecida antes, e não aparece do nada",
          "Alguém muda de ideia sobre outra pessoa, não só sobre o plano",
          "O antagonista perde por um motivo ligado ao tema, não por azar",
        ],
      },
      {
        type: "p",
        text: "Nada disso exige menos ação. Exige que a ação signifique algo — e isso é decidido no roteiro, muito antes de qualquer explosão entrar no orçamento.",
      },
    ],
  },
  {
    slug: "por-que-esquecemos-o-meio-da-temporada",
    title: "Por que você lembra do piloto e esquece o meio da temporada",
    excerpt:
      "A memória de uma série não é distribuída por igual: ela se concentra no começo, no fim e nos episódios que quebram a rotina — e os roteiristas sabem disso.",
    category: "Séries",
    tags: ["séries", "estrutura", "análise"],
    author: "Redação Magicine",
    published_at: "2026-08-15",
    featured: true,
    body: [
      {
        type: "p",
        text: "Peça a alguém para resumir uma série que a pessoa amou e observe o que sai: o piloto, um ou dois episódios do meio e o final. O resto vira um bloco indistinto de \"aí acontecem umas coisas\". Isso não é defeito de quem assiste.",
      },
      { type: "h2", text: "O meio existe para sustentar, não para brilhar" },
      {
        type: "p",
        text: "Uma temporada é montada com funções diferentes por episódio. O piloto vende o mundo. O final paga a promessa. Os episódios do meio, na maior parte, mantêm as peças em movimento: aproximam personagens, plantam informação que só será usada depois, testam relações. É trabalho de fundação, e fundação não aparece na foto.",
      },
      { type: "h2", text: "Os que escapam" },
      {
        type: "p",
        text: "Os episódios do meio que grudam são quase sempre os que quebram a fórmula: um capítulo inteiro em um único cenário, um que muda de ponto de vista, um que salta no tempo, um que abandona a trama principal para ficar com um personagem secundário. Eles não avançam mais que os outros — só são estruturalmente diferentes, e a memória guarda diferença.",
      },
      {
        type: "quote",
        text: "A memória não arquiva por importância. Arquiva por contraste.",
      },
      { type: "h2", text: "O que isso muda para quem assiste" },
      {
        type: "p",
        text: "Vale como aviso contra um julgamento comum: dizer que uma temporada \"caiu no meio\" às vezes descreve mais o funcionamento da memória do que a qualidade do texto. O teste honesto é perguntar se o final funcionou — porque se funcionou, o meio fez o trabalho dele, mesmo sem você lembrar.",
      },
    ],
  },
  {
    slug: "o-que-os-jogos-aprenderam-com-o-cinema",
    title: "O que os jogos aprenderam com o cinema — e o que devolveram",
    excerpt:
      "A troca começou com os jogos imitando enquadramentos. Décadas depois, é o cinema que anda pegando emprestada a gramática dos jogos.",
    category: "Games",
    tags: ["games", "linguagem", "cinema"],
    author: "Redação Magicine",
    published_at: "2026-08-14",
    featured: true,
    body: [
      {
        type: "p",
        text: "Por muito tempo a relação foi de mão única e um pouco constrangida: jogos queriam ser filmes. Cutscene era prêmio, e a parte jogável era o intervalo entre os pedaços bonitos.",
      },
      { type: "h2", text: "A fase da imitação" },
      {
        type: "p",
        text: "Dessa fase vieram coisas boas — o cuidado com enquadramento, luz e ritmo de montagem — e uma armadilha: cenas em que o jogador vira espectador do próprio personagem, assistindo alguém fazer o que ele estava fazendo até dois segundos atrás, muitas vezes melhor.",
      },
      { type: "h2", text: "O que só o jogo faz" },
      {
        type: "p",
        text: "A virada veio quando ficou claro que a mídia tem um recurso que o cinema não tem: tornar o público responsável. Um filme pode mostrar uma escolha difícil. Um jogo pode fazer você tomá-la e depois conviver com ela por dez horas.",
      },
      {
        type: "list",
        items: [
          "Cenário que conta história sem diálogo, porque você escolhe onde olhar",
          "Ritmo controlado pelo jogador, não pela montagem",
          "Regras como argumento: o que o jogo permite e proíbe é o que ele pensa",
          "Repetição com sentido — morrer e tentar de novo vira tema, não punição",
        ],
      },
      { type: "h2", text: "A devolução" },
      {
        type: "p",
        text: "Hoje a influência corre nos dois sentidos. Planos-sequência longos que acompanham alguém por trás do ombro, geografia de espaço construída para o público entender rotas de fuga, estruturas narrativas com caminhos alternativos — tudo isso circulou nos jogos antes de virar recurso comum na tela grande.",
      },
      {
        type: "p",
        text: "A conversa ficou mais interessante quando as duas mídias pararam de tentar ser a outra e começaram a roubar só o que servia.",
      },
    ],
  },
  {
    slug: "animacao-japonesa-envelhece-melhor",
    title: "Por que a animação desenhada à mão envelhece melhor que o CGI da mesma época",
    excerpt:
      "Não é nostalgia. É uma diferença técnica entre estilizar e simular — e simulação envelhece contra a memória do real.",
    category: "Anime",
    tags: ["animação", "técnica", "anime"],
    author: "Redação Magicine",
    published_at: "2026-08-13",
    featured: false,
    body: [
      {
        type: "p",
        text: "Assista a uma produção animada à mão de trinta anos atrás e depois a uma computadorizada de vinte. É bem provável que a mais velha pareça mais nova. Isso se repete demais para ser gosto pessoal.",
      },
      { type: "h2", text: "Estilizar não tem alvo móvel" },
      {
        type: "p",
        text: "Um desenho estilizado propõe uma convenção: o mundo é assim aqui dentro. Não existe versão \"correta\" com a qual comparar, então ele não pode ficar defasado — só sair de moda, que é outra coisa e costuma voltar.",
      },
      {
        type: "p",
        text: "A simulação faz a aposta oposta. Ela se mede contra o real, e o real está sempre disponível na sua janela. Cada avanço técnico posterior atualiza a régua e empurra o trabalho antigo para o passado.",
      },
      {
        type: "quote",
        text: "Quem estiliza combina uma regra com o público. Quem simula assina um contrato com a realidade — e a realidade não renegocia.",
      },
      { type: "h2", text: "A exceção que confirma" },
      {
        type: "p",
        text: "Trabalhos digitais que envelheceram bem quase sempre são os que escolheram uma estética assumida em vez de perseguir o fotorrealismo: proporções exageradas, texturas que não fingem ser pele, iluminação que ninguém confundiria com uma fotografia. Eles jogaram o jogo do desenho, e não o da simulação.",
      },
    ],
  },
  {
    slug: "a-pagina-conduz-o-olho",
    title: "O quadro que não se lê: como a página de quadrinhos conduz o olho",
    excerpt:
      "Boa parte do trabalho de um quadrinho acontece no espaço branco entre os quadros — o lugar onde o leitor faz o serviço sem perceber.",
    category: "Quadrinhos",
    tags: ["quadrinhos", "linguagem", "leitura"],
    author: "Redação Magicine",
    published_at: "2026-08-12",
    featured: false,
    body: [
      {
        type: "p",
        text: "Quadrinho é a única mídia narrativa em que o público controla o relógio e ainda assim pode ser conduzido com precisão. O truque não está no que é desenhado, mas em como o desenho organiza a ordem de leitura.",
      },
      { type: "h2", text: "O intervalo faz o tempo" },
      {
        type: "p",
        text: "Entre dois quadros existe um vão. É ali que o leitor preenche o que não foi mostrado: o soco que conectou, a viagem que aconteceu, os cinco anos que passaram. Quanto maior o salto pedido, mais participação — e mais risco de perder alguém no caminho.",
      },
      { type: "h2", text: "Ferramentas de condução" },
      {
        type: "list",
        items: [
          "Quadro largo e baixo alonga a duração; estreito e alto acelera",
          "Sangrar a arte até a borda tira a moldura e sugere continuidade",
          "Balão colocado no caminho do olho define quem fala primeiro",
          "Virar a página é um corte — o que está no verso chega como surpresa",
        ],
      },
      {
        type: "p",
        text: "Nenhuma dessas escolhas aparece para quem está lendo bem. Quando aparecem, é sinal de que alguma delas falhou e o olho parou para procurar o caminho.",
      },
    ],
  },
  {
    slug: "trilha-sonora-conta-o-que-a-cena-esconde",
    title: "A trilha conta o que a cena está escondendo",
    excerpt:
      "Música em filme raramente descreve o que você está vendo. Ela costuma dizer o que os personagens ainda não sabem — ou o que estão mentindo.",
    category: "Cinema",
    tags: ["trilha sonora", "análise", "linguagem"],
    author: "Redação Magicine",
    published_at: "2026-08-10",
    featured: false,
    body: [
      {
        type: "p",
        text: "A ideia de que a trilha \"sublinha a emoção da cena\" descreve o uso mais preguiçoso possível. Quando a música apenas concorda com a imagem, ela é redundante — e redundância em cinema é ruído caro.",
      },
      { type: "h2", text: "Música como narrador não confiável" },
      {
        type: "p",
        text: "O uso interessante é o que contradiz. Uma cena feliz com música tensa avisa o público de um perigo que os personagens ignoram, e cria expectativa sem uma linha de diálogo. Uma cena violenta com música doce transforma o espectador em cúmplice desconfortável.",
      },
      { type: "h2", text: "O tema que muda de significado" },
      {
        type: "p",
        text: "O recurso mais elegante é o tema que retorna alterado. A mesma melodia apresentada no começo como promessa volta no fim em tom menor, mais lenta, com metade dos instrumentos. Nada foi dito, e o público entende exatamente o que se perdeu.",
      },
      {
        type: "quote",
        text: "Quando a plateia sai cantarolando o tema de um personagem que morreu, a trilha fez um trabalho que o roteiro não teria como fazer sozinho.",
      },
      {
        type: "p",
        text: "É por isso que silêncio bem colocado costuma ser o gesto mais forte de um compositor. Depois de duas horas ensinando o público a esperar música em determinados momentos, tirá-la é uma frase inteira.",
      },
    ],
  },
  {
    slug: "anatomia-de-uma-boa-critica",
    title: "Anatomia de uma boa crítica de série",
    excerpt:
      "O que separa um texto que ajuda o leitor a decidir de um que só reconta a história — cinco escolhas que fazem a diferença.",
    category: "Bastidores",
    tags: ["crítica", "escrita", "guia"],
    author: "Redação Magicine",
    published_at: "2026-08-09",
    featured: false,
    body: [
      {
        type: "p",
        text: "Toda crítica responde, no fundo, a uma pergunta prática: vale o meu tempo? O texto pode ser bonito e bem construído, mas se o leitor termina sem saber disso, ele não fez o trabalho.",
      },
      { type: "h2", text: "Resumo não é análise" },
      {
        type: "p",
        text: "O erro mais comum é gastar dois terços do texto recontando o enredo. O leitor já viu a sinopse. O que ele não tem é o seu julgamento sobre o que a obra tentou fazer e se conseguiu.",
      },
      { type: "h2", text: "Diga de onde você está falando" },
      {
        type: "p",
        text: "Quem detesta terror avalia um terror de forma diferente de quem ama o gênero. Deixar isso claro não enfraquece o texto: dá ao leitor a régua para calibrar a sua opinião contra o gosto dele.",
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
    slug: "como-publicar-no-magicine",
    title: "Como publicar uma matéria no Magicine",
    excerpt:
      "O passo a passo do formato de blocos que monta as páginas — e o caminho para trocar o arquivo local pelo Supabase quando o volume crescer.",
    category: "Bastidores",
    tags: ["tutorial", "supabase", "publicação"],
    author: "Redação Magicine",
    published_at: "2026-08-08",
    featured: false,
    body: [
      {
        type: "p",
        text: "Esta página não foi montada à mão. Ela nasceu de um objeto JavaScript em shared/news-data.js, e o mesmo objeto gerou o card que você clicou. É o combinado do site: você escreve o conteúdo, o layout se monta sozinho.",
      },
      { type: "h2", text: "O texto é uma lista de blocos" },
      {
        type: "p",
        text: "Em vez de HTML solto, cada matéria tem um campo body com blocos identificados por tipo. A vantagem aparece na migração: esse formato cabe numa coluna jsonb do Supabase sem nenhuma conversão.",
      },
      {
        type: "list",
        items: [
          "p — um parágrafo comum",
          "h2 — um subtítulo para quebrar a leitura",
          "quote — um destaque com autoria opcional",
          "list — uma lista como esta",
          "img — uma imagem com legenda",
        ],
      },
      { type: "h2", text: "Quando migrar para o Supabase" },
      {
        type: "p",
        text: "Enquanto forem poucas matérias por semana, editar o arquivo e publicar resolve. A troca compensa quando você quiser escrever de outro computador, ter mais de uma pessoa publicando ou agendar publicações. O README traz o SQL da tabela e as duas linhas que mudam em shared/news.js.",
      },
    ],
  },
];
