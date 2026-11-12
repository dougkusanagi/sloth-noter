# 0015 — Cores de blocos e trechos no Markdown

Status: Aceito

## Contexto

As notas permanecem arquivos Markdown. Tabelas já guardam propriedades adicionais em comentários `sloth:table`. A interface agora permite colorir blocos e trechos sem converter as notas para um formato rico próprio.

## Decisão

Blocos usam um comentário `<!-- sloth:block color=blue background=yellow -->`, seguido de uma linha vazia e do bloco. O editor reconhece esse comentário como parte do bloco ao mover e converter o conteúdo. As cores de células continuam no comentário da tabela, com a mesma paleta de fundos.

Trechos usam elementos `span` com `style` limitado a `color` e `background-color`, em hexadecimal. O editor esconde os delimitadores no modo visual e mantém o texto editável. Alterar ou remover uma cor preserva a outra propriedade e os trechos adjacentes. Cores literais em código não são interpretadas como formatação.

## Alternativas

- Converter o documento inteiro para XML ou JSON: mudaria o formato das notas existentes.
- Guardar cores apenas nas preferências: perderia a formatação ao mover o arquivo.
- Usar HTML para envolver blocos inteiros: prejudicaria a interpretação de listas, títulos e código pelo parser Markdown.

## Consequências

As cores acompanham o arquivo e aparecem nos modos visual e leitura do Sloth Note. O modo Código mostra os metadados. Outros leitores podem ignorar os comentários de bloco e podem remover estilos HTML; a reprodução das cores fora do aplicativo depende do leitor. A largura é uma preferência de visualização, não uma propriedade do arquivo.
