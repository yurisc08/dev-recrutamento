# CINE 1UP — pacote da Cloudflare

Este pacote é **só o site**. É o que você sobe na Cloudflare Pages.

O banco fica no outro pacote (`cine1up-supabase.zip`). Dá para subir este
primeiro e ligar o banco depois: sem Supabase configurado, o site abre em modo
demonstração, com matérias de exemplo.

---

## O que tem aqui

```
index.html          Capa, com o labirinto jogável
emcartaz.html       Filmes nos cinemas agora e estreias
series.html         Séries em alta
criticas.html       Matérias da redação, com filtro e busca
post.html           Leitor de matéria
jogo.html           Cine Runner
sobre.html          Sobre
privacidade.html    Política de privacidade (o AdSense exige)
admin.html          Painel de publicação — sem link em nenhum menu
404.html            Página de erro

assets/             CSS, JavaScript e o favicon
functions/api/      Função que fala com o TMDB escondendo a chave
_headers            Cache e cabeçalhos de segurança
_redirects          Endereços curtos (/emcartaz, /series, /publicar)
ads.txt             Autorização de venda de anúncios
robots.txt          Pede aos buscadores para ignorar o painel
sitemap.xml
README.md           Documentação completa do projeto
```

---

## 1. Subir o site

> **Tem que ser Pages, não Worker.** Se o endereço final terminar em
> `.workers.dev`, foi criado um Worker: ele devolve a mesma página para todo
> endereço, inclusive para os arquivos de estilo, e o site abre sem CSS
> nenhum. O endereço certo termina em `.pages.dev`.

### Pelo painel (recomendado)

1. Suba esta pasta para um repositório no GitHub.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → escolha o repositório.
3. Configuração do build:
   - Framework preset: **None**
   - Build command: *(deixe vazio)*
   - Build output directory: **`/`**
4. **Save and Deploy**. Em menos de um minuto o site está em
   `seu-projeto.pages.dev`.

### Pelo terminal

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=cine1up
```

Não há etapa de build: é HTML, CSS e JavaScript prontos.

---

## 2. Domínio próprio

1. Registre o domínio (registro.br para `.com.br`, ou direto na Cloudflare).
2. No projeto Pages → **Custom domains** → *Set up a custom domain*.
3. Domínio do registro.br: aponte os nameservers que a Cloudflare mostrar.
4. O certificado HTTPS é automático.

---

## 3. Ligar o TMDB (filmes e séries)

As seções "Em cartaz", "Estreias" e "Séries em alta" vêm da API do TMDB.

1. Crie a chave em **themoviedb.org → Configurações → API** (tipo *Developer*).
2. Cloudflare Pages → seu projeto → **Settings → Environment variables** →
   adicione:

```
TMDB_KEY = sua_chave_aqui
```

3. Faça um novo deploy para a variável valer.

A função em `functions/api/tmdb.js` conversa com o TMDB pelo servidor, então a
chave nunca aparece no navegador de quem visita.

Enquanto não configurar, as vitrines mostram um aviso explicando o que falta —
o resto do site funciona normalmente.

---

## 4. Ligar o Supabase (suas matérias)

Abra o pacote `cine1up-supabase.zip` e siga o `LEIA-ME-SUPABASE.md`. No fim,
você volta aqui e cola duas linhas em `assets/js/config.js`:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

Depois faça um novo deploy.

---

## 5. Ligar o AdSense

Depois da conta aprovada:

1. Crie quatro blocos de anúncio no AdSense e anote os IDs.
2. Preencha em `assets/js/config.js`, no bloco `ADSENSE`.
3. Edite `ads.txt` e troque `pub-0000000000000000` pelo seu número.
4. Novo deploy.

Detalhes e as regras do programa estão na seção 5 do `README.md`.

---

## 6. Entrar no painel

O endereço é **`seudominio.com.br/admin.html`** (ou `/publicar`). Ele não
aparece em nenhum menu do site, de propósito. Salve nos favoritos.

O login vem do Supabase — veja o outro pacote.
