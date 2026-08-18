# Base de cargos editável (v55)

Versão v54 do Fluxo de Descritivos de Cargos + a nova aba **Base de cargos**: uma
planilha estilo Excel embutida na página, onde o ADMIN edita, inclui e exclui os
cargos da base geral. O que for salvo ali é a mesma base que o fluxo já consulta
(`job_catalog`), então a alteração aparece na hora na pesquisa de cargo vigente,
no conteúdo atual dos campos e no documento gerado.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | app v55 (v54 + aba Base de cargos) |
| `base-grid.js` | a planilha: grade, edição, seleção, copiar/colar, importar/exportar |
| `base-cargos.js` | colunas da base, regras de interligação, leitura/gravação de .xlsx e .csv |
| `styles.css` | estilos v54 + bloco da planilha no final |
| `sql/base_cargos_admin.sql` | funções e permissões no Supabase (executar uma vez) |

## Instalação

1. Publique os arquivos como hoje (mesma pasta do v54 — `base-grid.js` e
   `base-cargos.js` precisam ficar ao lado do `index.html`).
2. No Supabase → SQL Editor, execute `sql/base_cargos_admin.sql`.
3. Entre como ADMIN: a aba **Base de cargos** aparece no menu.

Enquanto o SQL não for executado, a aba abre em **modo local**: um aviso explica
o que falta e a planilha continua utilizável (importar arquivo → editar →
baixar). Nada é gravado no Supabase nesse modo.

## O que dá para fazer na aba

**Editar como no Excel**
- Setas navegam, `Enter` ou duplo clique abre a célula, `Tab` avança.
- Digitar direto sobre a célula substitui o conteúdo; `Esc` cancela.
- `Shift + setas` seleciona um intervalo; `Ctrl+C` copia em TSV (cola no Excel) e
  `Ctrl+V` cola um bloco vindo do Excel — se passar do fim, novas linhas são criadas.
- `Delete` limpa as células selecionadas e `Ctrl+Z` desfaz (últimas 120 ações).
- Cabeçalho fixo, colunas **Código do cargo** e **Cargo** congeladas à esquerda,
  e só a faixa visível é renderizada — a base inteira (milhares de linhas) rola sem travar.

**Linhas**
- `+ Linha` insere abaixo da seleção, `Duplicar` clona as linhas selecionadas e
  `Excluir linha` remove (a exclusão só vai para a base ao salvar).
- Clicar no número da linha seleciona a linha inteira.

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

**Perfis**
- ADMIN: edita, inclui, exclui, importa e exporta.
- C&R: enxerga a aba apenas para consulta e download (mesma regra da aba Modelos).
- Gestor: não vê a aba.

## Sobre o banco

O SQL cria/garante `public.job_catalog` (colunas resumidas + `raw_data` jsonb com
as 35 colunas da planilha) e as funções `admin_list_job_catalog`,
`admin_save_job_catalog_rows` e `admin_delete_job_catalog_rows`, todas restritas
ao perfil ADMIN para escrita. `search_job_catalog` e `get_job_catalog_details`
não são alteradas — continuam lendo a mesma tabela.

Toda alteração fica registrada em `public.job_catalog_changes` (quem alterou,
quando, ação e campos alterados), consultável por `list_job_catalog_changes`.
Esse histórico ainda não aparece na aba **Logs**, que lê `list_audit_logs`;
juntar os dois é um passo seguinte simples.
