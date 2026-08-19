# Publicação no Cloudflare — Fluxo de Descritivos de Cargos (v84)

Este zip é **só o site**. Os scripts do banco estão no outro zip
(`supabase-instalacao`), e devem ser executados **antes** da primeira
publicação em um projeto novo.

## 1. O que tem aqui

| Arquivo | Para que serve |
|---|---|
| `index.html` | o portal inteiro (telas, regras e fluxo) |
| `styles.css` | estilos |
| `config.js` | endereço do Supabase e chave publicável — **confira antes de publicar** |
| `vendor/xlsx.mjs` | leitura e gravação de planilha, servida do próprio site |
| `modelo-cargo-individual.docx` | modelo do documento gerado |
| `logo-anterior.png`, `logo-hub-carreira-recompensa.png` | identidade visual |
| `base-cargos-atualizada.xlsx` | base de cargos exportada, para importar quando precisar |
| `CORRECOES.md` | tudo o que mudou do v74 até esta versão |
| `LEIA-ME-BASE-DE-CARGOS.md` | como usar a aba Base de cargos |

## 2. Publicar

1. Abra o `config.js` e confira `SUPABASE_URL` e `SUPABASE_ANON_KEY` — eles
   apontam para o projeto Supabase que vai atender o portal.
2. Publique **todos os arquivos na raiz**, mantendo a pasta `vendor/` ao lado do
   `index.html`. No Cloudflare Pages, é só arrastar a pasta inteira.
3. A versão publicada é identificada por `20260819-v84` (dentro do
   `index.html`). Se o navegador mostrar a tela antiga, é cache: recarregue com
   **Ctrl+F5**.

## 3. Conferir se ficou tudo certo

1. Entre como **ADMIN**: devem aparecer as oito abas — Painel, Usuários,
   Campos, Modelos, Empresas e filiais, Fluxos, Base de cargos e Logs.
2. Na aba **Campos**, clique em **Editar** em qualquer campo: a janela precisa
   abrir. (Era exatamente aqui que o botão não respondia até a v82.)
3. Abra **Base de cargos**: o contador mostra o total de cargos.
4. Em **Nova solicitação → Atualizar cargo existente**, clique no campo de
   pesquisa: a lista de cargos abre sozinha.
5. Entre como **Gestor**: só a aba Painel, e nenhuma solicitação concluída
   oferece download do documento.
6. Entre como **C&R**, abra uma solicitação em Validação C&R: em "Opções finais
   de C&R" existe o botão **Baixar modelo — Validação C&R**.

## 4. Se o login recusar o acesso

A mensagem diz o caso exato:

- *"Este e-mail ainda não está cadastrado no portal"* → falta criar o usuário em
  **Usuários**;
- *"Seu acesso está inativo"* → o usuário existe, mas está desativado;
- *"Seu cadastro existe, mas o acesso ainda não foi ativado"* → o perfil foi
  criado fora do portal e o campo `active` ficou vazio; ative o usuário;
- *"E-mail ou código inválido"* → e-mail ou senha errados no Authentication;
- *"Não foi possível confirmar seu acesso agora: …"* → não é cadastro: é falha
  de conexão ou de permissão (RLS) na tabela `profiles`. A sessão é mantida.
  A partir da v83, uma sessão vencida é renovada automaticamente antes de
  qualquer aviso aparecer.

## 5. Banco de dados

Está tudo no zip `supabase-instalacao`, com o passo a passo no `LEIA-ME.md`
de lá: os arquivos 01 a 07 criam as 12 tabelas e as 45 funções em um projeto
novo, e o `00-verificacao.sql` confere o resultado sem alterar nada.

As duas **Edge Functions** (`admin-users` e `notify-workflow`) não ficam no
banco: precisam ser publicadas em Supabase → Edge Functions.
