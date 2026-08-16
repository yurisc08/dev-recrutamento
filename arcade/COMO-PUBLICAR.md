# Como publicar no Magicine

Guia direto. Você só precisa mexer em **um arquivo**: `shared/news-data.js`.

---

## O básico: publicar uma matéria

Abra `shared/news-data.js`. Você vai ver uma lista assim:

```js
window.MAGICINE_POSTS = [
  { ...matéria... },
  { ...matéria... },
];
```

Para publicar, **cole um bloco novo logo depois do `[`** (o primeiro da lista
é o mais fácil de achar depois):

```js
{
  slug: "titulo-da-materia-sem-acento",
  title: "O título que aparece na capa",
  excerpt: "Uma ou duas frases de chamada, aparecem no card.",
  category: "Cinema",
  tags: ["ficção científica", "estreia"],
  author: "Seu nome",
  published_at: "2026-09-01",
  featured: true,
  body: [
    { type: "p", text: "Primeiro parágrafo." },
    { type: "h2", text: "Um subtítulo" },
    { type: "p", text: "Mais um parágrafo." },
  ],
},
```

Salve, suba o site, pronto. A capa, a listagem, a busca e a página da matéria
se montam sozinhas.

### As regras que importam

| Campo | Regra |
| --- | --- |
| `slug` | Sem acento, sem espaço, sem maiúscula. Use hífen. **Nunca repita** um slug já usado. |
| `published_at` | Sempre `"AAAA-MM-DD"`. É por ele que o site ordena. |
| `category` | Uma de: **Cinema, Séries, Games, Bastidores**. Uma categoria nova aparece sozinha no menu e nos filtros — para criar uma, basta usar o nome novo e dar a ela uma cor em `--c-...` no `style.css`. |
| `featured` | `true` manda para a capa grande. Se houver várias, ganha a mais recente. |
| `status` | `"draft"` esconde do site. Serve para deixar meio escrito. |

### Os blocos de texto

```js
{ type: "p",     text: "Um parágrafo." }
{ type: "h2",    text: "Um subtítulo" }
{ type: "quote", text: "Uma citação.", cite: "Quem disse" }
{ type: "list",  items: ["Primeiro item", "Segundo item"] }
{ type: "img",   src: "img/foto.jpg", alt: "Descrição", caption: "Legenda" }
```

### Erros que quebram a página

1. **Esquecer uma vírgula** entre um bloco e outro.
2. **Aspas dentro do texto** sem escapar. Se precisar de aspas, use as
   tipográficas: `"assim"`, em vez de `"assim"`.
3. **Slug repetido** — a segunda matéria fica inacessível.

Se a página ficar em branco depois de editar, é quase sempre um desses três.
Abra o console do navegador (F12) e a mensagem de erro aponta a linha.

---

## Imagens

O campo `cover` aceita:

- um arquivo do próprio site: `cover: "img/minha-capa.jpg"` (crie a pasta
  `img/` e coloque o arquivo lá);
- ou um endereço completo: `cover: "https://..."`.

Sem `cover`, entra um fundo gerado com a cor da editoria — funciona bem, não
é obrigatório ter imagem.

As ilustrações que já vêm no site estão em `img/`, em SVG. Você pode
reaproveitá-las em matérias novas do mesmo assunto: é só apontar o `cover`
para o arquivo que combina.

**Atenção ao caminho:** escreva sempre relativo à raiz (`img/arquivo.svg`),
nunca `../img/`. O site resolve o resto sozinho — se você escrever com `../`,
a imagem some na home.

**Sobre direito de imagem:** use banco livre (Unsplash, Pexels) ou material
oficial de divulgação do estúdio, com o crédito que eles pedem. Pegar imagem
de outro site é o tipo de coisa que derruba a aprovação no AdSense.

---

## Publicando o site depois de editar

**Se você subiu por upload** (Workers & Pages → Upload assets): entre no
projeto, aba **Create deployment**, e envie a pasta de novo. Leva menos de um
minuto.

**Se você conectou ao Git:** faça commit e push. O Cloudflare publica sozinho
a cada push.

O `_headers` já mantém o HTML sem cache, então a matéria nova aparece na hora
para quem entrar. CSS e JS ficam 10 minutos em cache.

---

## Quando migrar para o Supabase

Editar arquivo e republicar resolve bem até umas poucas matérias por semana.
Vale trocar quando você quiser:

- escrever de outro computador ou do celular;
- ter mais de uma pessoa publicando;
- agendar publicações;
- passar de algumas dezenas de matérias.

O caminho está no `README.md`, seção *Migrando para o Supabase*: tem o SQL da
tabela pronto (incluindo a regra de segurança que impede a chave pública de
enxergar rascunhos) e as duas linhas que mudam em `shared/news.js`.

O importante: **o formato das matérias não muda**. O campo `body` já é o
mesmo JSON que vai para a coluna `jsonb`, então dá para copiar o que já
existe sem converter nada.

---

## Sobre o que escrever

Só publique texto seu. Copiar matéria de outro site — mesmo reescrevendo com
outras palavras — é violação de direito autoral, e o AdSense recusa sites com
conteúdo derivado. Notícia factual (o que foi anunciado, quando estreia)
qualquer um pode contar; o que não se copia é o **texto** de quem contou.

Análise, crítica, lista e opinião são o terreno mais seguro e o que rende
melhor: ninguém mais tem o seu ponto de vista, e são matérias que continuam
recebendo visita meses depois.
