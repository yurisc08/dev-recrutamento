# Flappy Bird

Clone do Flappy Bird em HTML5 Canvas. Sem build, sem dependências, sem imagens
externas — tudo é desenhado em código e os efeitos sonoros são gerados via
WebAudio. Basta servir os arquivos estáticos.

## Como jogar

- **Desktop:** `Espaço`, `↑` ou `W` (ou clique) para bater as asas.
- **Celular:** toque na tela.
- O recorde e a preferência de som ficam salvos no `localStorage` do navegador.

## Rodando localmente

Abrir o `index.html` direto pelo `file://` funciona, mas o ideal é usar um
servidor local (o manifest e o `localStorage` se comportam melhor via HTTP):

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Deploy no Cloudflare Pages

Este é um site 100% estático — não há etapa de build.

### Opção 1: upload direto (mais rápido)

1. Acesse **Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets**.
2. Envie o conteúdo desta pasta (ou o próprio `.zip`).
3. Clique em **Deploy**. O site fica no ar em `https://<projeto>.pages.dev`.

### Opção 2: conectado ao Git

1. **Workers & Pages → Create → Pages → Connect to Git** e selecione o repositório.
2. Configure o build assim:
   - **Framework preset:** `None`
   - **Build command:** *(deixe vazio)*
   - **Build output directory:** `flappy-bird` (ou `/` se a pasta for a raiz do repo)
3. **Save and Deploy.** Cada push na branch configurada gera um novo deploy.

### Opção 3: Wrangler (linha de comando)

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=flappy-bird
```

## Arquivos

| Arquivo                | Função                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `index.html`           | Estrutura da página, menu e tela de fim de jogo                |
| `style.css`            | Layout responsivo em proporção 9:16 e estilo das telas         |
| `game.js`              | Física, colisão, pontuação, áudio e renderização no canvas     |
| `_headers`             | Cabeçalhos de cache e segurança lidos pelo Cloudflare Pages    |
| `manifest.webmanifest` | Permite instalar o jogo como app no celular                    |
| `icon.svg`             | Ícone usado pelo manifest                                      |

## Ajustando a dificuldade

As constantes no topo do `game.js` controlam o balanceamento:

```js
const GRAVITY = 1500;      // queda mais rápida
const FLAP_V = -430;       // força do pulo
const SPEED = 130;         // velocidade do cenário
const PIPE_GAP = 158;      // espaço entre os canos
const PIPE_SPACING = 200;  // distância entre um cano e o próximo
```

Aumentar `PIPE_GAP` ou diminuir `SPEED` deixa o jogo mais fácil.
