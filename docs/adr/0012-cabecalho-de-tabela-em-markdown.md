# 0012. Cabeçalho de tabela em notas Markdown

- Status: Aceito
- Data: 2026-11-12

## Contexto

O menu da tabela oferece "Linha de cabeçalho" e "Coluna de cabeçalho", como no Quiet.md. O Markdown (GFM) sempre trata a primeira linha como cabeçalho e não tem forma de marcar uma coluna de cabeçalho nem de desligar a linha de cabeçalho.

Uma primeira versão gravava o cabeçalho como negrito nas células. Ela não funcionou: uma coluna que já tinha texto em negrito aparecia como cabeçalho ligado, e o negrito não diferenciava o cabeçalho do restante da tabela.

## Decisão

Guardar a configuração num comentário HTML do Sloth Note na linha imediatamente acima da tabela, por exemplo `<!-- sloth:table header-column -->` ou `<!-- sloth:table no-header-row header-column -->`. Sem comentário, vale o padrão do Markdown: linha de cabeçalho ligada e coluna de cabeçalho desligada. O comentário só é gravado quando a configuração difere do padrão. O editor esconde a linha do comentário, aplica um estilo próprio ao cabeçalho e mantém a linha de cabeçalho visível ao rolar a tabela. Recortar, copiar, excluir e mover a tabela levam o comentário junto.

## Alternativas

- Negrito nas células: descartado pelos motivos do contexto.
- HTML `<table>` com `<th>`: perderia a edição como tabela Markdown e a leitura em outros editores.
- Configuração fora da nota: se perderia ao copiar ou mover o arquivo.

## Consequências

Outros leitores Markdown ignoram o comentário e mostram a tabela comum, com a primeira linha como cabeçalho. Um comentário separado da tabela por uma linha em branco deixa de valer e aparece como texto. Mudanças futuras no formato precisam continuar lendo os comentários já gravados. Segue o mesmo modelo de comentários do ADR 0008 (colunas).
