# ADR 0051: Recorrência, histórico de conclusão e lembretes em tarefas (C4)

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A proposta C4 amplia o sistema de tarefas do Sloth Note (ADRs 0004, 0005 e 0044) com recorrência, histórico de conclusões e lembretes locais, exigindo formato portável em Markdown puro sem dependência de banco proprietário.

## Decisão

1. **Sintaxe portável inline no Markdown**:
   - **Recorrência**: `🔁 diária` / `🔁 daily`, `🔁 semanal` / `🔁 weekly`, `🔁 mensal` / `🔁 monthly`, ou `🔁 a cada N dias|semanas|meses` / `🔁 every N days|weeks|months`.
   - **Lembrete local**: `⏰ AAAA-MM-DD HH:MM` (horário local do dispositivo).
   - **Histórico de conclusão**: aproveita as datas `✅ AAAA-MM-DD` já gravadas nas tarefas concluídas, ordenadas cronologicamente por `extractCompletionHistory`.
2. **Geração da próxima ocorrência**:
   - Ao concluir uma tarefa recorrente, `buildNextRecurringTaskLine` gera a nova linha `- [ ] ...` com a próxima data `📅` calculada a partir da data atual da tarefa (ou de hoje) e mantém a linha concluída com `✅` como registro histórico.

## Consequências

- **Positivas**: arquivos `.md` continuam 100% legíveis em qualquer editor de texto; zero metadado oculto.
- **Negativas / limitações**: lembretes dependem de notificação local quando o app ou serviço do sistema estiver ativo.
