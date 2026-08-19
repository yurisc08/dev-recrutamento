# Instalador do Supabase — Fluxo de Descritivos de Cargos (v84)

Este pacote cria o banco inteiro do portal em um **projeto Supabase novo**:
as 12 tabelas, as 46 funções, as políticas de segurança (RLS), as permissões e
os dados iniciais.

> **Leia antes de rodar.** Estes scripts foram escritos para **um projeto novo,
> vazio**. Não são uma cópia do seu banco atual: as funções foram reconstruídas
> a partir de tudo o que o portal chama. Se o seu Supabase de produção já está
> funcionando, **não aplique este pacote nele** — para copiar o que já existe
> hoje, use o `10-exportar-esquema-existente.sql`, que lê o seu próprio banco.

## Ordem de execução

No Supabase → **SQL Editor**, abra cada arquivo e execute na ordem. Todos usam
`if not exists` / `create or replace`: podem ser executados de novo sem apagar
nada.

| Arquivo | O que faz | Obrigatório |
|---|---|---|
| `01-esquema-e-tabelas.sql` | as 12 tabelas, chaves, índices e a base de cargos | sim |
| `02-funcoes-basicas.sql` | perfil, permissões, auditoria, acessos e administração de campos | sim |
| `03-funcoes-do-fluxo.sql` | solicitações: criar, listar, salvar valores e mover o fluxo | sim |
| `04-triagem-e-validacao-adicional.sql` | pedidos iniciados pelo Gestor e aprovação adicional | sim |
| `05-permissoes-e-dados-iniciais.sql` | RLS, `grant execute`, fluxo oficial, os 13 campos e o mapeamento do documento | sim |
| `06-pesquisa-de-cargos.sql` | pesquisa de cargo vigente e detalhes do cargo | sim |
| `07-base-de-cargos-admin.sql` | aba Base de cargos: importação, cadastro manual e exportação | sim |
| `11-notificacoes-power-automate.sql` | avisa cada etapa do fluxo em um fluxo do Power Automate | opcional |

Depois de rodar de 01 a 07, execute o `00-verificacao.sql`. Ele não altera nada
e deve terminar com:

    tabelas_esperadas | tabelas_presentes | funcoes_esperadas | funcoes_presentes
                   12 |                12 |                45 |                45

(o `cr_set_request_details` é a 46ª função e não entra nessa conferência, que é
a mesma lista da v83.)

## Primeiro acesso

1. Em **Authentication → Users**, crie o seu usuário (o e-mail precisa ser
   `@marcopolo.com.br` — o portal recusa outros domínios) e defina uma senha:
   ela é o "código de acesso" da tela de login.
2. O perfil é criado automaticamente pelo gatilho, com papel `GESTOR`.
   Promova-se a ADMIN no SQL Editor:

       update public.profiles set role = 'ADMIN', active = true
        where email = 'seu.email@marcopolo.com.br';

3. Entre no portal: as oito abas do ADMIN devem aparecer.

## Edge Functions (ficam fora do banco)

Duas funções precisam ser publicadas em **Supabase → Edge Functions**; nenhum
SQL as cria:

- `admin-users` — cadastro de usuários e geração do código de acesso;
- `notify-workflow` — chamada pela tela a cada transição. Se você usar o
  `11-notificacoes-power-automate.sql`, ela deixa de ser necessária: os avisos
  passam a sair do próprio banco, e uma falha nela nunca interrompe o fluxo.

Sem a `admin-users`, o cadastro pela aba **Usuários** não funciona — nesse caso
crie os usuários direto em Authentication, como no primeiro acesso.

## Notificações por etapa no Power Automate

O `11-notificacoes-power-automate.sql` pendura um gatilho no histórico das
solicitações: a cada etapa gravada, o banco monta o aviso e faz um POST no seu
fluxo. Passo a passo em `../COMO-LIGAR-O-POWER-AUTOMATE.md`.

## Arquivos de apoio

| Arquivo | Quando usar |
|---|---|
| `00-verificacao.sql` | confere tabelas e funções; **não altera nada** |
| `08-conferir-chaves-repetidas.sql` | mostra campos ativos dividindo a mesma chave interna; **não altera nada** |
| `09-corrigir-chaves-repetidas.sql` | corrige o que o 08 encontrar, sem perder conteúdo já gravado |
| `10-exportar-esquema-existente.sql` | exporta do **seu** Supabase o que já existe hoje (funções, permissões e RLS) |

## O que foi testado aqui

1. Instalação limpa em um PostgreSQL 16 vazio: os sete arquivos rodaram com
   **0 erros**, e a reexecução também.
2. `00-verificacao.sql` no banco recém-criado: **12 de 12 tabelas** e **45 de 45
   funções**, nenhuma faltando.
3. O portal rodando de verdade contra esse banco: login dos quatro perfis,
   fluxo completo de C&R a Gestor e de volta, download da prévia e do documento
   concluído com os 17 marcadores preenchidos, importação da planilha de 3.968
   cargos e as oito abas do ADMIN.
4. As notificações: cada etapa do fluxo gerou um aviso com o destinatário certo.
