# 0006 — Modo Quadro (kanban) para notas com tarefas

- Estado: aceito
- Data: 2026-11-03

## Contexto

Com os status do [ADR 0004](0004-status-de-tarefas-no-checkbox.md), uma nota de projeto pode
ser vista como um quadro kanban. As notas continuam sendo arquivos Markdown comuns. O app já tem
um seletor com três modos (Padrão, Código e Leitura), e o modo escolhido hoje vale para todas
as notas (`src/main.jsx`). A versão mobile não tem seletor de modos.

## Decisão

- **Quadro** é o quarto modo do seletor: Padrão · Código · Leitura · Quadro. Também tem atalho e
  comando na paleta. Não é um tipo novo de nota: qualquer nota com tarefas pode ser vista como
  quadro, e o `.md` continua igual.
- **Colunas são os status** (A fazer, Fazendo, Esperando, Feita). As Canceladas aparecem na
  coluna Feita, riscadas. **Raias são as seções** da nota (H2), com o botão "Agrupar por seção"
  para ligar e desligar as raias. Esta é a mistura das opções A e B discutidas: o status fica no
  checkbox e as seções continuam sendo os assuntos.
- Mover um cartão para outra coluna muda o caractere do status. Mover para outra raia move a
  linha (com subtarefas e linhas recuadas) para o fim daquela seção. As duas ações também ficam
  disponíveis por menu, sem arrastar, para teclado e toque.
- O "+" de uma coluna cria a tarefa no fim da seção, com o status da coluna.
- O Quadro mostra só as tarefas. Para editar o resto do texto, a pessoa volta para Padrão. O
  Arquivo ([ADR 0005](0005-arquivo-de-tarefas-na-nota.md)) não aparece no Quadro.
- **O Quadro é lembrado por nota**, nos metadados do app (`noteMeta`, fora do `.md`). Os outros
  modos continuam globais. Assim, a nota de projeto abre como quadro e as outras notas não
  mudam.
- Uma nota sem tarefas mantém o botão visível e mostra uma mensagem de lista vazia com a ação
  "Adicionar tarefa".
- Primeiro no desktop e na web. O celular fica para uma etapa posterior, com uma coluna por vez
  e abas por status.

## Alternativas

- **Tipo de nota "Quadro" com seções como colunas (formato do plugin Kanban do Obsidian):**
  separa as notas de projeto das outras e exige converter notas existentes; perde as seções
  por assunto.
- **Botão separado, fora do seletor de modos:** ficaria menos visível e criaria outro lugar para
  trocar de vista.
- **Guardar a preferência no próprio arquivo (frontmatter):** acompanharia o arquivo, mas
  colocaria uma configuração do app no texto que o Obsidian e outros editores mostram.

## Consequências

- O estado do modo deixa de ser só global: o app precisa decidir o modo ao trocar de aba,
  conforme a nota.
- `noteMeta` ganha um campo novo; o backup e a pasta de notas precisam preservá-lo.
- Os testes E2E do seletor de modos e das posições entre Padrão e Leitura precisam considerar o
  quarto modo.
- Notas abertas no local (fora da pasta, [ADR 0001](0001-arquivos-abertos-no-local.md)) também
  precisam guardar a preferência de vista nos metadados do app.
