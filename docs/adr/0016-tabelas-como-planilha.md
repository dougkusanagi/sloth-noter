# 0016 — Tabelas com interação de planilha e fórmulas

Status: Aceito

## Contexto

As células das tabelas eram texto editável direto no editor da nota. Um clique punha o cursor do texto na célula, o que tornava difícil selecionar várias células, editar células vazias e manter o cursor visível. Células com listas e `<br>` precisavam de um modo de edição separado. Também havia pedido de fórmulas simples.

## Decisão

No modo visual, cada célula é desenhada como um bloco próprio e a tabela se comporta como uma planilha:

- Um clique seleciona a célula; arrastar ou Shift seleciona um intervalo. Setas, Tab, Enter, Home e End movem a seleção. Ctrl+C, Ctrl+X e Ctrl+V usam texto separado por tabulação (TSV), compatível com Excel e Google Sheets. Delete apaga o intervalo; Ctrl+B e Ctrl+I formatam todas as células.
- Clique duplo, F2 ou começar a digitar abre um pequeno editor dentro da célula. Ele mostra `<br>` como quebra de linha e desenha caixas de tarefa e marcadores nas linhas fora do cursor. Shift+Enter quebra a linha e continua listas e tarefas. Enter e Tab fecham o editor e movem a seleção; Escape devolve o texto anterior.
- O editor grava a célula na nota a cada alteração, para não perder texto se o app fechar durante a edição.
- Com uma célula selecionada, o teclado vai para um campo oculto da planilha, e não para o cursor de texto da nota. O cursor da nota não consegue ficar dentro de uma célula desenhada como bloco: o navegador o levava para outro lugar do documento.
- Uma célula cujo texto começa com `=` é uma fórmula. Um interpretador próprio (`src/formula.js`) lê a fórmula sem executar JavaScript e calcula o resultado. Referências seguem a planilha: coluna A é a primeira e a linha 1 é o cabeçalho. Há funções em português e inglês (SOMA/SUM, MÉDIA/AVERAGE, MÍN, MÁX, CONT.NÚM, CONT.VALORES, SE/IF, E, OU, NÃO, ARRED, ABS, RAIZ, PRODUTO, CONCAT). Argumentos são separados por `;`; a vírgula entre dígitos é decimal, como no Excel em português. Erros aparecem na célula (`#DIV/0!`, `#VALOR!`, `#REF!`, `#NOME?`, `#ERRO!`, `#CIRC!`), com a explicação ao passar o mouse.

## Alternativas

- Manter as células como texto do editor: mantinha os problemas de cursor e não permitia intervalos.
- Um componente de grade separado do editor, com a tabela fora do CodeMirror: exigiria refazer barras, redimensionamento, cabeçalho fixo e busca.
- Avaliar fórmulas com `eval` ou `Function`: executaria código vindo do arquivo da nota.
- Guardar o resultado calculado no arquivo: duplicaria dados e poderia ficar desatualizado.

## Consequências

O arquivo continua Markdown comum. A fórmula fica no arquivo (`| =SOMA(B2:B5) |`); outros leitores de Markdown, como o Obsidian, mostram a fórmula, não o resultado. A exportação CSV/XLSX continua com os textos das células, incluindo as fórmulas como texto. O clique numa célula deixou de pôr o cursor no texto: editar exige clique duplo, F2 ou digitação. Links dentro de células abrem com Ctrl/Cmd+clique. No celular, o primeiro toque seleciona e um segundo toque na mesma célula edita.
