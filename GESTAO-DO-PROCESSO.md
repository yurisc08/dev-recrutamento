# Gestão do processo

Não é sobre o software: é sobre quem responde por quê, o que acontece quando
algo muda no meio do caminho e como o processo termina sem deixar ponta solta.
Vale igual nas três versões (local, Cloudflare, Teams) — o que muda é onde o
dado mora, não o combinado.

---

## 1. Quem é dono de quê

Quatro papéis. Se dois deles forem a mesma pessoa, tudo bem — mas escreva isso,
porque no meio do processo alguém vai perguntar.

| Papel | Responde por | Não faz |
|---|---|---|
| **Dono do processo** (RH) | prazo, base carregada, quem tem acesso, encerramento | não decide por gestor nenhum |
| **Diretor** | distribuir a base da diretoria dele, cobrar, homologar | não muda decisão de outra diretoria |
| **Gestor / Gerente** | decidir sobre a equipe dele, com justificativa | não vê equipe alheia |
| **Dono técnico** | a máquina ligada (ou o Worker no ar), o backup, as senhas de serviço | não abre a base para ninguém |

> **A regra que evita 90% dos problemas:** *dono do processo* e *dono técnico*
> nunca podem ser uma pessoa só que está de férias. Tenha um segundo
> administrador desde o primeiro dia — no portal, é um segundo usuário com
> perfil RH; no M365, um coproprietário nos fluxos.

---

## 2. O ciclo, do começo ao fim

### Antes de começar (uma vez)

1. **Fechar o prazo e a data-base.** Data-base é a foto da folha; prazo é quando
   as decisões têm que estar dentro. Os dois vão na tela de Configurações e
   aparecem no topo para todo mundo.
2. **Conferir a planilha.** As 50 colunas do modelo, e principalmente
   **GESTOR IMEDIATO, GERENTE e DIRETOR preenchidos**. Linha sem esses nomes vira
   o grupo "(sem gestor informado)" e não chega a ninguém.
3. **Decidir por qual nível distribuir.** Base pequena vai por gestor imediato.
   Base grande vai por **gerente** ou **diretor**, e cada um reparte para baixo.
   Dá para mudar depois, mas mudar no meio confunde quem já respondeu.
4. **Combinar o que é justificativa suficiente.** O portal exige o campo; quem
   define se "revisão de estrutura" basta é o RH, não o software. Escreva duas
   linhas sobre isso e mande junto com o link.

### Rodando (toda semana)

5. **Carregar a base** — Importar Excel, conferir o de-para, confirmar.
6. **Distribuir** — tela Gestores: criar acesso e mandar o link de primeiro
   acesso pelo canal interno. A pessoa define a própria senha.
7. **Cobrar** — a mesma tela mostra quem ainda não respondeu e quem nem entrou.
   É a lista de cobrança: duas vezes por semana, não todo dia.
8. **Homologar** — o diretor confirma. Depois da homologação o gestor não muda
   mais; RH e diretoria ainda podem.

### Encerrando

9. **Exportar** o Excel final (leva a base, as decisões e a aba de auditoria).
10. **Congelar** — desative os acessos dos gestores. No portal local, basta
    fechar o programa; na nuvem, desative os usuários.
11. **Guardar e apagar** — o Excel exportado vai para onde o RH guarda documento
    de processo. O banco do portal se apaga **depois** disso, nunca antes.

---

## 3. Quando algo muda no meio

Estas são as situações que aparecem sempre. Todas têm resposta pronta.

**Um gestor sai da empresa.** Desative o acesso dele e atribua a equipe a outra
pessoa (tela Gestores → vincular). As decisões que ele já registrou continuam,
com o nome dele e a data — é assim que tem que ser.

**Uma pessoa muda de área durante o processo.** Recarregue a base. A importação
atualiza pela matrícula e **não apaga decisão nem atribuição feita à mão** — isso
é garantido por teste. Se a pessoa mudou de gestor, ela some da lista de um e
aparece na do outro.

**O gestor pede "só mais um dia".** Não mude o prazo no sistema por causa de um.
Mude o prazo só se o processo inteiro mudou; senão vira combinado quebrado para
quem entregou no dia.

**Alguém pede a base inteira "só para olhar".** Não. É o pedido que destrói o
recorte. Se a pessoa precisa ver mais, o certo é rever o perfil dela no portal,
que fica registrado — não mandar arquivo.

**Chegou coluna nova na planilha.** Importe normal: coluna fora do modelo você
mapeia na mão ou deixa de fora. Se ela for virar permanente, acrescente em
`modelo/colunas.json` e rode `node modelo/gerar.mjs` — os dois portais passam a
conhecer a coluna.

**Descobriram um erro numa decisão já homologada.** RH ou diretoria alteram; o
valor anterior, quem mudou e quando ficam na auditoria. Não existe "apagar e
refazer" — e é justamente isso que protege o RH depois.

---

## 4. Backup e retenção

| | Portal local | Cloudflare + Supabase |
|---|---|---|
| Onde está o dado | `dados/portal.sqlite`, na máquina | Postgres do Supabase |
| Backup | **você**: copie a pasta `dados` com o portal fechado, uma vez por dia | automático do Supabase (confira o plano: o gratuito guarda pouco) |
| Se a máquina morrer | perdeu o que não foi copiado | nada |
| Quem tem acesso físico | quem senta na máquina | ninguém da empresa |

No local, **backup é responsabilidade humana e é o ponto fraco do desenho.**
Uma cópia por dia durante o processo, numa pasta que só o RH abre, resolve. Não
use OneDrive nem pasta de rede compartilhada: sincronizar banco SQLite aberto
corrompe o arquivo.

**Retenção.** Decida antes de carregar dado real: quanto tempo o registro fica
guardado depois do processo. Pergunte à TI se já existe regra para dado de RH —
costuma existir, e aí você segue ela em vez de inventar.

---

## 5. O que levar para a TI/Segurança

Chegue com isto pronto, não com uma pergunta aberta:

- **Onde o dado mora** e quem tem acesso físico e lógico.
- **Como a pessoa entra**: senha própria, guardada só como hash PBKDF2-SHA256,
  bloqueio após 5 erros em 15 minutos.
- **Como o recorte é garantido**: conferido no banco, não na tela — e o teste que
  prova isso (um gestor abre e vê a equipe dele; outro abre e vê vazio).
- **O que é sensível e onde para**: CPF, data de nascimento e tipo de invalidez
  não saem para quem não é RH, nem na lista nem no Excel exportado.
- **A trilha**: login, decisão, homologação, importação, exportação e criação de
  acesso ficam registrados, e o próprio banco recusa alterar ou apagar.
- **O que você precisa deles**: liberar a porta no firewall (local) ou aprovar o
  provedor (nuvem). Peça uma coisa só, específica.

E as três perguntas que valem fazer: existe regra de retenção para dado de RH?
o desenho de acesso atende à política? precisa de rótulo de confidencialidade?

---

## 6. Sair do local para a nuvem sem refazer nada

O desenho é o mesmo nos dois: mesmas tabelas, mesmas regras, mesma tela. O que
muda é o banco (SQLite ↔ Postgres) e onde a tela é servida.

O caminho natural é: **piloto local com dados fictícios → piloto local com uma
diretoria → nuvem, se a empresa aprovar.** Nessa virada você:

1. roda `portal-supabase.sql` no Supabase (arquivo único, roda de novo sem
   duplicar nada);
2. publica o Worker e o front;
3. **recarrega a planilha** no ambiente novo — é a forma mais simples e segura de
   migrar, e a auditoria começa limpa lá;
4. cria os acessos de novo (senha é da pessoa: ninguém transfere senha).

O que **não** se leva: senhas, sessões e a trilha de auditoria antiga. Exporte o
Excel do ambiente velho antes e guarde — é o registro daquela fase.

---

## 7. Como saber se está indo bem

Olhe estes quatro números na tela Gestores, uma vez por semana:

- **quantos ainda não entraram** — se não cai, o problema é o canal do link, não
  o prazo;
- **quantos entraram e não decidiram nada** — é dúvida sobre o critério, não
  preguiça: chame para conversar;
- **decisões sem justificativa real** ("ajuste", "conforme conversado") — o
  portal aceita, a auditoria trabalhista não. Reveja com o gestor;
- **quantos faltam para o prazo**, por diretoria — é o número que o diretor quer
  na segunda de manhã.

Se os dois primeiros estão altos na metade do prazo, o processo não vai fechar no
dia. Antecipe a conversa em vez de esperar a última semana.
