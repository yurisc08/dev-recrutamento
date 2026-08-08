# Descritivos de Cargos

Ferramenta de criação, preenchimento e aprovação de descritivos de cargo,
hospedada **localmente** — na sua máquina ou num computador da rede da empresa.
Sem nuvem, sem conta em serviço nenhum e **sem nenhuma dependência**: só o Node.

O formulário, as validações e o documento final seguem o modelo
**MAPA DE CARREIRA**, declarado em um único lugar: `shared/model.js`.

## Como abrir

**Extraia o zip primeiro.** Abrir arquivos de dentro do zip, pelo visualizador do
Windows, não funciona: o navegador enxerga só um arquivo solto.

### O jeito recomendado: `Descritivos.vbs`

Duplo clique em **`Descritivos.vbs`** (Windows). Ele sobe a ferramenta **sem
janela nenhuma** e abre o navegador em <http://localhost:3000>. Para encerrar,
use **`Parar.vbs`**.

Rodando **`Instalar atalhos.vbs`** uma vez, você ganha um atalho na Área de
Trabalho e a ferramenta passa a subir sozinha ao ligar o computador — sem
Agendador de Tarefas e sem permissão de administrador.

> Se a sua empresa bloquear arquivos `.vbs`, use o **`abrir.bat`**, que faz o
> mesmo mas deixa uma janela preta aberta (fechá-la desliga o servidor).
> No Linux/macOS, `./abrir.sh`.

Precisa do **Node.js 18 ou mais novo** — se não tiver, baixe a versão LTS em
<https://nodejs.org> (instalação padrão, tudo "avançar"). Não existe
`npm install`: o servidor usa só o que já vem com o Node.

Assim os dados ficam gravados em `data/` e o fluxo funciona **entre pessoas**:
C&R cadastra na máquina dela e o gestor abre da dele, pelo IP da máquina que
está rodando (`http://192.168.0.42:3000`, por exemplo — descubra o seu com
`ipconfig`).

Dois caminhos a partir daqui:

- **Testar com gestores de fora da rede, sem contratar nada** →
  **[PILOTO-INTERNET.md](PILOTO-INTERNET.md)** (túnel a partir da sua máquina).
- **Deixar no ar de forma definitiva**, num servidor ou plataforma →
  **[HOSPEDAR.md](HOSPEDAR.md)**.

### Para só dar uma olhada: duplo clique no `index.html`

A ferramenta inteira está dentro desse arquivo e funciona sem instalar nada.
Serve para conhecer o fluxo e navegar pelas telas.

Aqui vale um aviso: **alguns navegadores não deixam arquivos abertos direto do
disco guardarem dados** (o Edge costuma recusar, com um erro de "quota"). Nesse
caso a ferramenta continua funcionando normalmente, mas o que você preencher
**se perde ao recarregar a página** — e a própria tela avisa isso. Para valer,
use o `abrir.bat`.

A ferramenta detecta sozinha em qual situação está e diz na tela.

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

## O fluxo de trabalho

```
1. C&R cadastra o cargo
   preenche a parte dela (identificação, formação, competências normativas)
   e o sistema gera o código de acesso do responsável
        │  e-mail automático ao gestor, com o código e o prazo
        ▼
2. Gestor entra com o código
   preenche as partes que cabem a ele e envia
        │
        ▼
3. Carreira & Recompensa analisa
   ├── devolve com o motivo ──▶ volta ao gestor (novo e-mail com o código)
   └── aprova ──▶ documento pronto; o código do gestor deixa de valer
```

**O aprovador é opcional.** No cadastro do cargo, deixando o campo *Aprovador*
em branco, o descritivo vai do gestor direto para C&R — que é quem aprova.
Se a sua estrutura exigir um aval intermediário (um diretor, por exemplo),
basta indicar um aprovador e ele entra entre as duas pontas.

| Etapa | Rótulo na tela | Quem age |
| --- | --- | --- |
| `editing` | Em preenchimento | Gestor responsável |
| `returned` | Devolvido para correção | Gestor responsável |
| `manager_review` | Aprovação do aprovador | Aprovador *(só quando indicado)* |
| `hr_review` | Aprovação de C&R | Carreira & Recompensa |
| `approved` | Aprovado | — (documento liberado) |
| `canceled` | Cancelado | — (C&R pode reabrir) |

Regras aplicadas no servidor (`shared/flow.js`):

- **Enviar** exige todos os campos obrigatórios do gestor preenchidos.
- **Devolver**, **cancelar** e **reabrir** exigem justificativa, que vira
  comentário e entra no histórico do cargo.
- **Aprovar** revalida os campos dos dois lados e grava a *Data de revisão*.
- Cada pessoa só escreve nos campos do seu papel — o servidor recusa o resto,
  mesmo que alguém tente por fora da tela.

### O código de acesso do gestor

É a única credencial dele: sem usuário, sem senha, sem cadastro. O código:

- é **por pessoa**, não por cargo — três cargos para o mesmo gestor entram sob o
  mesmo código e aparecem juntos quando ele entra;
- vai por e-mail **a cada envio para ele**: na criação do cargo, na devolução e
  na reabertura, sempre com o prazo e o endereço da ferramenta;
- **deixa de valer quando o descritivo é aprovado**. Se o gestor não tiver mais
  nenhum cargo pendente, o código para de dar acesso e a tela explica isso.
  Enquanto houver um cargo em aberto, o mesmo código continua servindo.

### E-mails automáticos

Com o SMTP configurado (**Configurações**), sai um aviso a cada passo:

| Quando | Para quem | Contém |
| --- | --- | --- |
| Cargo cadastrado | Gestor | prazo, endereço e **código de acesso** |
| Enviado para aprovação | Aprovador (se houver) ou C&R | o que analisar |
| Devolvido | Gestor | **motivo** e o código novamente |
| Aprovado | Gestor | aviso de conclusão |
| Reaberto / cancelado | Gestor | motivo |
| Prazo perto ou vencido | Quem está devendo a ação | lembrete, 1× por dia |

Se o envio falhar, **o fluxo não trava**: a ação já foi gravada e a falha fica
marcada no cargo, visível em Administração. Sem SMTP, o botão *Preparar e-mail*
abre a mensagem pronta no Outlook/Gmail de quem está usando.

## O modelo do descritivo é editável

O conteúdo do descritivo **não está fixo no código**. Em **Modelo**, C&R monta
o documento: cria e reordena seções, cria campos e define, para cada um:

| Escolha | Efeito |
| --- | --- |
| **Rótulo** | o que aparece no formulário e vira o título do bloco no documento |
| **Tipo** | texto curto, texto longo ou data |
| **Quem preenche** | C&R (**bloqueado** para o gestor, com o cadeado 🔒) ou o gestor |
| **Obrigatório** | se trava ou não o envio enquanto estiver vazio |
| **Dica** | um texto de apoio embaixo do campo |

A mudança vale de imediato para o formulário, para a validação do envio, para o
documento e para a exportação em CSV — as quatro coisas leem o mesmo modelo.
Cargos já preenchidos mantêm o que foi escrito; campos removidos simplesmente
deixam de aparecer. O botão *Restaurar modelo padrão* volta ao MAPA DE CARREIRA
original.

Duas travas de segurança: o modelo precisa manter o campo **Nome do cargo** (é
o que identifica o descritivo na lista, no e-mail e no documento) e precisa ter
**ao menos um campo do gestor** — sem isso ele não teria o que preencher.

## Divisão padrão do modelo por papel

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
| Fluxo | Aprovador e C&R | painel horizontal com uma coluna por etapa: mostra onde cada cargo parou, destaca a coluna que espera por você e tem busca por cargo, gestor ou código |
| Meus descritivos | Responsável | preencher e enviar seus cargos |
| Aprovações | Aprovador | aprovar ou devolver, com o descritivo inteiro à vista |
| Validações | C&R | validação final |
| Administração | C&R | criar cargo, buscar, filtrar por etapa, reenviar código, cancelar, exportar CSV |
| Códigos de acesso | C&R | criar, copiar, trocar e revogar códigos de C&R e aprovadores |
| Modelo | C&R | montar as seções e os campos do descritivo, e quem preenche cada um |
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
| `Descritivos.vbs` | Inicia a ferramenta sem janela (Windows) |
| `Parar.vbs` | Encerra a ferramenta |
| `Instalar atalhos.vbs` | Cria o atalho na Área de Trabalho e o início automático |
| `build.js` | Gera o `index.html` a partir de `src/`, `assets/` e `shared/` |
| `src/index.html` | Estrutura da página (fonte) |
| `server.js` | Servidor HTTP e rotas da API |
| `server/db.js` | Leitura e gravação atômica de `data/` (ou de `DATA_DIR`) |
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
