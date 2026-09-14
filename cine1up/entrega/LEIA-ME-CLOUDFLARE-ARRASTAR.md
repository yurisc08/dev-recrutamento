# CINE 1UP — pacote para arrastar no painel da Cloudflare

Este é o jeito mais simples de colocar o site no ar: **sem GitHub, sem
terminal**. Descompacte e arraste os arquivos.

---

## Por que este pacote é diferente

O upload direto do painel não compila a pasta `functions/` — é por isso que
aparece o aviso **"As funções Pages não são suportadas"**. Então esta versão
vem **sem** essa pasta, e o aviso não aparece.

O que a função fazia era conversar com o TMDB escondendo a chave no servidor.
Sem ela, o site fala direto com o TMDB usando a chave que você colar em
`assets/js/config.js` — já deixei configurado para isso.

A única diferença prática: **a chave do TMDB fica visível** no código do site.
É uma chave só de leitura, que não dá acesso a nada da sua conta, então o risco
é baixo. Se preferir escondê-la, use o outro pacote
(`cine1up-cloudflare.zip`) com GitHub ou Wrangler.

---

## 1. Subir

> **Atenção ao lugar certo.** Tem que ser **Pages**, não Worker. Se o endereço
> final terminar em **`.workers.dev`**, foi criado um Worker — e aí o site
> carrega sem CSS nenhum, com cara de documento do Word, porque o Worker
> devolve a mesma página para todo endereço, inclusive para os arquivos de
> estilo. O endereço certo termina em **`.pages.dev`**.

1. Descompacte este arquivo.
2. Cloudflare → **Workers & Pages** → **Create**.
3. Escolha a aba **Pages** → **Upload assets**.
   *(Não use "Create Worker", "Start with Hello World" nem "Import a repository".)*
4. Dê um nome ao projeto (`cine1up`, por exemplo).
5. **Arraste a pasta inteira** (ou selecione todos os arquivos de dentro dela).
6. **Deploy site**.

Em menos de um minuto o site está em `seu-projeto.pages.dev`.

> Arraste o **conteúdo** da pasta, não a pasta dentro de outra pasta. O
> `index.html` precisa ficar na raiz do projeto, senão a capa não abre.

Para atualizar depois: no projeto → **Create new deployment** → arraste os
arquivos de novo.

---

## 1b. Se o site abrir sem estilo nenhum

Sintoma: aparece texto preto no branco, links azuis sublinhados, um desenho
amarelo gigante no topo. É o site **sem CSS**.

**Teste em 10 segundos:** abra no navegador

```
SEU-ENDERECO/assets/css/base.css
```

- Se aparecer **código CSS** (começa com `/* ===` e `CINE 1UP — base.css`),
  os arquivos estão lá e o problema é outro — me avise.
- Se aparecer o **HTML da página** ou um erro, é o caso do aviso lá em cima:
  o projeto foi criado como **Worker**, que devolve o `index.html` para
  qualquer endereço. O navegador recebe HTML onde esperava CSS e ignora.

**Como consertar:** apague o projeto (no projeto → *Settings* → *Delete*) e
refaça pelo caminho **Workers & Pages → Create → aba Pages → Upload assets**.
Confira se o endereço final termina em `.pages.dev`.

---

## 2. Domínio próprio

No projeto → **Custom domains** → *Set up a custom domain* → digite seu
domínio. Se ele estiver no registro.br, aponte os nameservers que a Cloudflare
mostrar. O HTTPS é automático.

---

## 3. Filmes e séries (TMDB)

1. Crie a chave em **themoviedb.org → Configurações → API** (tipo *Developer*).
2. Abra `assets/js/config.js` e cole:

```js
TMDB_KEY: 'sua_chave_aqui',
TMDB_PROXY: false,
```

3. Suba os arquivos de novo.

Enquanto não configurar, as vitrines mostram um aviso explicando o que falta —
o resto do site funciona normalmente.

---

## 4. Suas matérias (Supabase)

Siga o `LEIA-ME.md` do pacote `cine1up-supabase.zip`. No fim, você cola duas
linhas em `assets/js/config.js`:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

E sobe os arquivos de novo.

---

## 5. Entrar no painel

O endereço é **`seudominio.com.br/admin.html`** (ou `/publicar`). Ele não
aparece em nenhum menu do site, de propósito. Salve nos favoritos.

---

## Os três jeitos de subir, comparados

| | Arrastar no painel | Conectar ao Git | Wrangler (terminal) |
|---|---|---|---|
| Precisa de GitHub | não | sim | não |
| Precisa de terminal | não | não | sim |
| Pasta `functions/` funciona | **não** | sim | sim |
| Chave do TMDB escondida | não | sim | sim |
| Atualizar o site | arrastar de novo | `git push` | um comando |

Este pacote é o da primeira coluna. Se um dia quiser trocar, é só usar o outro
pacote — o site é o mesmo.
