# Magicine

Site de cinema, séries e arcade em HTML5. Sem build, sem dependências, sem
imagens externas — os cenários dos jogos são desenhados em código e os
efeitos sonoros são gerados via WebAudio. É só subir os arquivos estáticos.

---

## 1. As notícias (o foco do site)

> Para o dia a dia de publicação, veja **[COMO-PUBLICAR.md](COMO-PUBLICAR.md)** —
> é o guia curto. Esta seção cobre o formato e a migração.

### Publicando hoje

As matérias moram no array `MAGICINE_POSTS`, em `shared/news-data.js`. Cada
objeto vira um card na home, uma entrada em `/noticias/` e uma página em
`/noticias/artigo.html?slug=...`.

```js
{
  slug: "meu-endereco-na-url",
  title: "Título da matéria",
  excerpt: "Uma ou duas frases de chamada.",
  category: "Cinema",              // vira filtro sozinho
  tags: ["fantasia", "estreia"],   // usado na busca
  author: "Seu nome",
  published_at: "2026-08-16",
  cover: "img/capa.jpg",           // opcional
  featured: true,                  // sobe para o destaque da home
  status: "draft",                 // opcional: esconde do site
  body: [
    { type: "p", text: "Um parágrafo." },
    { type: "h2", text: "Um subtítulo" },
    { type: "quote", text: "Uma citação.", cite: "Quem disse" },
    { type: "list", items: ["Primeiro", "Segundo"] },
    { type: "img", src: "img/cena.jpg", alt: "Descrição", caption: "Legenda" },
  ],
}
```

O pacote já vem com **27 matérias** escritas para este site — 5 de Cinema,
5 de Séries, 5 de Games e 12 de Bastidores. São textos originais de análise
atemporal: o tipo de conteúdo que continua recebendo visita meses depois.
Cada uma tem ilustração própria em `img/`, também original.

**Sobre notícia do dia:** as matérias que vêm no pacote são análise, não
notícia. Fato do dia (elenco confirmado, data anunciada, prêmio recebido)
precisa ser escrito por você quando acontecer — texto inventado sobre pessoa
ou obra real é declaração falsa e reprova o site no AdSense.

### Migrando para o Supabase

O site nunca fala direto com os dados: tudo passa por `shared/news.js`. Por
isso a migração não encosta em nenhuma página.

**Passo 1 — crie a tabela.** No SQL Editor do Supabase:

```sql
create table posts (
  slug         text primary key,
  title        text not null,
  excerpt      text,
  cover        text,
  category     text,
  tags         text[],
  author       text,
  published_at date not null default current_date,
  featured     boolean not null default false,
  status       text   not null default 'published',
  body         jsonb  not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index posts_publicadas_idx
  on posts (published_at desc)
  where status = 'published';

-- O site é público e só lê. Ligue o RLS e libere apenas a leitura
-- das matérias já publicadas: sem isso, a chave anônima enxergaria
-- também os rascunhos.
alter table posts enable row level security;

create policy "leitura publica das publicadas"
  on posts for select
  to anon
  using (status = 'published');
```

**Passo 2 — aponte o site para lá.** No topo de `shared/news.js`:

```js
const SOURCE = "supabase";

const SUPABASE = {
  url: "https://xxxxxxxxxxxx.supabase.co",
  anonKey: "eyJhbGciOi...",   // a chave "anon public"
  table: "posts",
};
```

Só isso. A home, a listagem, a busca, os filtros e o artigo continuam
funcionando.

Dois pontos que valem atenção:

- A chave **anon** pode ficar no código do site — ela é pública por
  natureza. O que protege os dados é o RLS acima, não o segredo da chave.
  **Nunca** use a `service_role` no navegador: ela ignora o RLS.
- O campo `body` é `jsonb` com exatamente o mesmo formato de blocos de hoje,
  então dá para copiar as matérias existentes sem conversão.

Se `SOURCE` estiver como `"supabase"` mas a URL ou a chave estiverem vazias,
o site avisa no console e volta a usar as matérias locais em vez de quebrar.

---

## 2. Os jogos

| Jogo | Gênero | Destaque |
| --- | --- | --- |
| **Fuga do Dragão** | Corrida | Carrinho nos trilhos de uma caverna, dragão cuspindo fogo atrás; partículas aditivas e luz dinâmica |
| **Fliperama** | Pinball | Física de segmentos e círculos; bumpers, slingshots, alvos e multiplicador de combo |
| **Colosso** | Escalada | Gorila gigante subindo a torre, desviando de entulho e derrubando aviões |
| **Linha de Frente** | Tiro | Arena em vista de cima, ondas convergentes, avanço com invulnerabilidade breve |
| **Guardiões** | Estratégia | Defesa de torre: três guardiões, três níveis cada, ondas com velozes, blindados e chefes |
| **Voo Rasante** | Habilidade | Quatro mundos com arte própria e recorde separado por mundo |
| **Serpente Neon** | Arcade | O tabuleiro ganha casas em telas maiores |
| **Quebra-Blocos** | Arcade | A parede ganha colunas em telas largas |
| **Invasores** | Tiro | Formação que acelera conforme você derruba os inimigos |
| **Rebatida** | Duelo | Três níveis de computador, melhor de 7 |

Todos rodam **em tela cheia**, com teclado no computador e toque no celular,
e têm botão de tela cheia nativa. O recorde fica no `localStorage`.

### Controles: por que existe `bindPointer`

Todo jogo liga o ponteiro por `Arcade.bindPointer(view, { down, move, up })`,
que usa **captura de ponteiro**. Sem ela, arrastar o dedo (ou o mouse com o
botão apertado) para fora do canvas fazia o `pointerup` se perder — e o
controle ficava travado apertado. Era um defeito silencioso que afetava
vários jogos, no toque e no mouse.

```js
Arcade.bindPointer(view, {
  down(p) { /* p já vem em coordenadas do mundo */ },
  move(p, e, apertado) {},
  up() { /* sempre chamado, mesmo saindo do canvas */ },
});
```

### Como funciona a tela cheia

`shared/engine.js` expõe `createView(canvas, { minW, minH })`. A escala é a
menor entre `larguraDaTela/minW` e `alturaDaTela/minH`, então a área mínima
sempre cabe e o que sobra vira mundo de verdade — sem tarjas pretas e sem
esticar a arte.

```js
const view = Arcade.createView(canvas, { minW: 540, minH: 310 });
const ctx  = view.ctx;
// nos jogos, use view.w e view.h a cada quadro; nunca constantes
```

O Voo Rasante é a exceção proposital: a **coluna de jogo** fica travada em
360×640 e o resto da tela recebe um fundo ambiente. Se a coluna esticasse, o
vão entre os obstáculos mudaria de tamanho e o recorde feito no monitor não
valeria o mesmo no celular.

### Sobre os mundos e cenários (direitos autorais)

Tudo é criação original **inspirada em gêneros**, não em obras específicas:

| Mundo / jogo | Inspiração | Por que é seguro |
| --- | --- | --- |
| Escola de Magia | Bruxos, vassouras, castelos | Folclore de domínio público |
| Olimpo | Mitologia grega | Domínio público há milênios |
| Reino de Pedra | Alta fantasia | Arquétipos de domínio público |
| Fuga do Dragão | Caverna, carrinho de mina, dragão | Arquétipos de domínio público |
| Colosso | Macaco gigante em arranha-céu | Arquétipo kaiju de domínio público |
| Fliperama | Pinball | Gênero, não uma mesa específica |
| Linha de Frente | Tiro em arena | Gênero, sem cenário ou arma de obra existente |

O que **não** foi usado, de propósito: nomes de obras, personagens, escolas,
casas, feitiços, criaturas inventadas por um autor específico, trilhas
sonoras, tipografia de marca e logotipos.

A regra que mantém o projeto seguro: **gênero e arquétipo podem; nome
próprio, personagem e marca registrada, não.** Ao criar mundos novos, evite
também "evocar" uma obra específica empilhando vários elementos
característicos dela ao mesmo tempo — é aí que uma releitura genérica passa
a ser reconhecível como cópia.

---

## 2.5. Sobre o visual

O movimento do site acontece em **um lugar só**: o canvas `#bg`
(`shared/bg.js`), com luz de projetor varrendo devagar, poeira subindo no
facho e manchas quentes que respiram. Nenhum card, botão ou título anima
sozinho — só transições curtas de hover.

O fundo se desliga inteiro quando a pessoa tem "reduzir movimento" ligado no
sistema, e pausa quando a aba sai de foco.

Para mudar a paleta, mexa nas variáveis no topo do `style.css`:

```css
--bg: #0c0c10;      /* fundo */
--amber: #ffb03a;   /* acento principal */
--ember: #ff5c39;   /* acento secundário */
```

As cores por editoria (`--c-cinema`, `--c-series`, `--c-games`,
`--c-bastidores`) tingem os cards, os selos dos títulos, a numeração das
"Últimas" e a fita no topo do menu.

As ilustrações das matérias ficam em `img/`, em SVG. Elas são desenhos
geométricos originais — pesam poucos KB e ficam nítidas em qualquer tela.
Nas matérias, o caminho é sempre relativo à raiz (`img/arquivo.svg`); cada
página declara a própria base em `MAGICINE_BASE` e o `News.media()` resolve,
para a mesma matéria funcionar na home e em `/noticias/`.

---

## 2.6. Páginas institucionais

`sobre.html`, `privacidade.html` e `contato.html` já existem e estão ligadas
no rodapé de todas as páginas. **A falta delas é um dos motivos mais comuns
de reprovação no AdSense.**

Elas vêm com o texto pronto e com comentários HTML marcando o que só você
pode preencher: seu nome, e-mail, cidade e a data da política. Procure por
`<!--` nos três arquivos — cada comentário é um campo a completar.

A política de privacidade já cobre o que o AdSense exige: uso de cookies por
Google e parceiros, link para as configurações de anúncios do Google e para
o aboutads.info, além dos direitos previstos na LGPD.

---

## 3. Deploy no Cloudflare Pages

Site 100% estático — não há etapa de build.

**Upload direto (mais rápido):** Dashboard → Workers & Pages → Create →
Pages → **Upload assets** → envie o conteúdo desta pasta (ou o `.zip`) →
Deploy.

**Conectado ao Git:** Create → Pages → Connect to Git. Framework preset
`None`, build command vazio, output directory `arcade`.

**Wrangler:**

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=magicine
```

---

## 4. AdSense

Os espaços já estão prontos em todas as páginas:

```html
<!-- AdSense: bloco de topo da home -->
<div class="ad-slot" data-ad="home-topo"></div>
```

1. **Publique o site antes.** O AdSense só aprova domínios no ar com
   conteúdo — por isso vale subir e publicar algumas matérias primeiro.
2. Cadastre o domínio e copie o código do editor (`pub-XXXXXXXXXXXXXXXX`).
3. Edite o `ads.txt` da raiz: descomente a linha e ponha o seu código. Ele
   precisa responder em `https://seusite.com/ads.txt`.
4. Cole o script antes de `</head>` e a tag `<ins class="adsbygoogle">`
   dentro da `div.ad-slot`.

A `.ad-slot` fica invisível enquanto vazia, então o layout não abre buracos.

Dois detalhes que evitam dor de cabeça:

- **Não coloque anúncio dentro das páginas de jogo.** Elas são tela cheia e
  um clique acidental durante a partida é a causa mais comum de suspensão de
  conta. Os anúncios estão só na home, na listagem e no artigo — onde o
  leitor está parado lendo, que também rende mais.
- O `_headers` **não** define `Content-Security-Policy` de propósito: uma CSP
  restritiva bloquearia os scripts do Google.

---

## 5. Estrutura

```
arcade/
├── index.html              home (capa + editorias + arcade)
├── style.css               estilo do site
├── app.js                  home: notícias, cards e recordes
├── COMO-PUBLICAR.md        guia de publicação do dia a dia
├── noticias/
│   ├── index.html          listagem com busca e filtros
│   └── artigo.html         leitor de matéria
├── img/                    ilustrações das matérias (SVG original)
├── shared/
│   ├── news.js             camada de dados (local ↔ Supabase)
│   ├── news-data.js        suas matérias
│   ├── bg.js               fundo animado (único movimento do site)
│   ├── engine.js           base dos jogos
│   └── ui.css              estilo das páginas de jogo
├── games/
│   └── dragao/ voo/ serpente/ blocos/ invasores/ rebatida/
├── icon.svg  manifest.webmanifest  ads.txt  _headers
```

### Adicionando um jogo novo

1. Crie `games/meu-jogo/` copiando o `index.html` de outro (a estrutura de
   HUD e telas é a mesma) e escreva o `game.js`.
2. Use `Arcade.createView` e leia `view.w`/`view.h` — nada de tamanho fixo.
3. Acrescente uma entrada no array `GAMES` do `app.js` com `id`, `name`,
   `genre`, `tint`, `desc`, `path`, `unit`, `best` e o `thumb` (SVG
   `viewBox="0 0 320 180"`).

O filtro por gênero da home se monta sozinho a partir do campo `genre`.
