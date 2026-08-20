# Fluxo de Descritivos de Cargos — pacote completo (v86)

Tudo o que é preciso para montar o ambiente do zero: o banco e o site.

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `supabase-instalacao/` | os scripts SQL: criam as tabelas, as funções, a segurança e os dados iniciais |
| `cloudflare-base-cargos/` | o site que vai para o Cloudflare Pages |
| `COMO-LIGAR-O-POWER-AUTOMATE.md` | notificações por etapa (opcional) |
| `LEIA-ME-PRIMEIRO.md` | este arquivo |

## Ordem, do zero até funcionando

**1. Crie o projeto no Supabase** (ou use um vazio).

**2. Banco.** No SQL Editor, rode os arquivos de `supabase-instalacao/` na
ordem **01 → 07**. Depois rode o `00-verificacao.sql`: precisa terminar com
12 de 12 tabelas e 45 de 45 funções. Detalhes em
`supabase-instalacao/LEIA-ME.md`.

**3. Seu usuário ADMIN.** Em Authentication → Users, crie o seu e-mail
`@marcopolo.com.br` com uma senha (é o "código de acesso" do login). Depois:

```sql
update public.profiles set role = 'ADMIN', active = true
 where email = 'seu.email@marcopolo.com.br';
```

**4. Edge Functions.** Publique `admin-users` e `notify-workflow` em
Supabase → Edge Functions. Elas não ficam no banco e não são criadas por nenhum
SQL daqui. Sem a `admin-users`, o cadastro pela aba Usuários não funciona (dá
para criar os usuários direto em Authentication).

**5. Site.** Em `cloudflare-base-cargos/`, abra o `config.js` e confira
`SUPABASE_URL` e `SUPABASE_ANON_KEY` do seu projeto. Publique a pasta inteira no
Cloudflare Pages, mantendo `vendor/` ao lado do `index.html`.

**6. Base de cargos.** Entre como ADMIN → aba **Base de cargos** → escolha a
planilha (`base-cargos-atualizada.xlsx` já vai no pacote) → confira a prévia →
**Atualizar base de cargos**.

**7. Notificações (opcional).** Rode o `11-notificacoes-power-automate.sql` e
siga o `COMO-LIGAR-O-POWER-AUTOMATE.md`.

**8. Dois perfis no mesmo e-mail (opcional).** Rode o `12-perfis-multiplos.sql`.
Depois, em Usuários → Editar, marque em "Também pode entrar como" o segundo
perfil da pessoa. Ao entrar, ela escolhe com qual vai trabalhar.

## Aviso importante sobre o SQL

Os scripts foram **reconstruídos** a partir de tudo o que o portal chama — não
são uma cópia do seu Supabase atual. Eles servem para montar um **projeto novo**.

Se o seu ambiente de produção já está rodando, **não aplique este pacote por
cima dele**. Para guardar o que já existe hoje, rode o
`supabase-instalacao/10-exportar-esquema-existente.sql`: ele lê o seu próprio
banco e devolve, prontas para executar, as funções, as permissões e as políticas
de RLS que estão no ar agora.

## Conferência rápida depois de publicar

1. ADMIN: as oito abas aparecem (Painel, Usuários, Campos, Modelos, Empresas e
   filiais, Fluxos, Base de cargos, Logs).
2. Aba **Campos** → **Editar** em qualquer campo: a janela abre.
3. **Nova solicitação → Atualizar cargo existente** → clicar na pesquisa: a
   lista de cargos abre sozinha.
4. Gestor: só a aba Painel, e nenhum botão de baixar documento.
5. C&R, em Validação C&R: existe o botão **Baixar modelo — Validação C&R**.
