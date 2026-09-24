# Plano de implementação

O plano vigente está em [PLANO.md](PLANO.md), acompanhado pelo [relatório de revisão](RELATORIO.md).

Este documento substitui o plano herdado. Tailwind compilado, shadcn/ui, CodeMirror, Web Workers, pasta de exemplo e H1 obrigatório deixam de ser requisitos prévios. Novas dependências precisam resolver problemas demonstrados e respeitar o orçamento de leveza.

As Etapas 1–3 do MVP web foram concluídas em 24/09/2026. O histórico de implementação, os testes e os limites conhecidos estão em [PLANO.md](PLANO.md). A entrega final obrigatória é o aplicativo desktop nativo em Tauri V2, com vault em pasta local, tratamento de alterações externas e distribuição validada; ela está detalhada nas Etapas 4–7 do plano vigente. A Etapa 4 está implementada: a janela nativa abre offline e grava o documento em um arquivo de estado versionado, sem depender de `localStorage`, com o mesmo contrato de persistência usado pelo web. A pasta local com arquivos `.md` é a Etapa 5.

Tauri V2 e pasta local não são opcionais nem apenas um empacotamento posterior. O web continua sendo a base reutilizável e o fallback enquanto o desktop não estiver concluído.

Uma ampliação posterior adicionou edição visual com CodeMirror e vinculou o primeiro H1 ao nome do arquivo. A decisão e as verificações estão registradas no plano vigente.
