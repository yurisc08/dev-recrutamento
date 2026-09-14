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
3. **Fazer upload** → escolha **`tema-cine1up.xml`** → confirme.
4. Abra o blog. O labirinto já está rodando na capa.

> **Se o upload der erro**, faça o teste da pasta `diagnostico/` antes de
> qualquer outra coisa — está explicado na seção logo abaixo. Ele diz em três
> minutos onde está o problema, e sem isso eu só consigo chutar.
>
> Antes disso, vale tentar o outro arquivo: **`tema-cine1up-v3.xml`**.
> Os dois têm exatamente o mesmo conteúdo; muda só o motor de template que o
> Blogger usa para ler o arquivo (o segundo declara `layoutsVersion='3'` e
> `version='2'` nos widgets). Um dos dois é o que a sua conta aceita.
>
> Se os dois derem erro, **copie a mensagem inteira** que o Blogger mostra: ela
> aponta a linha e o motivo, e é o que permite corrigir.

> Antes de trocar, guarde uma cópia do tema atual: mesmo menu → **Fazer backup**.

---

## 1b. Se der erro no upload: o teste de três arquivos

Na pasta `diagnostico/` tem três temas, do mais simples ao completo. Suba um
por vez, na mesma tela de sempre (Tema → Restaurar → Fazer upload), e anote
qual deu erro:

| Arquivo | O que tem dentro | Tamanho |
|---|---|---|
| `diag-1-esqueleto.xml` | o mínimo que o Blogger aceita | 1 KB |
| `diag-2-css.xml` | o mesmo + todo o CSS | 70 KB |
| `diag-3-css-js.xml` | o mesmo + todo o JavaScript | 169 KB |

O que cada resultado significa:

- **O 1 já dá erro** → o problema não é o conteúdo do tema. Pode ser a conta, o
  navegador ou o arquivo chegando corrompido. Tente por outro navegador.
- **O 1 sobe, o 2 dá erro** → o problema está no CSS (provavelmente o tamanho).
- **O 2 sobe, o 3 dá erro** → o problema está no bloco de JavaScript.
- **Os três sobem, mas o tema completo dá erro** → o problema está nas
  marcações do tema, e aí eu sei exatamente onde procurar.

Depois de subir cada teste o blog fica com cara de rascunho — é esperado. Ao
terminar, suba o tema de verdade (ou o seu anterior, se guardou o backup).

**Me mande o número que falhou e um print da mensagem de erro.** Com isso eu
corrijo de primeira.

---

## 2. Configurar (2 minutos)

Tudo que você precisa mexer está no topo do arquivo, num bloco marcado
**CONFIGURE AQUI**. Dá para editar antes de subir, ou depois em
**Tema → Editar HTML** (procure por `CONFIGURE AQUI`).

```js
window.CINE1UP = {
  ADSENSE: {
    cliente: '',       // 'ca-pub-0000000000000000'
    slots: { lista: '', artigo: '', rodape: '' },
    semConsentimento: 'nada',
    semAnuncioEm: ['/p/fliperama.html']
  },

  SECOES: [
    { rotulo: 'Notícia', titulo: 'Últimas notícias', olho: 'Acabou de sair' },
    { rotulo: 'Série',   titulo: 'Séries',           olho: 'Maratona' }
  ],
  ...
};
```

### Seções da capa

A capa monta as seções lendo os **marcadores** das suas postagens. Por padrão:

```js
SECOES: [
  { rotulo: 'Notícia', titulo: 'Últimas notícias', olho: 'Acabou de sair' },
  { rotulo: 'Série',   titulo: 'Séries',           olho: 'Maratona' }
]
```

Troque, tire ou acrescente à vontade — só precisa que o `rotulo` seja igualzinho
ao marcador que você usa nas postagens. Uma seção sem nenhuma postagem
desaparece da página, em vez de mostrar um vazio.

Abaixo delas vem sempre "As últimas da redação", com tudo que foi publicado.

> Esta versão **não usa o TMDB**. Nada de chave de API, nada de serviço externo:
> tudo que aparece na capa vem do seu próprio blog.

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

> O jogo em si já está dentro do tema. A página só coloca o gabinete na tela —
> por isso ela é obrigatória para o Cine Runner existir.

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
node blogger/build.js    # monta os dois temas
node blogger/validar.js  # confere as regras conhecidas do Blogger
node blogger/previa.js   # monta as duas prévias
```

Abra `blogger/previa-capa.html` e `blogger/previa-fliperama.html` no navegador
(ou a pasta `previa/` do pacote). Os posts são de mentira, mas o labirinto, o
jogo, o CRT e os cards são exatamente os do tema.

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
| Filmes e séries do TMDB | sim | não (só o seu conteúdo) |
| Cine Runner | sim | sim |
| Placar online do Cine Runner | sim | não (só o recorde no navegador) |
| Ilustrações geradas | sim | sim |
| Comentários | — | nativos do Blogger |
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
