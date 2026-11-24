# 0042 — Colunas como blocos arrastáveis

- Estado: aceito
- Data: 2026-11-23
- Complementa: [0008](0008-colunas-em-markdown.md)

## Contexto

O [ADR 0008](0008-colunas-em-markdown.md) definiu o formato das colunas: comentários
`<!-- sloth:columns -->`, `<!-- sloth:column -->` e `<!-- /sloth:columns -->` em volta de Markdown
comum. No modo Padrão, cada coluna era um editor de texto simples: mostrava a sintaxe Markdown sem
formatação, não tinha alças de bloco e só era criada pelo menu `/`. Os blocos da nota principal
podiam ser arrastados para dentro dos marcadores e deixar o layout inválido. Quem usa o app pediu
colunas como no Notion: cada coluna com blocos, e uma coluna nova criada ao arrastar um bloco para
o lado de outro.

## Decisão

- O formato do arquivo não muda.
- Para as alças, o layout de colunas inteiro é um único bloco da nota (`kind: 'columns'`). Ele se
  move, copia e exclui como um bloco, e nenhum outro bloco cai entre os seus marcadores.
- Cada coluna é um editor com a mesma formatação, o mesmo espaço entre blocos e as mesmas alças da
  nota. Esse editor não tem título (`embeddedDocument`). Todas as edições vão para o texto da nota
  em uma transação, para desfazer em um passo.
- Arrastar um bloco perto da borda direita ou esquerda de outro bloco cria um layout com os dois.
  Perto da borda de uma coluna, o bloco vira uma coluna nova ao lado dela.
- Ao arrastar o único bloco de uma coluna para fora, a coluna sai do layout. Quando resta uma
  coluna, o layout volta a ser blocos comuns. Backspace numa coluna vazia faz o mesmo.

## Alternativas

- Manter os editores simples e só melhorar os botões: não resolvia a falta de formatação nem a
  criação por arraste.
- Desenhar as colunas dentro do editor principal: o CodeMirror dispõe as linhas uma abaixo da
  outra e não aceita blocos lado a lado.
- Mudar o formato para HTML de layout: o [ADR 0008](0008-colunas-em-markdown.md) já descartou essa
  opção.

## Consequências

- Arrastes entre a nota e as colunas alteram os marcadores no arquivo: colunas vazias somem e um
  layout de uma coluna é desfeito.
- O menu `/`, a barra de formatação e os atalhos de bloco continuam só no editor principal. Dentro
  de uma coluna estão disponíveis as alças, Enter, Tab e as setas.
- Em telas de toque, as alças ficam ocultas, como na nota. Lá, as colunas são criadas pelo menu.
