# Gerador de Mapas de Carreira

Ferramenta em **um único arquivo HTML** para gerar mapas de carreira e descritivos
de cargo em Word e PDF a partir da base oficial de cargos.

O arquivo pronto para uso é **`Gerador_Mapas_Carreira.html`**: basta abrir com duplo
clique. Não precisa de servidor, instalação ou internet — a planilha, os dois modelos
Word e todas as bibliotecas estão embutidos no próprio arquivo, e todo o
processamento acontece no navegador.

## O que mudou em relação à versão anterior

A ligação entre as colunas da planilha e as células dos modelos Word era feita por
índices fixos dentro do código (`patchF` / `patchS`). Qualquer ajuste no documento
exigia alterar o código.

Agora essa ligação é um **mapeamento editável na própria ferramenta**. Quem usa
consegue definir de onde vem o conteúdo de cada campo sem depender de
desenvolvimento.

Outras mudanças:

- Console corporativo com seis telas (Painel, Base, Modelos, Mapeamento, Geração e Perfis).
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

Para o modelo de carreira há ainda o **nível da trilha**: escolhendo *Pleno* em uma
célula ligada a `SKILL_30`, a ferramenta passa a usar `SKILL_30_PL`.

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
├── Gerador_Mapas_Carreira.html   arquivo final — é este que se distribui
├── build.py                      monta o arquivo final
├── src/
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

### Regerar o arquivo

Depois de alterar qualquer fonte em `src/` ou trocar um arquivo em `assets/`:

```bash
python3 build.py
```

Para atualizar a base ou os modelos padrão, substitua o arquivo correspondente em
`assets/` mantendo o mesmo nome e rode o build novamente.

## Observações sobre os dados

- A base traz 5.448 linhas, das quais **3.550** têm conteúdo.
- O filtro de prefixos (`20` a `24`) não remove nenhum registro nesta base, mas
  continua disponível e configurável na tela Base de dados.
- `DATA_REVISAO` está vazia em todos os registros — a validação sinaliza isso.
- No modelo de carreira, a célula que aparece como `«SKILL_37»` tem, internamente,
  um código de campo `MERGEFIELD SKILL_35`. A ferramenta usa o texto visível, que é o
  que corresponde às competências comportamentais. Vale corrigir o campo no Word em
  alguma revisão futura.
