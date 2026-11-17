# 0029 — Remover os blocos recolhíveis (`<details>`)

- Status: Aceito
- Data: 2026-11-17
- Substitui: 0007, 0022

## Contexto

O Sloth Note reconhecia `<details>`/`<summary>` em linhas próprias como bloco recolhível (ADR 0007 e 0022). O recurso exigia casos especiais no editor (decorações, dobra, mover, converter, menu do bloco) e no leitor. Ele quebrou o layout dos modelos de nota várias vezes, e o modelo de tarefas era o único uso embutido. O item já tinha saído do menu de inserção.

## Decisão

Remover todo o suporte: o editor e a leitura não interpretam mais `<details>`. As linhas são texto comum, como qualquer outro HTML não suportado (o leitor continua sem HTML arbitrário). Os modelos foram refeitos sem esse bloco.

## Alternativas

- Manter e corrigir o visual: já houve várias rodadas de correção sem resultado estável.
- Converter as notas existentes automaticamente: alteraria arquivos do usuário sem pedido.

## Consequências

- Notas antigas com `<details>` não perdem texto: as marcas aparecem como texto e podem ser apagadas.
- Outros apps de Markdown continuam podendo recolher esses blocos.
- Menos código especial em `block-move`, `block-handle`, `block-actions`, `folding` e `live-decorations`.
