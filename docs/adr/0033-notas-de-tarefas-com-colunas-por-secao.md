# 0033 — Notas de tarefas, com as seções como colunas do Quadro

- Estado: aceito
- Data: 2026-11-23
- Substitui: [0006](0006-modo-quadro.md)

## Contexto

No [ADR 0006](0006-modo-quadro.md), as colunas do Quadro eram os status das tarefas (o caractere
dentro de `[ ]`) e os títulos H2 viravam faixas ("Agrupar por seção"). O usuário pediu colunas
fáceis de personalizar, e as próprias notas de projeto dele já se organizam por etapa com H2
(`## Corrigir`, `## Fazer`, `## Feito`). Também pediu um tipo de nota de tarefas, com resumo
abaixo do título, e que só essas notas tenham o Quadro, para evitar ver notas comuns como
kanban. O status continua útil fora do Quadro: biblioteca de Tarefas, atalhos Alt+1 a Alt+5,
menu da caixa de seleção e notas comuns.

## Decisão

- **Nota de tarefas** é a nota com a propriedade YAML `tipo: tarefas` (ou `type: tasks`). A marca
  fica no arquivo, viaja com a sincronização e aparece no painel de Propriedades. Ao criar ou
  converter uma nota, o app grava também `criada: AAAA-MM-DD`, e, se a nota não tiver seções,
  as colunas padrão `## Fazer`, `## Fazendo`, `## Esperando` e `## Feito`.
- **Cada H2 é uma coluna** do Quadro, na ordem do arquivo. A seção `## Arquivo`
  ([ADR 0005](0005-arquivo-de-tarefas-na-nota.md)) fica fora. Tarefas antes do primeiro H2
  aparecem numa coluna "Sem seção", só quando existem.
- **A posição no arquivo decide a coluna.** Mover um cartão move a linha (com subtarefas e linhas
  recuadas) para aquela seção.
- **O status acompanha a coluna quando o nome é conhecido**: Fazer/A fazer → `[ ]`,
  Fazendo/Em andamento → `[/]`, Esperando/Aguardando → `[>]`, Feito/Feita/Concluído → `[x]`
  (com a data de conclusão, conforme a configuração). Uma coluna com outro nome não muda a caixa.
  Marcar a caixa à mão não move a linha: uma `[x]` em "Fazer" aparece riscada em "Fazer".
- O Quadro só monta colunas para notas de tarefas. Numa nota comum, ele explica isso e oferece
  "Transformar em nota de tarefas". As faixas por seção deixam de existir.
- No editor, a nota de tarefas mostra abaixo do título um resumo: criação, última alteração e
  quantas tarefas há em cada coluna.
- Em qualquer nota, as tarefas selecionadas (uma ou várias) podem ir para outra seção H2 pelo
  teclado, com um menu das seções. Numa nota de tarefas, a regra de status acima também vale.
- O Quadro ganha a ação "Arquivar concluídas", que usa o arquivo do ADR 0005.

## Alternativas

- **Manter os status como colunas (ADR 0006):** colunas fixas, sem personalização pelo texto.
- **H2 e status definindo a coluna ao mesmo tempo:** uma `[x]` dentro de "Fazer" não teria
  coluna certa, e arrastar teria efeitos ambíguos. Descartada.
- **Marca da nota nos metadados do app (`noteMeta`)**, como a preferência de vista do ADR 0006:
  não viaja com o arquivo nem aparece em outros editores.

## Consequências

- Uma nota antiga vista como quadro precisa ser convertida; sem seções, ela recebe as colunas
  padrão abaixo do texto existente.
- A preferência "Agrupar por seção" (`boardGrouped`) deixa de ser usada.
- O modelo "Quadro" passa a criar uma nota de tarefas com as colunas padrão.
- A preferência de abrir a nota no Quadro continua por nota (`boardNotes`, ADR 0006).
