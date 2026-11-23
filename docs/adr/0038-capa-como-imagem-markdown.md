# 0038 — Capa como imagem Markdown

- Status: Aceito
- Data: 2026-11-23

## Contexto

A capa precisa acompanhar a nota em arquivos Markdown, na sincronização e no backup. A biblioteca já rastreia referências de imagens nas notas.

## Decisão

Gravar a capa como a primeira imagem, em um parágrafo próprio após o título da nota. O título Markdown da imagem é `sloth:cover`. As visualizações do Sloth Note mostram essa imagem em uma faixa abaixo do título do documento. Uma imagem normal na mesma posição continua com a apresentação usual.

## Alternativas

- Guardar o caminho só nas preferências locais faria a capa sumir na exportação Markdown e em outros aparelhos.
- Guardar o caminho em YAML exigiria acrescentar o rastreamento de referências em propriedades aos fluxos de biblioteca e backup.

## Consequências

- Outros leitores recebem uma imagem Markdown normal. A faixa e o recorte pertencem à apresentação do Sloth Note.
- Trocar ou remover a capa altera só a referência na nota. O arquivo permanece na biblioteca. Se a imagem for excluída pela biblioteca, a referência de capa também é removida.
