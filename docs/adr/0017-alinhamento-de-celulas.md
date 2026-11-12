# 0017 — Alinhamento por célula no comentário da tabela

Status: Aceito

## Contexto

O Markdown só alinha colunas inteiras, pela linha divisória (`:---:`), e não tem alinhamento vertical. O menu da tabela passou a oferecer alinhamento horizontal e vertical para as células selecionadas.

## Decisão

- Quando a seleção cobre colunas inteiras, o alinhamento horizontal continua na linha divisória do Markdown.
- Para as demais seleções, o alinhamento fica no comentário `<!-- sloth:table … -->` acima da tabela, junto das cores:
  - `halign=linha:coluna:left|center|right`, que tem prioridade sobre o alinhamento da coluna;
  - `valign=linha:coluna:middle|bottom`, em que o topo é o padrão e não é gravado.

## Alternativas

- Envolver o texto da célula em HTML (`<div align>`): poluiria o texto da célula e atrapalharia fórmulas e edição.
- Só permitir alinhamento por coluna: não atenderia ao alinhamento vertical nem a células isoladas.

## Consequências

O arquivo continua Markdown comum. Outros leitores ignoram o comentário e mostram só o alinhamento das colunas. Como as cores, as chaves usam a posição da célula: inserir ou remover linhas e colunas não desloca essas marcações.
