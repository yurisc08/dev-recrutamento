# Como colocar em uso — opções

Quatro caminhos, do mais simples ao mais definitivo. Todos rodam o **mesmo
programa**: o que muda é onde ele fica ligado e quem alcança.

| | Custo | Esforço | Serve para |
| --- | --- | --- | --- |
| **1. Só o arquivo** | zero | minutos | conhecer o fluxo, demonstrar |
| **2. Servidor na sua máquina** | zero | 15 min | usar dentro da empresa |
| **3. Túnel a partir da sua máquina** | zero | +15 min | piloto com gestores de fora |
| **4. Hospedagem** | R$ 25–45/mês | uma tarde | processo oficial |

---

## 1. Só o arquivo (`index.html`)

Duplo clique. Funciona sem instalar nada, sem internet.

- Os dados ficam **no navegador daquela máquina**.
- Cada pessoa que abrir tem a própria cópia: **o fluxo entre pessoas não
  acontece**.
- Não há envio de e-mail; os códigos aparecem na tela para você repassar.

Use para conhecer a ferramenta e mostrar para a equipe. Não use para operar.

---

## 2. Servidor na sua máquina (rede da empresa)

O caminho natural para começar de verdade.

1. Instale o Node.js LTS (<https://nodejs.org>).
2. Duplo clique em **`Instalar atalhos.vbs`** — cria o atalho e faz subir junto
   com o Windows, sem Agendador de Tarefas e sem administrador.
3. Descubra o IP da máquina (`ipconfig`) e passe aos gestores:
   `http://192.168.0.42:3000`.
4. Libere a porta no firewall (o comando está no `HOSPEDAR.md`).

**Ganha:** dados compartilhados, e-mail automático, tudo dentro da empresa.
**Limita:** a máquina precisa ficar ligada, e só alcança quem está na rede.

---

## 3. Túnel — acesso externo sem contratar nada

Um programa cria um endereço `https://` público apontando para a sua máquina.
Passo a passo em **[PILOTO-INTERNET.md](PILOTO-INTERNET.md)**.

**Ganha:** gestores acessam de casa ou do celular, sem VPN.
**Limita:** a máquina continua tendo que ficar ligada — e **túnel é assunto de
TI**, que deve aprovar antes.

Serve para provar o valor e conseguir o orçamento do passo 4.

---

## 4. Hospedagem — o destino, quando virar processo

| Onde | Quando faz sentido |
| --- | --- |
| **Hospedagem que a empresa já tem**, com Node.js (cPanel → "Setup Node.js App") | melhor caso: custo zero adicional, domínio e HTTPS prontos |
| **VPS pequeno** (Hostinger, Contabo, Hetzner) | não há hospedagem com Node; ~R$ 25–45/mês, alguém do TI administra |
| **Render / Railway** | ninguém quer administrar servidor; ~US$ 7/mês, **exige disco persistente** (variável `DATA_DIR`), senão os dados somem a cada publicação |

Roteiros completos — systemd, nginx, HTTPS, backup — no
**[HOSPEDAR.md](HOSPEDAR.md)**.

> Atenção ao comprar: os planos mais baratos de "hospedagem de sites" são para
> PHP e **não rodam Node.js**. Pergunte antes: *"este plano roda uma aplicação
> Node.js própria, com processo em execução contínua?"*

---

## Como migrar entre eles

Nada se perde e não existe exportar/importar: **copie a pasta `data/`**. São
dois arquivos JSON com os cargos, o histórico, o modelo e os acessos.

```
1 → 2   os dados do navegador não migram; recadastre (são poucos, no começo)
2 → 3   nada muda; só sobe o túnel
2 → 4   copie a pasta do projeto e a pasta data/ para o servidor
3 → 4   idem
```

---

## Segurança, em cada opção

| | Quem alcança | Proteção |
| --- | --- | --- |
| 1 | quem tem o arquivo | nenhuma: quem abre, entra |
| 2 | rede interna | código de acesso; HTTP é aceitável dentro da rede |
| 3 | quem tiver o link | código de acesso + HTTPS do túnel |
| 4 | conforme a configuração | código de acesso + HTTPS + backup |

Em qualquer opção valem as regras de acesso da ferramenta:

- o código do gestor é **exclusivo daquele descritivo**;
- os códigos **não ficam guardados** — o arquivo de dados só tem a verificação
  (hash), então nem quem abre o `db.json` descobre o código de alguém;
- o código do gestor **expira quando o descritivo é aprovado**;
- gerar um código novo **invalida o anterior na hora**, inclusive a sessão de
  quem estivesse usando.

Antes de expor a ferramenta a mais gente, faça uma vez: crie o seu acesso de
C&R, **revogue os de demonstração** (`CR-00001` e `AP-00001`) e restaure os
dados de teste para limpar os cargos de exemplo.
