# 0030 — Propriedades acima da nota, no estilo Obsidian

- Estado: aceito
- Data: 2026-11-17
- Substitui: 0028

## Contexto

O ADR 0028 punha o painel de propriedades na margem direita em janelas largas e numa seção recolhível acima da nota nas estreitas. Eram dois layouts para manter, e o painel lateral, com nome, seletor de tipo e campo em linhas separadas, ficava pesado. A pessoa pediu um componente mais limpo e parecido com o Obsidian.

## Decisão

- Um só layout em todas as larguras: as propriedades ficam acima do título, alinhadas ao texto, sob o cabeçalho "Propriedades", que recolhe as linhas.
- Cada propriedade é uma linha: ícone do tipo, nome e valor, sem bordas até receber foco.
- O ícone do tipo abre um menu com os tipos (texto, número, sim/não, data, lista) e "Remover".
- "Adicionar propriedade" abre uma linha para o nome; a propriedade nasce como texto vazio e o tipo muda depois pelo ícone.
- Continua igual ao ADR 0028: o formato do arquivo, as linhas YAML ocultas quando o bloco é legível, as conversões sem perda, os avisos ao renomear ou remover propriedades usadas em variáveis e a exibição do erro do YAML ilegível.

## Consequências

- O cabeçalho ocupa altura acima da nota mesmo em janelas largas; recolhê-lo reduz isso a uma linha.
- A escolha de recolher não é guardada: cada nota abre com as propriedades visíveis.
