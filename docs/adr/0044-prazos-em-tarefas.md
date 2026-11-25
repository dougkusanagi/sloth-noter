# ADR 0044: Prazos e datas em tarefas no formato Obsidian Tasks

- Estado: Aceito
- Data: 2026-11-25

## Contexto

O Sloth Note já segue o formato do plugin Tasks do Obsidian para status de tarefas (ADR 0004) e
para datas de conclusão/cancelamento (`✅ AAAA-MM-DD` e `❌ AAAA-MM-DD`, em `src/task-dates.js`).
A Parte 4 de `docs/plans/leitura-e-modelos.md` prevê suporte a prazos e datas de agendamento e
início, com chips coloridos por situação e filtro/ordenação na biblioteca de tarefas.

## Decisão

1. **Formato no arquivo Markdown**: adotar os marcadores do Obsidian Tasks no texto da tarefa:
   - `📅 AAAA-MM-DD` — prazo (`due`)
   - `⏳ AAAA-MM-DD` — agendada (`scheduled`)
   - `🛫 AAAA-MM-DD` — início (`start`)
     mantendo `✅ AAAA-MM-DD` (`done`) e `❌ AAAA-MM-DD` (`canceled`).
2. **Renderização acessível**: cada marcador é exibido como chip `<time class="task-date">` nos
   modos Padrão (`TaskDateWidget`), Leitura (`TaskDateBadge`) e na biblioteca de tarefas
   (`TasksLibrary`). Para prazos (`due`), o chip exibe texto relativo ("vence hoje", "vence amanhã",
   "vence em X dias", "atrasada há X dias") além da cor por situação (`overdue`, `today`, `soon`),
   e mantém a data completa no `title` e `aria-label`.
3. **Biblioteca de tarefas**: `TasksLibrary` oferece filtro por situação do prazo (Todos,
   Atrasadas, Hoje, Próximas, Com prazo) e opção para ordenar tarefas por prazo dentro de cada
   grupo.

## Alternativas consideradas

- **Sintaxe própria em texto (ex.: `@prazo:2026-11-20`)**: descartada porque quebraria a
  interoperabilidade com pastas compartilhadas com o Obsidian e divergiria do padrão já adotado
  para `✅`/`❌`.

## Consequências

- Notas continuam sendo Markdown puro e compatíveis com o ecossistema Obsidian Tasks.
- Prazos atrasados e próximos ficam imediatamente visíveis por cor e texto em ambos os temas.
