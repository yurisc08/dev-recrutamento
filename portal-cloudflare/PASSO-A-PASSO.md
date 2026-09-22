# Passo a passo — subir o portal no Cloudflare + Supabase

Guia de criação, do zero até o gestor marcando decisão. Leva cerca de 1 hora na
primeira vez. Tudo o que é gratuito está marcado.

**O que você vai precisar antes de começar**

- Um e-mail corporativo (para criar as contas).
- Um domínio da empresa já no Cloudflare, ou a disposição de usar o endereço
  gratuito `*.pages.dev` (funciona, mas fica menos elegante e sem Access).
- Node.js instalado na **sua** máquina, só para publicar: <https://nodejs.org>
  (versão LTS). Depois de publicado, ninguém mais precisa instalar nada.

> Antes de subir dado real: hospedar informação de RH fora da empresa é decisão
> da TI/Segurança e do jurídico (LGPD). Este guia entrega os controles; o aceite
> é da empresa.

---

## Parte 0 — Conferir tudo na sua máquina, antes de criar conta em lugar nenhum

Dá para rodar o portal inteiro — banco, API e tela — **sem Supabase, sem
Cloudflare e sem dado real**. É o jeito de validar sem risco: se não gostar,
você apaga a pasta e não criou conta em serviço nenhum.

Precisa de: Node 20+ e um PostgreSQL local (qualquer um serve).

```bash
# 1. um banco vazio
createdb portal_local

# 2. o MESMO arquivo que vai para o Supabase
psql -d portal_local -f supabase/portal-supabase.sql

# 3. a API, apontando para esse banco
cd api && npm install
DATABASE_URL="postgres://localhost/portal_local" npm run local
```

Em outro terminal, a tela:

```bash
cd web && npm install && npm run dev
```

Abra <http://127.0.0.1:5173>. Crie o seu acesso com `npm run admin`, dentro de
`api/`, e importe o `modelo/modelo-base.xlsx` (dados fictícios).

**Conferindo a segurança no seu próprio banco**, antes de confiar nela:

```bash
# a trilha de auditoria não se altera nem se apaga
psql -d portal_local -c "UPDATE portal.auditoria SET tipo = 'x';"
# ERRO:  A trilha de auditoria não pode ser alterada nem apagada.

# o papel da aplicação não faz DDL
psql -d portal_local -U portal_app -c "CREATE TABLE portal.invadiu (id int);"
# ERRO:  permission denied for schema portal
```

E os testes, que sobem a API de verdade contra esse banco:

```bash
cd api && DATABASE_URL="postgres://localhost/portal_local" npm test
# 40 testes: escopo por perfil, distribuição pelos três níveis, campo sensível,
# importação, homologação, exportação, trava de IP e auditoria.
```

Só depois disso vale criar as contas das partes 1 a 5. O arquivo SQL é o mesmo,
o código é o mesmo — muda só onde roda.

---

## Parte 1 — O banco (Supabase) · ~15 min

1. Entre em <https://supabase.com> → **Start your project** → crie a conta.
2. **New project**:
   - *Name*: `portal-decisoes`
   - *Database Password*: gere uma senha longa e **guarde num cofre de senhas**.
   - *Region*: **South America (São Paulo)** — deixa os dados no Brasil.
   - Plano *Free*.
3. Espere o projeto subir (~2 min).
4. Abra **`supabase/portal-supabase.sql`** num editor de texto. **Antes de
   colar**, troque `TROQUE_ESTA_SENHA` (aparece uma vez só) por uma senha longa
   e aleatória — é a senha que o Worker vai usar. Guarde-a num cofre.
5. No menu lateral, **SQL Editor** → **New query** → cole o arquivo inteiro →
   **Run**. É um arquivo só, e pode rodar de novo quando quiser: nada é
   duplicado e nada é apagado.

   > O arquivo é gerado a partir das quatro partes numeradas (`01-esquema`,
   > `02-seguranca`, `03-carga-inicial`, `04-gestores`), que continuam ali para
   > quem quiser ler por pedaço. Para gerar de novo:
   > `node supabase/montar.mjs`.
6. Confira que a auditoria está trancada (isto **tem** que dar erro):
   ```sql
   UPDATE portal.auditoria SET tipo = 'x';
   -- ERRO: A trilha de auditoria não pode ser alterada nem apagada.
   ```
7. Pegue o endereço do banco: **Project Settings → Database → Connection string
   → Transaction pooler** (porta **6543**). Vai ser parecido com:
   ```
   postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
   Troque o usuário e a senha pelos do `portal_app`:
   ```
   postgres://portal_app:SUA-SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
   **Guarde essa linha inteira** — é o que a API vai usar. A porta 6543 é
   obrigatória.

## Parte 2 — A API (Cloudflare Workers) · ~15 min

1. Crie a conta em <https://dash.cloudflare.com/sign-up> (plano gratuito).
2. No seu computador, abra o terminal (no Windows: *Prompt de Comando*) dentro
   da pasta `portal-cloudflare/api` e rode:
   ```bash
   npm install
   npx wrangler login
   ```
   Abre o navegador para autorizar. Autorize.
3. Guarde o endereço do banco como **segredo** (nunca dentro de arquivo):
   ```bash
   npx wrangler secret put DATABASE_URL
   ```
   Cole a linha `postgres://portal_app:...` que você guardou e dê Enter.
4. Abra `api/wrangler.toml` e ajuste:
   - `IPS_PERMITIDOS` — as faixas de IP da empresa/VPN, separadas por vírgula
     (ex.: `200.100.50.0/24,201.10.0.0/16`). Se deixar vazio, qualquer IP
     alcança o portal (o login e o Access continuam valendo).
   - Se você tem domínio próprio no Cloudflare, tire o `#` destas linhas e
     preencha:
     ```toml
     [[routes]]
     pattern = "portal.suaempresa.com.br/api/*"
     zone_name = "suaempresa.com.br"
     ```
5. Publique:
   ```bash
   npm run deploy
   ```

## Parte 3 — A tela (Cloudflare Pages) · ~10 min

1. Na pasta `portal-cloudflare/web`:
   ```bash
   npm install
   npm run build
   npx wrangler pages deploy dist
   ```
   Na primeira vez ele pergunta o nome do projeto — use `portal-decisoes`.
2. No painel da Cloudflare → **Workers & Pages → portal-decisoes → Custom
   domains**, ligue `portal.suaempresa.com.br` (o mesmo nome que você pôs na
   rota do Worker, na Parte 2).

> **Por que o mesmo domínio?** Tela e API no mesmo endereço mantêm o cookie de
> sessão *same-site* — é o que impede outro site de usar a sessão de quem está
> logado.

## Parte 4 — Cloudflare Access: o login corporativo na frente · ~10 min

1. No painel: **Zero Trust → Access → Applications → Add an application →
   Self-hosted**.
2. *Application domain*: `portal.suaempresa.com.br`.
3. *Identity providers*: o provedor da empresa (Entra ID/Azure AD, Google
   Workspace, Okta). Sem provedor, use **One-time PIN** e cadastre a lista de
   e-mails que podem entrar.
4. *Policies*: `Allow` só para o grupo do RH e os gestores/diretores do processo.
5. Copie o **Application Audience (AUD) Tag** e o domínio da sua equipe
   (`suaempresa.cloudflareaccess.com`), cole em `ACCESS_AUD` e `ACCESS_DOMINIO`
   no `api/wrangler.toml` e publique de novo:
   ```bash
   cd api && npm run deploy
   ```

Agora são três portas em série: **Access** (quem é você) → **faixa de IP** (de
onde) → **login do portal** (o que você pode ver).

## Parte 5 — Seu acesso e a primeira carga · ~10 min

1. Ainda na pasta `api`, crie o seu acesso de RH:
   ```bash
   # Windows (Prompt de Comando)
   set DATABASE_URL=postgres://portal_app:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   npm run admin

   # Linux/Mac
   export DATABASE_URL="postgres://portal_app:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
   ADMIN_USUARIO=rh.admin ADMIN_NOME="Seu Nome" npm run admin
   ```
   Sai um **link de primeiro acesso**. Abra no navegador (trocando o domínio de
   exemplo pelo endereço real do portal) e **defina a sua senha**.
2. Entre no portal e ajuste em **Configurações**: data-base, prazo, campos,
   ações e regras.
3. **Importar Excel**: escolha o arquivo, confira o de-para das colunas
   (a coluna `GESTOR IMEDIATO` é importante), veja a prévia e confirme.
4. **Gestores**: para cada gestor sem acesso, clique **Criar acesso**, copie o
   link e mande pelo canal interno. Ele define a senha dele e passa a ver só a
   equipe dele.
5. Acompanhe pelo **Dashboard** e pela tela **Gestores**. No fim, **Exportar
   Excel** gera a planilha com o que cada um decidiu.

## Quer ver funcionando antes, com dados falsos?

```bash
cd api
npm run demonstracao     # 24 pessoas fictícias, 1 diretor e 1 gestor de teste
```
E antes de usar com dado real, apague:
```bash
npx tsx scripts/semear-demonstracao.ts --remover
```

## No fim do processo

O portal é de um processo, não um cadastro permanente. Quando terminar, apague a
base no SQL Editor do Supabase:

```sql
DELETE FROM portal.colaboradores;   -- as avaliações vão junto
```

A trilha de auditoria fica, de propósito: é o registro de quem decidiu o quê.

## Custo

Workers, Pages e Supabase têm plano gratuito que cobre com folga um processo
deste tamanho. O Access é gratuito até 50 usuários. O gasto usual é só o
domínio.

## Se algo não funcionar

| Sintoma | Provável causa |
|---|---|
| "Acesso permitido apenas pela rede da empresa" | `IPS_PERMITIDOS` não bate com o IP de saída da empresa. Confira em <https://ifconfig.me> e ajuste. |
| "Acesso corporativo não confirmado" | `ACCESS_DOMINIO`/`ACCESS_AUD` errados, ou você abriu o endereço `.pages.dev` em vez do domínio com Access. |
| Erro de conexão com o banco | String de conexão sem a porta **6543**, ou senha do `portal_app` diferente. |
| "Este acesso ainda não foi ativado" | Normal: a pessoa precisa abrir o link de primeiro acesso antes de ter senha. |
