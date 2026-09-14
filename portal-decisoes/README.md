# Portal de Decisões — Reestruturação

Portal interno que substitui a planilha de tomada de decisão por um sistema com **login,
perfis de acesso (gestor / diretor / RH), atualização da base por Excel, colunas configuráveis
pelo próprio portal e trilha de auditoria**.

Roda **100% dentro da rede da empresa**: Node.js + SQLite em um único servidor, sem nuvem,
sem CDN e sem serviço externo. O dado sensível não sai do perímetro.

---

## O que o portal resolve

| Necessidade | Como o portal atende |
|---|---|
| Preencher "Ação Indicada" e "Justificativa" | Aba **Base de Decisões**, com lista suspensa e gravação imediata |
| Consolidado automático (aba "1. Resumo") | Aba **Resumo**: indicadores, % de preenchimento, quebras por divisão, diretoria e área |
| Separar por divisão para cada gestor | Perfil **gestor** só enxerga (e exporta) as divisões atribuídas a ele |
| Diretor visualiza tudo | Perfis **diretor** e **RH** veem a base inteira; o diretor ainda **homologa** as decisões |
| Atualizar a base pelo Excel | Aba **Importar / Exportar**: envia o .xlsx, confere o mapeamento das colunas e confirma |
| Alterar e adicionar colunas | Aba **Colunas**: cria, renomeia, reordena, oculta, define tipo e quem pode preencher |
| Devolver o arquivo ao RH | Exportação gera o .xlsx com as abas "1. Resumo" e "2. Base Decisões" e lista suspensa na coluna Ação |
| Colaboradores desligados na posição base | Marcados como `Desligado`; ficam bloqueados para decisão e são contados à parte |
| Estabilidade / afastamento | Sinalizados na linha; desligamento indicado exige justificativa e gera alerta visível ao RH |
| Confidencialidade | Acesso só por login, aviso permanente na tela e registro de quem viu/alterou o quê |

---

## Instalação

Pré-requisito: **Node.js 20 ou superior** no servidor interno (Linux ou Windows Server).

```bash
git clone <repositorio> /opt/portal-decisoes
cd /opt/portal-decisoes/portal-decisoes
npm install --omit=dev
cp .env.example .env        # ajuste porta, HOST e COOKIE_SECURE
node scripts/criar-usuario.js rh.admin "Nome do responsável de RH" admin
npm start
```

O portal sobe em `http://<servidor>:3000`. O banco é criado em `dados/portal.db`.

### Colocar no ar como serviço

* `implantacao/portal-decisoes.service` — unidade systemd (reinício automático, usuário sem privilégios).
* `implantacao/nginx.conf` — proxy reverso com TLS interno e liberação apenas das faixas de IP da empresa.
* `implantacao/backup.sh` — backup consistente do SQLite, para agendar no cron.

Com proxy reverso: coloque `HOST=127.0.0.1` e `COOKIE_SECURE=true` no `.env`.

---

## Perfis de acesso

| Perfil | Vê | Preenche | Homologa | Administra |
|---|---|---|---|---|
| **gestor** | só as divisões atribuídas | ação e justificativa dos seus colaboradores | não | não |
| **diretor** | base completa | qualquer colaborador | sim | não |
| **admin (RH)** | base completa | tudo, inclusive dados cadastrais | sim | colunas, usuários, importação, parâmetros |

* Usuários são criados na aba **Usuários**; o portal gera senha provisória, trocada no primeiro acesso.
* Um gestor pode responder por várias divisões (botão **Divisões**).
* Depois de homologada, a decisão fica travada para o gestor — só diretor ou RH alteram.

---

## Rotina do processo

1. **RH** importa a planilha na aba *Importar / Exportar* (chave de atualização: **matrícula**).
2. **RH** confere as colunas na aba *Colunas* e cria o que faltar (ex.: "Avaliação de desempenho",
   "Polivalência", "Impacto na continuidade") definindo quem pode preencher.
3. **RH** cadastra os gestores e atribui as divisões.
4. **Gestores** preenchem ação e justificativa — cada um vê apenas a sua divisão.
5. **Diretor** acompanha o Resumo, revisa e **homologa** as decisões.
6. **RH** exporta o .xlsx consolidado para devolver no formato original.

### Regras aplicadas automaticamente

* Colaborador com `Situação = Desligado` (posição base) não recebe decisão e é contado à parte.
* Ação **Transferência de área** exige justificativa.
* **Desligamento** de quem tem estabilidade/afastamento vigente exige justificativa e fica marcado
  com alerta (⚠) na base, no detalhe e na coluna "Alertas" da exportação — a checagem de estabilidade
  médica continua sendo feita pelo RH antes da execução.
* Toda alteração grava autor, valor anterior, valor novo e data na aba **Auditoria**.

---

## Importação de Excel

* Aceita `.xlsx` / `.xlsm`; detecta as abas e a linha de cabeçalho.
* Mostra uma prévia e o mapeamento sugerido coluna a coluna — nada é gravado antes da confirmação.
* Cabeçalhos desconhecidos podem virar **novas colunas** do portal com um clique.
* **Decisões já preenchidas no portal não são sobrescritas**, exceto se a opção
  "Importar também Ação e Justificativa" for marcada.
* Linhas com erro (matrícula vazia, data inválida, opção fora da lista) são relatadas e puladas;
  o restante é importado.

## Exportação

Gera o arquivo com as duas abas esperadas pelo RH:

* **1. Resumo** — indicadores, distribuição por ação e andamento por divisão.
* **2. Base Decisões** — todas as colunas, com lista suspensa na coluna *Ação Indicada*,
  além de Status, Alertas, quem preencheu e quando.

Gestores exportam apenas a própria divisão.

---

## Segurança e proteção de dados

* Sessões com cookie `HttpOnly` + `SameSite=Strict`; senhas com **scrypt** e sal por usuário.
* Bloqueio temporário após tentativas de login erradas; registro de acessos (aba Auditoria).
* CSP restritiva: a página não carrega nada de fora do servidor — funciona em rede sem internet.
* Recomendações de implantação: TLS interno, acesso limitado por firewall/VPN, backup diário
  do arquivo `dados/portal.db` (ver `implantacao/backup.sh`) e remoção dos usuários ao fim do processo.
* Base legal e retenção (LGPD) são responsabilidade do RH: o portal registra quem acessou e alterou
  cada decisão, o que ajuda na prestação de contas.

### Por que interno em vez de Cloudflare + Supabase

Dado de desligamento é informação sensível de pessoal. Mantendo tudo em servidor próprio:
nenhum terceiro processa a base, o acesso já fica restrito à rede/VPN corporativa e o backup
é um único arquivo sob controle da empresa. Se no futuro for preciso acesso externo, o caminho
recomendado é publicar **o mesmo portal** atrás da VPN — não mover os dados para fora.

---

## Manutenção

```bash
npm test                                   # suíte automatizada (regras, permissões, import/export)
node scripts/criar-usuario.js <usuario> "<Nome>" <admin|diretor|gestor> [senha] [divisoes]
node scripts/seed.js --confirmar           # dados FICTÍCIOS para treinamento/demonstração
```

Para treinar os gestores sem expor a base real, use um banco separado:

```bash
DB_PATH=./dados/treinamento.db PORT=3001 node scripts/seed.js --confirmar
DB_PATH=./dados/treinamento.db PORT=3001 npm start
```

### Estrutura

```
server.js              Express, CSP, rotas e tratamento de erros
src/db.js              Esquema SQLite, colunas padrão e parâmetros
src/auth.js            Senhas (scrypt), sessões, perfis e filtro por divisão
src/modelo.js          Regras de decisão, alertas de estabilidade e histórico
src/planilha.js        Leitura e geração de .xlsx (ExcelJS)
src/rotas/             API: colaboradores, colunas, config, resumo, usuários, histórico, planilha
public/                Interface (HTML, CSS e JS sem dependências externas)
implantacao/           systemd, nginx e backup
test/                  Testes automatizados
```

> Observação de dependências: `exceljs` traz `uuid` com um aviso de segurança (`GHSA-w5hq-g745-h8pq`)
> que afeta apenas chamadas `uuid` v3/v5/v6 com buffer — caminho não utilizado aqui. Atualize quando
> o `exceljs` publicar versão com `uuid` ≥ 11.1.1.
