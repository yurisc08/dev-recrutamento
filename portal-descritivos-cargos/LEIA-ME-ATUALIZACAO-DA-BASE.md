# Atualização da base de cargos pelo ADMIN

A partir desta versão o ADMIN atualiza a planilha de cargos direto no portal,
pela nova aba **Base de cargos**. Não é mais preciso rodar SQL a cada troca de arquivo,
e a tela continua funcionando mesmo quando os **nomes das colunas mudam**.

---

## 1. Instalação (uma única vez)

1. Publique no Cloudflare os arquivos alterados: `index.html`, `styles.css` **e a pasta
   `vendor/`** (ela contém o leitor de planilhas usado pela tela — sem ela a leitura do
   arquivo tenta um CDN externo e pode ser bloqueada pela rede corporativa).
2. No Supabase, abra **SQL Editor** e execute o arquivo
   **`supabase-base-cargos-admin-v73.sql`** inteiro, uma única vez.

Pronto. A aba **Base de cargos** passa a aparecer no menu apenas para o perfil ADMIN.

> O SQL é idempotente: se for executado de novo, não duplica nada e não apaga dados.

---

## 2. Como atualizar a planilha no dia a dia

**Passo 1 — Escolher a planilha.** Arraste o `.xlsx` (ou `.xlsm` / `.csv`) para a área
indicada. O arquivo é lido **dentro do navegador**; nada sobe para o servidor antes da
sua confirmação no passo 4.

**Passo 2 — Aba e linha do cabeçalho.** O sistema escolhe sozinho a aba com mais colunas
reconhecidas e descobre em qual linha está o cabeçalho (mesmo que existam títulos ou
linhas em branco acima dele). Se precisar, troque a aba ou a linha manualmente.

**Passo 3 — De onde vem cada informação.** Aqui está o ponto principal:

* cada informação usada pelo portal aparece como uma linha, com a coluna da planilha
  correspondente já selecionada;
* o reconhecimento ignora acentos, maiúsculas, espaços, underscores e a ordem das
  colunas — `COD_DO_CARGO`, `Código do Cargo` e `cod cargo` são tratados como a mesma coisa;
* cada linha mostra uma etiqueta indicando a confiança: *correspondência exata*,
  *reconhecida automaticamente* ou *confira esta coluna*;
* **se o nome de uma coluna mudar e o sistema não reconhecer**, basta abrir a lista e
  escolher a coluna certa. Só **Código do cargo** e **Cargo** são obrigatórios;
* campos deixados como *— não importar —* **não são alterados**: o conteúdo que já está
  na base é preservado;
* o botão **Reconhecer novamente** refaz a detecção automática do zero.

**Passo 4 — Conferência e envio.** Você vê os totais (linhas válidas, linhas sem código,
códigos repetidos) e uma amostra do resultado já mapeado. Escolha então:

| Opção | O que faz |
|---|---|
| **Substituir a base** | Grava tudo o que está na planilha e **desativa** (não apaga) os cargos que não vieram nela. |
| **Complementar a base** | Só inclui e atualiza. Nenhum cargo é desativado. |
| *Desativar somente cargos das empresas presentes no arquivo* | Protege as empresas que não estão na planilha enviada. Marcado por padrão. |
| *Células em branco apagam o conteúdo atual* | **Desmarcado por padrão.** Desmarcado, uma célula vazia mantém o que já existe na base. |

O envio é feito em lotes, com barra de progresso. Se algo falhar no meio do caminho,
a importação é cancelada e **nada é gravado** na base.

---

## 3. O mapeamento fica salvo

Depois de uma importação concluída, o mapeamento confirmado é gravado como
**"Mapeamento padrão"**. Na próxima vez, ele é reaplicado automaticamente
**casando pelo nome da coluna** — ou seja, funciona mesmo que as colunas mudem de
posição na planilha. As colunas que não estiverem no mapeamento salvo continuam sendo
detectadas automaticamente.

---

## 4. Regras de segurança e de dados

* Todas as funções verificam o perfil no servidor: **só ADMIN importa**. C&R e Gestor
  recebem erro mesmo que chamem a função diretamente.
* **Nada é apagado.** Cargos ausentes na planilha ficam com `active = false` e somem
  da pesquisa, mas o histórico e as solicitações vinculadas continuam íntegros.
* A chave usada é **empresa + código do cargo**. O mesmo código de cargo em empresas
  diferentes é tratado como cargos distintos (é o caso real da base atual).
* Linhas sem código de cargo são ignoradas; quando o mesmo cargo aparece duas vezes,
  vale a **última linha** da planilha.
* A linha original inteira é guardada em `raw_data`, então nenhuma coluna se perde,
  mesmo as que não têm campo próprio no portal.
* Cada atualização entra no **Histórico** da tela, com autor, data, arquivo, aba, modo
  e o resumo (incluídos / atualizados / desativados / ignorados).

---

## 5. Arquivos alterados nesta versão

| Arquivo | O que mudou |
|---|---|
| `index.html` | Nova aba **Base de cargos** (menu, tela e todo o assistente de importação). |
| `styles.css` | Estilos da nova tela. |
| `vendor/xlsx.mjs` | **Novo.** Leitor de planilhas (SheetJS, licença Apache 2.0) usado no navegador. Carregado só quando o ADMIN abre a tela. |
| `supabase-base-cargos-admin-v73.sql` | **Novo.** Estrutura e funções da importação. Rodar uma vez. |
| `LEIA-ME-ATUALIZACAO-DA-BASE.md` | **Novo.** Este documento. |

Nenhum arquivo existente foi removido e o fluxo de solicitações não foi alterado.
