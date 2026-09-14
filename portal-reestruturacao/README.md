# Portal de Decisões — Reestruturação

Sistema web interno que substitui a planilha de decisão da reestruturação.

**Fluxo:** RH/Admin carrega a base → Gestores avaliam seus colaboradores → Diretor acompanha a sua
Diretoria → RH acompanha tudo, com **auditoria completa** e **sem trocar arquivos por e-mail**.

Arquitetura: **React + TypeScript** (frontend) → **Node.js + TypeScript/Express** (API) →
**PostgreSQL**, tudo em contêineres para rodar num servidor interno. Nenhum serviço externo,
nenhum banco público, nenhum CDN — funciona em rede fechada.

---

## Índice

1. [Instalação](#instalação) · 2. [Primeiro acesso](#primeiro-acesso) · 3. [Perfis e acessos](#perfis-e-acessos)
· 4. [Estrutura organizacional](#estrutura-organizacional) · 5. [Importação do Excel](#importação-do-excel)
· 6. [Avaliação](#avaliação-do-colaborador) · 7. [Regras e alertas](#regras-e-alertas)
· 8. [Dashboards](#dashboards) · 9. [Auditoria](#auditoria) · 10. [Configurações](#configurações-do-processo)
· 11. [Segurança](#segurança) · 12. [Desenvolvimento e testes](#desenvolvimento-e-testes)

---

## Instalação

Dois caminhos, conforme a infraestrutura disponível:

* **Servidor interno da empresa** (preferível): siga esta seção — Docker Compose, dados sem sair da rede.
* **Sem servidor interno**, com os gestores precisando acessar de qualquer forma:
  veja **[IMPLANTACAO-NUVEM.md](IMPLANTACAO-NUVEM.md)** — publicação pelo navegador, com acesso
  restrito às faixas de IP da empresa (`IPS_PERMITIDOS`) e checklist de aprovação/LGPD.

Pré-requisito desta seção: Docker e Docker Compose no servidor interno.

```bash
cp .env.example .env          # defina POSTGRES_PASSWORD e a porta
docker compose up -d --build  # sobe banco + API + web
```

O portal fica em `http://<servidor>:8080`. O esquema do banco é criado automaticamente na primeira
subida (operação idempotente: pode rodar quantas vezes for preciso).

### Criar o primeiro administrador

```bash
docker compose exec api node dist/scripts/criar-admin.js rh.admin "Nome do responsável de RH" "SenhaForte123"
```

A senha informada na linha de comando é provisória: o portal exige a troca no primeiro acesso.

### Dados fictícios para demonstração/treinamento

```bash
docker compose exec api node dist/db/semear-demo.js --confirmar
```

Cria estrutura, 180 colaboradores e usuários **fictícios** (senha `Portal@2026`):
`rh.demo`, `diretor.industrial`, `diretor.corporativo`, `gestor.producao`, `gestor.qualidade`, `gestor.ti`.
Nenhum dado real da planilha é usado em exemplos, seeds ou código.

### Publicar com HTTPS interno

Coloque o serviço `web` atrás do proxy reverso da empresa (ou troque a porta publicada por
`127.0.0.1:8080:80`), configure o certificado da CA interna e ajuste `COOKIE_SECURE=true` no `.env`
— assim o cookie de sessão só trafega por HTTPS. Libere no firewall apenas as faixas da rede/VPN.

---

## Primeiro acesso

1. Entre com o usuário administrador criado acima e defina a nova senha.
2. **Configurações → Processo**: confirme nome, data-base (31/07/2026) e prazo (11/09/2026).
3. **Importar Excel**: carregue a planilha; as Diretorias e Divisões são criadas a partir dela.
4. **Configurações → Usuários**: cadastre diretores e gestores e defina a abrangência de cada um.
5. **Configurações → Campos / Ações / Regras**: ajuste o que for necessário — sem mexer no código.

---

## Perfis e acessos

| Perfil | Enxerga | Avalia | Homologa | Administra |
|---|---|---|---|---|
| **Gestor** | só a(s) sua(s) Divisão(ões) | sim, dos seus colaboradores | não | não |
| **Diretor** | toda a sua Diretoria | sim | sim | não |
| **RH / Admin** | empresa inteira | sim | sim | usuários, estrutura, campos, ações, regras, importação |

A autorização é aplicada **no backend**, na própria consulta ao banco: um gestor que tentar abrir
pelo id um colaborador de outra Divisão recebe 403, e a exportação devolve apenas o que ele pode ver.
Isso é coberto por testes automatizados.

---

## Estrutura organizacional

```
Diretoria → Divisão → Gestor → Colaboradores
```

* Cada colaborador pertence a uma Diretoria e a uma Divisão (vindas da carga).
* O **gestor** é um usuário vinculado a uma ou mais Divisões; o **diretor**, a uma ou mais Diretorias.
* Diretorias e Divisões são criadas na importação ou manualmente em **Configurações → Estrutura**.

---

## Importação do Excel

Tela **Importar Excel**, em três etapas — nada é gravado antes da confirmação:

1. **Envio**: o portal lê o arquivo, identifica as abas e detecta a linha de cabeçalho.
2. **Conferência**: mostra uma prévia e o mapeamento sugerido coluna a coluna (ajustável), com opção de
   criar automaticamente Diretorias/Divisões ausentes.
3. **Prévia da carga**: informa **registros novos**, **alterados** (com o de → para de cada campo),
   **sem mudança** e **linhas com erro**, além de avisar quantos colaboradores já têm avaliação preenchida.
   Só então o RH confirma.

Regras da carga:

* a chave de atualização é a **matrícula (CHAPA)**;
* linhas com erro (sem matrícula, data inválida, valor fora da lista) são relatadas e puladas — o resto entra;
* **as avaliações feitas no portal ficam em tabela separada e não são apagadas por uma nova carga**;
  importar decisões da planilha exige marcar explicitamente a opção correspondente;
* toda diferença aplicada vira registro de auditoria com origem "importação";
* cada carga fica no **Histórico de importações** (data, usuário, arquivo, data-base, contagens, status).

---

## Avaliação do colaborador

Fluxo principal: **Login → Minhas avaliações → marcar a decisão na própria linha → Salvar automático**.

### Decisão direto na lista (sem abrir um por um)

Na tela **Minhas avaliações** (e em **Colaboradores**) cada linha traz a ação em lista suspensa e a
justificativa no próprio lugar:

* escolher a ação grava na hora — o status da linha passa a *Preenchida*;
* se a ação exigir justificativa ou destino, a linha fica destacada em amarelo com o aviso do que falta
  e o cursor vai para o campo pendente; assim que ele é preenchido, a gravação acontece sozinha;
* transferências abrem, na mesma linha, o campo de destino (Diretoria / setor / nº do processo);
* colaboradores com alerta aparecem com ⚠ ao lado do status, com o texto do alerta no passar do mouse;
* selecionando várias linhas, **Aplicar ação aos selecionados** grava a mesma decisão em lote — cada
  linha passa pelas mesmas validações e as que exigirem tratamento individual voltam numa lista de pendências.

O clique no nome (ou em **Detalhes**) abre a ficha completa quando for preciso ver todos os campos da
base, a nova Diretoria/Divisão da transferência ou o histórico do colaborador.

A tela mostra os dados vindos do Excel (agrupados por identificação, organização, cargo, situação,
remuneração, desempenho, estabilidade) e, separadamente, o que é preenchido no portal:

* **Ação indicada** — lista configurável; por padrão `ATIVO`, `DESLIGAMENTO`, `TRANSFERÊNCIA DE ÁREA`
  e `ESTABILIDADE` (as mesmas da planilha). Sem preenchimento, a situação é *Sem decisão*.
* **Transferência**: abre **Nova Diretoria**, **Nova Divisão** (opcional) e o campo livre
  *setor / área / nº do processo*.
* **Justificativa** — texto livre, obrigatória quando a ação ou uma regra exigir (preenchível na própria linha).
* Registro automático de **quem alterou e quando**; o histórico do colaborador aparece na própria tela.

A **homologação** (Diretor/RH) trava a avaliação para o gestor.

---

## Regras e alertas

Configuráveis em **Configurações → Regras e alertas** (campo observado, condição, mensagem,
severidade, ação à qual se aplica e se exige justificativa). Já vêm cadastradas:

| Regra | Condição | Efeito |
|---|---|---|
| Desligado na posição-base | `SITUACAO` = DESLIGADO | informa que o colaborador já saiu no período |
| Estabilidade declarada | `ESTABILIDADE` preenchido | ⚠️ alerta e exige justificativa no desligamento |
| Estabilidade vigente | `DATA FIM ESTABILIDADE` no futuro | alerta crítico e exige justificativa |
| Invalidez / afastamento | `TIPO_INVALIDEZ` preenchido | alerta de validação obrigatória do RH |
| Aposentadoria prevista | `DT_APOSENTADORIA` preenchido | informativo |

> O sistema **sinaliza**; ele não toma decisões trabalhistas automaticamente. A validação de
> estabilidade médica continua sendo do RH, antes da execução.

---

## Dashboards

* **RH/Admin** — empresa toda: total, avaliados, pendentes, homologadas, desligados na posição-base,
  redução anual estimada, distribuição por ação, por Diretoria, por Divisão e **pendências por gestor**.
* **Diretor** — os mesmos números limitados à sua Diretoria, com % de conclusão por Divisão.
* **Gestor** — a sua Divisão: total, avaliados, pendentes e a lista de quem falta avaliar.

Filtros: Diretoria, Divisão, status, ação, nome e matrícula (busca livre) e “só com alerta”.

---

## Auditoria

Tela **Auditoria** (RH e Diretoria), com filtro por matrícula, tipo de evento e usuário. São registrados:

login, falha de login, logout, troca de senha, avaliação (de → para), homologação, importação,
exportação, criação/alteração de usuário, mudança de permissão, alterações de campos, ações, regras,
estrutura e parâmetros do processo.

A tabela de auditoria é **somente de inserção** — nenhuma rota da aplicação altera ou apaga registros.

---

## Configurações do processo

Tudo em banco, editável pelo RH/Admin, sem tocar no código:

* **Processo**: nome, data-base, prazo, aviso de confidencialidade — permite reaproveitar o portal em
  outros processos no futuro.
* **Campos**: criar, renomear, reordenar, desativar, definir tipo, obrigatoriedade, quem pode preencher,
  se aparece na lista, se soma no dashboard e se gera quebra por agrupamento.
* **Ações**: criar/desativar, exigir justificativa, exigir destino, contar como redução de custo.
* **Regras e alertas**: como descrito acima.
* **Estrutura**: Diretorias e Divisões.
* **Usuários**: perfil, abrangência (Diretorias/Divisões), ativação e senha provisória.

---

## Segurança

* Senhas com **scrypt** e sal por usuário — nunca em texto puro.
* Sessão em cookie `HttpOnly` + `SameSite=Strict`, com expiração configurável e invalidação na troca de senha.
* Cabeçalho próprio exigido nas requisições de escrita (barra envio a partir de outro site).
* Bloqueio temporário após tentativas de login malsucedidas, com registro de IP.
* **Autorização validada no backend** em toda consulta, inclusive exportação.
* Banco PostgreSQL na rede interna do Compose, sem porta publicada.
* Cabeçalhos `noindex`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.
* **Restrição por IP** (`IPS_PERMITIDOS`): fora das faixas da empresa/VPN o portal responde 403 —
  é o que devolve o perímetro quando a hospedagem é externa.
* Recomendações para a TI: HTTPS com certificado interno, acesso restrito por firewall/VPN,
  backup diário do volume do Postgres, revisão dos usuários ao fim do processo e definição da
  retenção dos dados (LGPD). **A validação final de segurança cabe à TI/Segurança da Informação.**

Backup e restauração:

```bash
docker compose exec banco pg_dump -U portal portal | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-09-14.sql.gz | docker compose exec -T banco psql -U portal portal
```

---

## Desenvolvimento e testes

```bash
# banco local (ou use o do compose)
cd backend && npm install
DATABASE_URL=postgres://portal@localhost:5432/portal npm run semear     # esquema + processo padrão
DATABASE_URL=postgres://portal@localhost:5432/portal npm run dev        # API em :4000

cd ../frontend && npm install && npm run dev                            # front em :5173 (proxy /api)
```

Testes de integração (rodam contra um PostgreSQL real, não contra simulação):

```bash
cd backend
DATABASE_URL=postgres://portal@localhost:5432/portal_test npm test
```

Cobrem: autenticação e bloqueio por tentativas, isolamento por perfil (gestor/diretor/RH),
validação de ações, justificativa e destino, alertas de estabilidade, homologação, permissões de
administração, dashboard por escopo, campos configuráveis, simulação e confirmação da importação
(inclusive preservação das avaliações), exportação com lista suspensa e escopo, e auditoria.

### Estrutura

```
backend/
  src/db/          esquema.sql, migração, seeds e catálogo padrão de campos/ações/regras
  src/dominio/     regras de negócio, escopo de visibilidade e conversão de valores
  src/http/        sessão, senhas, permissões e auditoria
  src/rotas/       autenticação, colaboradores, dashboard, configuração, usuários, auditoria, importação, exportação
  src/servicos/    processo, colaboradores e leitura/geração de planilhas
  test/            testes de integração
frontend/
  src/paginas/     Login, Dashboard, Colaboradores, Importar, Configurações, Auditoria
  src/componentes/ cartões, KPIs, barras, tabelas e modais
docker-compose.yml  banco + api + web
```

### Campos da base

O catálogo inicial reproduz as 47 colunas da aba **“2. BASE DECISÕES_CONS”** da planilha de referência
(de `CONCATENAR` a `SALÁRIO ANUAL`, incluindo `ESTABILIDADE`, `DATA FIM ESTABILIDADE` e
`DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR`), mais os campos preenchidos no portal
(ação, destino e justificativa). Novas colunas do Excel podem ser criadas direto na importação
ou em **Configurações → Campos** — sem alterar o código.
