# 0008. Layout de colunas em notas Markdown

- Status: Aceito
- Data: 2026-11-04

## Contexto

O editor precisa apresentar trechos de uma nota em colunas, permitir movê-los e manter o texto acessível quando o arquivo for aberto em outro leitor Markdown.

## Decisão

Delimitar o conjunto e cada coluna com comentários HTML próprios do Sloth Note, separados do conteúdo por linhas em branco. O texto de cada coluna permanece como Markdown comum. O aplicativo apresenta editores individuais no modo Padrão e renderiza o conteúdo no modo Leitura; em telas estreitas, as colunas são empilhadas.

## Alternativas

- Tabela Markdown: suas células não representam blocos Markdown arbitrários em várias linhas.
- HTML de layout: o suporte a Markdown dentro de elementos HTML varia entre leitores e pode tratar o conteúdo inteiro como HTML cru.
- Formato fora da nota: separaria a disposição do conteúdo ao copiar ou mover o arquivo.

## Consequências

Leitores Markdown que ignoram comentários apresentam o conteúdo em sequência, sem o layout. O Sloth Note reconhece marcadores completos no nível principal da nota; marcadores incompletos e conteúdo antes da primeira coluna permanecem como texto normal. Os comentários reservados não devem ser usados como linhas literais dentro de uma coluna. A edição dentro de cada coluna mostra a sintaxe Markdown; a visualização de leitura a formata. Alterações de formato exigem preservar a leitura dos arquivos já criados.
