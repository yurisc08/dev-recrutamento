# Portal de Decisões — versão local (rede da empresa)

O mesmo portal, rodando **dentro da empresa**, numa máquina sua. Os dados não
saem da rede: ficam num arquivo nesta pasta. Não instala nada no computador, não
mexe no registro do Windows e **não precisa de senha de administrador**.

Feito para quem tem acesso à rede e ao IP da máquina — e não tem acesso de TI.

---

## 1. Ligar o portal (5 minutos, uma vez)

1. **Baixe o Node.js em formato ZIP** (não é instalador):
   <https://nodejs.org/en/download> → *Windows* → *x64* → **ZIP**.
2. Abra o ZIP baixado, ache o arquivo **`node.exe`** e copie para a pasta
   **`node`** que está aqui do lado.
   *(Se a máquina já tiver Node.js instalado, pule os passos 1 e 2.)*
3. Dê dois cliques em **`iniciar.bat`**.
   No Linux ou Mac: `./iniciar.sh`.
4. Abre uma janela preta com algo assim:

```
  PORTAL DE DECISÕES — rodando nesta máquina

  Endereço para os gestores (rede da empresa):
    https://10.20.30.40:8443
    https://PC-RH:8443

  PRIMEIRO ACESSO (usuário rh.admin) — abra este link e defina a sua senha:
    https://10.20.30.40:8443/ativar?t=8f3c...
```

5. **Copie o link de primeiro acesso, abra no navegador e defina a sua senha.**
   Essa senha é sua: ninguém mais no portal tem acesso a ela.

> **Deixe essa janela aberta.** Enquanto ela estiver aberta, o portal está no ar.
> Fechou a janela, o portal sai do ar (os dados continuam salvos).
> Por isso, use uma máquina que fique ligada durante o processo.

### O aviso do navegador é esperado

Na primeira visita o navegador diz algo como *"A conexão não é particular"* ou
*"Este site não é seguro"*. Isso acontece porque o certificado foi criado pela
própria máquina, e não comprado de uma autoridade certificadora — é o preço de
não depender da TI.

O que fazer: **Avançado → Continuar para o site**. A conexão é cifrada do mesmo
jeito; o aviso é sobre *quem assinou* o certificado, não sobre a proteção.

Se quiser tirar o aviso de vez nas máquinas dos gestores (opcional, e aí sim
precisa de administrador na máquina de quem usa): mande o arquivo
`dados/portal-certificado.pem` e peça para instalar em *Autoridades de
Certificação Raiz Confiáveis*.

## 2. Colocar a base no ar

1. Entre no portal com o seu usuário.
2. **Configurações** — confira data-base, prazo, campos, ações e regras.
3. **Importar Excel** — escolha a planilha, confira o de-para das colunas e
   confirme. A coluna **GESTOR IMEDIATO** é a que separa a base por gestor.
   A planilha é lida **no seu computador**; só as colunas que você mapeou entram
   no portal.

   > O arquivo **`modelo-base.xlsx`**, aqui nesta pasta, tem exatamente as **49
   > colunas** que o portal já entende, com a lista suspensa na AÇÃO INDICADA e
   > uma aba explicando cada coluna. Cole a sua base nele (ou renomeie as colunas
   > da sua planilha para estes nomes) e a importação reconhece tudo sozinha.
   > Coluna que não estiver no modelo você mapeia na mão, ou deixa de fora.
4. **Gestores** — para cada gestor, **Criar acesso**. O portal devolve um **link
   de primeiro acesso**: mande para ele pelo canal interno (Teams, e-mail
   corporativo, o que a empresa usa).
5. O gestor abre o link, **define a senha dele** e passa a ver **só a equipe
   dele**, marcando as decisões direto na linha.
6. Você acompanha tudo em **Dashboard** e **Gestores**, sem pedir arquivo de
   volta. No fim, **Exportar Excel**.

### Ver a lista do seu jeito

A lista abre com as colunas principais. O botão **Colunas** abre o seletor: marque
as que você quer ver, agrupadas como na planilha (Identificação, Organização,
Cargo, Situação, Remuneração...). *Marcar todas* traz a base inteira na tela, com
rolagem lateral.

A escolha é **de cada pessoa** e fica salva no navegador dela — o gestor arruma a
tela dele sem mexer na sua. Clicar no nome abre a **ficha completa**: todas as
colunas daquela pessoa, mais o histórico do que já foi alterado nela.

A **exportação não depende dessa escolha**: o Excel sai sempre com todas as
colunas que a pessoa tem direito de ver.

## 3. Se os gestores não conseguirem abrir o endereço

Quase sempre é o **firewall do Windows** bloqueando a entrada na porta 8443.

- **Teste primeiro** em outra máquina da rede: `https://SEU-IP:8443`.
- Se não abrir, peça a alguém com administrador na *sua* máquina (ou à TI) para
  rodar uma vez, no Prompt de Comando como administrador:

  ```
  netsh advfirewall firewall add rule name="Portal de Decisoes" dir=in action=allow protocol=TCP localport=8443
  ```

  É uma regra de entrada para uma porta, nada além disso — e pode ser removida
  depois trocando `add` por `delete`.
- Se não houver essa possibilidade, o portal ainda funciona **na sua máquina**
  (para o RH consolidar), mas os gestores não vão alcançá-lo pela rede. Nesse
  caso, ou se fala com a TI, ou o caminho é a versão em nuvem
  (`portal-cloudflare`).

Outras causas possíveis: a máquina trocou de IP (reinicie o portal e use o novo
endereço que aparece na janela) ou o computador entrou em suspensão.

## 4. O que está protegido

- **Senha é da pessoa.** O acesso é criado sem senha nenhuma; quem define é a
  própria pessoa, pelo link de primeiro acesso (uso único, vale 7 dias). No
  arquivo do banco fica só o hash PBKDF2-SHA256 — nem o RH consegue entrar em
  nome de alguém.
- **Tráfego cifrado (HTTPS)** entre o navegador do gestor e o portal, com
  certificado gerado na primeira execução para o IP e o nome desta máquina.
- **Cada um vê o que é dele**, e isso é conferido no banco, não na tela: gestor
  vê a equipe dele, diretor a Diretoria dele, RH tudo.
- **CPF e data de nascimento** não saem do portal para quem não é RH — nem na
  tela, nem no Excel exportado.
- **Auditoria que ninguém apaga**: login, decisão, homologação, importação,
  exportação, criação de acesso. O próprio banco recusa alterar ou apagar a
  trilha.
- **5 senhas erradas em 15 minutos** bloqueiam o usuário.
- **Nada sai para a internet**: o portal só fala com quem está na rede.
- Dá para **limitar por faixa de rede**: copie `portal.config.json.exemplo` para
  `portal.config.json` e preencha `redes_permitidas` (ex.: `["10.20.30.0/24"]`).

### O que continua com você

- A máquina que hospeda deve ser **sua e com senha** — quem tem acesso ao
  arquivo `dados/portal.sqlite` tem acesso aos dados (as senhas, não).
- **Não coloque esta pasta em rede compartilhada, OneDrive ou pen drive.**
- **Backup**: com o portal fechado, copie a pasta `dados` para um local seguro.
  Uma vez por dia durante o processo já resolve.
- **No fim do processo**, apague os dados: feche o portal e apague o arquivo
  `dados/portal.sqlite`. (Isso apaga tudo, auditoria inclusive; se quiser
  guardar o registro das decisões, exporte o Excel antes — ele leva a aba de
  auditoria junto.)
- Mesmo rodando dentro da empresa, vale avisar a TI/Segurança e o RH sobre o que
  está no ar. É informação de pessoas.

## 5. Perguntas rápidas

**Preciso deixar meu computador ligado?**
Sim, enquanto os gestores estiverem preenchendo. Fechou a janela, o portal sai
do ar; os dados ficam salvos e voltam quando você abrir de novo.

**Dá para mudar a porta?**
Sim: copie `portal.config.json.exemplo` para `portal.config.json` e troque
`porta`. Use algo acima de 1024 (8443, 8444, 9443...).

**Esqueci minha senha.**
Se for outro usuário, você gera um **Novo link** na tela Gestores. Se for a sua
(RH) e não houver outro administrador, feche o portal, apague o arquivo
`dados/portal.sqlite`... e perde tudo. Então: **faça backup** e, se possível,
crie um segundo usuário administrador logo no começo.

**Posso rodar em outra máquina depois?**
Pode: copie a pasta inteira (com `dados`) e rode lá. O certificado é refeito
sozinho para o IP novo.

**E se a empresa preferir na nuvem?**
Tem o mesmo portal pronto para Cloudflare + Supabase, na pasta
`portal-cloudflare`, com o passo a passo dele.

## 6. Para quem for conferir o código

- `servidor/` — tudo em JavaScript puro, sem nenhuma biblioteca externa: banco
  (SQLite embutido no Node), certificado, regras, rotas.
- `publico/` — a interface já compilada.
- `testes/portal.test.mjs` — 16 testes que sobem o portal de verdade e conferem
  login, escopo por perfil, importação, decisão, homologação, exportação, campo
  sensível fora do alcance de quem não é RH e a auditoria imutável. Rode com
  `node --test testes/portal.test.mjs`.
- `modelo-base.xlsx` — a planilha-modelo com as 49 colunas do processo.

### Mexer na interface

A tela é um aplicativo React compilado. O código-fonte dela é compartilhado com a
versão em nuvem e está em **`../portal-cloudflare/web/src`**. Para mudar alguma
coisa:

```
cd ../portal-cloudflare/web
npm install
npx vite build
cp -r dist/* ../../portal-local/publico/
```

Se você não vai mexer na tela, nada disso é necessário: `publico/` já vem pronto
e o portal não precisa de `npm` para rodar.
