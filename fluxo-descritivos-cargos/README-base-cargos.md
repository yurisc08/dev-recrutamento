# Base de cargos editável (v59)

Versão v54 do Fluxo de Descritivos de Cargos + a nova aba **Base de cargos**: uma
planilha estilo Excel embutida na página, onde o ADMIN edita, inclui e exclui os
cargos da base geral. O que for salvo ali é a mesma base que o fluxo já consulta
(`job_catalog`), então a alteração aparece na hora na pesquisa de cargo vigente,
no conteúdo atual dos campos e no documento gerado.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | app v59 (v54 + aba Base de cargos) |
| `base-grid.js` | a planilha: grade, edição, seleção, copiar/colar, importar/exportar |
| `base-cargos.js` | colunas da base, regras de interligação, leitura/gravação de .xlsx e .csv |
| `styles.css` | estilos v54 + bloco da planilha no final |
| `sql/base_cargos_admin.sql` | funções e permissões no Supabase (executar uma vez) |

## Instalação

1. Publique os arquivos como hoje (mesma pasta do v54 — `base-grid.js` e
   `base-cargos.js` precisam ficar ao lado do `index.html`).
2. No Supabase → SQL Editor, execute `sql/base_cargos_admin.sql`.
3. Entre como ADMIN: a aba **Base de cargos** aparece no menu.

As funções usam o prefixo `base_cargos_` justamente porque já existe um
`admin_list_job_catalog` com outra assinatura no projeto — dois nomes iguais
fazem o Supabase responder *"Could not choose the best candidate function"*.
O script também remove a versão anterior deste mesmo arquivo (apenas aquelas
assinaturas exatas) e pode ser executado quantas vezes for preciso.

Enquanto o SQL não for executado, a aba abre em **modo local**: um aviso explica
o que falta e a planilha continua utilizável (importar arquivo → editar →
baixar). Nada é gravado no Supabase nesse modo.

## O que dá para fazer na aba

**Ajuda na própria tela**
- O **?** ao lado do título abre tudo em um só lugar: atalhos, como completar a
  base, preenchimento automático, onde cada coluna é usada no fluxo e o
  significado das cores. O painel fixo que ficava no rodapé foi removido.

**Enquanto houver alteração pendente**
- Uma faixa laranja fica visível abaixo da barra de ferramentas dizendo quantos
  cargos foram alterados e que **nada foi gravado ainda**, com o botão
  **Salvar alterações** ali mesmo. Importar sem gravar deixa de passar batido.

**Editar como no Excel**
- Setas navegam, `Enter` ou duplo clique abre a célula, `Tab` avança.
- Digitar direto sobre a célula substitui o conteúdo; `Esc` cancela.
- `Shift + setas` seleciona um intervalo; `Ctrl+C` copia em TSV (cola no Excel) e
  `Ctrl+V` cola um bloco vindo do Excel — se passar do fim, novas linhas são criadas.
- `Delete` limpa as células selecionadas e `Ctrl+Z` desfaz (últimas 120 ações).
- Cabeçalho fixo, colunas **Código do cargo** e **Cargo** congeladas à esquerda,
  e só a faixa visível é renderizada — a base inteira (milhares de linhas) rola sem travar.
- O botão **Ficha** abre o cargo selecionado como formulário, com os 35 campos
  agrupados — mais confortável para os textos longos.

**Linhas**
- `+ Linha` insere abaixo da seleção, `Duplicar` clona as linhas selecionadas e
  `Excluir linha` remove (a exclusão só vai para a base ao salvar).
- Clicar no número da linha seleciona a linha inteira.

**Se faltar conteúdo (base incompleta no banco)**
- A base é lida em blocos de 1.000 linhas (limite de resposta do Supabase) até
  terminar — o contador mostra o total real, não o primeiro pedaço.
- O status avisa quantas colunas vieram **sem nenhum conteúdo** e funciona como
  botão: clicar abre direto a importação. O menu **Colunas** mostra quantas
  linhas estão preenchidas em cada coluna.
- A importação abre um resumo antes de aplicar: linhas do arquivo, colunas
  reconhecidas, quantas casam com a base e quantas entrariam como novas. Aí você
  escolhe **Completar dados dos cargos** (recomendado) ou **Substituir toda a
  base**. Nada é gravado até você clicar em **Salvar alterações**.
- O casamento é feito por empresa + código do cargo e, quando a empresa não
  confere, apenas pelo código — desde que ele seja único na base, para nunca
  gravar no cargo errado.
- Medido de ponta a ponta com a planilha de 3.968 cargos contra um PostgreSQL
  real: 2s para ler o arquivo, 90.940 campos completados e 2s para gravar em 20
  lotes.

**Salvar**
- `Salvar alterações` grava tudo de uma vez, em lotes de 200 linhas.
- O contador mostra quantas linhas estão pendentes; célula alterada fica amarela,
  linha nova fica verde e `Descartar` recarrega a base do servidor.
- O navegador avisa se você tentar sair com alterações pendentes.

**Arquivo**
- `Baixar planilha (.xlsx)` gera o arquivo com as 35 colunas oficiais, cabeçalho
  congelado e filtro automático — respeitando o filtro que estiver na tela.
- `Baixar CSV (.csv)` para abrir direto no Excel em português.
- `Importar arquivo...` aceita `.xlsx` e `.csv` em dois modos: **mesclar** pelo
  código do cargo (atualiza os existentes e inclui os novos) ou **substituir**
  toda a base carregada. A importação também só é aplicada ao salvar.

**Campos interligados**
- **Empresa** completa código da empresa e emp. cód. a partir de outro registro.
- **Cargo** replica para nome completo e nome resumido quando estiverem vazios.
- **Código do cargo** herda CBO, nível, trilha e natureza de um cargo já cadastrado.
- **Cód. família** gera a chave de agrupamento (`H|família`).
- Preencher um requisito (escolaridade, idioma, competências) preenche o rótulo
  oficial correspondente.
- O preenchimento automático só acontece em célula vazia — nunca sobrescreve o
  que foi digitado — e a célula preenchida assim fica marcada em azul.
- Cada cabeçalho mostra qual campo do fluxo aquela coluna alimenta, e o quadro
  "Como os campos se interligam", no rodapé da aba, resume tudo.
- Código repetido dentro da mesma empresa é destacado em vermelho.

**No celular**
- A tabela rola na horizontal e as colunas congeladas são desligadas, para não
  cobrirem a tela.
- **Um toque na linha abre a ficha do cargo** em tela cheia, com todos os campos
  editáveis, botão de excluir e a barra Cancelar/Aplicar fixa no rodapé.
- Barra de ferramentas compacta e campos com fonte de 16px (o navegador não dá
  zoom ao focar).

**Perfis**
- ADMIN: edita, inclui, exclui, importa e exporta.
- C&R: enxerga a aba apenas para consulta e download (mesma regra da aba Modelos).
- Gestor: não vê a aba.

## Documento (DOCX)

- O download deixou de ser exclusivo das solicitações concluídas: em
  **Validação C&R** (e em Rascunho C&R) o C&R baixa uma **prévia** com o
  preenchimento salvo até o momento, e o Gestor faz o mesmo enquanto a
  solicitação está com ele. A solicitação continua na etapa atual e o arquivo sai
  identificado como prévia.
- Os 17 marcadores do modelo agora são preenchidos automaticamente quando o ADMIN
  não configurou a aba **Modelos**: primeiro o campo do formulário com a chave
  igual ao marcador, depois o campo da seção correspondente (missão,
  atividades, escolaridade, idioma, competências, experiência) e, se ainda
  estiver vazio, o conteúdo do cargo na **Base de cargos**. O texto padrão só
  aparece quando todas as origens estão vazias.

## Sobre o banco

O SQL cria/garante `public.job_catalog` (colunas resumidas + `raw_data` jsonb com
as 35 colunas da planilha) e as funções `base_cargos_list`, `base_cargos_save` e
`base_cargos_delete`, todas restritas ao perfil ADMIN para escrita.
`search_job_catalog` e `get_job_catalog_details` não são alteradas — continuam
lendo a mesma tabela.

O script se adapta ao formato que a sua tabela já tiver:

- **lendo**: junta as colunas reais da tabela (qualquer nome, convertido para
  maiúsculas), as colunas resumidas e o `raw_data` — este último com prioridade;
- **gravando**: além de `raw_data` e das colunas resumidas, atualiza também as
  colunas de texto que existirem com o nome de um campo da planilha
  (`ativ_desc`, `descricao_cargo`, `skill_31`...) e as colunas de data/número,
  uma a uma. Se o valor digitado não converter para o tipo da coluna (uma data
  escrita como `36434`, por exemplo), aquela coluna é ignorada e o valor fica
  guardado em `raw_data` — a gravação das demais linhas não é interrompida.

Toda alteração fica registrada em `public.job_catalog_changes` (quem alterou,
quando, ação e campos alterados), consultável por `base_cargos_history`.
Esse histórico ainda não aparece na aba **Logs**, que lê `list_audit_logs`;
juntar os dois é um passo seguinte simples.

O arquivo foi testado em um PostgreSQL 16 real, nos dois formatos de tabela
(a criada por ele e uma já existente com as colunas da planilha), incluindo
inclusão, alteração, exclusão, histórico, bloqueio de C&R para escrita, bloqueio
de Gestor para leitura e reexecução do próprio script.
