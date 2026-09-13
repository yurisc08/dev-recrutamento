# ⚡ CINEVOLT

**Cinema em alta voltagem** — revista de cinema com hero cinematográfico,
raios de verdade em canvas, ilustrações exclusivas geradas por código,
um jogo de intervalo e painel próprio de publicação.

---

## 1. O nome

**CINEVOLT** — cinema + volt (raio, energia, tensão). Curto, pronunciável em
português e inglês, e é uma palavra cunhada, o que aumenta muito a chance de
estar livre para registro.

> ⚠️ **Não consegui verificar disponibilidade** de domínio: o ambiente onde este
> projeto foi montado não tem acesso a WHOIS/DNS. Confira antes de comprar:
> - `registro.br` → para `.com.br`
> - `dash.cloudflare.com` → Domain Registration → para `.com` / `.tv` / `.io`

**Alternativas**, caso CINEVOLT esteja ocupado (todas coerentes com a mesma identidade):

| Nome | Leitura | Domínio sugerido |
|---|---|---|
| VOLTREEL | volt + reel (rolo de filme) | voltreel.com |
| KINORAIO | kino (cinema) + raio | kinoraio.com.br |
| FLICKVOLT | flick (filme) + volt | flickvolt.com |
| LUMERAIO | lume (luz) + raio | lumeraio.com.br |
| CINETESLA | cinema + Tesla | cinetesla.com |

Trocar o nome no site inteiro = editar `assets/js/config.js` (campo `SITE.nome`)
e o texto `CINE<b>VOLT</b>` no cabeçalho de cada `.html`.

---

## 2. O que está pronto

```
cinevolt/
├── index.html          Home com o hero da tempestade
├── arquivo.html        Todas as matérias, com filtro e busca
├── post.html           Leitor de matéria (?p=slug)
├── jogo.html           Cine Runner + placar online
├── sobre.html          Página institucional
├── admin.html          Painel de publicação (login)
├── 404.html            Erro com raios
│
├── assets/
│   ├── css/  base · effects · hero · admin
│   ├── js/   config · data · art · md · ui · fx · lightning · hero
│   │         home · arquivo · post · game · placar · admin
│   └── img/  guardiao.svg (ilustração autoral) · favicon.svg
│
├── supabase/schema.sql Banco, segurança e bucket — cole e rode
├── blogger/            Versão do site como tema do Blogger
├── _headers            Cache e segurança (Cloudflare Pages)
├── _redirects          URLs curtas (/materia/slug)
├── robots.txt · sitemap.xml
```

### Efeitos implementados

| # | Efeito | Onde |
|---|---|---|
| 1 | Raios ramificados em canvas (deslocamento recursivo do ponto médio) | `lightning.js` |
| 2 | Duas camadas de tempestade: raios na frente e atrás da figura | `hero.js` |
| 3 | Manto que ondula (filtro SVG `feTurbulence` + `feDisplacementMap` animado) | `guardiao.svg` |
| 4 | Olhos que piscam e núcleo do martelo pulsando | `guardiao.svg` |
| 5 | Trovão sintetizado em ruído marrom (Web Audio, sem arquivo de som) | `fx.js` |
| 6 | Flash de tela sincronizado com cada raio | `effects.css` |
| 7 | Nuvens de tempestade por turbulência, em duas velocidades | `hero.js` |
| 8 | Chuva em duas profundidades + névoa baixa | `hero.css` |
| 9 | Parallax das camadas seguindo o mouse | `hero.js` |
| 10 | Arcos elétricos que perseguem o cursor perto do martelo | `hero.js` |
| 11 | Preloader de claquete batendo | `effects.css` |
| 12 | Cursor customizado com trilha de faíscas | `fx.js` |
| 13 | Grão de filme, scanlines e vinheta sobre a página toda | `effects.css` |
| 14 | Revelação no scroll (fade, slide, zoom, clip) | `fx.js` |
| 15 | Título subindo linha a linha | `fx.js` |
| 16 | Tilt 3D nos cards com brilho seguindo o mouse | `fx.js` |
| 17 | Botões magnéticos | `fx.js` |
| 18 | Marquee infinito e tira de filme rolando | `effects.css` |
| 19 | Contadores animados | `fx.js` |
| 20 | Transição entre páginas com cortina + flash | `fx.js` |
| 21 | Barra de progresso de leitura | `fx.js` |
| 22 | Lightbox de trailer (YouTube) | `fx.js` |
| 23 | Capitular na primeira letra do artigo | `effects.css` |
| 24 | Menu fullscreen com abertura circular | `base.css` |
| 25 | `prefers-reduced-motion` respeitado em tudo | `effects.css` |

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

> A chave `anon` é pública por design — quem protege o conteúdo são as
> policies de RLS que o `schema.sql` cria. Nunca coloque a chave `service_role`
> no site.

### 3.2 Cloudflare Pages (hospedagem)

**Pelo painel (mais simples):**

1. Suba esta pasta para um repositório no GitHub.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Escolha o repositório. Configuração do build:
   - Framework preset: **None**
   - Build command: *(deixe vazio)*
   - Build output directory: **`/`** (ou `cinevolt` se o site estiver em subpasta)
4. **Save and Deploy**. Em ~30 segundos está no ar em `seu-projeto.pages.dev`.

**Pelo terminal:**

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=cinevolt
```

### 3.3 Domínio

1. Cloudflare → **Websites** → *Add a site* (ou registre o domínio direto na Cloudflare).
2. No projeto Pages → **Custom domains** → *Set up a custom domain* → `cinevolt.com.br`.
3. Se o domínio for `.com.br` registrado no registro.br, aponte os nameservers
   que a Cloudflare mostrar no painel do registro.br.
4. SSL é automático.

---

## 4. Publicar conteúdo

Acesse **`/admin.html`**, entre com o e-mail e senha criados no Supabase.

O painel tem três colunas: **lista** de matérias · **editor** · **ajustes**.

- **Título** gera o endereço (slug) sozinho — dá para editar.
- **Corpo** aceita Markdown. A barra tem botões e atalhos:
  `Ctrl+B` negrito · `Ctrl+I` itálico · `Ctrl+K` link · `Ctrl+H` título · `Ctrl+S` salvar.
- **Imagens**: arraste para dentro do texto, ou cole (`Ctrl+V`) — sobem para o
  Storage e o markdown é inserido sozinho.
- **Capa**: sem imagem enviada, o site desenha uma **ilustração exclusiva** a
  partir do endereço da matéria. "Outra variação" troca a composição.
- **Destaque** marca a matéria que vira o hero da home (só uma por vez — o banco
  garante isso).
- **Prévia** mostra o resultado final lado a lado enquanto você escreve.
- **Rascunho** fica invisível no site; **Publicar** coloca no ar na hora.

Enquanto você escreve, o texto é guardado no próprio navegador — se fechar a aba
sem querer, ele oferece continuar de onde parou.

### Sem Supabase configurado

O site funciona em **modo demonstração**: mostra 6 matérias de exemplo e salva o
que você publicar no `localStorage` do navegador. Serve para ver o design
funcionando antes de qualquer configuração.

---

## 5. O jogo

`/jogo.html` — **Cine Runner**. Você é um rolo de filme fugindo da tempestade.

- **Espaço / ↑ / clique** pula · **↓** desliza · **Enter** recomeça
- No celular: toque em cima pula, toque embaixo desliza
- Obstáculos: pipoca, tripé, claquete (pular) e drone (deslizar)
- Raio dourado vale 50 pontos
- Recorde pessoal fica no navegador; o **Top 10** fica no Supabase (tabela `placar`)

Toda a arte do jogo é desenhada em canvas por código — cidade em três camadas de
parallax, chuva, lua com halo e raios usando o mesmo motor do hero.

---

## 6. As ilustrações

Nenhuma imagem de banco. `assets/js/art.js` desenha pôsteres em SVG a partir de
uma semente (o slug da matéria):

- 7 composições: porta iluminada, órbita, casa na colina, close de rosto,
  sala de projeção, skyline neon e rolo de filme
- 8 paletas: sci-fi, noir, terror, ação, drama, documentário, romance, anime
- A categoria da matéria escolhe a paleta; o slug escolhe a composição
- Resultado **determinístico**: a mesma matéria sempre tem a mesma capa, e duas
  matérias diferentes nunca têm a mesma

A ilustração do hero (`assets/img/guardiao.svg`) é desenhada à mão em vetor —
o manto ondula com turbulência animada e os olhos piscam sozinhos.

---

## 7. Trocar a figura do hero

Quer usar outra ilustração (um personagem seu, um ator, um cartaz)?

1. Salve um PNG **com fundo transparente** em `assets/img/`.
2. Em `index.html`, troque todo o bloco `<div class="ch-figure">…</div>` por:

```html
<div class="ch-figure" data-depth="10" id="guardiao">
  <img src="/assets/img/seu-personagem.png" alt="">
</div>
```

3. Os raios vão mirar no centro da figura automaticamente (o alvo cai no
   `#nucleoMartelo`; sem ele, no ponto padrão da cena).

---

## 8. Blogger (alternativa)

Em `blogger/` tem o mesmo site empacotado como tema do Blogger, para quem
prefere publicar pelo editor do Google em vez do painel próprio.
Leia `blogger/README.md`.

Resumo da diferença:

| | Cloudflare + Supabase | Blogger |
|---|---|---|
| Publicar | painel próprio (`/admin.html`) | editor do Blogger |
| Design | controle total | limitado ao tema |
| Jogo | sim, com placar online | sim, sem placar |
| Custo | grátis | grátis |
| Domínio próprio | sim | sim |

---

## 9. Desenvolvimento local

Qualquer servidor estático serve — não há build:

```bash
npx http-server -p 8080 .
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

---

## 10. Acessibilidade e performance

- Sem framework, sem bundler: só a biblioteca do Supabase (via CDN, ~40 KB)
- Todas as animações param com `prefers-reduced-motion: reduce`
- Canvas pausa o desenho quando não há raio vivo em tela
- Imagens com `loading="lazy"`; ilustrações são SVG (poucos KB, nítidas em qualquer tela)
- Navegação por teclado no menu, no jogo e no editor
