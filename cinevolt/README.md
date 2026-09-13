# 🕹️ CINEVOLT

**Cinema em modo arcade** — revista de cinema com um Pac-Man rodando em modo
atração atrás do título, ilustrações de fliperama geradas por código, um segundo
jogo e painel próprio de publicação.

---

## 1. O nome

**CINEVOLT** — cinema + volt. Curto, pronunciável em português e inglês, e é uma
palavra cunhada, o que aumenta muito a chance de estar livre para registro.

> ⚠️ **Não consegui verificar disponibilidade**: o ambiente onde este projeto foi
> montado não tem acesso a WHOIS/DNS. Confira antes de comprar:
> - `registro.br` → para `.com.br`
> - `dash.cloudflare.com` → Domain Registration → para `.com` / `.tv` / `.io`

**Alternativas**, caso esteja ocupado:

| Nome | Leitura | Domínio sugerido |
|---|---|---|
| VOLTREEL | volt + reel (rolo de filme) | voltreel.com |
| KINORAIO | kino (cinema) + raio | kinoraio.com.br |
| FLICKVOLT | flick (filme) + volt | flickvolt.com |
| PIXELUZ | pixel + luz | pixeluz.com.br |
| CINETESLA | cinema + Tesla | cinetesla.com |

Trocar o nome no site inteiro = editar `assets/js/config.js` (campo `SITE.nome`)
e o texto `CINE<b>VOLT</b>` no cabeçalho de cada `.html`.

---

## 2. O que está pronto

```
cinevolt/
├── index.html          Home com o labirinto jogável
├── arquivo.html        Todas as matérias, com filtro e busca
├── post.html           Leitor de matéria (?p=slug)
├── jogo.html           Cine Runner + placar online
├── sobre.html          Página institucional
├── admin.html          Painel de publicação (login)
├── 404.html            Erro com raios
│
├── assets/
│   ├── css/  base · effects · arcade · admin
│   ├── js/   config · data · art · md · ui · fx · lightning
│   │         maze · arcade · home · arquivo · post · game · placar · admin
│   └── img/  favicon.svg
│
├── supabase/schema.sql Banco, segurança e bucket — cole e rode
├── blogger/            Versão do site como tema do Blogger
├── _headers            Cache e segurança (Cloudflare Pages)
├── _redirects          URLs curtas (/materia/slug)
├── robots.txt · sitemap.xml
```

### O hero é jogável

Atrás do título roda um labirinto completo — 22×28 tiles, quatro fantasmas com
personalidades diferentes (vai direto, embosca, vagueia, se aproxima e recua),
pílulas que os deixam azuis e fogem. Ele começa em **modo atração**, como um
fliperama esperando ficha. Apertou uma seta (ou arrastou o dedo no celular),
você assume o controle e o HUD avisa "1 PLAYER".

Duas decisões técnicas que importam, documentadas em `maze.js`:

- **Movimento por tile exato.** Cada entidade guarda o tile atual e o progresso
  de 0 a 1 até o próximo, em vez de "está perto do centro?". Assim ninguém
  atravessa parede quando o quadro demora — celular fraco, aba em segundo plano
  ou tela de 144 Hz.
- **Duas camadas de canvas.** Paredes e pontinhos são pintados uma única vez numa
  camada de fundo; o quadro a quadro só redesenha as cinco entidades. Desenhar
  180 paredes com sombra a cada quadro derrubava a página para 1 fps.

### Efeitos implementados

| # | Efeito | Onde |
|---|---|---|
| 1 | Labirinto jogável em modo atração, com IA de busca em largura | `maze.js` |
| 2 | Fantasmas com quatro personalidades e olhos que seguem a direção | `maze.js` |
| 3 | Pílula de poder dispara um raio de verdade sobre o labirinto | `arcade.js` |
| 4 | Motor de raios ramificados em canvas | `lightning.js` |
| 5 | Trovão sintetizado em ruído marrom (Web Audio, sem arquivo) | `fx.js` |
| 6 | Tela CRT: scanlines, varredura descendo e cantos curvos | `arcade.css` |
| 7 | Título com relevo de letreiro e falha de neon a cada 6s | `arcade.css` |
| 8 | "INSERT COIN" piscando com moeda girando | `arcade.css` |
| 9 | Marquise de lâmpadas correndo em cores | `arcade.css` |
| 10 | Faixa de perseguição: herói e quatro fantasmas atravessando a tela | `arcade.js` |
| 11 | Botões com corpo físico, que afundam ao clicar | `arcade.css` |
| 12 | Ilustrações de fliperama geradas por semente | `art.js` |
| 13 | Fonte pixel 3×5 desenhada à mão, usada dentro dos pôsteres | `art.js` |
| 14 | Preloader de claquete batendo | `effects.css` |
| 15 | Cursor customizado com trilha de faíscas | `fx.js` |
| 16 | Grão de filme sobre a página toda | `effects.css` |
| 17 | Revelação no scroll (fade, slide, zoom, clip) | `fx.js` |
| 18 | Título subindo linha a linha | `fx.js` |
| 19 | Tilt 3D nos cards com brilho seguindo o mouse | `fx.js` |
| 20 | Botões magnéticos | `fx.js` |
| 21 | Marquee infinito e tira de filme rolando | `effects.css` |
| 22 | Contadores animados | `fx.js` |
| 23 | Transição entre páginas com cortina + flash | `fx.js` |
| 24 | Barra de progresso de leitura | `fx.js` |
| 25 | Lightbox de trailer (YouTube) | `fx.js` |
| 26 | Capitular na primeira letra do artigo | `effects.css` |
| 27 | Menu fullscreen com abertura circular | `base.css` |
| 28 | `prefers-reduced-motion` respeitado em tudo | `arcade.css` |

---

## 3. Colocar no ar

### 3.1 Supabase (conteúdo)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano grátis serve).
2. **SQL Editor** → cole `supabase/schema.sql` inteiro → **Run**.
   Isso cria as tabelas, a segurança (RLS) e o bucket `midia`.
3. **Authentication → Users → Add user** → crie o seu e-mail e senha.
   Esse é o login do painel. Desligue "Enable signup" em
   *Authentication → Providers → Email* para ninguém mais se cadastrar.
4. **Project Settings → API** → copie `Project URL` e a chave `anon public`.
5. Cole as duas em `assets/js/config.js`:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

> A chave `anon` é pública por design — quem protege o conteúdo são as policies
> de RLS que o `schema.sql` cria. Nunca coloque a chave `service_role` no site.

### 3.2 Cloudflare Pages (hospedagem)

**Pelo painel:**

1. Suba esta pasta para um repositório no GitHub.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Configuração do build:
   - Framework preset: **None**
   - Build command: *(vazio)*
   - Build output directory: **`/`** (ou `cinevolt` se o site estiver em subpasta)
4. **Save and Deploy**.

**Pelo terminal:**

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=cinevolt
```

### 3.3 Domínio

1. Cloudflare → **Websites** → *Add a site* (ou registre o domínio na Cloudflare).
2. No projeto Pages → **Custom domains** → `cinevolt.com.br`.
3. Domínio `.com.br` do registro.br: aponte os nameservers que a Cloudflare mostrar.
4. SSL é automático.

---

## 4. Publicar conteúdo

Acesse **`/admin.html`** e entre com o e-mail e senha criados no Supabase.

Três colunas: **lista** de matérias · **editor** · **ajustes**.

- **Título** gera o endereço (slug) sozinho — dá para editar.
- **Corpo** aceita Markdown. Barra com botões e atalhos:
  `Ctrl+B` negrito · `Ctrl+I` itálico · `Ctrl+K` link · `Ctrl+H` título · `Ctrl+S` salvar.
- **Imagens**: arraste para dentro do texto, ou cole (`Ctrl+V`) — sobem para o
  Storage e o markdown entra sozinho.
- **Capa**: sem imagem enviada, o site desenha uma **ilustração exclusiva** a
  partir do endereço da matéria. "Outra variação" troca a composição.
- **Destaque** marca a matéria que vira o título do hero (só uma por vez — o
  banco garante isso com um trigger).
- **Prévia** mostra o resultado final lado a lado enquanto você escreve.
- **Rascunho** fica invisível no site; **Publicar** coloca no ar na hora.

O texto é guardado no navegador enquanto você escreve — fechou a aba sem querer,
ele oferece continuar de onde parou.

### Sem Supabase configurado

O site roda em **modo demonstração**: mostra 6 matérias de exemplo e salva o que
você publicar no `localStorage`. Serve para ver tudo funcionando antes de
configurar qualquer coisa.

---

## 5. Os jogos

**No hero** — o labirinto, sempre rodando. Setas ou WASD assumem o controle;
no celular, arraste. Recorde guardado no navegador.

**Em `/jogo.html`** — **Cine Runner**: corredor infinito, você é um rolo de filme
fugindo da tempestade.

- **Espaço / ↑ / clique** pula · **↓** desliza · **Enter** recomeça
- Obstáculos: pipoca, tripé, claquete (pular) e drone (deslizar)
- Raio dourado vale 50 pontos
- Recorde pessoal no navegador; **Top 10** no Supabase (tabela `placar`)

Toda a arte dos dois jogos é desenhada em canvas por código.

---

## 6. As ilustrações

Nenhuma imagem de banco. `assets/js/art.js` desenha pôsteres de fliperama em SVG
a partir de uma semente (o slug da matéria):

- **8 composições**: sprite gigante, gabinete, labirinto, tela de GAME OVER,
  formação de invasores, tabela de recordes, cartucho e explosão de pixels
- **8 paletas**: fliperama, invasores, neon, perigo, bloco, sépia, ouro e gelo
- **7 sprites em pixel** desenhados à mão (invasor, fantasma, herói, nave,
  caveira, coração, moeda)
- **Fonte pixel 3×5 própria**, que escreve HIGH SCORE, INSERT COIN, READY! e as
  iniciais do placar dentro da arte
- A categoria da matéria escolhe a paleta; o slug escolhe a composição
- Resultado **determinístico**: a mesma matéria sempre tem a mesma capa, e duas
  matérias diferentes nunca têm a mesma

---

## 7. Mexer no labirinto

O mapa fica no topo de `assets/js/maze.js`, como texto:

```js
const MAPA = [
  '############################',
  '#............##............#',
  ...
];
```

`#` é parede, `.` é ponto, `o` é pílula de poder, espaço é corredor vazio.
Todas as linhas precisam ter 28 colunas.

Mudou o mapa? Vale conferir se continua jogável: todo ponto precisa ser
alcançável a partir da posição inicial do herói, e os fantasmas precisam
conseguir sair da casa central. Um mapa fechado não quebra a página, mas o
herói fica girando em círculo.

Para trocar a velocidade, as personalidades dos fantasmas ou a duração da
pílula, procure por `criarEntidades`, `cerebroFantasma` e `assustadoAte`.

---

## 8. Blogger (alternativa)

Em `blogger/` tem o mesmo site empacotado como tema do Blogger — labirinto,
CRT, ilustrações geradas e tudo mais — para quem prefere publicar pelo editor
do Google. Leia `blogger/README.md`.

| | Cloudflare + Supabase | Blogger |
|---|---|---|
| Publicar | painel próprio (`/admin.html`) | editor do Google |
| Design | controle total | limitado ao tema |
| Labirinto no hero | sim | sim |
| Cine Runner com placar online | sim | jogo sim, placar precisa do Supabase |
| Custo | grátis | grátis |

O tema é gerado a partir dos mesmos arquivos do site:

```bash
node blogger/build.js
```

---

## 9. Desenvolvimento local

Não há build:

```bash
npx http-server -p 8080 .
# ou
python3 -m http.server 8080
```

---

## 10. Acessibilidade e performance

- Sem framework, sem bundler: só a biblioteca do Supabase (via CDN, ~40 KB)
- Todas as animações param com `prefers-reduced-motion: reduce`, inclusive o
  labirinto (que nem chega a iniciar)
- O labirinto pausa sozinho quando a aba sai de foco
- Nenhum `shadowBlur` no caminho de cada quadro — só nas camadas pintadas uma vez
- Ilustrações são SVG: poucos KB e nítidas em qualquer tela
- Navegação por teclado no menu, nos dois jogos e no editor
