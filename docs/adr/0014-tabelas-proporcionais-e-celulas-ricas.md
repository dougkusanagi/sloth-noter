# 0014. Tabelas proporcionais e conteúdo nas células

- Status: Aceito
- Data: 2026-11-12
- Substitui: 0013

## Contexto

Guardar larguras absolutas deixava uma faixa vazia ou fazia a tabela ultrapassar o documento. O usuário definiu que somente colunas podem ser redimensionadas e que a tabela deve sempre preencher o documento. Células também precisam de cores, listas e tarefas.

## Decisão

Interpretar `widths` no comentário `sloth:table` como pesos proporcionais, com valores positivos até 10000. Medidas anteriores em pixels passam a determinar proporções. Arrastar uma divisória redistribui o espaço entre as duas colunas vizinhas; a largura total permanece igual. As linhas crescem automaticamente com o conteúdo: `heights` antigo é preservado na leitura do arquivo, mas não aplicado; novos arrastes removem esse campo. Escape cancela o arraste e Desfazer reverte sua gravação.

Acrescentar `colors=linha:coluna:cor,...` ao mesmo comentário, com posições visuais a partir de zero, incluindo o cabeçalho. A paleta aceita `green`, `blue`, `yellow`, `red` e `purple`, aplicados sobre a superfície do tema. O menu de contexto permite escolher ou remover a cor. Cores arbitrárias vindas do arquivo não são interpretadas como CSS.

Células continuam em uma linha física Markdown. `<br>` separa blocos visuais; dentro de código, permanece literal. O renderizador usa a árvore Markdown para listas, tarefas, citações, imagens, links e formatação. Não executa HTML arbitrário. Uma célula rica ocupa um único item da grade; controles fragmentados em decorações internas do CodeMirror causavam desalinhamento. Duplo clique revela o texto para editar; Escape volta à renderização. Checkboxes alteram o marcador correspondente no Markdown, com histórico de desfazer, e são desativados na leitura.

## Alternativas

Larguras fixas com rolagem foram descartadas pelo requisito de preencher o documento. Converter tudo para HTML alteraria o formato de edição. Guardar cores fora da nota faria a apresentação se perder ao transportar o arquivo.

## Consequências

Outros leitores Markdown podem mostrar os marcadores de tarefa e lista como texto dentro das células; as extensões não são parte das tabelas GFM. Cores pertencem às posições das células. CSV/XLSX continuam exportando texto, sem cores nem dimensões, e transformam quebras de célula em quebras de texto. Permanecem as decisões sobre exportação e proteção de fórmulas do ADR 0013.
