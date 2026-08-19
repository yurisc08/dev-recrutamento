# Correções aplicadas sobre o v74 (publicação v83)

## 1. Botões de Editar/Desativar não faziam nada

A função `jsq()`, usada para montar os `onclick` das listas, escapava as aspas
como `"`:

    onclick="editField("f-cbo")"

Uma sequência `\u` só é válida dentro de uma string JavaScript. Fora dela o
navegador para com **"Invalid or unexpected token"** e o clique não executa nada.

Agora o valor é montado com `JSON.stringify` e protegido para atributo HTML:

    onclick="editField(&quot;f-cbo&quot;)"

O navegador devolve as aspas antes de interpretar o JavaScript.

Isso destravou **21 ações** que estavam paradas pelo mesmo motivo:

- Campos: Editar, Remover/Desativar
- Usuários: Editar, Gerar novo código, Definir código, Desativar/Reativar
- Empresas e filiais: Editar, Desativar/Reativar, Excluir
- Áreas aprovadoras e fluxos: Desativar/Ativar, excluir etapa
- Solicitações: Baixar documento, Recusar, Excluir
- Triagem do Gestor: aceitar e não aceitar

## 2. Pesquisa de cargo vigente

Antes, a lista só aparecia depois de digitar 2 caracteres e só respondia a clique
do mouse: clicar no campo, digitar uma letra ou clicar na lupa não mostrava nada,
e as setas do teclado não navegavam.

Agora:

- clicar no campo (ou na lupa) já abre a lista com os cargos da base;
- 1 caractere não esconde mais a lista;
- setas ↑/↓ percorrem, **Enter** seleciona, **Esc** fecha;
- a opção em foco fica destacada e a lista mostra "digite para filtrar" enquanto
  nenhum termo foi informado;
- buscas fora de ordem são descartadas, então o resultado exibido é sempre o do
  texto atual.

## 3. Documento concluído: só Carreira & Recompensa

O Gestor via o botão de baixar o documento em dois lugares — no cartão do painel
e dentro da solicitação concluída. Os dois passaram a exigir o perfil C&R (o
ADMIN continua enxergando tudo).

O bloqueio também está na própria geração: chamar `chooseModel` fora do botão
responde "O documento concluído fica disponível apenas para Carreira & Recompensa".

O que o Gestor continua tendo é o **"Baixar modelo — Preenchimento Gestor"**,
disponível apenas enquanto a solicitação está com ele, para conferir o que está
preenchendo. Não é o documento aprovado.

Também foi removida uma duplicidade: para o C&R apareciam dois botões na
solicitação concluída ("Baixar documento" e "Baixar documento aprovado"). Ficou
apenas o segundo, que cobre também as demais grafias de status aprovado.

## 4. Revisão geral (v77)

Varredura nos três perfis (ADMIN, C&R e Gestor), em todas as abas, no celular e
com o servidor falhando de propósito. Três ajustes saíram dela:

**Botão morto no perfil do Gestor.** O Gestor via "Baixar modelo — Preenchimento
Gestor" na etapa dele, mas o próprio código recusava o clique com "O download do
modelo atual é exclusivo de C&R e Administrador". O botão foi removido: agora ele
tem só "Salvar rascunho" e "Enviar para C&R com observação".

**Falha de carregamento deixava a tela pela metade.** Se a consulta das
solicitações falhasse (rede, permissão, RPC fora do ar), o painel abria sem
título, sem indicadores e sem nenhuma mensagem — parecia que a base estava
vazia. Agora aparece o motivo do erro e um botão "Tentar novamente".

**Notificação podia travar a atualização da tela.** Depois de cada transição o
sistema chama a função de notificação; se essa chamada falhasse de forma
inesperada, a linha seguinte (recarregar e voltar ao painel) não executava e o
usuário ficava achando que a ação não tinha sido registrada. A notificação agora
é isolada: falhou, registra no console e o fluxo segue.

Sem erros de JavaScript em nenhum perfil, nenhuma aba estoura a largura no
celular, e as transições (atribuir ao Gestor, enviar para C&R, concluir) seguem
validando o que já validavam.

## 5. Login dizendo "Perfil não cadastrado ou inativo" (v78)

A verificação do perfil, logo após o login, tratava três situações diferentes
como se fossem a mesma — e ainda deslogava o usuário em todas elas:

    let { data: p } = await sb.from("profiles")...;   // o erro era descartado
    if (!p?.active) { await sb.auth.signOut(); toast("Perfil não cadastrado ou inativo."); }

- **Falha na consulta** (rede instável, permissão/RLS, PostgREST fora do ar):
  `p` vinha nulo e o usuário — ativo e cadastrado — era expulso com a mensagem
  errada. Agora a sessão é mantida e a tela explica o motivo real, pedindo nova
  tentativa.
- **Cadastro inexistente** e **acesso inativo** agora têm mensagens distintas,
  cada uma dizendo o que fazer.
- **`active` nulo** (perfil criado fora do portal, sem o campo preenchido)
  também tinha a mesma mensagem genérica; agora avisa que falta ativar o acesso.

As mensagens aparecem no próprio cartão de login, e não só num aviso que some
em três segundos.

**Corrida entre duas inicializações.** `init()` era chamado pelo formulário e
também pelo evento de autenticação. As duas execuções corriam juntas e, se a
segunda tropeçasse, o `signOut()` dela derrubava a sessão que a primeira já
tinha validado — o login "caía" sozinho, de forma intermitente. Agora a segunda
chamada reaproveita a primeira.

**Renovação de token não reinicia mais a tela.** O mesmo evento dispara quando o
token é renovado automaticamente. Antes, isso recarregava tudo e jogava o
usuário de volta ao Painel no meio de uma solicitação aberta. Agora esses
eventos são ignorados quando o perfil já está carregado.

Testado nos cinco cenários (perfil ativo, inativo, inexistente, erro de consulta
e `active` nulo) e com a renovação de token durante uma solicitação aberta.

## 6. Explicação dos campos ("?") cortada (v79)

O balão do "?" era desenhado dentro do próprio botão, sempre acima dele e preso
à largura de 300px. Resultado: perto da borda do cartão ou da janela o texto era
cortado, e explicações longas ficavam numa coluna estreita e alta.

Agora o balão é posicionado na tela, fora do botão:

- ele se ajusta sozinho para caber — abre acima do "?" e, se não houver espaço,
  abaixo; nunca ultrapassa as margens da janela;
- ficou mais largo (até 420px, ou a largura da tela no celular), com o texto
  inteiro visível e rolagem própria só em textos muito longos;
- dentro de um diálogo, o balão é criado no próprio diálogo, senão ficaria atrás
  da camada do modal;
- no computador aparece ao passar o mouse ou ao focar pelo teclado; no celular,
  o primeiro toque abre e o segundo fecha (antes, o toque abria e fechava na
  mesma hora);
- fecha com **Esc**, ao clicar fora ou ao rolar a página.

Testado no cartão da solicitação, dentro do diálogo de nova solicitação e no
celular, com um texto de 368 caracteres: em todos os casos o balão fica inteiro
dentro da tela e mostra o texto completo.

## 7. Campo de escolaridade que "não deixa editar" (v80)

Investigando o relato, o campo não fica bloqueado para o ADMIN em nenhuma tela:
na solicitação ele é sempre editável para esse perfil, e a edição pela aba
Campos envia o identificador correto. O que existe é outro problema, que produz
exatamente a mesma sensação quando há **dois campos com a mesma chave interna**
— caso típico de "Escolaridade mínima" e "Escolaridade desejável":

- o conteúdo da solicitação é gravado **por chave**, não por campo. Com a chave
  repetida, o que for digitado em um substitui o outro ao salvar: o usuário
  edita, salva, e o campo volta como estava;
- a leitura do valor na tela também usava o `name` do campo e devolvia sempre o
  primeiro elemento encontrado. Agora cada controle carrega o identificador do
  campo e é lido individualmente, dentro do formulário da solicitação — o que
  também evita confusão com campos de mesmo nome em diálogos abertos.

Como a gravação por chave vem do banco, o portal passa a **mostrar o conflito**
em vez de perder conteúdo em silêncio:

- a aba **Campos** abre com um aviso listando quais campos dividem a mesma chave,
  e os cartões envolvidos ficam destacados com a marca "chave repetida";
- a própria solicitação mostra o aviso acima dos campos, para C&R e ADMIN.

A correção definitiva é renomear a chave de um dos campos no banco (ou desativar
o que não for usado).

## 8. Correção definitiva das chaves repetidas (v81)

O aviso da v80 apontava o problema, mas quem tinha de resolver era o banco. Agora
o pacote traz os dois scripts:

- `sql-01-chaves-duplicadas.sql` — só consulta: diz se há campos dividindo a
  mesma chave e mostra como as chaves ficariam depois;
- `sql-02-corrigir-chaves-duplicadas.sql` — aplica. O primeiro campo de cada
  chave mantém a atual e os demais recebem uma chave derivada do próprio nome
  ("Escolaridade desejável" vira `escolaridade_desejavel`).

Nada do histórico se perde: os valores gravados estão ligados ao campo pelo
identificador, assim como o mapeamento do documento.

Testado em PostgreSQL 16: com duas escolaridades e dois idiomas dividindo chave,
o 01 apontou os quatro campos, o 02 renomeou dois e a conferência voltou vazia.
Rodar de novo não altera nada, e um campo sem nome preenchido é deixado como
está em vez de virar uma chave vazia.

## 9. Bateria final (v81)

Executada sobre o conteúdo do próprio zip, já extraído e servido como o
Cloudflare serve — 12 suítes, todas verdes:

1. navegação completa: 3 perfis x todas as abas x solicitações nos 4 status,
   sem nenhum erro de JavaScript;
2. login nos 5 cenários (ativo, inativo, inexistente, erro de consulta, `active`
   nulo), com a sessão preservada quando a falha é de comunicação;
3. renovação de token com uma solicitação aberta: permanece na tela e não
   recarrega nada;
4. transições do fluxo (atribuir ao Gestor, enviar para C&R, concluir), com as
   validações de observação obrigatória e código do cargo;
5. explicação dos campos no cartão, dentro do diálogo e no celular, incluindo
   fechar por Esc e por segundo toque;
6. aviso de chave repetida na aba Campos e dentro da solicitação;
7. os 21 botões de ação que estavam quebrados no v74;
8. Base de cargos: lista, contador, pesquisa, ficha e paginação;
9. celular: nenhuma aba estoura a largura da tela;
10. download do documento por perfil, inclusive tentando forçar pelo console;
11. pesquisa de cargo vigente por clique, digitação, lupa e teclado;
12. servidor fora do ar: a tela explica o motivo em vez de ficar vazia.

Um defeito apareceu nesta bateria e foi corrigido: no celular, a rolagem logo
após o toque fechava a explicação do campo. O balão agora acompanha o "?" e só
some quando o ícone sai da tela.

## 10. Exportação do esquema (v82)

O pacote traz 17 das 45 funções do portal. Para permitir apagar tudo e recriar,
foi incluído o `sql-03-exportar-esquema-atual.sql`, que lê o catálogo do próprio
Supabase e devolve, prontos para executar: a definição completa de todas as
funções, os `grant execute` e as políticas de RLS — além das instruções do
`supabase db dump` para as tabelas e do download das Edge Functions.

Testado: as funções exportadas por ele foram executadas em um banco vazio e
recriadas sem nenhum erro.

## 11. "Editar" do campo continuava sem abrir (v83)

O console do seu navegador mostrou a causa exata:

    Uncaught TypeError: (f.options || []).join is not a function
        at window.editField

O campo guarda as opções da lista suspensa em `options`. Dependendo de como o
campo foi criado, esse conteúdo chega do banco como **texto**
(`"Básico\nAvançado"`), como **objeto** (`{"0":"Básico"}`) ou como **JSON dentro
de um texto** — e não como lista. O código só sabia lidar com lista: ao clicar
em **Editar** ele parava ali, a janela não abria e o botão parecia morto. Era
exatamente o sintoma de "o escolaridade não consegue editar".

Agora existe uma função única que aceita qualquer um desses formatos e devolve
sempre uma lista de textos. Ela é usada nos dois lugares que liam `options`:

- a janela **Editar campo** (aba Campos);
- o `<select>` do formulário da solicitação — que quebrava do mesmo jeito e
  deixava o formulário sem o campo.

Além disso, o `editField` passou a avisar na tela quando algo inesperado
acontecer, em vez de simplesmente não responder.

Testado no navegador com os seis formatos possíveis (texto com quebras de
linha, objeto, JSON em texto, objeto vazio, nulo e número): em todos a janela
abre, as opções aparecem corretamente e o console fica limpo.

## 12. Sessão vencida aparecendo como falha de acesso (v83)

O mesmo print trazia um `401` na leitura do perfil, seguido de "Falha ao
carregar o perfil". Isso acontece quando a aba fica aberta por horas e o token
vence. Agora, antes de mostrar qualquer aviso, o portal renova a sessão uma vez
e repete a leitura — só avisa se ainda assim não conseguir.

## 13. Instalador completo do Supabase (v83)

Foi montado o pacote `supabase-instalacao`, com os scripts numerados de 01 a 07
que criam **as 12 tabelas e as 45 funções** em um projeto Supabase novo, além
das políticas de RLS, das permissões e dos dados iniciais (fluxo oficial, os 13
campos do documento e o mapeamento padrão).

Validação executada aqui, e não apenas por leitura:

1. instalação limpa em um PostgreSQL 16 vazio — **0 erros** nos sete arquivos;
2. o `sql-00-verificacao-instalacao.sql` no banco recém-criado: **12 de 12
   tabelas e 45 de 45 funções**, nenhuma marcada como FALTA;
3. o portal de verdade (este `index.html`) rodando contra esse banco, através de
   uma ponte que responde como o Supabase (Auth + PostgREST + RPC):
   - login dos quatro perfis, incluindo o usuário inativo e o e-mail inexistente;
   - solicitação criada por C&R, atribuída ao Gestor, preenchida, devolvida,
     código do cargo salvo e concluída;
   - Gestor com apenas ATIV_DESC e DESCRICAO_CARGO editáveis;
   - download da **prévia** em Validação C&R e do documento **concluído**,
     ambos com os 17 marcadores preenchidos e nenhum `«MARCADOR»` sobrando;
   - Gestor sem botão de download em nenhuma tela, e barrado também pelo console;
   - as oito abas do ADMIN abrindo com conteúdo;
   - criação e edição de campos, com chaves distintas geradas automaticamente
     para rótulos parecidos (`escolaridade_minima` e `escolaridade_desejavel`).
