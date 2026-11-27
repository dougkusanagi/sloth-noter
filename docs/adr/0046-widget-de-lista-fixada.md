# ADR 0046: Widget de lista fixada no Android

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A etapa B5 do plano mobile pede um widget Android na tela inicial exibindo as tarefas de uma nota fixada, permitindo marcar e desmarcar tarefas diretamente pelo widget sem abrir o aplicativo, preservando exatamente as mesmas regras de Markdown de `src/tasks.js` (incluindo datas de conclusão `✅` quando ativadas) e sem risco de conflito ou corrupção com o app aberto.

O armazenamento principal (`state.v3.json`) é gerenciado pela fila de gravação do app principal (WebView + Rust). Escrever diretamente em `state.v3.json` a partir de um `AppWidgetProvider` em segundo plano poderia causar condições de corrida com o app aberto ou exigir duplicar o parser/mutador completo de Markdown e sincronização no lado Kotlin.

## Decisão

Adotar uma arquitetura em duas vias desacopladas por armazenamento privado (`filesDir/widget/`), análoga à fila isolada do ADR 0045:

1. **Snapshot de leitura (`filesDir/widget/pinned-tasks.json`)**:
   - Sempre que o documento ou a lista de tarefas muda no mobile, o app calcula o snapshot da nota fixada escolhida (a primeira nota fixada com tarefas abertas/concluídas não arquivadas e não canceladas; se nenhuma fixada tiver tarefas, a primeira nota fixada; ou vazio se não houver nota fixada) e o publica via `SlothSystem.syncWidgetSnapshot(json)`.
   - O `PinnedTasksWidgetProvider` lê esse snapshot para renderizar o título da nota e as tarefas (até 8 itens visíveis no widget, com indicador de concluída/pendente).
2. **Fila de alternâncias (`filesDir/widget/pending-toggles/`)**:
   - Ao tocar em uma tarefa no widget, o `WidgetTasksStore.kt` atualiza imediatamente o snapshot local para dar retorno visual instantâneo no widget e grava um arquivo atômico (`<id>.json`) na fila privada com `{ id, noteId, line, text, targetStatus, createdAt }`.
   - Se a `MainActivity` estiver ativa, ela é notificada (`window.__nativeAction?.()`) para aplicar a fila imediatamente. Caso o app esteja fechado, a fila é ingerida na próxima abertura ou retomada.
3. **Aplicação idempotente no app (`src/mobile/widget-tasks.js`)**:
   - O app consome `SlothSystem.takePendingWidgetToggles()`, localiza cada tarefa na nota alvo usando `noteTasks(note.body)` (por número de linha + texto, com fallback por texto caso linhas acima tenham sido editadas) e aplica `applyStatus(body, task.mark, toggle.targetStatus)` de `src/tasks.js`, passando pela mesma fila de gravação (`commit` + `writer.whenIdle()`).
   - Somente após a gravação ser confirmada sem erro o app chama `SlothSystem.ackPendingWidgetToggles(idsJson)` e republica o snapshot atualizado.
4. **Abertura direta da nota**:
   - Tocar no título do widget abre a `MainActivity` com `dev.slothnote.app.OPEN_NOTE` e o `noteId` correspondente (`SlothSystem.takeOpenNoteId()`), abrindo a nota diretamente.

## Alternativas consideradas

- **Ler e escrever `state.v3.json` diretamente no Kotlin**: exigiria duplicar toda a lógica de `tasks.js`, datas `✅`/`❌`, frontmatter e bloqueio concorrente com o Rust, aumentando o risco de divergência de Markdown e perda de dados.
- **Abrir uma Activity invisível com WebView a cada toque no widget**: lento, consome bateria e memória desnecessariamente para um simples clique em checkbox.

## Consequências

- **Positivas**: feedback visual imediato no widget; zero corrida de escrita com `state.v3.json`; 100% de fidelidade às regras de `src/tasks.js` (incluindo datas de conclusão e sincronização subsequente); fácil de testar em unitários JS e E2E mobile.
- **Negativas / limitações**: enquanto o app não for aberto após um toque no widget com o app totalmente fechado, a alteração permanece na fila privada `pending-toggles/` (já refletida no widget) e só sobe para a sincronização remota quando o app abrir.
