# Montando o fluxo no Power Automate

O arquivo `portal-decisoes.html` é só a tela. Quem guarda a base, confere quem é
cada pessoa e grava as decisões é **um fluxo seu**, no Power Automate, com os
dados numa lista do SharePoint da empresa.

Essa divisão é o ponto central: **um HTML aberto no computador não consegue
esconder nada de quem o abriu**. Se a base viesse dentro do arquivo, todo gestor
veria todo mundo. Por isso o arquivo vem vazio — ele pergunta, o fluxo responde
só o que é daquela pessoa.

```
  Gestor abre o HTML  ──POST {acao, chave}──▶  Fluxo (Power Automate)
                                                  │ confere a chave
                                                  │ filtra a equipe dele
       tela mostra a equipe  ◀──JSON com as linhas─┘ grava e registra
```

---

## Parte 1 — As listas no SharePoint

No site do SharePoint da equipe, crie **duas listas**.

### Lista `Base` (uma linha por colaborador)

| Coluna | Tipo | Observação |
|---|---|---|
| `Title` | Texto | use a **matrícula (CHAPA)** aqui — é a chave |
| `Nome` | Texto | |
| `Diretoria` | Texto | |
| `Divisao` | Texto | |
| `GestorImediato` | Texto | **é esta coluna que separa a base por gestor** |
| `Cargo` | Texto | |
| `Situacao` | Texto | |
| `SalarioAnual` | Número | opcional — só se quiser os totais no painel |
| `Estabilidade` | Texto | |
| `DataFimEstabilidade` | Texto | no formato AAAA-MM-DD |
| `Acao` | Texto | a decisão |
| `Justificativa` | Texto (várias linhas) | |
| `Destino` | Texto | |
| `AtualizadoPor` | Texto | preenchido pelo fluxo |
| `AtualizadoEm` | Texto | preenchido pelo fluxo |

### Lista `Acessos` (uma linha por pessoa que entra no portal)

| Coluna | Tipo | Observação |
|---|---|---|
| `Title` | Texto | a **chave** da pessoa (gere uma aleatória, ver abaixo) |
| `Nome` | Texto | aparece no canto da tela |
| `Perfil` | Escolha | `admin`, `diretor` ou `gestor` |
| `Escopo` | Texto | para gestor: o nome exatamente como está em `GestorImediato`. Para diretor: o nome da Diretoria. Para admin: deixe vazio |
| `Ativo` | Sim/Não | desmarque para cortar o acesso na hora |

**Gerando chaves:** algo longo e aleatório, não o nome da pessoa. Uma forma
rápida: no Excel, `=CONCAT(DEC2HEX(RANDBETWEEN(0,4294967295),8);DEC2HEX(RANDBETWEEN(0,4294967295),8))`.

> Crie também a lista `Auditoria` (`Title` = matrícula, `Quem`, `Acao`,
> `Justificativa`, `Quando`) se quiser a trilha completa — o passo 4 da Parte 2
> grava nela.

## Parte 2 — O fluxo

Um fluxo só, com um `Switch` decidindo o que fazer. Em
<https://make.powerautomate.com> → **Criar** → **Fluxo de nuvem instantâneo** →
gatilho **"Quando uma solicitação HTTP é recebida"**.

### 1. Gatilho

No esquema JSON do corpo, cole:

```json
{
  "type": "object",
  "properties": {
    "acao": { "type": "string" },
    "chave": { "type": "string" },
    "arquivo": { "type": "string" },
    "decisoes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "chapa": { "type": "string" },
          "acao": { "type": "string" },
          "justificativa": { "type": "string" },
          "destino": { "type": "string" }
        }
      }
    },
    "linhas": { "type": "array", "items": { "type": "object" } }
  }
}
```

Salve o fluxo uma vez: o Power Automate só mostra a **URL do gatilho** depois de
salvar. Essa URL é o "endereço do fluxo" que vai no portal — **trate como
senha**, ela já carrega a assinatura de acesso.

### 2. Conferir a chave (sempre, antes de tudo)

- **Obter itens** → site e lista `Acessos`
  - *Consulta de filtro*: `Title eq '@{triggerBody()?['chave']}' and Ativo eq 1`
  - *Contagem máxima*: 1
- **Condição**: `length(body('Obter_itens')?['value'])` é igual a `0`
  - **Se sim** → **Resposta**: status `200`, cabeçalho
    `Access-Control-Allow-Origin: *`, corpo
    `{ "ok": false, "erro": "Chave não reconhecida. Procure o RH." }` →
    **Encerrar**.
- Crie três variáveis a partir do item encontrado (`first(body('Obter_itens')?['value'])`):
  `vNome`, `vPerfil`, `vEscopo`.

### 3. `acao = abrir` — devolver a base da pessoa

- **Obter itens** na lista `Base`, com *Consulta de filtro* conforme o perfil.
  O jeito mais simples é montar o filtro numa variável antes:

  | Perfil | Filtro |
  |---|---|
  | `gestor` | `GestorImediato eq '@{variables('vEscopo')}'` |
  | `diretor` | `Diretoria eq '@{variables('vEscopo')}'` |
  | `admin` | (vazio — traz tudo) |

  Ligue **Paginação** na ação e coloque um limite acima do tamanho da sua base
  (o padrão traz só 100 itens).

- **Resposta** — status `200`, cabeçalho `Access-Control-Allow-Origin: *`, corpo:

```
{
  "ok": true,
  "usuario": { "nome": "@{variables('vNome')}", "perfil": "@{variables('vPerfil')}" },
  "processo": {
    "nome": "Reestruturação",
    "data_base": "2026-07-31",
    "prazo": "2026-09-11",
    "aviso": "Documento confidencial. Não compartilhe fora do processo."
  },
  "colaboradores": @{select(body('Obter_itens_base')?['value'], item(), json(concat('{
      "chapa": "', item()?['Title'], '",
      "nome": "', item()?['Nome'], '",
      "diretoria": "', item()?['Diretoria'], '",
      "divisao": "', item()?['Divisao'], '",
      "gestor_imediato": "', item()?['GestorImediato'], '",
      "cargo": "', item()?['Cargo'], '",
      "situacao": "', item()?['Situacao'], '",
      "acao": "', coalesce(item()?['Acao'],''), '",
      "justificativa": "', coalesce(item()?['Justificativa'],''), '"
    }')))}
}
```

> Na prática é mais fácil montar esse array com a ação **Selecionar** (Select) do
> que escrever a expressão à mão: origem `body('Obter_itens_base')?['value']` e,
> no modo texto, uma linha por campo — `chapa` ← `item()?['Title']`, `nome` ←
> `item()?['Nome']`, e assim por diante. Depois use a saída do Selecionar em
> `"colaboradores": @{body('Selecionar')}`.

### 4. `acao = gravar` — registrar as decisões

- **Aplicar a cada** → `triggerBody()?['decisoes']`
  - **Obter itens** na `Base` com filtro `Title eq '@{items('Aplicar_a_cada')?['chapa']}'`
  - **Condição de segurança** (não pule esta): se `vPerfil` for `gestor` e o
    `GestorImediato` do item for diferente de `vEscopo` → responda
    `{ "ok": false, "erro": "Fora da sua equipe." }` e encerre. É isto que
    impede alguém de mandar decisão sobre a equipe de outro.
  - **Atualizar item**: `Acao`, `Justificativa`, `Destino`,
    `AtualizadoPor` = `vNome`, `AtualizadoEm` = `utcNow()`
  - **Criar item** na lista `Auditoria` com os mesmos dados (o histórico).
- **Resposta**: `{ "ok": true, "gravados": @{length(triggerBody()?['decisoes'])} }`

### 5. `acao = importar` — carga da planilha (só RH)

- Se `vPerfil` não for `admin` → responda
  `{ "ok": false, "erro": "Só o RH importa a base." }`.
- **Aplicar a cada** → `triggerBody()?['linhas']`: procure pela matrícula; se
  existir, **Atualizar item** (sem mexer em `Acao`/`Justificativa` — a decisão já
  registrada não pode ser apagada pela carga); se não existir, **Criar item**.
- **Resposta**: `{ "ok": true, "novos": ..., "alterados": ... }`

### 6. Detalhes que evitam dor de cabeça

- **Toda** ação **Resposta** precisa do cabeçalho
  `Access-Control-Allow-Origin: *`. Sem ele o navegador recebe a resposta e
  joga fora, e a tela mostra "não consegui falar com o fluxo".
- O portal manda `content-type: text/plain` de propósito: assim o navegador não
  faz a chamada de verificação (*preflight* `OPTIONS`) que o Power Automate não
  responde. O corpo continua sendo JSON normal para o fluxo.
- Responda **sempre com status 200**, mesmo em erro, usando
  `{ "ok": false, "erro": "..." }`. A tela mostra essa mensagem como está — vale
  escrevê-la pensando em quem vai ler.
- Fluxos gratuitos/Microsoft 365 têm limite de execuções por minuto. Para uma
  base de algumas centenas de pessoas e alguns gestores, é folgado; o portal
  manda as decisões em **um único pedido por lote**, não uma por uma.

## Parte 3 — Distribuir para os gestores

1. Guarde o `portal-decisoes.html` numa **biblioteca do SharePoint ou no Teams**
   da empresa — não num site aberto. Assim só quem está no Microsoft 365 da
   empresa consegue baixar a tela.
2. Mande para cada gestor: o arquivo (ou o link da biblioteca), **a chave dele** e
   o endereço do fluxo. Ele abre, cola os dois na primeira tela e pronto.
   Marcando "lembrar", não precisa colar de novo naquele computador.
3. Quando alguém sair do processo: desmarque `Ativo` na lista `Acessos`. O acesso
   morre no próximo pedido.

## Parte 4 — O que isso protege, e o que não

**Protege:**

- A base fica no **SharePoint da empresa**, com backup, versionamento e as
  políticas que a TI já aplica ali. Nada em servidor de terceiro.
- Cada pessoa **só recebe as linhas dela** — o recorte é feito no fluxo, não na
  tela.
- **Nenhuma porta aberta, nenhum computador ligado o tempo todo**, nenhum
  endereço para hospedar.
- O que o fluxo não mandar, a tela não tem como mostrar: não devolva CPF,
  nascimento ou salário individual para quem não precisa.

**Não protege (e é honesto dizer):**

- **A chave funciona como senha, e só isso.** Quem conseguir a chave de alguém vê
  o que aquela pessoa vê. Uma chave por pessoa, nunca compartilhada, trocada
  quando alguém sai. É mais fraco que um login de verdade com a conta da empresa.
- **O endereço do fluxo é segredo**: quem tiver a URL e uma chave válida chama o
  fluxo de qualquer lugar. Não publique o HTML com o endereço preenchido em lugar
  aberto.
- **Quem abre o HTML enxerga o código dele.** É esperado: o arquivo não guarda
  segredo nenhum — nem base, nem senha, nem regra de permissão.
- Se a empresa quiser login de verdade (a conta Microsoft de cada um, sem chave),
  o caminho é **Power Apps** em vez do HTML, ou o portal com Cloudflare Access que
  já está pronto na pasta `portal-cloudflare`.

---

## Testado até onde dá

O portal foi exercitado num navegador real contra um **fluxo de mentira** que
implementa exatamente este contrato: chave inválida, gestor vendo só a equipe
dele, decisão gravada, fluxo fora do ar (a decisão fica na fila e vai quando
volta), importação de planilha e exportação.

O que **não** foi testado aqui: um fluxo de verdade no Power Automate — não tenho
acesso ao ambiente da sua empresa. Se algo não bater na primeira montagem, o
suspeito número um é o cabeçalho `Access-Control-Allow-Origin` faltando na ação
**Resposta**.
