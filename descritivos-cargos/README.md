# Descritivos de Cargos

Ferramenta de criação, preenchimento e aprovação de descritivos de cargo,
hospedada **localmente** — na sua máquina ou num computador da rede da empresa.
Sem nuvem, sem conta em serviço nenhum e **sem nenhuma dependência**: só o Node.

O formulário, as validações e o documento final seguem o modelo
**MAPA DE CARREIRA**, declarado em um único lugar: `shared/model.js`.

## Dois jeitos de usar

### 1. Só abrir o `index.html` (modo local)

Extraia a pasta e dê **duplo clique no `index.html`**. Funciona sem instalar
nada, sem Node e sem internet — a ferramenta inteira está dentro desse arquivo.

Use para conhecer o fluxo, demonstrar para a equipe ou preencher sozinho. Neste
modo os dados ficam **no navegador daquela máquina** e os e-mails são preparados
no seu cliente de e-mail (Outlook, Gmail…) pelo botão *Preparar e-mail*.

> Extraia o zip antes. Abrir o `index.html` de dentro do zip, pelo visualizador
> do Windows, costuma dar erro.

### 2. Rodando o servidor (modo compartilhado)

Para o fluxo funcionar **entre pessoas** — C&R cria na máquina dela, o gestor
abre na dele — é preciso um servidor:

```bash
cd descritivos-cargos
npm start               # equivale a: node build.js && node server.js
```

Abra <http://localhost:3000>. Não tem `npm install`: o servidor usa só os
módulos nativos do Node 18 ou mais novo (`node -v` para conferir).

A ferramenta detecta sozinha em qual modo está e avisa na tela.

Para outras pessoas acessarem, elas usam o **IP da máquina que roda o servidor**
— `http://192.168.0.42:3000`, por exemplo. Para descobrir esse IP:

| Sistema | Comando |
| --- | --- |
| Windows | `ipconfig` (procure "Endereço IPv4") |
| Linux / macOS | `hostname -I` ou `ifconfig` |

Duas observações práticas: o computador que roda o servidor precisa ficar ligado
enquanto as pessoas preenchem, e o firewall dele precisa liberar a porta 3000
(no Windows, a primeira execução costuma abrir a caixa "Permitir acesso").
Para trocar a porta: `PORT=8080 node server.js`.

## Primeiros passos

1. Entre como C&R com o código `CR-00001`.
2. Em **Configurações**, preencha o **endereço da ferramenta** (o IP acima, que
   vai nos e-mails) e os dados do **servidor de e-mail**. Clique em
   *Enviar e-mail de teste* para confirmar antes de usar para valer.
3. Em **Códigos de acesso**, crie o seu código de C&R e os dos aprovadores
   reais; depois revogue os de demonstração (`CR-00001` e `AP-00001`).
4. Em **Administração**, use *Restaurar dados de teste* para limpar os cargos de
   demonstração antes de começar (isso também recria os usuários de teste, então
   faça isso **antes** do passo 3).
5. Crie o primeiro cargo em **Novo cargo**.

## Acesso: só código, para todo mundo

Não existe usuário nem senha em lugar nenhum. Cada pessoa entra com um código,
e o próprio código diz quem ela é e o que pode fazer. O prefixo indica o perfil:

| Prefixo | Perfil | De onde vem |
| --- | --- | --- |
| `DC-` | Responsável pelo preenchimento | nasce junto com o cargo, por pessoa |
| `AP-` | Aprovador | criado em **Códigos de acesso** |
| `CR-` | Carreira & Recompensa (administrativo) | criado em **Códigos de acesso** |

O campo aceita o código como a pessoa digitar: com ou sem hífen, maiúsculas ou
minúsculas, com espaços (`cr 00001`, `CR-00001` e `cr00001` são o mesmo código).

### Códigos de demonstração

Aparecem como botões na tela de entrada, é só clicar:

| Código | Quem é |
| --- | --- |
| `CR-00001` | Carreira & Recompensa |
| `AP-00001` | Aprovador |
| `DC-00001` | Gestor Demonstração (2 cargos, um deles devolvido) |
| `DC-00002` | Gestora Demonstração (1 cargo já aprovado, documento pronto) |

### Administrando os códigos

Em **Códigos de acesso** (só C&R) ficam as duas listas: os códigos
administrativos, criados ali, e os códigos dos responsáveis, gerados junto com
os cargos. Em ambas dá para copiar com um clique.

- **Novo código**: informe a pessoa e o perfil; o código é sorteado na hora.
- **Gerar código novo** (equivale a trocar a senha): o antigo deixa de valer
  imediatamente e as sessões abertas com ele caem.
- **Revogar**: tira o acesso. Não dá para revogar o próprio código nem o último
  código de C&R — assim ninguém fica trancado para fora.
- O **e-mail é opcional** no código e serve para receber os avisos do fluxo.
- Ao **renomear um aprovador**, os cargos ligados a ele são atualizados junto.
  No cadastro do cargo o aprovador é escolhido numa lista, não digitado.

> Se você vem da versão com e-mail e senha, os usuários viram códigos na
> primeira execução e **os códigos gerados são impressos no terminal** — anote-os
> antes de fechar a janela.

## O fluxo

```
C&R cria o cargo (identificação + formação + comportamentais)
        │  gera o código de acesso e envia o e-mail ao responsável
        ▼
   editing ──enviar──▶ manager_review ──aprovar──▶ hr_review ──validar──▶ approved
      ▲                     │                          │                     │
      └──── returned ◀──devolver───────────────devolver─┘        documento / PDF

   qualquer etapa ──cancelar (C&R)──▶ canceled ──reabrir (C&R)──▶ editing
```

| Etapa | Rótulo | Quem age |
| --- | --- | --- |
| `editing` | Em preenchimento | Responsável pelo cargo |
| `returned` | Devolvido para correção | Responsável pelo cargo |
| `manager_review` | Aguardando aprovação | Aprovador |
| `hr_review` | Validação de C&R | Carreira & Recompensa |
| `approved` | Aprovado | — (documento liberado) |
| `canceled` | Cancelado | — (pode ser reaberto por C&R) |

Regras aplicadas em `shared/flow.js`, **no servidor**:

- **Enviar para aprovação** exige todos os campos obrigatórios do responsável.
- **Devolver**, **cancelar** e **reabrir** exigem justificativa, que vira
  comentário e entra no histórico.
- **Validar e aprovar** revalida os campos dos dois papéis e grava a
  *Data de revisão* automaticamente.
- Cargo cancelado sai do ar para o responsável: o código deixa de dar acesso a
  ele.

### E-mails automáticos

Configurado o SMTP, a ferramenta envia sozinha em cada passo:

| Quando | Para quem | Contém |
| --- | --- | --- |
| Cargo criado | Responsável | prazo, endereço e **código de acesso** |
| Enviado para aprovação | Aprovador | quem enviou e o que analisar |
| Aprovado pelo aprovador | Equipe de C&R | entrou na fila de validação |
| Devolvido | Responsável | **motivo** e código de acesso |
| Aprovado por C&R | Responsável | aviso de conclusão |
| Reaberto / cancelado | Responsável | motivo |
| Prazo perto ou vencido | Quem está devendo a ação | lembrete, 1× por dia |

Se o envio falhar, **o fluxo não trava**: a ação já foi gravada e a falha fica
registrada no cargo, visível em Administração ("Falha no envio"). Sem SMTP
configurado, nada é enviado e o botão **Preparar e-mail** abre o e-mail já
escrito no cliente da própria pessoa (Outlook, Gmail…), para envio manual.

### Código de acesso

O responsável entra só com o código — sem usuário nem senha. Ele é sorteado
(`DC-XXXX-XXXX`, alfabeto sem `0/O` e `1/I` para ser ditado por telefone sem
erro) e é **por pessoa, não por cargo**: se C&R cadastrar três cargos para o
mesmo e-mail, os três caem sob o mesmo código e aparecem juntos quando o gestor
entra. O botão **Reenviar código** manda tudo de novo quando a pessoa perde o
e-mail.

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

## O que cada tela faz

| Tela | Quem vê | Para quê |
| --- | --- | --- |
| Meus descritivos | Responsável | preencher e enviar seus cargos |
| Aprovações | Aprovador | aprovar ou devolver, com o descritivo inteiro à vista |
| Validações | C&R | validação final |
| Cargos | Aprovador e C&R | consulta |
| Administração | C&R | criar cargo, buscar, filtrar por etapa, reenviar código, cancelar, exportar CSV |
| Códigos de acesso | C&R | criar, copiar, trocar e revogar códigos de C&R e aprovadores |
| Configurações | C&R | e-mail (SMTP), avisos automáticos e cobrança de prazo |
| Documento | todos (aprovado) | MAPA DE CARREIRA pronto para imprimir ou salvar em PDF |

## Onde ficam os dados

Na pasta `data/`, no computador que roda o servidor:

- `data/db.json` — cargos, histórico, comentários e códigos de acesso
- `data/config.json` — endereço, SMTP e preferências de aviso

É isso que faz o fluxo funcionar entre pessoas: C&R cria o cargo na máquina
dela, o gestor abre da máquina dele e enxerga o mesmo cargo.

- **Backup**: copie a pasta `data/`. São dois arquivos.
- **Recomeçar do zero**: apague `data/` e suba o servidor de novo, ou use
  *Restaurar dados de teste* em Administração.
- A pasta está no `.gitignore` — dados reais não vão para o repositório.
- Os códigos ficam legíveis no `data/db.json` — é o que permite a C&R
  consultá-los e reenviá-los. Proteja o arquivo com as permissões do sistema.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | **Arquivo único gerado**, com tudo embutido — é o que se abre |
| `build.js` | Gera o `index.html` a partir de `src/`, `assets/` e `shared/` |
| `src/index.html` | Estrutura da página (fonte) |
| `server.js` | Servidor HTTP e rotas da API |
| `server/db.js` | Leitura e gravação atômica de `data/` |
| `server/auth.js` | Sessões abertas a partir dos códigos |
| `server/mailer.js` | Cliente SMTP próprio (EHLO, STARTTLS, AUTH, DATA) |
| `server/notify.js` | Textos dos avisos, disparo por etapa e cobrança de prazo |
| `shared/model.js` | Seções, campos, papéis e etapas do modelo |
| `shared/seed.js` | Dados de demonstração, usados pelos dois modos |
| `assets/local-store.js` | Modo local: mesma interface da API, guardando no navegador |
| `shared/flow.js` | Visibilidade, permissão de escrita e transições |
| `assets/api.js` | Cliente da API; única camada do navegador que fala com o servidor |
| `assets/app.js` | Interface |
| `assets/styles.css` | Estilos e folha de impressão do documento |

**Ao mexer no código, rode `node build.js`** (ou `npm start`, que já faz isso)
para regenerar o `index.html` — é ele que o navegador abre.

Os arquivos de `shared/` são carregados pelos dois lados — o navegador desenha a
interface com as mesmas regras que o servidor aplica de verdade. Para incluir ou
renomear um campo do descritivo, edite `SECTIONS` em `shared/model.js`:
formulário, validação, permissões, exportação e documento acompanham.

## Alcance desta versão

Feita para rede interna, na escala de uma área de RH. O que ela assume:

- **No modo local não há e-mail automático nem dados compartilhados**, e os
  códigos ficam no `localStorage` do navegador. É um modo de demonstração e uso
  individual; para valer entre pessoas, use o servidor.
- **O código é a credencial inteira.** Quem tem o código entra. Por isso os
  códigos criados são sorteados (`CR-XXXX-XXXX`), nunca sequenciais. Trate-os
  como senha ao enviar, e revogue quando alguém sair da função.

- **HTTP, sem TLS.** Rede interna confiável. Para expor fora da empresa, ponha
  atrás de um proxy com HTTPS.
- **Sessões em memória**, válidas por 12 horas. Reiniciar o servidor apenas pede
  um novo login.
- **Gravação em arquivo JSON.** Adequada para dezenas ou centenas de cargos com
  poucos acessos simultâneos. Se crescer, `server/db.js` é o único arquivo que
  muda para virar SQLite ou Postgres.
- **A senha do SMTP fica em texto em `data/config.json`**, porque o protocolo
  exige a senha original no envio. Proteja o arquivo com as permissões do
  sistema e prefira uma conta de e-mail dedicada a envios automáticos.
