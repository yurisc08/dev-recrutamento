# Piloto: acesso pela internet, a partir da sua máquina

Este guia serve para **testar o processo com alguns gestores** sem contratar
hospedagem. A ferramenta continua rodando no seu computador; um programa
chamado *túnel* cria um endereço `https://` público que aponta para ela.

Sem abrir porta no firewall, sem IP fixo, sem mexer no roteador.

> **Antes de começar, dois avisos honestos.**
>
> 1. **Seu computador precisa ficar ligado.** Se ele dormir, reiniciar por
>    atualização ou for para casa, quem abrir o link vê erro.
> 2. **Túnel é assunto de TI.** Ele atravessa os controles da rede da empresa, e
>    os descritivos levam nome e e-mail de gestores para fora. Avise a TI antes —
>    é uma conversa curta e evita uma longa depois.
>
> Por isso este caminho é para **piloto**. Virando processo oficial, migre para
> um servidor (veja `HOSPEDAR.md`): você copia a pasta `data/` e não perde nada.

---

## Passo 1 — Deixe a ferramenta rodando

Duplo clique em **`Descritivos.vbs`**. Ela sobe sem janela nenhuma e abre o
navegador em <http://localhost:3000>.

Confirme que funciona **antes** de mexer no túnel.

## Passo 2 — Escolha o túnel

### Opção A — Tailscale (recomendada para o piloto)

Entrega um endereço HTTPS **fixo**, que não muda quando você reinicia. É o que
permite mandar o link por e-mail aos gestores.

1. Baixe em <https://tailscale.com/download> e instale (não exige
   administrador na maioria dos casos).
2. Faça login com a conta do Google ou Microsoft da empresa.
3. No painel do Tailscale (admin console), habilite **HTTPS** e **Funnel** para
   o seu dispositivo.
4. No Prompt de Comando:

   ```bat
   tailscale funnel 3000
   ```

5. Ele imprime o endereço, algo como
   `https://seu-computador.SEU-TAILNET.ts.net`. Esse é o endereço que os
   gestores usam.

### Opção B — Cloudflare Tunnel (sem instalar nada permanente)

Mais rápido para uma demonstração de 10 minutos, mas o endereço **muda a cada
vez que você sobe** — não serve para mandar por e-mail.

1. Baixe o `cloudflared` em
   <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
2. No Prompt de Comando, dentro da pasta onde baixou:

   ```bat
   cloudflared tunnel --url http://localhost:3000
   ```

3. Ele imprime um endereço `https://algo-aleatorio.trycloudflare.com`.

Para um endereço fixo na Cloudflare é preciso ter um domínio hospedado nela —
aí já é o mesmo esforço de um servidor de verdade.

## Passo 3 — Ajuste o endereço dentro da ferramenta

Entre como C&R (`CR-00001`) → **Ajustes** → campo **Endereço da ferramenta** →
cole o endereço público do túnel e salve.

É esse endereço que vai nos e-mails automáticos. Sem isso, o gestor recebe o
código mas não sabe onde usá-lo.

## Passo 4 — Teste como se fosse um gestor

Pelo celular, na rede de dados (fora do Wi-Fi da empresa), abra o endereço e
entre com um código de gestor. Se abrir e você conseguir preencher, o piloto
está pronto.

---

## Segurança durante o piloto

- **Revogue os códigos de demonstração** (`CR-00001` e `AP-00001`) em
  *Códigos* antes de expor o endereço. Eles são públicos, estão neste guia.
- Crie o seu código de C&R **antes** de revogar o de demonstração, senão você
  fica sem acesso.
- Os códigos dos gestores já são sorteados e expiram quando o descritivo é
  aprovado.
- Encerre o túnel quando não estiver testando: feche a janela do `cloudflared`
  ou rode `tailscale funnel off`.

## Quando encerrar o piloto

Migrar para um servidor é copiar duas coisas: a **pasta do projeto** e a
**pasta `data/`**. Nada de exportar ou reimportar — os cargos, o histórico, os
códigos e o modelo estão nesses dois arquivos JSON.
