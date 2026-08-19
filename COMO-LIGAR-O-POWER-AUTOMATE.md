# Notificações por etapa no Power Automate

Hoje o envio dos códigos de acesso já funciona. Isto aqui é a outra ponta: um
aviso a cada etapa do fluxo — pedido aberto pelo Gestor, atribuição, devolução,
envio para C&R, validação adicional, conclusão e recusa.

## Por que sai do banco, e não da tela

O portal já chamava uma função `notify-workflow` no navegador, mas **só no botão
de transição**. Criação, triagem do Gestor, validação adicional, recusa e
conferência opcional passam por outros caminhos — nenhuma delas avisaria
ninguém. Além disso, um aviso que depende do navegador se perde se a pessoa
fechar a aba na hora errada.

O `11-notificacoes-power-automate.sql` resolve isso pendurando um gatilho no
histórico da solicitação. Toda etapa passa por lá, sem exceção. O envio é
assíncrono (`pg_net`): o portal nunca fica esperando o Power Automate, e uma
falha lá **não derruba** a solicitação aqui — ela fica registrada para você
consultar depois.

## Passo 1 — criar o fluxo no Power Automate

1. **Criar → Fluxo de nuvem automatizado → pular** e escolha o gatilho
   **"Quando uma solicitação HTTP for recebida"**.
2. Em **Esquema JSON do corpo da solicitação**, clique em *Usar carga de exemplo
   para gerar o esquema* e cole isto:

```json
{
  "evento": "Atribuída ao Gestor",
  "etapa": "Aguardando preenchimento",
  "quando": "2026-08-19T22:22:13.296482+00:00",
  "observacao": "",
  "autor": { "nome": "Carla C&R", "email": "cr@marcopolo.com.br", "perfil": "CR" },
  "destinatarios": [
    { "nome": "Gil Gestor", "email": "gestor@marcopolo.com.br", "perfil": "GESTOR" }
  ],
  "solicitacao": {
    "id": "35ac6892-b80b-4fe0-8886-2663022d5c68",
    "numero": "DC-2026-B4C39BBB",
    "titulo": "Analista de Processos",
    "codigo_cargo": "",
    "tipo": "NEW",
    "empresa": "Marcopolo",
    "filial": "Ana Rech",
    "setor": "Qualidade",
    "justificativa": "Vaga nova aprovada no orçamento.",
    "prazo": "2026-08-26",
    "status": "Aguardando preenchimento",
    "progresso": 45,
    "criada_em": "2026-08-19T22:22:10.030787+00:00",
    "atualizada_em": "2026-08-19T22:22:13.296482+00:00",
    "gestor": { "nome": "Gil Gestor", "email": "gestor@marcopolo.com.br" },
    "criador": { "nome": "Carla C&R", "email": "cr@marcopolo.com.br" }
  },
  "portal": "https://o-endereco-do-seu-portal"
}
```

3. Salve o fluxo. O Power Automate gera a **URL HTTP POST** — copie.

## Passo 2 — apontar o portal para o fluxo

No Supabase → SQL Editor, como ADMIN:

```sql
select public.admin_configurar_notificacao(
  'COLE-AQUI-A-URL-DO-FLUXO',
  'um-segredo-qualquer',              -- vai no cabeçalho x-portal-segredo
  'https://o-endereco-do-seu-portal', -- aparece no e-mail como link
  true);
```

Depois dispare um teste, que chega no fluxo sem mexer em nenhuma solicitação:

```sql
select public.admin_testar_notificacao();
```

## Passo 3 — enviar o e-mail (ou o Teams)

Dentro do fluxo, depois do gatilho:

1. **Aplicar a cada** → escolha `destinatarios` do conteúdo dinâmico.
2. Dentro do laço, **Enviar um email (V2)** do Office 365 Outlook:
   - **Para**: `email` (do item atual do laço);
   - **Assunto**: `Descritivo @{body('...')?['solicitacao']?['numero']} — @{body('...')?['evento']}`
   - **Corpo**: use `titulo`, `empresa`, `filial`, `status`, `prazo`,
     `observacao` e o link de `portal`.

Para mandar por **Teams**, troque a ação por *Postar mensagem em um chat ou canal*
usando o mesmo `email` como destinatário.

### Mensagens diferentes por etapa

Se quiser um texto por etapa, use um **Switch** no campo `evento`. Os valores
possíveis são exatamente estes:

| `evento` | Quem recebe |
|---|---|
| `Pedido aberto pelo Gestor` | todos os C&R ativos |
| `Solicitação criada` | ninguém (é rascunho do próprio C&R) |
| `Criada a partir do pedido do Gestor` | ninguém (segue como rascunho de C&R) |
| `Atribuída ao Gestor` | o Gestor responsável |
| `Enviada para C&R` | quem abriu + o time de C&R |
| `Devolvida ao Gestor` | o Gestor responsável |
| `Enviada ao Gestor para conferência` | o Gestor responsável |
| `Enviada para validação adicional` | somente o aprovador escolhido |
| `Solicitação concluída` | Gestor e quem abriu |
| `Solicitação recusada` / `Solicitação cancelada` | Gestor e quem abriu |

O portal já resolve quem recebe: a lista vem pronta em `destinatarios`. Você não
precisa consultar nada no fluxo.

## Passo 4 — conferir o que saiu

```sql
select e.created_at, e.evento, e.destinatarios, e.erro,
       r.status_code, left(r.content, 200) as resposta
  from public.notificacao_envio e
  left join net._http_response r on r.id = e.net_request_id
 order by e.created_at desc limit 20;
```

`status_code` 200 ou 202 é o Power Automate aceitando a chamada. A coluna `erro`
só é preenchida quando nem deu para tentar (fluxo desligado, endereço em branco
ou etapa sem destinatário).

Para desligar sem apagar nada:

```sql
update public.notificacao_config set ativo = false;
```

## Proteger o fluxo

A URL do Power Automate já vem com uma assinatura, mas dá para conferir também o
segredo: no fluxo, adicione uma **Condição** logo no início comparando
`triggerOutputs()?['headers']?['x-portal-segredo']` com o valor que você
configurou, e encerre o fluxo se não bater.

## O que foi testado aqui

Rodando o portal de verdade contra um PostgreSQL real, com o Power Automate
substituído por um receptor local que grava o que chega:

- fluxo completo pelo navegador → `Atribuída ao Gestor` (gestor),
  `Enviada para C&R` (C&R), `Solicitação concluída` (os dois);
- Gestor abrindo um pedido → `Pedido aberto pelo Gestor` para o C&R;
- devolução, conferência opcional e recusa → destinatários corretos;
- validação adicional → **somente** o aprovador escolhido;
- solicitação em rascunho → nenhum e-mail, e o motivo registrado;
- fluxo desligado ou endereço em branco → nenhuma chamada, e o fluxo do portal
  segue normalmente.

O conteúdo do JSON acima é uma cópia real de um envio desses testes.
