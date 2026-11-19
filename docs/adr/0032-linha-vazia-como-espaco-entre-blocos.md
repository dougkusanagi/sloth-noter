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
- No editor visual, a primeira linha vazia de uma sequência (e a última, quando a sequência tem 3
  ou mais linhas) é o separador (`cm-md-gap`). Ela tem a altura do espaço padrão (`--block-gap`) e
  é um intervalo atômico: as setas e o clique pulam ela, e Backspace no início do bloco seguinte
  apaga o separador e junta os dois blocos. As outras linhas vazias são parágrafos vazios, com a
  altura de um parágrafo.
- Blocos sem linha vazia entre eles recebem o mesmo espaço como `padding`, nunca como `margin`.

## Alternativas

- Gravar só `\n` para cada Enter e tratar cada linha como parágrafo: o arquivo deixaria de ser
  lido da mesma forma por outros programas e pelo modo Leitura. Descartada.
- Deixar a linha vazia navegável com outra altura: o texto mudava de lugar ao mover o cursor.

## Consequências

- O cursor não para mais na linha que separa dois blocos no modo Padrão; no modo Código, sim.
- O espaço entre tabelas e o texto passou de 0,75em para o espaço padrão.
- O seletor `:has()` é usado para dar o espaço abaixo da linha antes de um bloco de código ou
  tabela.
