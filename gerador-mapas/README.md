# Gerador de Mapas de Carreira

Ferramenta para gerar mapas de carreira e descritivos de cargo em Word e PDF a
partir da base oficial de cargos. Todo o processamento acontece no navegador —
nenhum dado sai do computador de quem usa.

Existem três formas de uso, geradas do mesmo código-fonte:

| Uso | Comando | O que é |
| --- | --- | --- |
| **Uma pessoa** | `python3 build.py` | `Gerador_Mapas_Carreira.html` — abre com duplo clique. Sem servidor, sem Python, sem internet. |
| **Equipe, na rede** | `python3 servidor.py --rede` | Sobe um endereço `http://ip-da-maquina:8080` para os colegas. No Windows, `Iniciar-servidor-rede.bat`. |
| **Servidor permanente** | `python3 build_web.py` | Gera a pasta `web/` para publicar em IIS, nginx, Netlify etc. |

Para hospedar, veja **[HOSPEDAGEM.md](HOSPEDAGEM.md)** — inclui a decisão de
publicar ou não a base de cargos junto.

## Modelos Word

A ferramenta trabalha com **quantos modelos forem necessários**. Na tela *Modelos
Word* dá para adicionar um arquivo `.docx`, dar um nome a ele e definir **quando ele
deve ser usado**:

| Regra | Usa este modelo quando |
| --- | --- |
| **Quando uma coluna tiver certo valor** | Ex.: `TCLC_DESC` for igual a `OPERACIONAL` |
| **Trilha JR/PL/SR completa** | O cargo tem os três níveis preenchidos |
| **Qualquer cargo** | Sobra — deixe por último |
| **Somente manual** | Nunca é escolhido sozinho |

Ao gerar, cada cargo usa o **primeiro modelo cuja regra combinar** — por isso a ordem
importa, e há setas para reordenar. Cada cartão mostra quantos cargos da base cairiam
naquele modelo, o que permite conferir a regra antes de gerar qualquer documento.

Ao adicionar um modelo, a estrutura é lida na hora e os campos `«CAMPO»` já vêm
mapeados automaticamente quando a coluna correspondente existe na planilha.

## Enviar a ferramenta pronta

Na tela *Salvar e distribuir*, o botão **Gerar ferramenta** cria um novo arquivo HTML
já com os modelos, o mapeamento e as regras configurados. Quem receber apenas abre e
usa — não precisa configurar nada, nem ter Python.

- **Com a base** — arquivo maior, funciona sozinho.
- **Sem a base** — arquivo leve; quem abrir seleciona a planilha no próprio
  computador. Indicado quando o arquivo circula por e-mail ou fora da rede interna.

A cópia gerada também consegue gerar outras cópias, então a configuração pode ser
repassada adiante sem voltar ao código.

## O que mudou em relação à versão anterior

A ligação entre as colunas da planilha e as células dos modelos Word era feita por
índices fixos dentro do código (`patchF` / `patchS`). Qualquer ajuste no documento
exigia alterar o código.

Agora essa ligação é um **mapeamento editável na própria ferramenta**. Quem usa
consegue definir de onde vem o conteúdo de cada campo sem depender de
desenvolvimento.

Outras mudanças:

- Número de modelos deixou de ser fixo em dois: agora são quantos forem necessários,
  cada um com sua regra de uso.
- A ferramenta configurada pode ser exportada como um novo arquivo HTML pronto para uso.
- Console corporativo com seis telas (Painel, Base, Modelos, Mapeamento, Geração e
  Salvar e distribuir).
- Leitura automática da estrutura do `.docx`: tabelas, células e campos de mesclagem.
- Sugestão automática de mapeamento a partir dos campos `«CAMPO»` do documento e dos
  rótulos das colunas (Júnior / Pleno / Sênior).
- Validação que aponta campos sem origem, colunas inexistentes e colunas vazias.
- Perfis de mapeamento salvos no navegador, exportáveis e importáveis em `.json`.
- Datas em formato brasileiro: a base guarda `45474`, o documento passa a mostrar `01/07/2024`.
- PDF gerado a partir da estrutura real do modelo, e não de um leiaute fixo — trocar o
  modelo Word passa a refletir também no PDF.
- Aba, prefixos de códigos ignorados e colunas alternativas configuráveis pela interface.

## A tela de Mapeamento

Cada quadro reproduz uma tabela do arquivo Word. Clicando em qualquer célula é
possível definir a origem do conteúdo:

| Origem | Efeito |
| --- | --- |
| **Coluna** | Preenche com uma coluna da planilha |
| **Texto fixo** | Grava sempre o mesmo texto |
| **Em branco** | Limpa a célula |
| **Manter** | Preserva o que está escrito no modelo Word |

Há ainda o **nível da trilha**: escolhendo *Pleno* em uma célula ligada a
`SKILL_30`, a ferramenta passa a usar `SKILL_30_PL`.

Complementos disponíveis por célula: formato do valor (texto, data, maiúsculas,
primeira maiúscula), colunas alternativas para quando a principal está vazia e
pré-visualização com um cargo real.

### Ao trocar um modelo Word

O mapeamento é reaproveitado automaticamente: primeiro pela posição da célula e,
quando o documento muda de estrutura, pela assinatura de contexto (título da tabela +
rótulos + nome do campo). O que não for reconhecido aparece como pendência na tela
de Mapeamento e no Painel.

## Estrutura do projeto

```
gerador-mapas/
├── Gerador_Mapas_Carreira.html   arquivo único, pronto para distribuir
├── build.py                      monta o arquivo único
├── build_web.py                  monta a pasta web/ (não versionada)
├── servidor.py                   servidor local, só biblioteca padrão
├── Iniciar-servidor.bat          atalho Windows — só esta máquina
├── Iniciar-servidor-rede.bat     atalho Windows — libera na rede
├── iniciar-servidor.sh           atalho Linux e macOS
├── HOSPEDAGEM.md                 guia de publicação
├── src/                          código-fonte compartilhado pelos formatos
│   ├── styles.css
│   ├── body.html
│   └── app.js
└── assets/
    ├── base.xlsx                 base oficial de cargos
    ├── template-carreira.docx    modelo JR/PL/SR
    ├── template-individual.docx  modelo de cargo individual
    ├── logo.png
    └── jszip.min.js
```

### Regerar

Depois de alterar qualquer fonte em `src/` ou trocar um arquivo em `assets/`:

```bash
python3 build.py        # arquivo único
python3 build_web.py    # versão web
```

Rode os dois para manter os formatos iguais. Para atualizar a base ou os modelos
padrão, substitua o arquivo correspondente em `assets/` mantendo o mesmo nome.

A diferença entre os builds está apenas em `window.GMC`, o descritor que diz se
os assets vêm embutidos em base64 ou são baixados por URL. O `app.js` é o mesmo.

O arquivo gerado carrega também uma cópia do próprio esqueleto (HTML + CSS + JS, sem
os dados, cerca de 200 KB). É isso que permite à ferramenta gerar novas cópias já
configuradas pelo navegador. Como a cópia embutida mantém os marcadores intactos, a
ferramenta gerada também consegue se regerar — verificado: a segunda geração sai
byte a byte igual à primeira.

## Observações sobre os dados

- A base traz 5.448 linhas, das quais **3.550** têm conteúdo.
- O filtro de prefixos (`20` a `24`) não remove nenhum registro nesta base, mas
  continua disponível e configurável na tela Base de dados.
- `DATA_REVISAO` está vazia em todos os registros — a validação sinaliza isso.
- No modelo de carreira, a célula que aparece como `«SKILL_37»` tem, internamente,
  um código de campo `MERGEFIELD SKILL_35`. A ferramenta usa o texto visível, que é o
  que corresponde às competências comportamentais. Vale corrigir o campo no Word em
  alguma revisão futura.
