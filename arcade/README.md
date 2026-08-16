# Nébula Arcade

Portal de jogos em HTML5 Canvas para rodar direto no navegador. Sem build, sem
dependências, sem imagens externas — todo o cenário é desenhado em código e os
efeitos sonoros são gerados via WebAudio. É só subir os arquivos estáticos.

## Os jogos

| Jogo | Gênero | Destaque |
| --- | --- | --- |
| **Trilha Radical** | Corrida | Moto de trilha com física de duas rodas e terreno gerado na hora |
| **Voo Rasante** | Habilidade | Quatro mundos com arte própria e recorde separado por mundo |
| **Serpente Neon** | Arcade | A cobrinha, com visual de circuito |
| **Quebra-Blocos** | Arcade | Fases progressivas, ângulo de rebatida pela raquete |
| **Invasores** | Tiro | Formação que acelera conforme você derruba os inimigos |
| **Rebatida** | Duelo | Três níveis de computador, melhor de 7 |

Todos funcionam com teclado no computador e com toque no celular. O recorde de
cada um fica salvo no `localStorage` do navegador.

## Sobre os mundos do Voo Rasante (direitos autorais)

Os quatro mundos são **criações originais inspiradas em gêneros**, não em obras
específicas:

| Mundo | No que se inspira | Por que é seguro |
| --- | --- | --- |
| Clássico | O gênero "bater asas entre canos" | Mecânica de jogo não é protegida por direito autoral |
| Escola de Magia | Bruxos, vassouras e castelos | Elementos folclóricos de domínio público |
| Olimpo | Mitologia grega | Domínio público há milênios |
| Reino de Pedra | Alta fantasia (dragões, montanhas) | Arquétipos de domínio público |

O que **não** foi usado, de propósito: nomes de obras, personagens, casas,
escolas, feitiços, criaturas inventadas por um autor específico, trilhas
sonoras, tipografia de marca ou qualquer logotipo. Nomes e arte são próprios.

Essa é a linha que mantém o projeto do lado seguro: **gênero e arquétipo podem;
nome próprio, personagem e marca registrada, não.** Se quiser criar novos
mundos, siga a mesma regra — e evite também "evocar" uma obra específica
combinando vários elementos característicos dela ao mesmo tempo.

## Rodando localmente

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Deploy no Cloudflare Pages

Site 100% estático — não há etapa de build.

### Opção 1: upload direto (mais rápido)

1. **Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets**.
2. Envie o conteúdo desta pasta (ou o `.zip` inteiro).
3. **Deploy.** Fica no ar em `https://<projeto>.pages.dev`.

### Opção 2: conectado ao Git

1. **Create → Pages → Connect to Git** e escolha o repositório.
2. Configuração de build:
   - **Framework preset:** `None`
   - **Build command:** *(vazio)*
   - **Build output directory:** `arcade`
3. **Save and Deploy.** Cada push gera um deploy novo.

### Opção 3: Wrangler

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=nebula-arcade
```

## Colocando o AdSense

Os espaços já estão prontos. Cada página tem uma `div` marcada:

```html
<!-- AdSense: cole aqui a tag do bloco de anúncio desta página -->
<div class="ad-slot" data-ad="home-topo"></div>
```

Passo a passo:

1. **Publique o site primeiro.** O AdSense só aprova domínios que já estão no ar
   com conteúdo — por isso vale subir para o Cloudflare antes de pedir a
   aprovação.
2. No AdSense, cadastre o domínio e copie o **código do editor**
   (`pub-XXXXXXXXXXXXXXXX`).
3. Edite o `ads.txt` na raiz: descomente a linha e coloque o seu código.
   O arquivo precisa responder em `https://seusite.com/ads.txt`.
4. Cole o script do AdSense antes de `</head>` em cada página, e a tag
   `<ins class="adsbygoogle">` dentro da `div.ad-slot` correspondente.

A `div.ad-slot` fica invisível enquanto estiver vazia (`.ad-slot:empty`), então
o layout não abre buracos antes de os anúncios entrarem.

Dois detalhes que evitam dor de cabeça:

- **Não coloque anúncio por cima do canvas.** Cliques acidentais durante o jogo
  são a causa mais comum de suspensão de conta.
- O `_headers` **não** define `Content-Security-Policy` de propósito: uma CSP
  restritiva bloquearia os scripts do Google. Se for adicionar uma depois,
  libere `pagead2.googlesyndication.com`, `googleads.g.doubleclick.net` e
  `tpc.googlesyndication.com`.

## Publicando notícias de cinema e séries

A seção já está montada, responsiva e vazia. Para publicar, adicione itens no
array `NOTICIAS` no topo do `app.js`:

```js
const NOTICIAS = [
  {
    kicker: "Série",
    title: "Título da sua matéria",
    excerpt: "Uma ou duas frases de chamada.",
    date: "2026-08-16",
    url: "noticias/minha-materia.html",  // opcional
    cover: "img/capa.jpg",               // opcional
  },
];
```

Os cards aparecem sozinhos, ordenados como estiverem no array, e o texto
"Em breve" some assim que houver pelo menos uma notícia.

Ao publicar, escreva texto próprio: copiar matéria de outro site é violação de
direito autoral e o AdSense recusa sites com conteúdo copiado. Para imagens, use
banco livre (Unsplash, Pexels) ou material oficial de divulgação, sempre com o
crédito pedido pelo estúdio.

## Estrutura

```
arcade/
├── index.html            portal (hero, grade de jogos, notícias)
├── style.css             estilo do portal
├── app.js                cards, filtros, recordes e notícias
├── icon.svg              ícone do site
├── manifest.webmanifest  instalável como app
├── ads.txt               modelo para o AdSense
├── _headers              cache e segurança (Cloudflare Pages)
├── shared/
│   ├── engine.js         base: loop, canvas, entrada, áudio, recordes
│   └── ui.css            estilo comum das páginas de jogo
└── games/
    ├── trilha/  voo/  serpente/  blocos/  invasores/  rebatida/
```

### Como o `shared/engine.js` ajuda

Todo jogo novo ganha de graça: escala de canvas com `devicePixelRatio`, loop de
passo fixo (imune a variação de FPS), teclado + botões de toque no mesmo estado
de entrada, efeitos sonoros e recordes no `localStorage`.

```js
const ctx   = Arcade.fitCanvas(canvas, LARGURA, ALTURA);
const shell = Arcade.mountShell("meu-jogo");   // recorde + som + toque
Arcade.loop(update, draw);                     // update(dt) e draw()
```

## Adicionando um jogo novo

1. Crie `games/meu-jogo/` com um `index.html` (copie o de outro jogo — a
   estrutura da barra e das telas é a mesma) e um `game.js`.
2. Ajuste `--ar` no `<style>` da página para a proporção da sua tela.
3. Acrescente uma entrada no array `GAMES` do `app.js`, com `id`, `name`,
   `genre`, `tint`, `desc`, `path`, `unit`, `best` e o `thumb` (um SVG
   `viewBox="0 0 320 180"`).

O filtro por gênero na home se monta sozinho a partir do campo `genre`.
