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

## 6. Arquivos desta versão

| Arquivo | O que mudou |
|---|---|
| `index.html` | Aba **Base de cargos**: importação, exportação e cadastro de cargos. |
| `styles.css` | Estilos da nova tela. |
| `supabase-base-cargos-admin-v74.sql` | **Rodar uma vez.** Estrutura e funções de importação, exportação e cadastro. Cumulativo — substitui o v73. |
| `vendor/xlsx.mjs` | Leitor/gravador de planilhas (SheetJS, licença Apache 2.0), carregado só quando o ADMIN abre a tela. |
| `LEIA-ME-BASE-DE-CARGOS.md` | Este documento. |

Nenhum arquivo existente foi removido e o fluxo de solicitações não foi alterado.
