# 🕹️ CINE 1UP

**Cinema e séries em modo arcade** — estreias e séries em alta puxadas
automaticamente do TMDB, críticas escritas por você, ilustrações de fliperama
geradas por código e dois jogos na casa.

---

## 1. O nome

**CINE 1UP** — "1UP" é a vida extra do fliperama. Curto, fácil de falar e de
lembrar, e liga as duas coisas que o site é: cinema e arcade.

> ⚠️ **Não consegui verificar disponibilidade**: o ambiente onde este projeto
> foi montado não tem acesso a WHOIS/DNS. Confira antes de comprar:
> - `registro.br` → para `cine1up.com.br`
> - `dash.cloudflare.com` → Domain Registration → para `cine1up.com` / `.tv`

Trocar o nome no site inteiro: editar `assets/js/config.js` (campo `SITE.nome`)
e o texto `CINE<b>1UP</b>` no cabeçalho de cada `.html`.

---

## 2. O que está pronto

```
cine1up/
├── index.html          Home com o labirinto jogável
├── criticas.html        Todas as matérias, com filtro e busca
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
   - Build output directory: **`/`** (ou `cine1up` se o site estiver em subpasta)
4. **Save and Deploy**.

**Pelo terminal:**

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=cine1up
```

### 3.3 Domínio

1. Cloudflare → **Websites** → *Add a site* (ou registre o domínio na Cloudflare).
2. No projeto Pages → **Custom domains** → `cine1up.com.br`.
3. Domínio `.com.br` do registro.br: aponte os nameservers que a Cloudflare mostrar.
4. SSL é automático.

---

### 3.4 TMDB (filmes e séries de verdade)

As vitrines **Em cartaz**, **Estreias**, **Séries em alta** e **Populares** não
são escritas por ninguém: vêm da API do TMDB e se atualizam sozinhas.

1. Crie uma conta em [themoviedb.org](https://www.themoviedb.org) (grátis).
2. **Configurações → API → Criar** → escolha *Developer* → copie a
   **chave da API (v3 auth)**.
3. Escolha um dos dois caminhos:

**Recomendado — chave no servidor.** Cloudflare Pages → seu projeto →
**Settings → Environment variables** → adicione:

```
TMDB_KEY = sua_chave_aqui
```

Pronto. A função em `functions/api/tmdb.js` fala com o TMDB pelo servidor e a
chave nunca aparece no navegador de quem visita. Ela só aceita os endpoints que
o site usa, para não virar um proxy aberto.

**Plano B — chave no navegador.** Se hospedar fora da Cloudflare, cole a chave
em `assets/js/config.js`:

```js
TMDB_KEY: 'sua_chave_aqui',
```

Funciona igual, mas a chave fica visível no código do site. Chaves v3 do TMDB
são só de leitura, então o risco é baixo — ainda assim, prefira a primeira opção.

**Enquanto não configurar**, as vitrines mostram um aviso explicando o que
falta, em vez de quebrar o layout.

O resultado fica em cache no navegador por 6 horas, então uma visita não
dispara dezenas de chamadas. Para limpar: `TMDB.limparCache()` no console.

> Crédito obrigatório: o TMDB pede que sites que usam a API digam que os dados
> vêm de lá. O rodapé das páginas já faz isso.

---

## 4. Como funcionam o acesso e as publicações

### 4.1 Quem enxerga o quê

Existem exatamente dois perfis. Não há tela de cadastro no site — ninguém
consegue criar conta sozinho.

| | Visitante (qualquer pessoa) | Redação (você e quem você liberar) |
|---|---|---|
| Ler matérias publicadas | sim | sim |
| Ver rascunhos | **não** | sim |
| Criar, editar e apagar matérias | **não** | sim |
| Enviar imagens | **não** | sim |
| Ver a lista da newsletter | **não** | sim |
| Jogar e mandar pontuação | sim | sim |

Isso não é só a tela escondendo botão: é o banco recusando. As regras de
*Row Level Security* do `schema.sql` avaliam cada consulta no servidor do
Supabase. Mesmo que alguém abra o console do navegador e chame a API na mão
com a chave pública do site, o banco responde "não" para tudo que não seja
leitura de matéria publicada.

### 4.2 Liberar alguém para publicar

São dois passos — e os **dois** são necessários. Ter login não dá permissão
nenhuma; quem manda é a tabela `redacao`.

**Passo 1 — criar o login.**
Supabase → **Authentication → Users → Add user** → e-mail e senha →
marque *Auto Confirm User*.

**Passo 2 — colocar na redação.**
Supabase → **SQL Editor** → rode trocando o e-mail e o nome:

```sql
insert into public.redacao (user_id, nome, papel)
select id, 'Seu Nome', 'admin' from auth.users
 where email = 'voce@exemplo.com'
on conflict (user_id) do nothing;
```

Pronto: entre em `/admin.html` com esse e-mail e senha.

Se pular o passo 2, o painel avisa na cara: *"Este login existe, mas ainda não
está liberado para publicar"* — e já mostra o comando que falta rodar.

**Fechar o cadastro público.** Em *Authentication → Providers → Email*,
desligue **Enable signup**. Assim nem contas inúteis são criadas.

**Ver quem tem acesso hoje:**

```sql
select r.papel, r.nome, u.email, r.criado_em
  from public.redacao r join auth.users u on u.id = r.user_id
 order by r.criado_em;
```

**Tirar o acesso de alguém** (o login continua existindo, mas para de escrever):

```sql
delete from public.redacao
 where user_id = (select id from auth.users where email = 'ex@exemplo.com');
```

**Esqueceu a senha?** Supabase → Authentication → Users → os três pontinhos ao
lado do usuário → *Send password recovery*.

### 4.3 O caminho de uma matéria

1. Você entra em **`/admin.html`** e clica em **+ Nova matéria**.
2. Escreve. O **título** gera o endereço (slug) sozinho; dá para editar.
   O corpo aceita Markdown, com barra de botões e atalhos:
   `Ctrl+B` negrito · `Ctrl+I` itálico · `Ctrl+K` link · `Ctrl+H` título · `Ctrl+S` salvar.
3. **Imagens**: arraste para dentro do texto ou cole (`Ctrl+V`). Elas sobem
   para o Storage do Supabase e o markdown entra sozinho.
4. **Capa**: se você não enviar imagem, o site desenha uma ilustração exclusiva
   a partir do endereço da matéria. "Outra variação" troca a composição.
5. **Status `rascunho`** → a matéria existe só para a redação. Some do site.
6. **Publicar** → aparece **na hora** em `/criticas.html`, na home e nos
   relacionados. Não precisa fazer deploy de novo: o site é estático, mas o
   conteúdo vem do banco em tempo real.
7. **Destaque** marca a matéria que vira o título grande da capa. Só uma por
   vez — um gatilho no banco desmarca a anterior sozinho.

Enquanto você escreve, o texto é guardado no seu próprio navegador. Se a aba
fechar sem querer, ao voltar o painel oferece continuar de onde parou.

**Editorias disponíveis:** Notícia, Crítica, Estreia, Série, Ensaio, Entrevista,
Lista e Clássico. A editoria também escolhe a paleta da ilustração gerada.

### 4.4 O que é automático e o que é seu

| Seção | De onde vem | Precisa de você? |
|---|---|---|
| Em cartaz, Estreias, Séries em alta, Populares | TMDB | não, atualiza sozinho |
| Ticker de manchetes da home | TMDB | não |
| Notícias, críticas, ensaios | você, pelo painel | sim |
| Capa (matéria em destaque) | a matéria marcada como destaque | sim |
| Placar do fliperama | quem jogar | não |

### 4.5 Sem Supabase configurado

O site roda em **modo demonstração**: mostra matérias de exemplo e salva o que
você publicar no `localStorage` do navegador. Serve para ver tudo funcionando
antes de configurar qualquer coisa — mas nada disso vai para o ar de verdade.

---

## 5. AdSense

O site já vem com tudo montado para anúncios do Google. Falta só a conta.

### 5.1 O que o código já faz pelas regras do programa

| Regra | Como está resolvido |
|---|---|
| Precisa de política de privacidade dizendo que usa cookies e citando o Google | `privacidade.html`, com link no rodapé de todas as páginas |
| Precisa de `ads.txt` na raiz | `ads.txt` — **troque o número pelo seu ID de editor** |
| Consentimento de cookies | Nenhum script do Google carrega antes da pessoa escolher no aviso |
| Nada de clique acidental | Nenhum anúncio no fliperama, e os blocos mantêm distância de botões |
| Nada de anúncio em página sem conteúdo | `/404.html` e `/admin.html` não recebem anúncio |
| Densidade razoável | No máximo 3 blocos por página, e o do meio do texto só entra se a matéria tiver fôlego |
| Rótulo permitido | "Publicidade" — o Google só aceita esta palavra ou "Links patrocinados" |
| Não empurrar o conteúdo quando o anúncio chega | Cada espaço nasce com altura reservada |

### 5.2 Ligar a sua conta

1. Inscreva-se em [adsense.google.com](https://adsense.google.com) com o domínio
   do site **já no ar e com conteúdo publicado**. Site vazio é recusado.
2. Aprovado, crie os blocos em **Anúncios → Por unidade de anúncio →
   Display**. Crie quatro e anote o ID de cada um.
3. Preencha em `assets/js/config.js`:

```js
ADSENSE: {
  cliente: 'ca-pub-0000000000000000',   // seu ID de editor
  slots: {
    artigo: '1111111111',   // no meio da matéria
    rodape: '2222222222',   // fim da matéria
    lista:  '3333333333',   // entre seções de listagem
    home:   '4444444444'    // meio da home
  },
  semConsentimento: 'nada'
}
```

4. Edite `ads.txt` e troque `pub-0000000000000000` pelo seu número.
5. Publique. Enquanto `cliente` estiver vazio, nenhum script de anúncio é
   carregado e os espaços nem aparecem na página — o site continua limpo.

### 5.3 Onde os anúncios aparecem

- **Home** — um bloco entre as vitrines do TMDB e as matérias da redação
- **Em cartaz / Séries** — um bloco entre seções
- **Críticas** — um bloco depois da grade, antes da paginação
- **Matéria** — um depois do terceiro parágrafo e um no fim do texto
- **Fliperama, 404 e painel** — nenhum, de propósito

### 5.4 Duas coisas que dependem de você

**Aprovação.** O Google exige conteúdo próprio e suficiente, navegação clara e
a política de privacidade no ar. As vitrines do TMDB **não contam como conteúdo
próprio** — são dados de terceiros. Publique algumas críticas e notícias suas
antes de se inscrever.

**Visitantes da Europa e do Reino Unido.** Para essa audiência o Google exige
uma CMP certificada por ele — o aviso de cookies deste site cumpre a LGPD
brasileira, mas não substitui a certificação. A solução gratuita é do próprio
Google: AdSense → **Privacidade e mensagens → Mensagem de consentimento da UE**,
ative e ele passa a exibir o próprio banner para quem acessa de lá.

**Se a pessoa recusar os cookies**, por padrão nenhum anúncio é exibido. Se
preferir mostrar anúncios não personalizados nesse caso, troque em
`config.js`:

```js
semConsentimento: 'nao-personalizado'
```

### 5.5 No Blogger

A versão do Blogger não usa este código: lá os anúncios entram pelo próprio
painel (**Ganhos → AdSense**) ou por um widget de HTML no tema. O `ads.txt` no
Blogger fica em **Configurações → Monetização → ads.txt personalizado**.

---

## 6. Os jogos

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

## 7. As ilustrações

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

## 8. Mexer no labirinto

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

## 9. Blogger (alternativa)

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

## 10. Desenvolvimento local

Não há build:

```bash
npx http-server -p 8080 .
# ou
python3 -m http.server 8080
```

---

## 11. Acessibilidade e performance

- Sem framework, sem bundler: só a biblioteca do Supabase (via CDN, ~40 KB)
- Todas as animações param com `prefers-reduced-motion: reduce`, inclusive o
  labirinto (que nem chega a iniciar)
- O labirinto pausa sozinho quando a aba sai de foco
- Nenhum `shadowBlur` no caminho de cada quadro — só nas camadas pintadas uma vez
- Ilustrações são SVG: poucos KB e nítidas em qualquer tela
- Navegação por teclado no menu, nos dois jogos e no editor
