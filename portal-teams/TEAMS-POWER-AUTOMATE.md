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

**Para o gestor.** Chega uma mensagem do fluxo no chat do Teams (ou no canal).
O cartão traz **o que falta decidir agora** — cada pessoa com uma lista suspensa
de ação e um campo de justificativa — e um botão **Enviar decisões**. Ele
responde ali mesmo, no celular ou no computador, sem senha e sem link. Veja
`previa-cartao.png` e o JSON pronto em `cartao-gestor.json`.

O cartão **não é onde a lista inteira é lida**. Ele é o aviso, a cobrança e a
decisão rápida. Quando o gestor quiser ver tudo — todas as pessoas, todas as
colunas da planilha, filtrar, ordenar, mudar de ideia — ele usa o botão **Abrir a
lista completa**, que leva à tela do portal (a mesma base, sem corte). Ver
[Onde fica a lista inteira](#onde-fica-a-lista-inteira).

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
| Ler a lista inteira | 500 linhas numa tela | **não é no cartão** — o cartão leva para a tela |

Os dois se completam: **Teams para avisar, cobrar e decidir o que está pendente;
tela para ler e revisar a lista inteira** — mesma lista do SharePoint por baixo.

## Onde fica a lista inteira

Um cartão do Teams não serve para ler uma base. O Teams corta cartão grande (na
prática, a partir de ~25 KB de JSON), o Adaptive Card não tem tabela rolável nem
filtro, e a planilha tem 49 colunas — num cartão cabem 3 ou 4. Então a regra é:

> **O cartão mostra as pendências. A lista completa mora na tela.**

Três jeitos de dar a lista completa dentro do Teams, do mais simples ao mais
completo:

**a) A lista do SharePoint como aba do Teams.** No canal, **+ → Listas → Adicionar
uma lista existente** e aponte para a `Base`. Sai de graça: todas as linhas,
todas as colunas, filtro, ordenação, busca, agrupamento, exportar para Excel,
funciona no celular. Crie uma **visão** filtrada por `GestorEmail` **é igual a
[Eu]** e cada gestor abre a mesma aba vendo só a equipe dele.
*Cuidado:* essa visão é **conveniência, não segurança** — quem souber trocar a
visão vê o resto. O recorte de verdade continua vindo do fluxo (que manda a cada
um só o seu cartão) ou do login do portal. Se a base tem salário e CPF, não
publique a lista crua num canal aberto: use um canal privado por diretoria, ou a
opção (c).

**b) A tela HTML aberta pelo cartão.** Se o `portal-decisoes.html` estiver num
endereço `https` que a empresa alcança (uma biblioteca do SharePoint que renderize
HTML, ou o `portal-cloudflare`), basta um botão `Action.OpenUrl` no cartão com
`...?gestor=<e-mail>`. Já está no `cartao-gestor.json` como **Abrir a lista
completa** — troque a URL. *Atenção:* muitos tenants entregam `.html` do
SharePoint como download em vez de abrir; se for o seu caso, é (a) ou (c).

**c) O portal com login, como aba de site.** O `portal-local` (na rede da empresa)
e o `portal-cloudflare` (com Cloudflare Access) servem uma URL de verdade — e essa
URL entra como aba no Teams (**+ → Site**). Aí a lista inteira aparece com o
recorte validado no servidor: gestor vê a divisão dele, diretor vê a diretoria,
RH vê tudo — que é o que a planilha por e-mail nunca deu.

Em qualquer um dos três, o Teams continua fazendo o que faz bem: avisar, cobrar
quem não respondeu e receber a decisão com o nome de quem decidiu.

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
   - **Mande no máximo 10 por cartão** — use `take(body('Filtrar_matriz'), 10)`.
     O cartão é para as pendências, não para a base: o texto já diz quantas
     ficaram de fora, e o botão **Abrir a lista completa** leva à tela onde estão
     todas (veja [Onde fica a lista inteira](#onde-fica-a-lista-inteira)). Quando
     essas 10 forem respondidas, o Fluxo 3 manda as próximas — sem paginação
     manual.
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
  de ~25 KB de JSON). Com 3 campos por pessoa cabem umas 15, mas **use 10** e
  deixe a lista inteira na tela — cartão com 15 pessoas já rola demais no
  celular, e a base tem 49 colunas que não cabem ali de jeito nenhum.
- **Responder é pontual, revisar é na tela.** Cartão é ótimo para "decidir
  agora". Para "abrir a lista inteira, filtrar, comparar salário e tempo de casa,
  mudar de ideia três vezes", é a tela — aba do Teams ou portal. Por isso a
  combinação dos dois, e nunca só o cartão.
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

**Tela para ler a base inteira, Teams para avisar, cobrar e decidir o que está
pendente.** Os dois, sempre — não é escolher um. O que muda com o tamanho das
equipes é só o peso de cada um: com equipes pequenas o gestor resolve quase tudo
pelo cartão e quase não abre a tela; com equipes grandes ele vive na tela e o
cartão vira o lembrete. Em nenhum dos casos a lista completa passa pelo cartão.

> O que não testei: nada deste arquivo rodou contra um Teams/Power Automate real
> — não tenho acesso ao ambiente da sua empresa. O `cartao-gestor.json` é
> Adaptive Card 1.4 válido e está no formato que o conector do Teams aceita, mas
> a primeira montagem vai pedir ajustes.
