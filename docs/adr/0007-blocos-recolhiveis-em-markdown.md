# 0007. Blocos recolhíveis no Markdown

- Status: Aceito
- Data: 2026-11-03

## Contexto

As notas são arquivos Markdown que podem ser abertos fora do Sloth Note. Um bloco recolhível precisa manter o conteúdo no arquivo e permitir que outros leitores compatíveis exibam seu título e conteúdo.

## Decisão

Gravar o bloco usando `<details>` e `<summary>` em linhas próprias, com linhas em branco separando o conteúdo Markdown. O Sloth Note reconhece blocos completos nesse formato no nível principal do documento. A abertura ou o recolhimento é um estado da visualização e não altera o arquivo.

## Alternativas

- Sintaxe exclusiva com marcadores próprios: exigiria suporte específico para mostrar o bloco em outros leitores.
- Reutilizar títulos Markdown: mudaria a hierarquia da nota e não permitiria um bloco independente de suas seções.

## Consequências

Leitores que aceitam HTML em Markdown podem apresentar o bloco nativamente; outros podem mostrar as tags ou ignorá-las. Blocos incompletos ou aninhados não são convertidos como um bloco externo pelo editor e continuam no texto original. O suporte a Markdown dentro de HTML varia entre leitores.
