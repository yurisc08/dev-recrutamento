# Portal de Decisões — versão offline (arquivo único)

Para quem **não pode instalar nada** na máquina: um único arquivo `.html` que abre com dois cliques,
lê a planilha, guarda as decisões e devolve o Excel. Sem servidor, sem internet, sem instalação.

## Como usar

1. Salve `portal-decisoes-offline.html` numa pasta (rede ou máquina local).
2. Dê dois cliques — abre no Chrome ou no Edge, como qualquer página.
3. Escreva seu nome no campo do topo (é o que aparece na auditoria).
4. Aba **Início** → carregue a planilha `.xlsx`.
5. Confira o mapeamento das colunas (matrícula, nome, divisão, estabilidade, salário...).
6. Aba **Decisões** → marque a ação direto na linha; ações que exigem justificativa ou destino
   destacam a linha até o campo ser preenchido.
7. Aba **Início** → **Exportar Excel** (abas “1. Resumo”, “2. Base Decisões” e “3. Auditoria”)
   ou **Salvar trabalho (.json)** para continuar depois.

## O que ele faz

- Lê `.xlsx` inteiro (todas as colunas preservadas) sem enviar o arquivo para lugar nenhum.
- Decisão marcada na própria linha, com as mesmas regras da versão servidor:
  justificativa obrigatória por ação, destino obrigatório em transferência,
  alerta de estabilidade/afastamento/desligado na posição-base.
- Aplicação em lote para os selecionados, com lista das pendências que exigem tratamento individual.
- Resumo com indicadores, distribuição por ação e andamento por Diretoria/Divisão.
- Auditoria de cada alteração (autor, campo, de → para), exportada junto na planilha.
- Tema claro/escuro, funciona em tela de celular.

## O que ele NÃO faz (e por que a versão servidor existe)

- **Não tem login nem controle de acesso.** Quem abrir o arquivo de trabalho vê tudo o que estiver nele.
- **Não centraliza**: cada pessoa trabalha no seu arquivo; consolidar exige trocar `.json`/`.xlsx`.
- **A auditoria é local** — fica dentro do arquivo de trabalho, não num banco que ninguém apaga.

Para gestor ver só a própria Divisão, diretor só a sua Diretoria e auditoria central,
use a versão instalada no servidor (pasta `portal-reestruturacao/`).

## Requisitos e cuidados

- Chrome ou Edge atualizados (Firefox e Safari recentes também funcionam).
- Os dados ficam no navegador daquela máquina e daquele perfil de usuário:
  limpar dados de navegação apaga. **Exporte o `.json` ao terminar cada sessão.**
- Guarde o arquivo e os `.json` em pasta com acesso restrito, como faria com a planilha.
