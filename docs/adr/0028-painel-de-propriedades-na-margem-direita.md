# 0028 — Painel de propriedades na margem direita

- Estado: substituído por 0030
- Data: 2026-11-17

## Contexto

O [ADR 0027](0027-propriedades-yaml-e-variaveis.md) fixou o formato: o bloco YAML fica no começo do
arquivo, antes do título, para que outros programas o leiam. Na primeira entrega ele aparecia como
uma caixa de texto cru acima do título. A pessoa propôs mostrar as propriedades na lateral direita
do documento, onde há espaço livre em janelas largas, em vez de colocá-las abaixo do título.

## Decisão

- O formato do arquivo não muda: o YAML continua antes do título.
- No modo Padrão e na Leitura, as linhas do YAML ficam ocultas (sem altura e sem cursor) quando o
  bloco é legível, e um painel "Propriedades" as mostra e edita.
- **Janela larga:** o painel fica fixo na margem à direita do texto, que rola com a nota. Usa-se a
  margem quando sobram pelo menos 280 px de cada lado do texto (largura do painel mais folgas). Com
  largura de texto "total" nunca sobra espaço.
- **Janela estreita:** o painel vira uma seção recolhível, "Propriedades (N)", acima da nota.
- O painel só existe quando a nota já tem um bloco; "Inserir propriedades (YAML)" cria o primeiro.
- Cada propriedade tem nome, tipo (texto, número, sim/não, data, lista) e valor editáveis. Mudar de
  tipo só converte quando não há perda; senão, avisa. Valores com estrutura que o painel não edita
  (mapas, listas de objetos) ficam só para leitura. Renomear ou remover uma propriedade usada por
  `{{user.nome}}` pede confirmação e informa quantas variáveis são afetadas; o texto da nota não é
  reescrito.
- Cada edição regrava só o bloco, preservando comentários e a ordem (`src/frontmatter.js`).
  O YAML ilegível (erro, chave repetida, alias, grande demais) não é ocultado: o painel mostra o
  erro e a linha, e o texto continua editável nele.
- Na Leitura o painel é somente leitura.
- Fora do escopo desta entrega: o celular (continua com o bloco como texto editável) e o painel
  lateral de leitura de uma segunda nota.

## Alternativas

- YAML abaixo do título no arquivo: quebraria a leitura por Obsidian, Jekyll, Hugo e Pandoc.
- Painel sempre acima do texto: ocupa altura e empurra o título; descartado para janelas largas.
- Esconder o YAML sem painel: a pessoa perderia o acesso às propriedades no modo Padrão.

## Consequências

- Ctrl+A e a seleção no modo Padrão não incluem o bloco oculto (como já ocorre com o `# ` do título).
- Uma nota com YAML legível mostra as propriedades só no painel; o modo Código mostra o texto.
- Com a janela estreita, o painel não aparece na lateral, mesmo com espaço de sobra na barra
  lateral fechada, porque a medida usa a largura do painel de edição.
