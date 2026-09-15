# Montagem, passo a passo

Como sair da planilha por e-mail e chegar no processo rodando, sem depender da
TI para nada. Cada fase tem **o que fazer**, **quanto tempo leva** e **como
testar antes de seguir**. Não pule os testes: erro na fase 2 descoberto na fase 5
custa o dobro.

**Tempo total: entre 6 e 8 horas de trabalho**, que dá para partir em dois ou três
dias. Nenhuma licença premium, nenhum conector pago, nenhum chamado aberto.

```
FASE 0  decidir 3 coisas ................ 15 min   (sozinho, no papel)
FASE 1  criar o lugar ................... 30 min
FASE 2  criar a lista ................... 45 min
FASE 3  carregar a base ................. 20 min
FASE 4  fluxo de permissão .............. 1 h
FASE 5  fluxo do cartão ................. 2 h      <- o mais trabalhoso
FASE 6  cobrança e resumo ............... 1 h
FASE 7  a aba com a lista inteira ....... 15 min
FASE 8  piloto e validação da TI ........ 1 semana de calendário
```

---

## FASE 0 — Três decisões, antes de clicar em nada

São as únicas que doem para mudar depois. Decida agora, anote, siga.

### Decisão 1 — O salário entra na lista?

| | o que acontece | quando escolher |
|---|---|---|
| **Não entra** (recomendado) | a lista tem só as colunas de decisão. O arquivo completo com CPF e salário fica numa pasta que só o RH abre. No fim, o RH exporta a lista e cruza por PROCV com o arquivo dele | quase sempre |
| **Entra** | o diretor vê o custo ao vivo no painel. O gestor passa a ver o salário da própria equipe | só se o diretor exigir o número em tempo real |

**Recomendo: não entra.** O CPF nunca entra, nos dois casos — ele não serve para
decidir nada e é o dado que mais pesa se vazar.

### Decisão 2 — Um processo por vez, ou vários?

Se você vai rodar "Reestruturação 2026" e no ano que vem "Reestruturação 2027",
crie **um Team por processo**. Termina o processo, arquiva o Team inteiro: some
da vista de todo mundo, mas o histórico fica. É mais limpo que uma coluna `Ano`
em cima de uma lista que só cresce.

### Decisão 3 — De quem é a conta que roda os fluxos?

Os fluxos rodam com a conta de quem os criou. Se essa pessoa sair da empresa, os
fluxos param. **Não use a sua conta pessoal** se você é a única pessoa que sabe
onde isso mora. Duas saídas:

- criar os fluxos dentro de uma **solução** e adicionar um coproprietário (o
  chefe do RH, ou quem ficar responsável) — 2 minutos, resolve;
- ou pedir uma conta de serviço à TI. Mas isso é pedir para a TI, e a ideia era
  não depender.

Faça a primeira. No Power Automate, cada fluxo tem **Gerenciar > Proprietários**.

---

## FASE 1 — O lugar (30 min)

### 1.1 Criar o Team

No Teams: **Times > Ingressar ou criar um time > Criar um time > Do zero >
Privado**. Nome: `Reestruturação 2026`.

Privado importa: só quem você adicionar entra. Se a sua empresa bloqueou a
criação de times (algumas bloqueiam), peça um time à TI — é um pedido pequeno,
que eles atendem sem virar projeto.

### 1.2 Quem entra

- **Proprietários**: você e mais uma pessoa do RH (nunca só você).
- **Membros**: por enquanto ninguém. Os gestores entram na fase 8, no piloto.

### 1.3 Achar o site do SharePoint

Todo Team tem um site atrás dele. No canal Geral, aba **Arquivos >
Abrir no SharePoint**. Guarde essa URL — os fluxos vão pedir.

### ✅ Antes de seguir

Abra o site do SharePoint numa aba anônima com outra conta (ou peça a um colega).
Tem que dar **acesso negado**. Se abrir, o time não é privado — refaça.

---

## FASE 2 — A lista (45 min)

### 2.1 Armadilha que pega todo mundo

O SharePoint guarda **dois nomes** por coluna: o que você vê e o interno, que ele
cria a partir do primeiro e **nunca mais muda**. Se você criar a coluna como
`Ação indicada`, o nome interno vira `A_x00e7__x00e3_o_x0020_indicada` e você vai
escrever isso nas expressões do fluxo pelo resto da vida.

**Crie toda coluna com nome simples — sem acento, sem espaço — e renomeie
depois.** Cria `AcaoIndicada`, salva, renomeia para `Ação indicada`. O interno
continua `AcaoIndicada` e as expressões ficam legíveis.

### 2.2 Criar a lista

No site: **Novo > Lista > Lista em branco**. Nome: `Decisoes`.

Renomeie a coluna `Title` para `Matricula` (ela é obrigatória e já existe — use
como chave, é a CHAPA).

Depois crie estas, nesta ordem, com estes nomes exatos:

| Coluna | Tipo | Para quê |
|---|---|---|
| `Nome` | Texto | |
| `Cargo` | Texto | DES_CARGO da planilha |
| `Diretoria` | Texto | |
| `Divisao` | Texto | |
| `GestorNome` | Texto | GESTOR IMEDIATO |
| `GestorEmail` | **Pessoa** | **a coluna mais importante** — é por ela que o fluxo separa e dá permissão |
| `Situacao` | Texto | |
| `Estabilidade` | Texto | vazio quando não tem |
| `DataFimEstabilidade` | Data | |
| `Acao` | **Escolha** | ATIVO / DESLIGAMENTO / TRANSFERENCIA / ESTABILIDADE. Deixe **sem valor padrão** — vazio significa "ainda não decidiu" |
| `Destino` | Texto | só usado quando a ação é transferência |
| `Justificativa` | Texto, várias linhas | |
| `DecididoPor` | Texto | o fluxo preenche |
| `DecididoEm` | Data e hora | o fluxo preenche |
| `Alertas` | Texto | o que exige atenção do RH (estabilidade, aposentadoria) |

`GestorEmail` como tipo **Pessoa**, não texto: assim o SharePoint valida contra o
diretório da empresa (não dá para digitar um e-mail que não existe) e a ação de
permissão aceita o campo direto.

Se você escolheu "salário entra" na fase 0, acrescente `SalarioAnual` (Moeda).

### 2.3 A lista de auditoria

**Novo > Lista > Lista em branco**, nome `Auditoria`. Colunas: `Title` (renomeie
para `Matricula`), `Quem` (Texto), `Acao` (Texto), `Justificativa` (Texto),
`Quando` (Data e hora).

Esta lista **só recebe**. Nada nela é editado ou apagado, nunca. Em
**Configurações da lista > Configurações de versão**, marque *Criar versões*.

### 2.4 A pasta do arquivo completo

Se você seguiu a recomendação da fase 0, o arquivo com CPF e salário fica aqui:
na aba **Arquivos** do canal, crie a pasta `RH-Confidencial`, clique nos três
pontos > **Gerenciar acesso > Avançado > Parar de herdar permissões**, e deixe só
o RH. É a mesma pasta que hoje seria um anexo de e-mail — só que com controle.

### ✅ Antes de seguir

Crie uma linha na mão pela interface. Preencha tudo. Confira em
**Configurações da lista** que os nomes internos são os simples (clique numa
coluna e olhe o fim da URL, depois de `Field=`).

---

## FASE 3 — Carregar a base (20 min)

Nada de fluxo aqui. O jeito rápido é copiar e colar.

1. Abra o `modelo-base.xlsx` e preencha com a base real (as 49 colunas).
2. Numa aba nova do Excel, monte só as colunas da lista, **na mesma ordem** da
   lista do SharePoint. Use PROCV se precisar.
3. Preencha `GestorEmail` com o e-mail corporativo de cada gestor. **Este é o
   passo que decide se tudo funciona** — um e-mail errado é uma pessoa que não
   recebe o cartão. Confira a lista de e-mails únicos antes.
4. Na lista do SharePoint: **Editar em modo de grade**, clique na primeira
   célula vazia e **Ctrl+V**. Ele cola as linhas todas.

Vai colar 500 linhas de uma vez. Se der erro em alguma, o SharePoint marca a
célula em vermelho — quase sempre é uma data em formato diferente ou um e-mail
que não existe no diretório.

### Preencher a coluna `Alertas`

Antes de colar, no Excel, uma fórmula resolve:

```
=SE(E([@ESTABILIDADE]<>"";[@[DATA FIM ESTABILIDADE]]>HOJE());"Estabilidade vigente - validar com o RH";
 SE([@IDADE]>=64;"Perto da aposentadoria - validar com o RH";""))
```

É o mesmo alerta que a tela mostra. Aqui ele vira dado, e o cartão só exibe.

### ✅ Antes de seguir

`Contar` a lista e comparar com a planilha. Agrupar por `GestorEmail` e conferir
se o número de pessoas por gestor bate com o que o diretor espera. Este é o
momento de achar o gestor que saiu da empresa e ninguém atualizou.

---

## FASE 4 — Cada gestor enxerga só a equipe dele (1 h)

Sem isso, qualquer pessoa do time vê a lista inteira. **Uma visão filtrada não
resolve** — ela é conveniência, não segurança: quem troca a visão vê o resto.

### 4.1 Tirar o acesso geral

Na lista `Decisoes`: **Configurações > Permissões desta lista > Parar de herdar
permissões**. Remova todos os grupos, deixe só você e o RH com Controle total.

Agora ninguém mais vê nada. O fluxo devolve o acesso, linha a linha.

### 4.2 O fluxo

Power Automate > **Criar > Fluxo de nuvem instantâneo > Disparar um fluxo
manualmente**. Nome: `Reestruturacao - conceder acesso`.

1. **Obter itens** — site e lista `Decisoes`. Em *Configurações avançadas*,
   **Ativar paginação** e Limite `5000`. (Sem isso ele para em 100 linhas e você
   passa uma tarde procurando o motivo.)
2. **Aplicar a cada** → `value` do passo anterior.
   - **Conceder acesso a um item ou pasta** (ação do conector SharePoint):
     - Site e lista: os mesmos
     - Id: `ID` do item
     - Destinatários: `GestorEmail Email`
     - Funções: **Pode editar**
     - **Notificar pessoas: Não** (senão cada gestor recebe 40 e-mails)
3. Salve e execute uma vez.

> Confirme que a ação **Conceder acesso a um item ou pasta** aparece no seu
> tenant — algumas empresas desativam compartilhamento de item. Se não aparecer,
> o plano B está no fim deste arquivo.

### 4.3 O limite honesto

Isso cria uma permissão única por linha. Até algumas centenas de linhas, sem
problema. Acima de **5.000 linhas com permissão única** a lista começa a ficar
lenta e o SharePoint reclama. Se a sua base for maior que isso, a permissão vai
por **pasta por gestor**, não por item — mais trabalho de montagem.

### ✅ Antes de seguir

Peça a **um** gestor para abrir a lista. Ele tem que ver a equipe dele e mais
nada. Peça a um gestor de outra área para abrir: tem que ver a lista vazia.
**Não passe daqui sem esse teste.** É o teste que a TI vai repetir.

---

## FASE 5 — O cartão no Teams (2 h)

É a fase mais trabalhosa e a que muda o dia a dia: o gestor decide sem abrir nada.

### 5.1 Fluxo `Reestruturacao - enviar cartoes`

Gatilho: **Disparar um fluxo manualmente** (você dispara quando quiser).

1. **Obter itens** — `Decisoes`, paginação ligada, *Consulta de filtro*:
   `Acao eq null` (só quem falta decidir).
2. **Selecionar** — De: `value`, mapeando só `item()?['GestorEmail']?['Email']`.
3. **Compor** — `union(body('Selecionar'), body('Selecionar'))`. Esse truque tira
   os repetidos e sobra um e-mail por gestor.
4. **Aplicar a cada** sobre o Compor. Abra *Configurações* e ligue a
   **Simultaneidade** em 10 — senão os gestores recebem um de cada vez, e o fluxo
   fica preso esperando o primeiro responder.
   - **Filtrar matriz**: as linhas cujo `GestorEmail` é o item atual.
   - **Compor** `pendentes` = `take(body('Filtrar_matriz'), 10)`.
     Dez, não quarenta: o cartão é para as pendências, a lista inteira está na
     aba (fase 7).
   - **Selecionar** → monte o bloco de cada pessoa usando o `cartao-gestor.json`
     deste pacote como molde, e junte com `join()`.
   - **Postar cartão adaptável e aguardar uma resposta** — Destinatário: o e-mail
     do gestor. Cartão: o JSON que você compôs.

### 5.2 Gravar, com as duas conferências que importam

Ainda dentro do "Aplicar a cada", depois da resposta:

1. **Confira quem respondeu.** A saída da ação traz o e-mail de quem clicou.
   Compare com o `GestorEmail` da linha. Se não bater, **não grave** — responda
   avisando. Sem esse passo, um cartão encaminhado deixa alguém responder pela
   equipe do outro.
2. **Confira a justificativa.** Se a ação for DESLIGAMENTO, TRANSFERENCIA ou
   ESTABILIDADE e a justificativa estiver vazia, poste uma mensagem pedindo e
   reenvie o cartão só com as pendentes. É a regra que a planilha nunca teve.
3. **Atualizar item** em `Decisoes`: `Acao`, `Justificativa`, `Destino`,
   `DecididoPor` = nome de quem respondeu, `DecididoEm` = `utcNow()`.
4. **Criar item** em `Auditoria` — os mesmos dados. Esta some nunca.
5. **Postar mensagem** no chat: "3 decisões registradas, faltam 5."

### ✅ Antes de seguir

Rode o fluxo com **você mesmo** como gestor de duas linhas de teste. Responda
pelo celular. Confira que `DecididoPor` gravou o seu nome e que a `Auditoria`
ganhou duas linhas. Depois tente responder um cartão que não é seu — tem que
recusar.

---

## FASE 6 — Cobrança e resumo (1 h)

Dois fluxos curtos que substituem o que hoje você faz na mão.

### `Reestruturacao - cobrar pendentes`

Gatilho **Recorrência**: a cada 2 dias, só em dia útil, às 9h.
Conta as linhas com `Acao eq null` agrupadas por `GestorEmail` e manda um cartão
curto só para quem tem pendência: "Faltam 5 pessoas. Prazo sexta." com um botão
que dispara o cartão completo de novo.

É este fluxo que faz o processo terminar no prazo. Hoje esse trabalho é seu.

### `Reestruturacao - resumo da diretoria`

Gatilho **Recorrência**: segunda, 8h. Um cartão para o diretor com gestor, total,
decididos, pendentes. Se quiser, um botão "cobrar todos" que chama o fluxo acima.

---

## FASE 7 — A lista inteira dentro do Teams (15 min)

O cartão mostra as pendências. Para ver tudo — todas as pessoas, todas as
colunas, filtrar, ordenar, exportar — a lista entra como aba:

No canal: **+ > Listas > Adicionar uma lista existente >** `Decisoes`.

Cada gestor abre a mesma aba e vê só o que a fase 4 liberou para ele. O diretor e
o RH veem tudo. Funciona no celular, exporta para Excel, e você não montou tela
nenhuma.

O `portal-decisoes.html` continua útil: é onde o RH consolida, testa formato de
coluna e mostra a proposta para a diretoria antes de qualquer dado real entrar.

---

## FASE 8 — Piloto, e só depois a TI (1 semana)

Nesta ordem. Inverter custa caro.

**Dias 1 e 2 — dados fictícios.** Carregue 10 linhas inventadas, com você e mais
duas pessoas do RH como "gestores". Rode o ciclo inteiro: cartão, resposta,
cobrança, resumo. Quebre de propósito: responda sem justificativa, encaminhe um
cartão, tente abrir a lista com outra conta.

**Dia 3 — um gestor de verdade, dados fictícios.** Alguém paciente. O que você
quer saber é se ele entende o cartão sem explicação. Se precisar explicar, o
texto do cartão está errado — conserte o texto, não o gestor.

**Dia 4 — a TI/Segurança.** Agora você chega com algo pronto e com respostas.
Leve:

- onde o dado mora: **o tenant da própria empresa**, no site do Team, com backup,
  retenção e log de auditoria do M365 que eles já administram;
- quem entra: **conta corporativa**, sem senha nova e sem link compartilhado;
- o recorte: **permissão por item do SharePoint**, não filtro de tela — e você já
  tem o teste da fase 4 para mostrar;
- o que não está na lista: **CPF e salário**, que ficam na pasta restrita;
- o histórico: lista `Auditoria` só de inserção, versionamento ligado.

Pergunte três coisas: se a permissão por item atende a política deles, se o Team
precisa de rótulo de confidencialidade, e se existe regra de retenção para dado
de RH que você deva aplicar.

**Dia 5 — dado real, primeira diretoria.** Uma diretoria, não todas. Depois o
resto.

---

## Quando o processo terminar

1. Exporte `Decisoes` para Excel e cruze com o arquivo completo do RH.
2. Na lista: **Configurações > Configurações avançadas**, tire a permissão de
   edição de todo mundo. Vira só leitura.
3. Rode o fluxo da fase 4 ao contrário, ou simplesmente **arquive o Team**: some
   da vista, o histórico fica.
4. `Auditoria` não se toca.

---

## Plano B, se a permissão por item estiver bloqueada

Algumas empresas desativam compartilhamento de item no SharePoint. Se a ação da
fase 4 não existir no seu tenant:

**Ninguém acessa a lista.** Só você e o RH. O gestor nunca abre a lista — ele
recebe o cartão, responde e pronto. Para "ver a equipe inteira", o Fluxo 3 manda
um cartão de resumo com a lista dele em texto, ou o fluxo gera um Excel só com as
linhas dele e manda no chat.

É menos confortável para o gestor e mais fluxo para você montar. Mas é seguro
pelo desenho: o dado não está num lugar que ele possa abrir. E continua muito
melhor que o anexo de e-mail de hoje, que ninguém consegue tirar da caixa postal
de ninguém.

---

## O que eu não pude testar

Nada deste arquivo rodou contra um Microsoft 365 real — não tenho acesso ao
ambiente da sua empresa. As telas, os nomes das ações e os limites vêm da
documentação e do comportamento padrão do produto; a primeira montagem vai pedir
ajuste em algum nome de campo. As duas coisas para confirmar no primeiro dia são
a criação do Team e a existência da ação **Conceder acesso a um item ou pasta**.
