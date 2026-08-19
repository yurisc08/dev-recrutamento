# Correções aplicadas sobre o v74 (publicação v78)

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
