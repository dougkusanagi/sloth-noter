# 0004 — Status de tarefas no caractere do checkbox

- Estado: aceito
- Data: 2026-11-03

## Contexto

Uma nota pode representar um projeto, como um quadro do Trello. Só dois estados (`[ ]` e `[x]`)
não mostram o que está em andamento ou parado. As notas são Markdown puro, e a pasta pode ser
usada também pelo Obsidian. Por isso, o status precisa ficar no próprio texto e seguir uma
convenção que outros editores já entendem.

Hoje o app grava `[-]` como **parcial**: `syncLinkedTasks` (`src/tasks.js`) escreve esse
caractere em tarefas com link `[[nota]]` quando só parte das tarefas da nota ligada está feita.
No plugin Tasks do Obsidian e em temas como o Minimal, `[-]` significa **cancelada**. A pessoa
que usa o app pediu para seguir o padrão mais estabelecido do mercado.

## Decisão

O status fica no caractere entre colchetes, com a convenção do plugin Tasks do Obsidian:

| Markdown | Status    | Observação                                                             |
| -------- | --------- | ---------------------------------------------------------------------- |
| `[ ]`    | A fazer   | Padrão GFM.                                                            |
| `[/]`    | Fazendo   | Padrão do plugin Tasks.                                                |
| `[>]`    | Esperando | Não há padrão único; temas como o Minimal usam `>` para tarefa adiada. |
| `[x]`    | Feita     | Padrão GFM; `[X]` continua aceito.                                     |
| `[-]`    | Cancelada | Padrão do plugin Tasks. Não conta no total do progresso.               |

- **Parcial deixa de ser gravado como `[-]`.** Em tarefas com link, o app grava `[/]` (em
  andamento) quando parte das tarefas ligadas está feita, `[x]` quando todas estão feitas e
  `[ ]` quando nenhuma está. O visual indeterminado continua, calculado pelo progresso.
- **Datas:** ao concluir, o app acrescenta `✅ AAAA-MM-DD` ao fim da tarefa; ao cancelar,
  `❌ AAAA-MM-DD`. Ao reabrir a tarefa, a data é removida. É o formato do plugin Tasks. Uma
  opção em Configurações desliga a gravação das datas.
- **Caracteres desconhecidos** (como `[?]` ou `[!]`, de outros temas) são preservados e nunca
  reescritos. Na interface, eles contam como "A fazer".
- O clique no círculo continua alternando entre A fazer e Feita. Os outros status ficam num menu
  na etiqueta da tarefa, no clique direito, no toque longo e nos atalhos `Alt+1…5`.

## Alternativas

- **Manter `[-]` como parcial e usar `[~]` para cancelada:** não altera arquivos, mas contraria
  o padrão do Obsidian; uma tarefa cancelada no Obsidian apareceria como parcial no app.
- **Seções como status (`## Fazendo`):** tira as seções do papel de assunto (Backend,
  Frontend). Ficou só como agrupamento visual do Quadro ([ADR 0006](0006-modo-quadro.md)).
- **Tags ou campos (`#fazendo`, `[status:: fazendo]`):** poluem o texto e dependem de
  convenção de nomes; um erro de digitação vira um status desconhecido.

## Consequências

- O formato dos arquivos muda. Notas antigas com `[-]` em tarefas com link são regravadas como
  `[/]`, `[x]` ou `[ ]` na próxima sincronização das tarefas ligadas. Para tarefas com link, o
  status vem sempre do progresso calculado, nunca do caractere lido. Assim, um `[-]` antigo não
  aparece como cancelado.
- Um `[-]` escrito à mão numa tarefa sem link passa a significar cancelada.
- `noteTasks`, `sectionProgress`, `sectionChecklists`, `resolvedTasks`, `remarkPartialTasks`,
  a decoração do modo Padrão, a Leitura e a biblioteca de tarefas precisam ler o status, não
  só `done`.
- Concluir uma tarefa passa a alterar também o texto (a data), não só o caractere. Desfazer
  precisa reverter as duas coisas num passo.
- Outros editores sem suporte mostram `[/]`, `[>]` e `[-]` como texto ou como checkbox vazio.
  O conteúdo não se perde.
