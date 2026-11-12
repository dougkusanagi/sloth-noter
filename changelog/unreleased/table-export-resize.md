Adicionado: No menu da tabela, use **Exportar CSV** ou **Exportar XLSX** para salvar os textos das células como planilha. CSV usa UTF-8 e ponto e vírgula. XLSX preserva códigos como `001` como texto. Formatação, imagens e dimensões não são exportadas; textos que parecem fórmulas não são executados.

Alterado: Arraste a divisória entre duas colunas para redistribuir a largura entre elas. A tabela sempre ocupa a largura do documento, sem faixa vazia à direita. As linhas têm altura automática e não podem ser redimensionadas. O destaque da divisória permanece durante o arraste. Escape cancela; Desfazer reverte o ajuste. Use **Restaurar tamanhos automáticos** no menu da tabela para voltar à distribuição uniforme.

Adicionado: Clique com o botão direito numa célula para abrir o mesmo menu da tabela, com **Cores da célula** (cor do texto e de fundo) e as ações de adicionar ou remover a linha e a coluna dessa célula. As cores acompanham a nota e se adaptam ao tema.

Adicionado: Células agora renderizam listas, tarefas com checkboxes, citações, imagens, links e formatação Markdown. Use `<br>` para separar itens dentro da mesma célula: `- [ ] Ícones<br>- [x] Guia visual`. Dê dois cliques na célula para editar o texto; Escape volta à visualização. Durante a edição, Shift+Enter quebra a linha dentro da célula e, numa lista ou tarefa, já começa o próximo item; numa tarefa vazia, encerra a lista. As caixas de tarefa seguem o mesmo visual das tarefas da nota. As tarefas podem ser marcadas no modo de edição e ficam desativadas em Leitura. Outros editores Markdown podem mostrar os marcadores como texto.

![Tabela com tarefas, listas e uma célula com fundo verde](/changelog/tabela-dimensoes.png)

Corrigido: O destaque da divisória fica centralizado entre as colunas e alinhado à divisão dos controles externos, inclusive durante o arraste.

Adicionado: Arraste sobre a barra de colunas ou de linhas, ou use Shift+clique, para selecionar várias de uma vez. Alinhamento, negrito, itálico, tachado, código, cores e exclusão valem para toda a seleção. O botão **Cores** da barra aplica cor do texto e cor de fundo às células selecionadas. No menu da tabela, **Cores da célula** muda a célula onde está o cursor.

Corrigido: Linhas vazias da tabela têm altura normal; um clique numa célula vazia mostra o cursor e o texto digitado fica na célula certa. Clicar abaixo de uma tabela no fim da nota cria um parágrafo novo.
