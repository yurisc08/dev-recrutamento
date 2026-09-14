# CINE 1UP no Blogger

A mesma revista, publicando pelo editor do Google. Labirinto jogável na capa,
prateleiras do TMDB, ilustrações geradas, tela de CRT, Cine Runner e AdSense —
tudo dentro de um arquivo de tema.

### Como o tema conversa com o Blogger

O interpretador de temas do Blogger é rígido e recusa uma porção de coisas que
parecem inofensivas: campos antigos como `data:post.snippet` e
`data:post.firstImageUrl`, expressões com ternário dentro de `expr:`, widget sem
`version='2'`. Qualquer um deles já derruba o upload com uma lista de erros.

Por isso este tema pede ao Blogger o **mínimo possível**:

- só `data:post.title` e `data:post.body`, e só na página da matéria
- links do menu são endereços comuns (`/search/label/Notícia`), sem `expr:`
- a lista de matérias da capa **não** vem do tema: é montada no navegador a
  partir do feed JSON do próprio blog (`/feeds/posts/summary/default?alt=json`)

Menos coisa para o Blogger interpretar, menos chance de erro no upload. Antes de
subir, rode o validador — ele confere as regras conhecidas:

```bash
node blogger/build.js && node blogger/validar.js
```

> A validação final é do próprio Blogger. Se ainda aparecer erro no upload,
> **copie a mensagem inteira**: ela diz a linha e o motivo.

---

## 1. Instalar o tema

1. Abra [blogger.com](https://www.blogger.com) e crie o blog (ou use um existente).
2. Menu lateral → **Tema** → seta ao lado de *Personalizar* → **Restaurar**.
3. **Fazer upload** → escolha `cine1up-blogger.xml` → confirme.
4. Abra o blog. O labirinto já está rodando na capa.

> Antes de trocar, guarde uma cópia do tema atual: mesmo menu → **Fazer backup**.

---

## 2. Configurar (2 minutos)

Tudo que você precisa mexer está no topo do arquivo, num bloco marcado
**CONFIGURE AQUI**. Dá para editar antes de subir, ou depois em
**Tema → Editar HTML** (procure por `CONFIGURE AQUI`).

```js
window.CINE1UP = {
  TMDB_KEY: '',        // chave do TMDB — sem ela, as prateleiras somem
  TMDB_PROXY: false,   // deixe false: no Blogger não existe /api/tmdb

  ADSENSE: {
    cliente: '',       // 'ca-pub-0000000000000000'
    slots: { lista: '', artigo: '', rodape: '' },
    semConsentimento: 'nada',
    semAnuncioEm: ['/p/fliperama.html']
  },
  ...
};
```

### TMDB

Chave grátis em **themoviedb.org → Configurações → API** (tipo *Developer*).
Cole em `TMDB_KEY`. Sem ela, as seções "Nos cinemas agora" e "Séries em alta"
simplesmente não aparecem — o resto do site funciona igual.

> No Blogger a chave fica visível no código do tema. É uma chave só de leitura,
> então o risco é baixo. Se isso incomodar, a versão Cloudflare do projeto
> guarda a chave no servidor.

### AdSense

Depois da conta aprovada, crie três blocos de anúncio no AdSense e cole os IDs
em `slots`. Com `cliente` vazio, nenhum script de anúncio carrega e os espaços
nem aparecem.

O `ads.txt` no Blogger fica em **Configurações → Monetização → ads.txt
personalizado**. Cole lá:

```
google.com, pub-SEU-NUMERO, DIRECT, f08c47fec0942fa0
```

---

## 3. Criar as duas páginas

O tema espera duas páginas em endereços fixos. Os arquivos estão nesta pasta,
prontos para copiar e colar.

| Arquivo | Título da página | Endereço que precisa sair |
|---|---|---|
| `fliperama.html` | Fliperama | `/p/fliperama.html` |
| `privacidade.html` | Privacidade | `/p/privacidade.html` |

Em cada uma: **Páginas → Nova página** → digite o título → mude o editor para
**Visualização HTML** → cole o conteúdo do arquivo → **Publicar**.

O Blogger monta o endereço a partir do título, então "Fliperama" vira
`/p/fliperama.html` sozinho. Confira depois de publicar: se sair diferente, o
link do menu quebra.

Na página de privacidade, **troque o e-mail de contato** (aparece duas vezes).

---

## 4. Publicar matérias

Escreva normalmente em **Nova postagem**. O tema cuida do resto:

- **Marcadores** viram a editoria do card e definem a paleta da ilustração
  gerada. Use os mesmos nomes do menu: `Notícia`, `Série`, `Crítica`, `Ensaio`,
  `Lista`, `Estreia`, `Clássico`, `Entrevista`.
- **Primeira imagem do post** vira a capa do card automaticamente (o tema usa a
  miniatura do feed e pede a versão grande dela).
- **Sem imagem nenhuma?** O tema desenha uma ilustração exclusiva em SVG a
  partir do endereço do post — a mesma arte generativa da versão principal.
- A **matéria mais recente** vira o título grande da capa sozinha.

O menu do tema aponta para marcadores (`/search/label/Notícia`), então uma
editoria só aparece no menu depois que existir pelo menos um post com aquele
marcador.

---

## 5. Ver antes de subir

Dá para abrir o tema no seu computador, com o mesmo CSS e o mesmo JavaScript
que vão para o Blogger:

```bash
node blogger/build.js    # monta o tema a partir dos arquivos do site
node blogger/previa.js   # monta blogger/previa.html
```

Abra `blogger/previa.html` no navegador. Os posts são de mentira, mas o
labirinto, as prateleiras, o CRT e os cards são exatamente os do tema.

> A prévia não valida as marcações próprias do Blogger (`b:if`, `b:loop`,
> `data:...`) — quem confere aquilo é o próprio Blogger, no upload.

---

## 6. Domínio próprio

**Configurações → Publicação → Domínio personalizado** → digite
`www.seudominio.com.br`. O Blogger mostra dois registros CNAME; cadastre-os no
painel do seu domínio (registro.br ou Cloudflare) e volte para salvar.

---

## 7. O que muda em relação à versão Cloudflare

| | Cloudflare + Supabase | Blogger |
|---|---|---|
| Escrever matéria | painel próprio em `/admin.html` | editor do Google |
| Rascunho, agendamento | sim | sim |
| Labirinto na capa | sim | sim |
| Prateleiras do TMDB | sim | sim |
| Cine Runner | sim | sim |
| Placar online do Cine Runner | sim | não (só o recorde no navegador) |
| Ilustrações geradas | sim | sim |
| Comentários | — | nativos do Blogger |
| Chave do TMDB escondida | sim (função no servidor) | não (fica no tema) |
| Newsletter | sim (Supabase) | precisa de serviço externo |
| Controle do design | total | o que o tema expõe |

---

## 8. Regerar o tema

Mexeu no CSS ou no JavaScript do site principal? Rode na raiz do projeto:

```bash
node blogger/build.js
```

O tema é montado a partir dos mesmos arquivos, então as duas versões nunca
ficam diferentes. Depois é só subir o XML de novo no Blogger.
