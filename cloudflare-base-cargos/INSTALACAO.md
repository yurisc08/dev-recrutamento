# Instalação — Fluxo de Descritivos de Cargos (v82)

Pacote completo: os arquivos que vão para o Cloudflare e os scripts SQL do
Supabase.

## 1. O que tem aqui

| Arquivo | Para que serve |
|---|---|
| `index.html` | o portal inteiro (telas, regras e fluxo) |
| `styles.css` | estilos |
| `config.js` | endereço do Supabase e chave publicável — **confira antes de publicar** |
| `vendor/xlsx.mjs` | leitura/gravação de planilha, servida do próprio site |
| `modelo-cargo-individual.docx` | modelo do documento gerado |
| `logo-anterior.png`, `logo-hub-carreira-recompensa.png` | identidade visual |
| `base-cargos-atualizada.xlsx` | base de cargos exportada, para importar quando precisar |
| `sql-00-verificacao-instalacao.sql` | **confere** o que já existe no banco (não altera nada) |
| `sql-01-chaves-duplicadas.sql` | **confere** se há campos dividindo a mesma chave (não altera nada) |
| `sql-02-corrigir-chaves-duplicadas.sql` | corrige as chaves repetidas encontradas pelo 01 |
| `sql-03-exportar-esquema-atual.sql` | **exporta** do seu Supabase o que já existe, para poder recriar o ambiente do zero |
| `supabase-corrigir-lista-cargos-v58.sql` | pesquisa de cargo vigente e detalhes do cargo |
| `supabase-base-cargos-admin-v74.sql` | aba Base de cargos: importação, cadastro manual e exportação |
| `CORRECOES.md` | o que mudou da v74 até aqui |
| `LEIA-ME-BASE-DE-CARGOS.md` | como usar a aba Base de cargos |

## 2. Publicar o site

1. Confira o `config.js`: `SUPABASE_URL` e `SUPABASE_ANON_KEY` do seu projeto.
2. Publique **todos os arquivos na raiz**, mantendo a pasta `vendor/` ao lado do
   `index.html`. No Cloudflare Pages, é só arrastar a pasta inteira.
3. A versão publicada é identificada por `20260818-v82` (dentro do `index.html`).
   Se o navegador mostrar a tela antiga, é cache: recarregue com Ctrl+F5.

## 3. Banco de dados (Supabase → SQL Editor)

**Comece pela verificação.** Rode `sql-00-verificacao-instalacao.sql`: ele lista
cada tabela e cada função que o portal usa, marcando **OK** ou **FALTA**, e não
altera nada. O resumo no fim diz quantas das 12 tabelas e das 45 funções já
existem.

Depois, rode nesta ordem os dois scripts do pacote (podem ser executados quantas
vezes precisar):

1. `supabase-corrigir-lista-cargos-v58.sql`
2. `supabase-base-cargos-admin-v74.sql`

Rode a verificação de novo para confirmar que o que faltava desses dois virou OK.

Por último, rode `sql-01-chaves-duplicadas.sql`. Se ele listar campos (o caso
típico é "Escolaridade mínima" e "Escolaridade desejável" com a mesma chave),
confira a prévia e rode `sql-02-corrigir-chaves-duplicadas.sql` — sem isso, o
que for digitado em um desses campos substitui o outro ao salvar. O 02 pode ser
executado como está e não perde nenhum conteúdo já gravado.

### Para poder apagar tudo e recriar do zero

Este pacote **não** contém todas as funções do portal: traz 17 das 45. As outras
30 vieram das versões anteriores do projeto, que não passaram por aqui. Com o
que está no zip, um projeto Supabase novo abriria o portal, mas painel, campos e
fluxo não funcionariam.

Para ter o instalador completo, exporte do seu próprio banco — o que sai de lá é
exatamente o que está rodando hoje, sem reconstrução:

1. rode `sql-03-exportar-esquema-atual.sql` e salve o resultado da **parte 1**
   (todas as funções), da **parte 2** (permissões) e da **parte 3** (políticas
   RLS) em um arquivo `.sql`;
2. para as tabelas, use o utilitário oficial, indicado na parte 4 do script:
   `supabase db dump --schema public -f esquema-completo.sql` (ou `pg_dump`);
3. baixe também o código das duas Edge Functions
   (`supabase functions download admin-users` e `notify-workflow`), porque elas
   não ficam no banco.

Com esses arquivos guardados junto do pacote, dá para recriar o ambiente inteiro
em um projeto novo. Testado aqui: as funções exportadas pela parte 1 foram
recriadas em um banco vazio sem nenhum erro.

### Se a verificação apontar funções que não estão nestes dois arquivos

O portal usa 45 funções no total. Estes dois scripts criam 17 — as ligadas à
base de cargos e à pesquisa. As outras 28 (`create_request`,
`transition_dynamic_request`, `save_dynamic_values`, `list_visible_requests`,
`admin_upsert_field`, entre outras) vieram das versões anteriores do projeto
(v47 e anteriores) e **já estão no seu Supabase** — não foram incluídas aqui
porque este pacote não as altera.

Se você estiver montando um projeto Supabase **novo do zero**, aplique antes os
scripts dessas versões anteriores; sem eles o portal abre, mas painel, campos e
fluxo não funcionam. A verificação mostra exatamente quais estão faltando.

### Edge Functions

Duas funções vivem fora do banco e precisam estar publicadas em
**Supabase → Edge Functions**:

- `admin-users` — cadastro de usuários e geração de código de acesso;
- `notify-workflow` — notificação a cada etapa do fluxo (se falhar, o fluxo
  continua normalmente; apenas o aviso deixa de ser enviado).

## 4. Conferir se ficou tudo certo

1. Entre como **ADMIN**: devem aparecer as abas Painel, Usuários, Campos,
   Modelos, Empresas e filiais, Fluxos, Base de cargos e Logs.
2. Abra **Base de cargos** → o contador deve mostrar o total de cargos.
3. Em **Nova solicitação → Atualizar cargo existente**, clique no campo de
   pesquisa: a lista de cargos deve abrir sozinha.
4. Entre como **Gestor**: só a aba Painel, e nenhuma solicitação concluída deve
   oferecer download do documento.
5. Na aba **Campos**, não deve aparecer o aviso laranja de "chave repetida". Se
   aparecer, rode os SQL 01 e 02 acima.

## 5. Se o login recusar o acesso

A partir da v78 a mensagem diz o caso exato:

- *"Este e-mail ainda não está cadastrado no portal"* → falta criar o usuário em
  **Usuários**;
- *"Seu acesso está inativo"* → o usuário existe, mas está desativado;
- *"Seu cadastro existe, mas o acesso ainda não foi ativado"* → o perfil foi
  criado fora do portal e o campo `active` ficou vazio; ative o usuário;
- *"Não foi possível confirmar seu acesso agora: …"* → não é cadastro: é falha
  de conexão ou de permissão (RLS) na tabela `profiles`. A sessão é mantida;
  tente de novo e, se persistir, confira as políticas da tabela.
