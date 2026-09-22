# Portal de Decisões — Cloudflare + Supabase

Mesmo portal de decisões da reestruturação, preparado para rodar **fora da rede
da empresa**, com o cuidado que dado de pessoa exige: acesso só pelo login
corporativo, banco fechado, trilha de auditoria que ninguém apaga e campo
sensível (CPF, nascimento) que nem sai da API para quem não é RH.

| Peça | Onde roda | O que faz |
|---|---|---|
| `web/` | Cloudflare Pages | A tela (React). Lê e monta o Excel **no navegador**. |
| `api/` | Cloudflare Workers | Regras, permissões, auditoria. Nada decide sozinho. |
| `supabase/` | Supabase (PostgreSQL) | O banco. Acesso só por senha, por um papel sem privilégio sobrando. |

> **Antes de subir dado real:** a decisão de hospedar informação de RH fora da
> empresa é da TI/Segurança e do jurídico (LGPD), não do portal. O que está aqui
> são os controles para que essa escolha seja defensável — o aceite é de vocês.
> Se a preferência for manter tudo interno, use `portal-reestruturacao/`, que é
> o mesmo sistema em Docker para servidor da empresa.

---

## 1. Banco no Supabase

1. Crie um projeto em <https://supabase.com> (região **South America (São Paulo)**
   deixa o banco no Brasil).
2. No painel, abra **SQL Editor** e rode os arquivos, nesta ordem:
   - **`supabase/portal-supabase.sql`** — tudo num arquivo só; é o que se cola
     no SQL Editor. Gerado das quatro partes abaixo por `supabase/montar.mjs`.
   - `supabase/01-esquema.sql` — tabelas (schema `portal`).
   - `supabase/02-seguranca.sql` — papel `portal_app`, auditoria imutável,
     fechamento das APIs automáticas do Supabase.
   - `supabase/03-carga-inicial.sql` — processo, as 51 colunas do catálogo
     (50 da planilha + JUSTIFICATIVA), 4 ações e 5 regras. Gerado de
     `modelo/colunas.json` por `modelo/gerar.mjs`.
   - `supabase/04-gestores.sql` — gestor imediato e primeiro acesso com senha
     própria (em banco novo é inofensivo; em banco já em uso, é a migração).
3. **Troque a senha do papel do portal** (o arquivo vem com um valor de exemplo):
   ```sql
   ALTER ROLE portal_app WITH PASSWORD 'uma-senha-longa-e-aleatoria';
   ```
4. Copie a string de conexão em **Project Settings → Database → Connection
   string → Transaction pooler** (porta **6543**) e troque usuário e senha pelos
   do `portal_app`:
   ```
   postgres://portal_app:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
   O pooler na porta 6543 é obrigatório: o Worker abre e fecha conexão a cada
   requisição, e é isso que o pooler foi feito para aguentar.

Depois de subir, confira que a auditoria está mesmo trancada:

```sql
UPDATE portal.auditoria SET tipo = 'x';   -- deve falhar
-- ERRO: A trilha de auditoria não pode ser alterada nem apagada.
```

## 2. API (Cloudflare Workers)

```bash
cd api
npm install
npx wrangler login

# a string de conexão vai como segredo, nunca no arquivo de configuração
npx wrangler secret put DATABASE_URL

npm test          # 39 testes (precisam de um PostgreSQL local; veja a seção 6)
npm run deploy
```

Em `api/wrangler.toml`, ajuste antes de publicar:

- **Rota** — descomente e preencha com o mesmo domínio do Pages:
  ```toml
  [[routes]]
  pattern = "portal.suaempresa.com.br/api/*"
  zone_name = "suaempresa.com.br"
  ```
  Interface e API no mesmo domínio é o que mantém o cookie de sessão
  *same-site* e dispensa CORS.
- `IPS_PERMITIDOS` — faixas de IP da empresa/VPN, separadas por vírgula
  (`200.100.50.0/24,201.10.0.0/16`). Vazio = qualquer origem.
- `ACCESS_DOMINIO` e `ACCESS_AUD` — preenchidos, o Worker passa a **exigir e
  conferir a assinatura** do crachá do Cloudflare Access (seção 4).
- `SESSAO_HORAS` — validade da sessão (padrão 8h).

## 3. Interface (Cloudflare Pages)

```bash
cd web
npm install
npm run build
npx wrangler pages deploy dist       # ou: npm run implantar
```

No painel do Pages, ligue o **domínio personalizado**
`portal.suaempresa.com.br` — o mesmo da rota do Worker. Os arquivos
`web/public/_headers` (CSP, sem indexação, sem iframe) e `web/public/_redirects`
(rotas da SPA) já sobem junto.

## 4. Cloudflare Access — o login corporativo na frente de tudo

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Domínio: `portal.suaempresa.com.br`.
3. Identidade: o provedor da empresa (Entra ID/Azure AD, Google Workspace, Okta)
   ou, sem provedor, **One-time PIN** para uma lista fechada de e-mails.
4. Política: permitir só o grupo do RH e os gestores/diretores do processo.
5. Copie o **Application Audience (AUD) Tag** e o domínio da equipe
   (`suaempresa.cloudflareaccess.com`) para `ACCESS_AUD` e `ACCESS_DOMINIO` no
   `wrangler.toml`, e publique o Worker de novo.

Com isso são três portas em série: Access (quem é você) → faixa de IP (de onde)
→ login do portal (o que você pode ver). O login do portal continua existindo
porque é ele que separa RH, diretor e gestor.

## 5. Primeiro acesso e dados

```bash
cd api
export DATABASE_URL="postgres://portal_app:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

# administrador do RH — sem ADMIN_SENHA, sai um link para você definir a sua
ADMIN_USUARIO=rh.admin ADMIN_NOME="Nome do RH" npm run admin

# opcional: 24 colaboradores fictícios, um diretor e um gestor, só para ver funcionando
npm run demonstracao
# e para apagar a demonstração antes do dado real:
npx tsx scripts/semear-demonstracao.ts --remover
```

Entre no portal e siga: **Configurações** (data-base, prazo, campos, ações,
regras) → **Importar Excel** → **Gestores** (seção 5.1) para distribuir a base.

Na importação, a planilha é lida **no seu navegador**; para a API vão só as
colunas que você mapeou, já em texto. Nada de subir o arquivo inteiro. A carga
casa pela matrícula (CHAPA), mostra o que vai mudar antes de gravar e **não
apaga as decisões** já registradas no portal — a não ser que você marque
explicitamente a opção de importar decisões da planilha.

### 5.1 Gestor imediato: uma base só, sem recortar arquivo

A planilha traz a coluna **GESTOR IMEDIATO**. Na carga, ela vira o vínculo de
quem responde por quem — e é isso que substitui o vaivém de arquivos por e-mail:

1. O RH importa a base inteira, uma vez.
2. Em **Gestores**, o diretor vê a lista agrupada por gestor imediato, com a
   equipe de cada um, quanto já foi avaliado e quem ainda não tem acesso.
3. Em **Criar acesso**, o diretor (ou o RH) cria o acesso do gerente e recebe um
   **link de primeiro acesso** para mandar pelo canal interno.
4. O gerente abre o link, **define a própria senha** e passa a ver só a equipe
   dele — a mesma base, com as flags de decisão na linha.
5. O diretor acompanha o andamento na mesma tela, sem pedir arquivo de volta.

Detalhes que valem saber:

- **Ninguém cria senha por ninguém.** O acesso nasce sem senha: até a pessoa
  abrir o link, não existe senha para ele — nem o RH nem a Diretoria conseguem
  entrar em nome dela. O link é de uso único, vale 7 dias, e no banco fica só o
  resumo (SHA-256) dele.
- Esqueceu a senha? **Novo link** na tela de Gestores: a senha antiga deixa de
  valer na hora, as sessões abertas caem, e a nova senha é escolhida pela
  própria pessoa.
- Se o nome do gestor na planilha for igual ao nome de um acesso que já existe,
  a carga religa sozinha. **Vincular** resolve os casos em que não bate.
- Recarregar a planilha **não desfaz** atribuição feita à mão no portal.
- Gestor enxerga quem está sob ele (pelo gestor imediato) mais a Divisão que lhe
  foi atribuída, se houver. Fora disso, nada — e isso é conferido no SQL.

## 6. Rodando na sua máquina antes de publicar

```bash
# banco local (qualquer PostgreSQL 14+)
createdb portal_local
psql -d portal_local -f supabase/01-esquema.sql
psql -d portal_local -f supabase/02-seguranca.sql
psql -d portal_local -f supabase/03-carga-inicial.sql
psql -d portal_local -f supabase/04-gestores.sql

cd api && npm install
export DATABASE_URL="postgres://usuario@127.0.0.1:5432/portal_local" DB_SSL=false
npm run admin && npm run demonstracao

cd ../web && npm install && npm run build
cd ../api && npm run local          # http://127.0.0.1:8787
```

`npm run local` roda o **mesmo código do Worker** em Node e ainda serve a
interface já compilada — serve para conferir o fluxo inteiro antes de publicar.
Em produção quem executa é a Cloudflare.

Para desenvolver a tela com recarga automática: `npm run dev` dentro de `web/`
(porta 5173, com proxy do `/api` para 127.0.0.1:8787).

## 7. O que está protegido — e o que continua com você

Feito aqui:

- Senha guardada só como hash **PBKDF2-SHA256** (210 mil iterações), nunca em
  texto — e definida pela própria pessoa no primeiro acesso, nunca por quem
  administra.
- Sessão em cookie `HttpOnly; SameSite=Strict; Secure`, guardada no banco e com
  prazo; 5 tentativas erradas em 15 minutos bloqueiam o usuário.
- **Permissão conferida no servidor, dentro do SQL**: gestor enxerga a equipe
  dele (gestor imediato) e a Divisão atribuída, diretor a Diretoria dele, RH
  tudo — inclusive na exportação.
- Campos marcados como sensíveis (CPF, nascimento) **não saem da API** para
  quem não é RH, nem na tela nem no Excel.
- Auditoria de login, logout, primeiro acesso, decisão, homologação, importação,
  exportação, criação de acesso e mudança de responsável/permissão — com gatilho no banco e privilégio revogado,
  ninguém altera nem apaga.
- Papel `portal_app` com permissão só no schema `portal`; APIs automáticas do
  Supabase (anon/authenticated) revogadas.
- Regras e alertas (estabilidade, afastamento, desligado na base) **avisam,
  nunca decidem** por ninguém.
- Alterar campos, ações e regras é configuração na tela — não precisa mexer no código.

Continua com a empresa:

- Aprovação da TI/Segurança e do jurídico (LGPD) para hospedar dado de RH fora.
- Contrato e região do Supabase (deixe o projeto no Brasil), retenção e backup.
- Quem entra na política do Cloudflare Access e quando sai.
- **Apagar os dados no fim do processo** — o portal existe para um processo com
  data-base e prazo, não para virar cadastro permanente:
  ```sql
  DELETE FROM portal.colaboradores;   -- avaliações vão junto (cascade)
  ```
  A trilha de auditoria fica, de propósito: ela é o registro de quem decidiu o quê.

## 8. Custo

Volume de um processo de reestruturação (algumas centenas de pessoas, algumas
dezenas de usuários) cabe com folga no plano gratuito de Workers, Pages e
Supabase. O Access é gratuito até 50 usuários. Domínio próprio é o gasto usual.
