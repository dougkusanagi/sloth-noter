# 0032 — Linha vazia entre blocos é só espaço no editor

- Status: Aceito
- Data: 2026-11-19

## Contexto

No Markdown, dois parágrafos precisam de uma linha vazia entre eles. No editor visual, essa linha
aparecia como uma linha de verdade: o cursor parava nela, a altura dela era diferente do espaço
em volta dos blocos de código e das tabelas, e um bloco escrito logo depois de outro, sem linha
vazia, ficava com outro espaço. O usuário pediu que cada Enter (sem Shift) crie um parágrafo e que
todos os blocos usem o mesmo espaço padrão, sem uma linha vazia visível.

Também havia um erro: o espaço em volta dos blocos de código era `margin` na linha. O CodeMirror
não mede margens no mapa de alturas, então as setas e a dica "Digite /" iam para o lugar errado.

## Decisão

- O arquivo continua em Markdown comum: Enter no fim de um parágrafo ou de um bloco de código
  grava `\n\n`; Shift+Enter grava uma quebra simples.
- No editor visual não existe linha entre dois blocos. A linha vazia que os separa (a primeira de
  uma sequência, e também a última quando a sequência tem 3 ou mais linhas) é trocada por um
  espaçador (`cm-block-gap`, `src/editor/block-gaps.js`) com a altura do espaço padrão
  (`--block-gap`). Ele não recebe o cursor: as setas pulam o intervalo (intervalo atômico), um
  clique nele leva ao bloco de baixo, e Backspace no início do bloco seguinte junta os dois. As
  outras linhas vazias são parágrafos vazios, com a altura de um parágrafo.
- Dois blocos de código ou tabelas colados, sem linha vazia, também recebem o espaçador.
- Um bloco colado a um código ou tabela, sem linha vazia, recebe o espaço como `padding`, nunca
  como `margin`.
- A última quebra de linha do arquivo não aparece até o cursor chegar nela.

## Alternativas

- Gravar só `\n` para cada Enter e tratar cada linha como parágrafo: o arquivo deixaria de ser
  lido da mesma forma por outros programas e pelo modo Leitura. Descartada.
- Deixar a linha vazia navegável com outra altura: o texto mudava de lugar ao mover o cursor.
- Esconder a linha e pôr o espaço como `padding` nos blocos vizinhos: o CodeMirror estima mal a
  altura das linhas fora da tela, e a rolagem salva de cada aba voltava até 44 px fora do lugar.
  O espaçador informa a altura estimada (`estimatedHeight`).

## Consequências

- O cursor não para mais entre dois blocos no modo Padrão; no modo Código, a linha vazia aparece.
- O espaço entre tabelas e o texto passou de 0,75em para o espaço padrão.
- O seletor `:has()` é usado para dar o espaço abaixo da linha antes de um bloco de código ou
  tabela.
