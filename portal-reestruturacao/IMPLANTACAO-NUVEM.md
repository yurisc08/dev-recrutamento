# Publicar o portal para os gestores (sem servidor interno)

Guia para o caso em que **não há servidor da empresa disponível** e o portal precisa ficar acessível
aos gestores por um endereço na internet. Todo o processo é feito **pelo navegador** — nada é instalado
na sua máquina.

---

## Antes de tudo: o que isso significa

Hospedar fora tira a base do perímetro da empresa. Isso não é proibido nem inseguro por natureza —
folha, ponto e ERP em nuvem são comuns — mas **é uma decisão que não cabe a uma pessoa sozinha**.
Leve ao RH e à TI/Segurança antes de subir dado real:

- quem é o responsável pelo tratamento e quem é o operador (o provedor);
- onde ficam os servidores (prefira região no Brasil);
- por quanto tempo os dados ficam lá e quem apaga no fim;
- contrato/termo com o provedor cobrindo dados pessoais (LGPD).

**Enquanto a aprovação não sai:** suba com os **dados fictícios** que acompanham o projeto. Você mostra
o portal funcionando para RH, diretoria e TI sem expor uma única informação real.

### O que o portal já faz para reduzir o risco

| Controle | Como funciona |
|---|---|
| **Acesso só pela rede da empresa** | `IPS_PERMITIDOS` com as faixas de IP da empresa/VPN — fora delas o portal responde 403, mesmo quem souber o endereço |
| HTTPS | o provedor publica só em HTTPS; `COOKIE_SECURE=true` impede o cookie de sessão sair em claro |
| Senhas | scrypt com sal por usuário; nunca em texto puro; troca obrigatória no primeiro acesso |
| Sessão | cookie `HttpOnly` + `SameSite=Strict`, expiração configurável |
| Força bruta | bloqueio temporário por tentativas, com registro de IP |
| Permissão | gestor só a Divisão dele, diretor só a Diretoria — validado no servidor, em toda consulta |
| Auditoria | tabela só de inserção: login, decisão (de → para), importação, exportação, permissões |
| Dado mínimo | colunas sensíveis (CPF, por exemplo) podem ficar **fora da carga**: basta não mapeá-las na importação |

> Recomendação prática: **não importe CPF nem data de nascimento**. O processo de decisão não precisa
> deles, e o que não sobe não vaza.

---

## Opção A — Render (mais simples, tudo no navegador)

O repositório já traz `render.yaml`: o Render lê esse arquivo e cria sozinho o banco PostgreSQL e o
serviço web.

1. **Crie a conta** em render.com e conecte sua conta do GitHub (o repositório pode ser privado).
2. No painel: **New → Blueprint**.
3. Escolha o repositório `dev-recrutamento` e a branch `claude/restructuring-decision-portal-ko8yy7`.
   O Render mostra o que vai criar: **portal-decisoes** (serviço web) e **portal-banco** (PostgreSQL).
4. Preencha as variáveis que ele pedir:
   - `IPS_PERMITIDOS` — as faixas de IP da empresa/VPN, separadas por vírgula.
     Ex.: `200.150.10.0/24, 187.44.7.9`. Peça as faixas para a TI. Deixe em branco **apenas**
     enquanto estiver com dados fictícios.
   - `ADMIN_NOME` — seu nome.
   - `ADMIN_SENHA` — senha provisória do administrador (mín. 10 caracteres, com letras e números).
     Você troca no primeiro acesso.
5. **Apply / Create**. A primeira construção leva alguns minutos.
6. Abra o endereço que o Render mostra (algo como `https://portal-decisoes.onrender.com`) e entre com
   `rh.admin` e a senha provisória.

### Depois de entrar

1. **Configurações → Processo**: confirme nome, data-base (31/07/2026) e prazo (11/09/2026).
2. **Importar Excel**: carregue a planilha. As Diretorias e Divisões são criadas a partir dela.
   Na tela de conferência, **deixe sem mapeamento as colunas que não devem subir** (CPF, por exemplo).
3. **Configurações → Usuários**: crie os gestores (perfil Gestor) e diretores (perfil Diretor) e defina
   a abrangência de cada um — Divisões para gestor, Diretorias para diretor. O portal gera a senha
   provisória de cada um.
4. Envie para cada gestor: o **endereço do portal**, o **usuário** e a **senha provisória**
   (de preferência a senha por outro canal). Peça que troquem no primeiro acesso.
5. Acompanhe pelo **Dashboard** (pendências por gestor) e cobre quem estiver atrasado.

> Se um gestor disser que "não abre": confirme se ele está na rede da empresa ou na VPN. É a trava
> de IP funcionando.

---

## Opção B — Supabase como banco (se a empresa já usa)

O Supabase é, para o portal, **apenas um PostgreSQL gerenciado** — nenhuma linha de código muda.

1. Crie o projeto no Supabase (região Brasil, se disponível) e guarde a senha do banco.
2. Em **Project settings → Database → Connection string (URI)**, copie a string.
3. No serviço web (Render, Railway ou outro), configure:
   - `DATABASE_URL` = a string copiada;
   - `DB_SSL` = `true` (o Supabase exige TLS).
4. O resto é igual: o esquema é criado na primeira subida.

Nesse arranjo você tem dois fornecedores (quem roda o site e quem guarda os dados) — ambos precisam
entrar na avaliação da TI.

---

## Opção C — Cloudflare

Cloudflare **não roda este portal sozinho** (ele precisa de Node + PostgreSQL), mas ajuda de dois jeitos:

- **Na frente do portal hospedado**: DNS + proxy, com WAF e Cloudflare Access exigindo login corporativo
  antes mesmo de chegar à tela do portal. É uma camada a mais sobre a trava de IP.
- **Cloudflare Tunnel**: se um dia a TI liberar um servidor interno, o Tunnel publica o portal
  **sem abrir porta no firewall e sem os dados saírem da empresa** — é a melhor combinação de
  acesso externo com dado interno. Se essa opção existir, prefira-a a qualquer hospedagem.

---

## Custos

Os três provedores têm plano gratuito com limites (o serviço "dorme" quando fica ocioso, e o banco
gratuito costuma ter prazo de validade) e planos pagos de baixo custo para uso pequeno. Para um
processo com prazo definido, o gasto é de poucos dólares por mês — confirme os valores atuais no
site do provedor antes de decidir.

---

## Checklist antes de subir a base real

- [ ] RH e TI/Segurança aprovaram a hospedagem externa, por escrito.
- [ ] `IPS_PERMITIDOS` preenchido com as faixas da empresa/VPN e testado (de fora deve dar 403).
- [ ] `COOKIE_SECURE=true` e o endereço abrindo em HTTPS.
- [ ] CPF, data de nascimento e outras colunas desnecessárias **não** mapeadas na importação.
- [ ] Senhas provisórias entregues por canal seguro; todos trocaram no primeiro acesso.
- [ ] Backup do banco configurado no provedor.
- [ ] Combinado quem apaga os dados e quando, ao fim do processo.

## Ao encerrar o processo

1. **Exportar Excel** com tudo (base + decisões + auditoria) e guardar onde o RH determinar.
2. Desativar os usuários em **Configurações → Usuários**.
3. Excluir o serviço e o banco no provedor — isso apaga os dados de lá.
4. Registrar a exclusão para a TI/Compliance.
