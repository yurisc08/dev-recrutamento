# Como visualizar o portal — passo a passo

Guia curto para colocar o sistema no ar e navegar pelas telas. Tempo estimado: 10 minutos.

---

## Opção A — com Docker (recomendada)

Funciona igual em Windows, macOS e Linux. É assim que o portal vai rodar no servidor da empresa.

### 1. Instalar o Docker

* **Windows/macOS**: instale o **Docker Desktop** (https://www.docker.com/products/docker-desktop) e abra o programa.
* **Linux**: `sudo apt install docker.io docker-compose-plugin` (ou o equivalente da sua distribuição).

Para conferir se está pronto, abra o terminal (no Windows: PowerShell) e rode:

```bash
docker --version
```

### 2. Baixar o projeto

Se você recebeu o **arquivo .zip**: descompacte em uma pasta e entre nela pelo terminal.

```bash
cd caminho/para/portal-reestruturacao
```

Se preferir pegar direto do repositório:

```bash
git clone -b claude/restructuring-decision-portal-ko8yy7 https://github.com/yurisc08/dev-recrutamento.git
cd dev-recrutamento/portal-reestruturacao
```

### 3. Criar o arquivo de configuração

```bash
cp .env.example .env
```

No Windows (PowerShell): `Copy-Item .env.example .env`

Abra o `.env` num editor de texto e troque a senha do banco:

```
POSTGRES_PASSWORD=uma-senha-qualquer-para-teste
```

### 4. Subir o sistema

```bash
docker compose up -d --build
```

A primeira execução baixa as imagens e compila — pode levar alguns minutos. Quando terminar, confira:

```bash
docker compose ps      # os três serviços (banco, api, web) devem aparecer "running"
```

### 5. Abrir no navegador

```
http://localhost:8080
```

### 6. Entrar com os dados fictícios

Para navegar com a base de demonstração (180 colaboradores fictícios, nenhum dado real):

```bash
docker compose exec api node dist/db/semear-demo.js --confirmar
```

Depois entre com qualquer um destes usuários — **senha `Portal@2026`**:

| Usuário | Perfil | O que ele enxerga |
|---|---|---|
| `rh.demo` | RH / Admin | a empresa inteira, importação, configurações e auditoria |
| `diretor.industrial` | Diretor | só a Diretoria Industrial |
| `gestor.producao` | Gestor | só a Divisão Produção |
| `gestor.qualidade` | Gestor | Divisões Qualidade e Manutenção |

### 7. Roteiro sugerido para conhecer as telas

1. Entre como **`gestor.producao`** → menu **Minhas avaliações**: marque a ação direto na linha
   (a gravação é imediata). Escolha `DESLIGAMENTO` sem justificativa para ver a linha ficar
   destacada pedindo o campo que falta; escolha `TRANSFERÊNCIA DE ÁREA` para o campo de destino aparecer.
   Selecione várias linhas e use **Aplicar ação aos selecionados**.
2. Clique no nome de alguém para ver a **ficha completa** e o histórico.
3. Saia e entre como **`diretor.industrial`** → **Dashboard**: percentual de conclusão por Divisão;
   em **Colaboradores**, selecione linhas e use **Homologar selecionados**.
4. Saia e entre como **`rh.demo`** → **Dashboard** (visão geral e pendências por gestor),
   **Importar Excel**, **Configurações** (processo, campos, ações, regras, estrutura, usuários) e **Auditoria**.
5. Use **Exportar Excel** em qualquer perfil e compare: cada um baixa apenas o que pode ver.

### 8. Para parar / recomeçar

```bash
docker compose down          # para tudo (os dados continuam salvos)
docker compose down -v       # para e APAGA o banco (recomeço do zero)
docker compose up -d         # sobe de novo
```

---

## Uso real (sem os dados fictícios)

1. Suba o sistema (passos 1 a 5) **sem** rodar o `semear-demo`.
2. Crie o administrador de verdade:

   ```bash
   docker compose exec api node dist/scripts/criar-admin.js rh.admin "Seu Nome" "SenhaProvisoria123"
   ```
3. Entre com esse usuário, troque a senha e vá em **Importar Excel** para carregar a planilha real.
4. Em **Configurações → Usuários**, cadastre diretores e gestores e defina a abrangência de cada um.

> Antes de usar com dados reais: publique por HTTPS interno, marque `COOKIE_SECURE=true` no `.env` e
> peça a validação da TI/Segurança da Informação.

---

## Opção B — sem Docker (para desenvolvimento)

Requer **Node.js 20+** e **PostgreSQL 14+** instalados.

```bash
# 1. banco
createdb portal

# 2. API (terminal 1)
cd backend
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/portal npm run semear
DATABASE_URL=postgres://usuario:senha@localhost:5432/portal npm run dev      # http://localhost:4000

# 3. Front (terminal 2)
cd frontend
npm install
npm run dev                                                                  # http://localhost:5173
```

Dados fictícios: `DATABASE_URL=... npm run semear-demo -- --confirmar` (dentro de `backend`).

Testes automatizados:

```bash
cd backend
createdb portal_test
DATABASE_URL=postgres://usuario:senha@localhost:5432/portal_test npm test
```

---

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| `docker: command not found` | O Docker Desktop não está instalado ou não foi aberto. |
| `port is already allocated` | A porta 8080 está ocupada. Troque `PORTA_PUBLICA=8081` no `.env` e rode `docker compose up -d` de novo. |
| Página não abre | `docker compose ps` para ver os serviços e `docker compose logs api --tail 50` para ver o erro. |
| `required variable POSTGRES_PASSWORD is missing` | Você não criou o `.env` ou não preencheu a senha (passo 3). |
| Esqueci a senha do usuário | `docker compose exec api node dist/scripts/criar-admin.js <usuario> "<Nome>" "NovaSenha123"` recria/atualiza o administrador. |
| Quero limpar tudo e recomeçar | `docker compose down -v && docker compose up -d --build` |

Detalhes completos do sistema (perfis, regras, auditoria, segurança) estão no `README.md`.
