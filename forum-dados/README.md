# DataHub — Fórum da Equipe de Dados

Fórum corporativo com chat em tempo real, pensado para times de **Análise de Dados**
(analistas, engenheiros, cientistas de dados, BI, produto e gestão) compartilharem
ideias, sugestões e atualizações de projetos.

Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4**, **Supabase** (auth, banco,
realtime, RLS) e deploy em **Cloudflare Pages**.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [1. Configurar o Supabase](#1-configurar-o-supabase)
- [2. Rodar localmente](#2-rodar-localmente)
- [3. Deploy no Cloudflare Pages](#3-deploy-no-cloudflare-pages)
- [Modelo de dados](#modelo-de-dados)
- [Segurança (RLS)](#segurança-rls)
- [Como virar admin](#como-virar-admin)
- [Formatação de texto](#formatação-de-texto)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Próximos passos sugeridos](#próximos-passos-sugeridos)

---

## Funcionalidades

**Autenticação**
- Cadastro com e-mail/senha, nome, usuário, função e squad
- Login, logout, recuperação de senha, indicador de força da senha
- Perfil criado automaticamente via trigger no banco (`handle_new_user`)
- Todas as rotas do fórum são protegidas — visitante sempre cai no login

**Fórum**
- 8 categorias pré-configuradas para o contexto de dados
- Tópicos com título, conteúdo em markdown, até 5 tags e contadores de views/respostas
- Respostas com um nível de aninhamento (resposta de resposta)
- Votos (+1/−1) em tópicos e respostas, com score sincronizado por trigger
- Marcar resposta como **solução** (só o autor do tópico)
- Fixar e fechar tópicos (autor ou moderação)
- Ordenação por Recentes / Populares / Sem resposta, com paginação
- Busca por título e conteúdo + filtro por tag, com índice full-text em português

**Chat em tempo real**
- 4 canais pré-configurados (`geral`, `duvidas`, `deploys`, `aleatorio`)
- Mensagens via Supabase Realtime, agrupadas por dia e por autor
- Lista de quem está online usando Presence
- Enter envia, Shift+Enter quebra linha; blocos de código funcionam no chat também

**Outros**
- Notificações em tempo real quando alguém responde seu tópico
- Diretório de membros com busca e filtro por função
- Página de perfil pública + tela de configurações da conta
- Tema claro/escuro com persistência e sem flash na carga
- Layout responsivo (sidebar vira drawer no mobile)

---

## Arquitetura

```
Navegador
   │
   ├── Cloudflare Pages ......... hospeda o build estático (SPA)
   │
   └── Supabase
        ├── Auth ............... e-mail/senha, sessão via JWT
        ├── PostgreSQL ......... tabelas + triggers + funções
        ├── Row Level Security . autorização direto no banco
        └── Realtime ........... chat, respostas e notificações
```

Não há backend próprio: o front fala direto com o Supabase usando a **anon key**, e toda
a autorização é feita por RLS no banco. Por isso a anon key pode ir para o bundle sem
problema — ela não dá acesso a nada que as políticas não permitam.

---

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região mais próxima do time).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e execute.
   O script é idempotente: cria tipos, tabelas, índices, triggers, funções, políticas
   de RLS, habilita o Realtime e insere as categorias e canais iniciais.
3. Em **Authentication → Providers**, confirme que *Email* está habilitado.
4. Em **Authentication → URL Configuration**, preencha:
   - *Site URL*: `http://localhost:5173` em desenvolvimento; depois, a URL do Pages
   - *Redirect URLs*: adicione também `https://SEU-PROJETO.pages.dev/entrar`
5. (Opcional, recomendado para uso interno) Em **Authentication → Providers → Email**,
   desative *Confirm email* se o time for cadastrado manualmente, ou mantenha ativo para
   exigir confirmação por e-mail.
6. Em **Project Settings → API**, copie `Project URL` e a chave `anon public`.

> **Restringindo o cadastro ao domínio da empresa:** em *Authentication → Policies* não dá
> para filtrar o signup. A forma mais simples é adicionar uma checagem no trigger
> `handle_new_user`, levantando exceção se `new.email` não terminar com `@suaempresa.com`.

---

## 2. Rodar localmente

Requisitos: Node 20+ e npm.

```bash
cd forum-dados
npm install
cp .env.example .env.local     # preencha com as chaves do passo 1
npm run dev                    # http://localhost:5173
```

`.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Sem as variáveis o app sobe normalmente e mostra um aviso na tela de login, em vez de
quebrar.

Scripts disponíveis:

| Comando           | O que faz                                          |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | Servidor de desenvolvimento com HMR                |
| `npm run build`   | Checagem de tipos (`tsc -b`) + build de produção   |
| `npm run preview` | Serve o `dist/` localmente                         |
| `npm run lint`    | Só a checagem de tipos                             |
| `npm run deploy`  | Build + `wrangler pages deploy dist`               |

---

## 3. Deploy no Cloudflare Pages

### Opção A — conectado ao Git (recomendado)

1. No dashboard da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Selecione o repositório e configure:

   | Campo                    | Valor           |
   | ------------------------ | --------------- |
   | Framework preset         | `Vite`          |
   | Build command            | `npm run build` |
   | Build output directory   | `dist`          |
   | Root directory           | `forum-dados`   |

3. Em **Settings → Environment variables**, adicione para *Production* e *Preview*:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Cada push no branch de produção gera um novo deploy automaticamente.

### Opção B — via Wrangler (linha de comando)

```bash
npm install -g wrangler
wrangler login
cd forum-dados
npm run deploy
```

### Detalhes já resolvidos no repositório

- **`public/_redirects`** — `/* /index.html 200`, necessário para o roteamento client-side
  do React Router funcionar em URLs diretas (ex.: `/t/<id>` no refresh).
- **`public/_headers`** — cache imutável para `/assets/*` e headers de segurança
  (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- **`wrangler.toml`** — nome do projeto e `pages_build_output_dir`.

Depois do primeiro deploy, volte no Supabase e atualize *Site URL* e *Redirect URLs*
com o domínio do Pages.

---

## Modelo de dados

| Tabela           | Função                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `profiles`       | Perfil do usuário (1:1 com `auth.users`), função, squad, bio       |
| `categories`     | Categorias do fórum (ícone, cor, ordem)                            |
| `threads`        | Tópicos, com tags, contadores e flags de fixado/fechado            |
| `replies`        | Respostas, com `parent_id` para aninhamento e flag de solução      |
| `thread_votes`   | Voto por (tópico, usuário)                                         |
| `reply_votes`    | Voto por (resposta, usuário)                                       |
| `chat_channels`  | Canais do chat                                                     |
| `chat_messages`  | Mensagens do chat                                                  |
| `notifications`  | Notificações de resposta                                           |

Automação no banco (nada disso depende do front):

- `handle_new_user` — cria o profile no signup, gerando um username único
- `sync_reply_count` — mantém `reply_count` e `last_activity_at` dos tópicos
- `sync_thread_score` / `sync_reply_score` — recalculam o score a cada voto
- `notify_thread_author` — gera notificação quando alguém responde
- `touch_updated_at` — mantém `updated_at`
- `increment_thread_views(uuid)` — RPC de visualizações
- `forum_stats()` — RPC com os números da home

---

## Segurança (RLS)

Todas as tabelas têm Row Level Security habilitada e nenhuma política libera acesso
anônimo — é preciso estar autenticado até para ler.

- **Leitura**: qualquer usuário autenticado lê tópicos, respostas, perfis e mensagens
- **Escrita**: só é possível criar conteúdo com `author_id = auth.uid()`
- **Edição/exclusão**: apenas o autor — ou quem tem `is_admin = true`
- **Respostas**: bloqueadas por política quando o tópico está `is_locked`
- **Votos**: cada usuário só manipula os próprios votos (PK composta impede voto duplo)
- **Notificações**: cada um enxerga apenas as suas

Ou seja, mesmo que alguém use a anon key direto contra a API, as regras continuam valendo.

---

## Como virar admin

Admins podem fixar tópicos e remover conteúdo de terceiros. No SQL Editor do Supabase:

```sql
update public.profiles
   set is_admin = true
 where username = 'seu.usuario';
```

---

## Formatação de texto

Tópicos, respostas e mensagens do chat aceitam um markdown enxuto, renderizado sem
`innerHTML` (nada de HTML injetado):

````text
**negrito**   *itálico*   `código inline`

# Título
> Citação
- item de lista
1. item numerado

```sql
select 1;
```
````

Blocos de código exibem a linguagem e um botão de copiar. Links viram âncoras
automaticamente com `rel="noopener noreferrer nofollow"`.

---

## Estrutura de pastas

```
forum-dados/
├── public/
│   ├── _headers            # headers do Cloudflare Pages
│   ├── _redirects          # fallback de SPA
│   └── favicon.svg
├── supabase/
│   └── schema.sql          # schema completo: tabelas, RLS, triggers e seed
├── src/
│   ├── components/         # Layout, ThreadCard, VoteButtons, RichText, UI base
│   ├── contexts/           # AuthContext, ThemeContext
│   ├── lib/                # client do Supabase, tipos, camada de dados, formatação
│   ├── pages/              # rotas (login, feed, tópico, chat, perfil, busca…)
│   ├── App.tsx             # roteador
│   └── index.css           # design tokens + componentes utilitários
├── wrangler.toml
└── package.json
```

### Rotas

| Rota              | Página                                  |
| ----------------- | --------------------------------------- |
| `/entrar`         | Login (pública)                         |
| `/cadastro`       | Cadastro (pública)                      |
| `/`               | Feed com estatísticas e tags em alta    |
| `/c/:slug`        | Categoria                               |
| `/t/:id`          | Tópico com respostas                    |
| `/novo`           | Criar tópico (com pré-visualização)     |
| `/chat`           | Chat em tempo real                      |
| `/chat/:slug`     | Canal específico                        |
| `/u/:username`    | Perfil público                          |
| `/configuracoes`  | Editar a própria conta                  |
| `/busca`          | Busca e navegação por tags              |
| `/membros`        | Diretório de membros                    |

---

## Próximos passos sugeridos

Não estão implementados — ficam como evolução natural:

- Upload de avatar e anexos via Supabase Storage
- Menção com `@usuario` gerando notificação
- Mensagens diretas (1:1) além dos canais públicos
- E-mail de digest semanal com os tópicos mais ativos
- Integração com Slack/Teams para espelhar o canal `#deploys`
- Edição de mensagens do chat (hoje só exclusão)
