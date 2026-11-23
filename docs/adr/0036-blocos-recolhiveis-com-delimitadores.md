# 0036 — Blocos recolhíveis com delimitadores Markdown

- Status: Aceito
- Data: 2026-11-23

## Contexto

O [ADR 0029](0029-remover-blocos-recolhiveis.md) retirou a interpretação de `<details>` e `<summary>` das notas após regressões de espaçamento em modelos. O pedido atual traz de volta um bloco com título, seta e conteúdo recolhível.

## Decisão

Gravar o bloco entre `<!-- sloth:accordion -->` e `<!-- /sloth:accordion -->`. O título é um parágrafo de uma linha imediatamente após a abertura, seguido por uma linha em branco. O restante é Markdown normal. O editor reutiliza o estado de dobra de seções e a leitura no celular renderiza um elemento de expansão nativo, criado a partir do Markdown reconhecido.

## Alternativas

- Reativar o formato anterior alteraria a apresentação de notas que já contêm `<details>`.
- Usar somente um título Markdown faria a dobra continuar até o próximo título do mesmo nível.

## Consequências

- O conteúdo e o título continuam disponíveis em leitores Markdown. O estado aberto ou recolhido fica na visualização e não modifica os arquivos.
- Marcadores dentro de código, incompletos ou no formato antigo permanecem como já eram tratados.
