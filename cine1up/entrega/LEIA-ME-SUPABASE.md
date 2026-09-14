# CINE 1UP — pacote do Supabase

Este pacote é **só o banco**: onde ficam as suas matérias, as imagens que você
envia, a lista da newsletter e o placar do jogo.

São 10 minutos, uma vez só.

---

## O que tem aqui

```
schema.sql    Cria tudo: tabelas, segurança e o espaço das imagens
```

---

## 1. Criar o projeto

1. Entre em [supabase.com](https://supabase.com) e crie uma conta (o plano
   grátis atende bem um site de conteúdo).
2. **New project** → escolha um nome, uma senha forte para o banco e a região
   **South America (São Paulo)**, que é a mais perto.
3. Espere uns dois minutos enquanto ele provisiona.

---

## 2. Rodar o schema.sql

1. No menu lateral → **SQL Editor** → **New query**.
2. Abra o `schema.sql` deste pacote, copie **tudo** e cole lá.
3. **Run**.

Deve aparecer "Success. No rows returned". Isso criou:

- a tabela **posts** (suas matérias, com rascunho, destaque, nota, tags)
- a tabela **redacao** (quem pode publicar)
- a tabela **newsletter** (quem assinou)
- a tabela **placar** (recordes do Cine Runner)
- as regras de segurança (RLS) que impedem qualquer visitante de escrever
- o espaço **midia**, onde as imagens que você enviar vão ficar

Pode rodar de novo mais tarde sem medo: o arquivo foi escrito para não duplicar
nada.

---

## 3. Criar o seu login

1. Menu lateral → **Authentication** → **Users** → **Add user** →
   **Create new user**.
2. Coloque seu e-mail e uma senha forte.
3. Marque **Auto Confirm User** (senão o Supabase fica esperando você confirmar
   por e-mail).

---

## 4. Liberar o seu login para publicar

Ter login **não** dá permissão nenhuma. É preciso entrar na tabela `redacao`.
Esse é justamente o que impede outra pessoa de publicar no seu site.

**SQL Editor** → nova query → troque o e-mail e o nome → **Run**:

```sql
insert into public.redacao (user_id, nome, papel)
select id, 'Seu Nome', 'admin' from auth.users
 where email = 'voce@exemplo.com'
on conflict (user_id) do nothing;
```

Para conferir que deu certo:

```sql
select r.papel, r.nome, u.email
  from public.redacao r join auth.users u on u.id = r.user_id;
```

Tem que aparecer uma linha com o seu e-mail.

---

## 5. Fechar o cadastro público

**Authentication → Providers → Email** → desligue **Enable signup**.

Sem isso, qualquer pessoa pode criar uma conta no seu Supabase. Ela não
conseguiria publicar nada (a tabela `redacao` barra), mas é sujeira à toa.

---

## 6. Copiar as duas chaves

**Project Settings → API**. Copie:

- **Project URL** → algo como `https://xxxxxxxx.supabase.co`
- **anon public** → a chave longa que começa com `eyJ...`

Cole no arquivo `assets/js/config.js` do pacote da Cloudflare:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

E faça um novo deploy do site.

> A chave `anon` é pública por natureza — ela vai no código do site mesmo. Quem
> protege o conteúdo são as regras de RLS que o `schema.sql` criou.
>
> **Nunca** coloque a chave `service_role` no site. Ela ignora todas as regras
> de segurança. Se ela vazar, qualquer pessoa apaga tudo.

---

## 7. Conferir

Abra `seudominio.com.br/admin.html`, entre com o e-mail e a senha do passo 3 e
publique uma matéria de teste. Ela deve aparecer na capa na hora.

Se aparecer *"este login existe, mas ainda não está liberado para publicar"*, o
passo 4 não foi feito (ou o e-mail estava diferente).

---

## Depois: manutenção

**Esqueceu a senha:** Authentication → Users → os três pontinhos ao lado do seu
usuário → *Send password recovery*.

**Backup:** Database → Backups. No plano grátis o Supabase guarda os últimos
dias; para um arquivo seu, use *Database → Backups → Download* ou
`pg_dump` com a string de conexão que aparece em Project Settings → Database.

**Projeto pausado:** o plano grátis pausa projetos sem acesso por uma semana.
Basta entrar no painel e clicar em *Restore*. Se o site for para valer, vale
olhar o plano pago.

**Ver quem tem acesso:**

```sql
select r.papel, r.nome, u.email, r.criado_em
  from public.redacao r join auth.users u on u.id = r.user_id
 order by r.criado_em;
```
