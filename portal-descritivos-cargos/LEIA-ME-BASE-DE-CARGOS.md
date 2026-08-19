# Base de cargos administrada pelo ADMIN

A aba **Base de cargos** (visível apenas para o perfil ADMIN) faz três coisas:

1. **Importar** a planilha oficial, mesmo quando os nomes das colunas mudam.
2. **Exportar** a base como ela está hoje, em planilha.
3. **Incluir, editar e desativar cargos direto no portal**, sem passar pela planilha.

---

## 1. Instalação (uma única vez)

1. Publique no Cloudflare os arquivos alterados: `index.html`, `styles.css` **e a pasta
   `vendor/`** (ela contém o leitor/gravador de planilhas usado pela tela — sem ela o
   navegador tenta um CDN externo, que a rede corporativa pode bloquear).
2. No Supabase, abra **SQL Editor** e execute o arquivo
   **`supabase-base-cargos-admin-v74.sql`** inteiro, uma única vez.

> O SQL é idempotente e cumulativo: substitui o v73 e pode ser executado de novo sem
> duplicar nada e sem apagar dados.

---

## 2. Importar a planilha

**Passo 1 — Escolher a planilha.** Arraste o `.xlsx` (ou `.xlsm` / `.csv`) para a área
indicada. O arquivo é lido **dentro do navegador**; nada sobe para o servidor antes da
sua confirmação no passo 4.

**Passo 2 — Aba e linha do cabeçalho.** O sistema escolhe sozinho a aba com mais colunas
reconhecidas e descobre em qual linha está o cabeçalho, mesmo com títulos ou linhas em
branco acima dele. Dá para trocar manualmente.

**Passo 3 — De onde vem cada informação.** Cada informação usada pelo portal aparece como
uma linha, com a coluna da planilha já selecionada:

* o reconhecimento ignora acentos, maiúsculas, espaços, underscores e a ordem das
  colunas — `COD_DO_CARGO`, `Código do Cargo` e `cod cargo` são a mesma coisa;
* cada linha mostra a confiança: *correspondência exata*, *reconhecida automaticamente*
  ou *confira esta coluna*;
* **se um nome mudar e não for reconhecido**, basta escolher a coluna certa na lista.
  Só **Código do cargo** e **Cargo** são obrigatórios;
* campos deixados como *— não importar —* **não são alterados** na base;
* o botão **Reconhecer novamente** refaz a detecção do zero.

**Passo 4 — Conferência e envio.** Totais, amostra do resultado e as opções:

| Opção | O que faz |
|---|---|
| **Substituir a base** | Grava tudo o que está na planilha e **desativa** (não apaga) os cargos que não vieram nela. |
| **Complementar a base** | Só inclui e atualiza. Nenhum cargo é desativado. |
| *Desativar somente cargos das empresas presentes no arquivo* | Protege empresas que não estão na planilha enviada. Marcado por padrão. |
| *Células em branco apagam o conteúdo atual* | **Desmarcado por padrão.** Assim, uma célula vazia mantém o que já existe na base. |
| *Preservar cargos cadastrados no portal* | **Marcado por padrão.** Cargos criados na tela (item 4 abaixo) não são desativados só por não estarem na planilha. |

O envio é feito em lotes, com barra de progresso. Se algo falhar no meio, a importação é
cancelada e **nada é gravado**.

O mapeamento confirmado fica salvo como **"Mapeamento padrão"** e é reaplicado na próxima
importação **casando pelo nome da coluna**, não pela posição.

---

## 3. Exportar a base vigente

Botão **Baixar planilha da base**, no topo da tela. Gera um `.xlsx` com a base como ela
está no momento, com uma opção para trazer **somente os cargos ativos**.

O arquivo sai no **mesmo layout do arquivo oficial** (`COD_EMPRESA`, `EMPRESA`,
`COD_DO_CARGO`, `CARGO`, `NOME_COMPLETO`, … `SKILL_30` … `SKILL_37`), acrescido de duas
colunas de leitura: `SITUACAO` (Ativo/Inativo) e `ORIGEM` (Planilha / Cadastro no portal).

Isso significa que o ciclo **exportar → ajustar no Excel → importar de volta** funciona
sem nenhum ajuste de mapeamento: o arquivo exportado é reconhecido com 100% das colunas.
Colunas do arquivo original que o portal não usa como campo próprio (`NOME`, `EMP_COD`,
`DT_ATIVACAO`, `DATA_REVISAO`, …) também voltam no arquivo, porque ficam guardadas junto
com cada cargo.

---

## 4. Incluir e editar cargos direto no portal

O card **Cargos cadastrados**, no fim da tela, tem pesquisa, paginação e um filtro de
inativos. Cada cargo mostra duas etiquetas: **Ativo/Inativo** e a origem
(**Veio da planilha** ou **Cadastrado no portal**).

* **+ Novo cargo na base** — abre o formulário completo (identificação, classificação,
  descritivo e os oito requisitos SKILL). Código do cargo e Cargo são obrigatórios.
* **Editar** — abre o mesmo formulário preenchido, para qualquer cargo.
* **Desativar / Reativar** — tira ou devolve o cargo à pesquisa de cargos vigentes.
* **Excluir** — disponível apenas para cargos criados no portal e sem nenhuma solicitação
  vinculada. Nos demais casos o sistema orienta a desativar.

**Ponto importante:** ao salvar um cargo pela tela, ele passa a ser marcado como
*Cadastrado no portal*. Com a opção *Preservar cargos cadastrados no portal* marcada
(padrão), a próxima importação **não** vai desativá-lo por ele não estar na planilha —
mas continua atualizando-o normalmente se o mesmo código aparecer no arquivo. É isso que
permite manter os dois caminhos ao mesmo tempo sem um atropelar o outro.

Não é permitido ter dois cargos com o mesmo código dentro da mesma empresa. O mesmo
código em empresas diferentes é permitido, porque é assim que a base real funciona.

---

## 5. Segurança e integridade

* Todas as funções verificam o perfil **no servidor**: só ADMIN importa, exporta ou
  edita. C&R e Gestor recebem erro mesmo chamando a função diretamente.
* **Nada é apagado por importação.** Cargos ausentes ficam `active = false` e somem da
  pesquisa; histórico e solicitações vinculadas continuam íntegros.
* A chave é **empresa + código do cargo**.
* Linhas sem código são ignoradas; cargo repetido na planilha usa a **última linha**.
* A linha original inteira fica guardada em `raw_data` — nenhuma coluna se perde.
* Cada importação entra no **Histórico** com autor, data, arquivo, aba, modo e resumo.

---

## 6. Segurança

### O que protege o sistema

**A regra que vale para qualquer aplicação web: o código que roda no navegador é
público.** Ctrl+U, as ferramentas de desenvolvedor, a aba de rede ou um simples
`curl` mostram o `index.html`, o `styles.css` e o `config.js` para qualquer pessoa
que abra o site. Não existe forma de impedir isso — bloquear Ctrl+U ou o botão
direito é contornado em segundos e não protege nada. Minificar embaralha a leitura,
mas o código continua todo lá.

Por isso a proteção **não depende de esconder o código**. Ela está no servidor:

* a chave do `config.js` é a *publicável* (`sb_publishable_`), feita para ficar
  exposta; nenhuma chave de servidor (`service_role`) vai no pacote;
* todas as 15 funções do banco são `security definer`, com `set search_path` fixo,
  e **conferem o perfil ADMIN no servidor**. As checagens da tela são só
  conveniência — quem chamar a função direto pela API recebe erro;
* a tabela `job_catalog` fica com RLS ligado e apenas uma policy de **leitura**:
  ninguém escreve nela pela API, só as funções. As tabelas de importação não têm
  policy nenhuma — nem leitura;
* todas as referências a tabelas dentro das funções são qualificadas com `public.`,
  o que impede o truque de sombrear uma tabela por `pg_temp`;
* a única consulta dinâmica (`admin_job_delete`) é parametrizada, sem concatenação.

Em outras palavras: mesmo lendo todo o código-fonte e conhecendo os nomes das
funções e tabelas, um Gestor não consegue importar, exportar, editar nem apagar
cargos.

### Injeção de código pela tela

Valor que veio da planilha ou digitado por outro usuário **nunca** é interpolado
cru dentro de um atributo. Isso importa porque escapar para HTML não basta em
atributos de evento: o navegador decodifica as entidades **antes** de o JavaScript
ser lido, então um `&#39;` volta a ser aspa e fecha a string.

* as ações da lista de cargos usam `data-attributes` lidos via `dataset`, com um
  listener delegado — sem `onclick` montado por concatenação;
* os demais botões do portal passam os valores por `jsq()`, que gera um literal de
  string JavaScript com `&`, `<`, `>`, `"`, `'` e `/` convertidos para `\uXXXX`;
* os atributos montados a partir da configuração de campos passam por `esc()`.

### Leitura da planilha

O leitor de planilhas roda dentro de uma proteção: se a análise do arquivo criar
qualquer propriedade em `Object.prototype` — o efeito das falhas do tipo
*prototype pollution* — as propriedades são removidas na hora, o arquivo é
recusado e nada dele chega à tela.

Ainda assim, **vale trocar o leitor pela versão corrigida antes de publicar.** O
`vendor/xlsx.mjs` está na 0.18.5, a última publicada no npm, que tem dois avisos em
aberto: *prototype pollution*
([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
corrigido na 0.19.3) e *ReDoS*
([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9),
corrigido na 0.20.2). As versões corrigidas saíram do npm e só existem no CDN do
SheetJS. O código funciona igual com a versão nova — é só trocar o arquivo:

```
curl -o vendor/xlsx.mjs https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs
```

### Conferência ao rodar o SQL

A última consulta do arquivo SQL mostra o estado de RLS de cada tabela. O esperado é:

| tabela | rls_ligado | policies |
|---|---|---|
| `job_catalog` | t | 1 (só leitura) |
| `job_import_runs` / `job_import_stage` / `job_import_profiles` | t | 0 |

Se a tabela `profiles` aparecer com `rls_ligado = f`, vale revisar — ela guarda os
cadastros de acesso e não faz parte desta entrega.

---

## 7. Arquivos desta versão

| Arquivo | O que mudou |
|---|---|
| `index.html` | Aba **Base de cargos**: importação, exportação e cadastro de cargos. |
| `styles.css` | Estilos da nova tela. |
| `supabase-base-cargos-admin-v74.sql` | **Rodar uma vez.** Estrutura e funções de importação, exportação e cadastro. Cumulativo — substitui o v73. |
| `vendor/xlsx.mjs` | Leitor/gravador de planilhas (SheetJS, licença Apache 2.0), carregado só quando o ADMIN abre a tela. Veja o item 6 sobre atualizar este arquivo. |
| `LEIA-ME-BASE-DE-CARGOS.md` | Este documento. |

Nenhum arquivo existente foi removido e o fluxo de solicitações não foi alterado.
