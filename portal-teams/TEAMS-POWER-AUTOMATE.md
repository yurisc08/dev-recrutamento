# Pelo Teams, com Power Automate

**Resposta curta: daria certo, e é a melhor das opções sem TI** — porque resolve
exatamente o ponto fraco do HTML com chave.

No HTML, a identidade da pessoa vinha de uma chave que você distribui: quem
tivesse a chave de alguém passava por aquela pessoa. No Teams isso some. Quando o
gestor responde um cartão, **o Power Automate recebe a conta dele do Microsoft
365** — nome e e-mail, confirmados pela empresa. Não tem chave para vazar, não
tem senha para criar, não tem link para guardar.

```
  RH importa a base ──▶ Lista do SharePoint ──▶ Fluxo manda um cartão no Teams
                                                    para cada gestor
                                                          │
       painel do RH ◀── grava com o nome de quem ◀── gestor marca e envia
                        respondeu e a data              (dentro do Teams)
```

---

## Como fica para cada pessoa

**Para o gestor.** Chega uma mensagem do fluxo no chat do Teams (ou no canal),
com a equipe dele listada: cada pessoa com uma lista suspensa de ação e um campo
de justificativa, e um botão **Enviar decisões**. Ele responde ali mesmo, no
celular ou no computador, sem abrir nada, sem senha, sem link. Veja
`previa-cartao.png` e o JSON pronto em `cartao-gestor.json`.

Se ele marcar DESLIGAMENTO sem justificar, o fluxo responde na hora pedindo a
justificativa e manda o cartão de novo — a mesma regra do portal, só que aqui ela
mora no fluxo.

**Para o RH e o diretor.** A base continua sendo uma só, na lista do SharePoint.
O acompanhamento pode ser a tela HTML que você já tem (ela lê a mesma lista pelo
mesmo fluxo), uma visão do SharePoint ou um cartão semanal no Teams com o
andamento por gestor.

## O que muda em relação ao HTML com chave

| | HTML + chave | Teams + cartão |
|---|---|---|
| Quem é a pessoa | uma chave que você distribui | **a conta dela no Microsoft 365** |
| Se a chave vazar | outra pessoa vê a equipe dela | não existe chave |
| Onde responde | abrindo um arquivo | no Teams que já está aberto |
| Celular | funciona, mas é um arquivo | nativo |
| Lembrete de quem não respondeu | você persegue por e-mail | o fluxo cobra sozinho |
| Rever e mudar depois | tabela completa, à vontade | o cartão é mais para responder uma vez |
| Base grande por pessoa | 500 linhas numa tela | cartão fica pesado acima de ~15 por vez |

Os dois se completam: **Teams para coletar dos gestores, HTML para o RH
consolidar** — mesma lista do SharePoint por baixo.

## Montando (4 fluxos, todos com conector padrão do M365)

Use as mesmas listas `Base` e (agora opcional) `Acessos` descritas em
`../portal-fluxo/POWER-AUTOMATE.md`. Acrescente em `Base` uma coluna
`GestorEmail` (texto) — é por ela que o fluxo sabe para quem mandar o cartão.

### Fluxo 1 — "Enviar para os gestores" (manual, o RH dispara)

1. Gatilho: **Disparar um fluxo manualmente**.
2. **Obter itens** da lista `Base` (com paginação ligada).
3. **Selecionar** → produza só a lista de e-mails: `item()?['GestorEmail']`.
   Depois **Compor** com `union(body('Selecionar'), body('Selecionar'))` para
   tirar os repetidos — sobra um e-mail por gestor.
4. **Aplicar a cada** e-mail (ligue a **Simultaneidade** para eles irem em
   paralelo):
   - **Filtrar matriz**: as linhas daquele gestor, sem decisão ainda.
   - **Compor** o corpo do cartão: comece pelo `cartao-gestor.json` deste pacote
     e troque o trecho dos colaboradores por uma expressão que monte um bloco por
     pessoa. O caminho mais simples é uma ação **Selecionar** gerando o objeto de
     cada pessoa e depois `join()` dentro do JSON.
   - **Postar cartão adaptável e aguardar uma resposta** (conector Teams):
     destinatário = o e-mail do gestor, cartão = o que você compôs.
   - Quando ele responder, a saída traz os campos (`acao_A1001`, `just_A1001`...)
     **e quem respondeu** (`responder`/`from`). Use isso, não confie no que vem
     dentro do cartão.

### Fluxo 2 — "Gravar a resposta" (a parte que precisa de cuidado)

Dentro do mesmo fluxo, depois da resposta:

1. **Confira que quem respondeu é mesmo o gestor daquela pessoa.** Para cada
   matrícula, compare o `GestorEmail` da linha com o e-mail de quem respondeu. Se
   não bater, não grave — responda avisando. Sem esse passo, alguém com o link do
   cartão encaminhado poderia responder pela equipe de outro.
2. **Valide a justificativa**: se a ação for DESLIGAMENTO, TRANSFERÊNCIA ou
   ESTABILIDADE e a justificativa estiver vazia, poste uma mensagem pedindo e
   reenvie o cartão só com as pendentes.
3. **Atualizar item** na `Base`: `Acao`, `Justificativa`, `AtualizadoPor` = nome
   de quem respondeu, `AtualizadoEm` = `utcNow()`.
4. **Criar item** na lista `Auditoria` — mesma coisa, mas sem apagar nunca.
5. **Postar mensagem** no chat confirmando: "3 decisões registradas, faltam 5".

### Fluxo 3 — "Cobrar quem falta" (agendado)

Gatilho **Recorrência** (a cada 2 dias, dias úteis): conte as linhas sem `Acao`
por `GestorEmail` e mande um cartão curto só para quem tem pendência, com o botão
que dispara o cartão completo de novo. É o que hoje você faz na mão, por e-mail.

### Fluxo 4 — "Resumo para a diretoria" (agendado)

Toda segunda, um cartão para o diretor com a tabela: gestor, total, avaliados,
pendentes. Se quiser um botão "cobrar todos", ele chama o Fluxo 3.

## Limites que valem saber antes de escolher

- **Tamanho do cartão.** O Teams corta cartão muito grande (na prática, a partir
  de ~25 KB). Com 3 campos por pessoa, **até ~15 pessoas por cartão** fica
  confortável. Acima disso, mande em páginas ("pessoas 1 a 15", depois as
  próximas) — o `Action.Submit` já leva um campo `pagina` para isso.
- **Responder é pontual, revisar é ruim.** Cartão é ótimo para "decidir agora".
  Para "abrir a lista inteira, filtrar, mudar de ideia três vezes", a tela HTML é
  melhor. Por isso a combinação dos dois.
- **"Postar cartão e aguardar" prende a execução do fluxo** até a pessoa
  responder (o limite de uma execução é 30 dias). Com muitos gestores, use a
  simultaneidade do "Aplicar a cada" ou um fluxo filho por gestor.
- **Cotas.** Teams, SharePoint e Approvals são conectores padrão, inclusos no
  M365 — sem licença premium. Existe um limite diário de chamadas por usuário
  (na faixa de milhares); uma base de algumas centenas de linhas com gravação em
  lote passa longe disso.
- **Quem dispara é você.** O fluxo roda com a *sua* conta: é você quem tem acesso
  à lista, e o gestor só vê o que o cartão mostra. Isso é bom para o recorte — e
  significa que o fluxo não pode ficar num usuário que vai sair da empresa.
- **Anexo e Excel** não entram pelo cartão. Importar a planilha continua sendo do
  RH, pela tela HTML ou direto no SharePoint.

## Uma alternativa ainda mais simples (se a base for pequena)

Se forem poucas pessoas por gestor, dá para usar **Aprovações do Teams** sem
montar cartão nenhum: "Iniciar e aguardar uma aprovação" → tipo **Respostas
personalizadas**, com as opções ATIVO / DESLIGAMENTO / TRANSFERÊNCIA /
ESTABILIDADE, e o campo de comentário como justificativa. Vem pronto com
notificação, histórico e app no celular.

O custo: **uma aprovação por colaborador**. Para 20 pessoas é confortável; para
200, vira spam. Por isso o cartão agrupado é melhor quando a equipe é grande.

## Se a empresa topar ir um passo além

Com **Power Apps dentro do Teams** (Dataverse for Teams, também sem licença
extra) você teria a tela completa — lista, filtro, edição, dashboard — com login
da própria conta, sem chave e sem cartão. É mais trabalho de montagem e uma
ferramenta a aprender, mas é o desenho mais sólido dentro da Microsoft. O que
está pronto aqui (a lógica, as regras, o formato dos dados) serve igual: muda a
tela, não o miolo.

---

## Recomendação, em uma linha

Se a maioria dos gestores tem **poucas pessoas** e você quer resposta rápida com
identidade garantida: **Teams + cartão**, com a tela HTML para o RH consolidar.
Se os gestores têm **equipes grandes** e vão querer revisar bastante antes de
fechar: a tela (HTML, local ou nuvem) como principal, e o Teams só para avisar e
cobrar.

> O que não testei: nada deste arquivo rodou contra um Teams/Power Automate real
> — não tenho acesso ao ambiente da sua empresa. O `cartao-gestor.json` é
> Adaptive Card 1.4 válido e está no formato que o conector do Teams aceita, mas
> a primeira montagem vai pedir ajustes.
