# Descritivos de Cargos

Ferramenta de criação, preenchimento e aprovação de descritivos de cargo,
hospedada **localmente** — na sua máquina ou num computador da rede da empresa.
Sem nuvem, sem conta em serviço nenhum e **sem nenhuma dependência**: só o Node.

O formulário, as validações e o documento final seguem o modelo
**MAPA DE CARREIRA**, declarado em um único lugar: `shared/model.js`.

## Como rodar

```bash
cd descritivos-cargos
node server.js          # ou: npm start
```

Abra <http://localhost:3000>.

Para que outras pessoas acessem, elas usam o **IP da máquina que está rodando o
servidor** — `http://192.168.0.42:3000`, por exemplo. Para descobrir esse IP:

| Sistema | Comando |
| --- | --- |
| Windows | `ipconfig` (procure "Endereço IPv4") |
| Linux / macOS | `hostname -I` ou `ifconfig` |

Duas observações práticas: o computador que roda o servidor precisa ficar ligado
enquanto as pessoas preenchem, e o firewall dele precisa liberar a porta 3000
(no Windows, a primeira execução costuma abrir a caixa "Permitir acesso").
Para trocar a porta: `PORT=8080 node server.js`.

## Onde ficam os dados

Em `data/db.json`, no computador que roda o servidor — é isso que faz o fluxo
funcionar entre pessoas: C&R cria o cargo na máquina dela, o gestor abre da
máquina dele e enxerga o mesmo cargo.

- **Backup**: copie `data/db.json`. É o arquivo inteiro.
- **Recomeçar do zero**: apague a pasta `data/` e suba o servidor de novo, ou
  use **Restaurar dados de teste** em Administração.
- A pasta `data/` está no `.gitignore` — dados reais não vão para o repositório.

## Acessos de teste

| Papel | Acesso |
| --- | --- |
| Responsável pelo cargo | código `DC-00001` (sem usuário/senha) |
| Aprovador | `aprovador@empresa.com` / `Ap@2026!` |
| Carreira & Recompensa | `rh@empresa.com` / `Rh@2026!` |

Os usuários internos ficam em `data/db.json` (`users`). Para uso real, troque as
senhas ali e reinicie o servidor.

## O fluxo

```
C&R cria o cargo (identificação + formação + comportamentais)
        │  gera o código de acesso e prepara o e-mail ao responsável
        ▼
   editing ──enviar──▶ manager_review ──aprovar──▶ hr_review ──validar──▶ approved
      ▲                     │                          │                     │
      └──── returned ◀──devolver───────────────devolver─┘        documento / PDF
```

| Etapa | Rótulo | Quem age |
| --- | --- | --- |
| `editing` | Em preenchimento | Responsável pelo cargo |
| `returned` | Devolvido para correção | Responsável pelo cargo |
| `manager_review` | Aguardando aprovação | Aprovador |
| `hr_review` | Validação de C&R | Carreira & Recompensa |
| `approved` | Aprovado | — (documento liberado) |

Regras aplicadas em `shared/flow.js`, **no servidor**:

- **Enviar para aprovação** exige todos os campos obrigatórios do responsável.
- **Devolver** exige justificativa, que vira comentário e entra no histórico.
- **Validar e aprovar** revalida os campos dos dois papéis e grava a
  *Data de revisão* automaticamente.
- **Reabrir para revisão** (só C&R, só em cargos aprovados) devolve o cargo para
  preenchimento com justificativa.

### Código de acesso

O responsável entra só com o código — sem usuário nem senha. Ele é sorteado
(`DC-XXXX-XXXX`, alfabeto sem `0/O` e `1/I` para ser ditado por telefone sem
erro) e é **por pessoa, não por cargo**: se C&R cadastrar três cargos para o
mesmo e-mail, os três caem sob o mesmo código e aparecem juntos quando o gestor
entra.

O botão **Preparar e-mail** abre o cliente de e-mail padrão com a mensagem
pronta — assunto, prazo, endereço do servidor e o código. O envio em si é feito
pelo seu e-mail de sempre; a ferramenta não manda e-mail sozinha.

## Divisão do modelo por papel

| Bloco do modelo | Preenchido por |
| --- | --- |
| Identificação do cargo (empresa, código, cargo, CBO, trilha, datas) | C&R |
| Foco de atuação, Missão, Responsabilidades | Responsável |
| Formação mínima / desejável | C&R |
| Idioma mínimo / desejável | Responsável |
| Competências técnicas mínimas / desejáveis | Responsável |
| Competências comportamentais Marcopolo | C&R |
| Experiência mínima / desejável | Responsável |

Campos que não pertencem ao papel logado aparecem bloqueados (🔒) na tela — e são
**recusados pelo servidor** mesmo que alguém tente enviá-los por fora. O
aprovador nunca edita conteúdo: apenas aprova ou devolve.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `server.js` | Servidor HTTP, API, sessões e gravação em `data/db.json` |
| `shared/model.js` | Seções, campos, papéis e etapas do modelo (navegador + servidor) |
| `shared/flow.js` | Visibilidade, permissão de escrita e transições (navegador + servidor) |
| `assets/api.js` | Cliente da API; única camada do navegador que fala com o servidor |
| `assets/app.js` | Interface: login, navegação, formulário, filas, documento |
| `assets/styles.css` | Estilos, incluindo a folha de impressão do documento |

Os arquivos de `shared/` são carregados pelos dois lados — o navegador desenha a
interface com as mesmas regras que o servidor aplica de verdade. Para incluir ou
renomear um campo do descritivo, edite `SECTIONS` em `shared/model.js`:
formulário, validação, permissões e documento final acompanham.

## Alcance desta versão

Feita para rede interna, na escala de uma área de RH. O que ela assume:

- **HTTP, sem TLS.** Rede interna confiável. Para expor fora da empresa, ponha
  atrás de um proxy com HTTPS.
- **Senhas em texto no `data/db.json`.** Se a ferramenta passar a valer como
  registro oficial, troque por hash (`node:crypto.scrypt`) e proteja o arquivo.
- **Sessões em memória.** Reiniciar o servidor apenas pede um novo login.
- **Gravação em arquivo JSON.** Adequada para dezenas ou centenas de cargos com
  poucos acessos simultâneos. Se crescer, `server.js` é o único arquivo que muda
  para virar SQLite ou Postgres.
