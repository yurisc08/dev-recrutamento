# Correções aplicadas sobre o v74 (publicação v76)

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
