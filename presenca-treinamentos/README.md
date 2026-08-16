# Controle de Presença em Treinamentos

Sistema para registrar a presença em treinamentos a partir da **maquininha de crachá conectada na rede**: o leitor envia cada passagem de crachá para a nuvem, o sistema descobre a qual aula aquela leitura pertence e calcula quem teve presença, quem chegou atrasado, quem saiu antes e quem faltou — por aula e consolidado por turma.

Roda inteiro na **Cloudflare**: Workers (API), D1 (banco SQLite) e Workers Assets (painel web). Sem servidor para administrar e, no volume típico de uma empresa, dentro do plano gratuito.

```
 Maquininha de crachá ──HTTP──▶ Cloudflare Worker ──▶ D1 (banco)
   (rede da empresa)             /api/ingest              │
                                                          ▼
                                              Painel web (Assets)
                                       turmas · chamada · relatórios · CSV
```

## O que o sistema faz

- **Cadastro**: pessoas e crachás (com histórico de troca de crachá), salas, leitores, treinamentos, turmas e aulas.
- **Ingestão**: endpoint HTTP que aceita uma leitura ou um lote, em vários formatos de payload, com deduplicação automática.
- **Cálculo de presença**: associa cada leitura à aula certa e calcula tempo em sala, percentual e situação.
- **Chamada por aula**: lista de presença com entrada, saída, tempo, atraso e ajuste manual (abono, atestado, presença sem crachá).
- **Frequência consolidada por turma**: percentual acumulado e situação (aprovado / reprovado / em andamento), com exportação em CSV para Excel.
- **Operação do dia a dia**: painel com aulas de hoje, leituras ao vivo, leitores sem comunicação e fila de crachás não identificados.

## Como a presença é calculada

Para cada pessoa em cada aula:

| Situação nas leituras | Resultado |
|---|---|
| Nenhuma leitura | **Ausente** |
| Uma leitura (entrada) | Conta da entrada até o fim da aula — a menos que a aula exija leitura de saída |
| Duas ou mais leituras | Primeira = entrada, última = saída |

Regras aplicadas:

- o tempo é **recortado dentro do intervalo da aula** — chegar 30 min antes não gera crédito extra;
- **presença = tempo em sala ÷ duração da aula**. Atingindo o mínimo da aula (padrão 75%) o status é *Presente*; abaixo disso, *Parcial*;
- **atraso** e **saída antecipada** usam a tolerância da aula (padrão 10 min) e aparecem como marcadores, sem zerar a presença;
- o **ajuste manual do instrutor sempre vence** o cálculo automático, e a falta abonada conta como tempo cumprido na frequência da turma;
- a frequência consolidada considera **apenas as aulas já encerradas** — aula futura não conta como falta. Enquanto houver aula pendente a situação fica *Em andamento*, exceto quando nem comparecendo a tudo que resta o aluno alcança o mínimo.

A qual aula pertence uma leitura: entre as aulas das turmas em que a pessoa está matriculada, vence a que **está acontecendo** no momento da leitura; havendo empate, a que ocorre **na sala daquele leitor**; depois, a mais próxima no tempo dentro da janela de tolerância (padrão: 60 min antes e depois). Leituras de quem não está matriculado aparecem na aula como *"crachás lidos fora da lista"*, prontas para matricular ou ignorar.

## Instalação

Pré-requisitos: Node.js 18+ e uma conta Cloudflare.

```bash
npm install
npx wrangler login

# 1. cria o banco D1 e cola o database_id no wrangler.toml
npm run db:create

# 2. cria as tabelas
npm run db:migrate          # produção
npm run db:migrate:local    # local

# 3. segredo do cookie de sessão do painel (produção)
npx wrangler secret put SESSION_SECRET

# 4. publica
npm run deploy
```

Ao abrir a URL do Worker pela primeira vez, o sistema pede a criação do **usuário administrador**. Não existe senha padrão.

### Rodando na sua máquina

```bash
npm run setup   # migrations + dados de exemplo no banco local
npm run dev     # http://127.0.0.1:8787
```

Os dados de exemplo criam a turma `NR35-2026-01` com aulas ontem/hoje/amanhã, seis pessoas com crachá e leituras já registradas. Abra a turma e clique em **Recalcular** para processar as leituras de exemplo. O leitor de teste usa a chave `dev_demo_chave_de_teste_123`.

## Ligando a maquininha

Cada leitor cadastrado no painel recebe uma **chave própria** (exibida uma única vez). Configure o equipamento para enviar as leituras para `/api/ingest`:

```http
POST https://seu-worker.workers.dev/api/ingest
X-Device-Key: dev_sua_chave_aqui
Content-Type: application/json

{"badge":"0001234","timestamp":"2026-08-16T13:02:10-03:00","direction":"entrada"}
```

Lote (quando o leitor acumula leituras offline e envia depois):

```json
{"events":[{"badge":"0001234","timestamp":"..."},{"badge":"0005678","timestamp":"..."}]}
```

Leitores que só conseguem chamar uma URL simples:

```
GET https://seu-worker.workers.dev/api/ingest?key=dev_sua_chave&badge=0001234
```

Teste de conexão, sem gravar nada:

```
GET https://seu-worker.workers.dev/api/ingest/ping?key=dev_sua_chave
```

**Formatos aceitos.** Cada fabricante nomeia os campos de um jeito, então a API aceita os nomes mais comuns sem configuração:

| Informação | Nomes aceitos |
|---|---|
| Crachá | `badge`, `card`, `cardNumber`, `cracha`, `codigo`, `matricula`, `pis`, `tag`, `rfid`, `uid`, … |
| Horário | `timestamp`, `time`, `data_hora`, `datetime`, `event_time`, epoch em segundos ou milissegundos |
| Sentido | `direction`, `sentido`, `tipo`, `io` (`in`/`entrada`/`1`, `out`/`saida`/`2`) |
| Lote | array puro, `{"events":[…]}`, `{"values":[…]}`, `{"logs":[…]}`, `{"data":[…]}` |

Detalhes que evitam dor de cabeça:

- horário **sem fuso** é interpretado no fuso configurado em `APP_TIMEZONE` (padrão `America/Sao_Paulo`); com `Z` ou `-03:00` é respeitado como está;
- se o leitor não mandar horário, vale o horário de chegada no servidor;
- zeros à esquerda são ignorados na comparação: `0001234` e `1234` são o mesmo crachá;
- reenviar o mesmo evento não duplica nada — a resposta marca `duplicado`;
- crachá não cadastrado é **guardado assim mesmo** e entra na fila de "crachás não identificados"; ao vincular o número a uma pessoa, as leituras antigas são reprocessadas.

### Se o leitor não consegue enviar HTTP

Use o coletor em `tools/coletor.mjs`: ele roda em qualquer máquina da rede da empresa, consulta o leitor periodicamente e repassa as leituras novas para a nuvem.

```bash
INGEST_URL=https://seu-worker.workers.dev/api/ingest \
DEVICE_KEY=dev_sua_chave \
LEITOR_URL=http://192.168.0.50/api/logs \
node tools/coletor.mjs
```

A função `extrairRegistros` no início do arquivo é o ponto de adaptação para o modelo do seu equipamento.

## API

Ingestão (autenticada pela chave do leitor):

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/ingest` | Recebe uma leitura ou um lote |
| GET | `/api/ingest` | Mesma coisa via query string |
| GET | `/api/ingest/ping` | Testa a chave e devolve a hora do servidor |

Painel (autenticado por sessão em cookie):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/dashboard` | Números do dia, aulas de hoje, últimas leituras |
| — | `/api/people`, `/api/courses`, `/api/rooms`, `/api/devices` | Cadastros (CRUD) |
| POST | `/api/people/:id/badges` | Vincula crachá e reprocessa leituras antigas |
| GET/POST | `/api/classes` | Turmas |
| POST | `/api/classes/:id/enrollments` | Matrícula |
| POST | `/api/classes/:id/sessions` | Cria aula (com repetição semanal opcional) |
| GET | `/api/classes/:id/report[.csv]` | Frequência consolidada |
| GET | `/api/sessions/:id` | Lista de chamada da aula |
| PUT/DELETE | `/api/sessions/:id/attendance/:personId` | Ajuste manual / volta ao automático |
| POST | `/api/sessions/:id/recompute` | Recalcula a aula |
| GET | `/api/scans` | Leituras brutas (tela ao vivo) |
| POST | `/api/scans/manual` | Marcação manual |

## Configuração

Em `wrangler.toml`:

| Variável | Padrão | Para que serve |
|---|---|---|
| `APP_TIMEZONE` | `America/Sao_Paulo` | Fuso do dia útil e dos horários sem fuso |
| `MATCH_WINDOW_BEFORE_MIN` | `60` | Quanto antes da aula uma leitura ainda conta |
| `MATCH_WINDOW_AFTER_MIN` | `60` | Quanto depois da aula uma leitura ainda conta |
| `SESSION_SECRET` | — | Assina o cookie do painel. **Em produção use `wrangler secret put`** |

## Segurança

- Cada leitor tem chave própria, guardada apenas como hash SHA-256; pode ser trocada a qualquer momento pelo painel (a anterior para de funcionar na hora).
- Senhas do painel usam PBKDF2-SHA256 com 100 mil iterações e salt por usuário.
- Sessão em cookie `HttpOnly`, `SameSite=Lax`, assinado por HMAC e com validade de 12 horas.
- Perfis: `admin`, `operador` e `leitura` (este último não altera dados).
- Todas as consultas usam parâmetros vinculados — sem concatenação de SQL.
- O payload original de cada leitura fica guardado em `scans.raw` para auditoria.

## Estrutura

```
src/
  index.ts              rotas e middlewares
  attendance.ts         motor de cálculo (funções puras, testadas)
  routes/               ingest, auth, people, classes, catalog, devices, scans, dashboard
  services/
    ingest.ts           normalização dos formatos de payload dos leitores
    presence.ts         associação leitura→aula e gravação da presença
  lib/                  crypto, auth de sessão, datas, helpers HTTP
migrations/             schema do D1
public/                 painel web (HTML/CSS/JS puro, sem build)
tools/coletor.mjs       coletor para leitores que não enviam HTTP
test/                   testes do motor de presença e da ingestão
```

## Testes

```bash
npm test        # 27 testes: cálculo de presença, consolidação, matching e ingestão
npm run typecheck
```

## Próximos passos possíveis

- Emissão de certificado em PDF para quem foi aprovado por frequência.
- Notificação por e-mail do relatório ao fim da turma.
- Importação de pessoas por planilha CSV.
- Tela de quiosque na TV da sala mostrando quem já entrou.
