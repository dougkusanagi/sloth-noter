# 0037 — Alertas em citações Markdown

- Status: Aceito
- Data: 2026-11-23

## Contexto

Alertas precisam funcionar no editor visual, na leitura e em notas armazenadas como arquivos Markdown.

## Decisão

Usar uma citação cuja primeira linha começa com `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` ou `> [!CAUTION]`. O restante do bloco contém o Markdown da citação. Texto na mesma linha após o marcador vira o título do alerta no Sloth Note. Sem esse texto, o aplicativo mostra o nome do tipo no idioma ativo.

## Alternativas

- Comentários HTML ofereceriam delimitadores próprios, mas exigiriam um formato exclusivo do Sloth Note.
- Um bloco HTML próprio reduziria o aproveitamento da sintaxe de citação pelos leitores Markdown.

## Consequências

- Notas existentes com esses marcadores em citações passam a mostrar alertas. Marcadores em blocos de código e tipos desconhecidos mantêm o tratamento anterior.
- Leitores sem suporte a alertas ainda mostram a citação. O título na mesma linha é uma extensão do formato básico.
