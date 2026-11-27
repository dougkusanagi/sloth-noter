# ADR 0047: IA no aparelho no Android (opcional, Gemini Nano / AICore)

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A etapa B7 do plano mobile prevê ações opcionais de **Resumir** e **Revisar** texto usando IA local no aparelho (Gemini Nano / ML Kit GenAI via Android AICore), sem uso de rede, seguindo as diretrizes de privacidade de `docs/IA-E-SYNC.md`. O recurso deve permanecer desligado por padrão, desaparecer completamente quando não houver modelo disponível no aparelho e nunca alterar a nota sem aceitação explícita do usuário.

## Decisão

1. **Zero peso extra no APK base e detecção em tempo de execução**:
   - Nenhum modelo de IA é empacotado no APK (mantendo o APK enxuto).
   - A ponte nativa `SlothSystem.getOnDeviceAiState()` consulta em tempo de execução se o dispositivo oferece o runtime de IA no aparelho (Android 14+ com AICore / Gemini Nano disponível), retornando `'available'` ou `'unavailable'`.
   - Quando o estado for `'unavailable'`, nenhuma opção de IA aparece na interface (nem em Configurações, nem na folha de ações da nota).
2. **Desligado por padrão (`prefs.mobileOnDeviceAi = false`)**:
   - Mesmo em aparelhos compatíveis, o usuário precisa ativar explicitamente **IA no aparelho** em **Configurações → Sistema**.
3. **Sugestão explícita antes de editar**:
   - As ações **Resumir com IA** e **Revisar com IA** rodam exclusivamente no aparelho via `SlothSystem.runOnDeviceAi(requestId, action, text)` sem acesso à rede.
   - O retorno é sempre exibido em uma folha de revisão com prévia editável e ações **Aceitar** e **Descartar**.
   - **Resumir** insere um bloco `> [!NOTE] Resumo` logo abaixo do título H1, preservando o texto original; **Revisar** substitui o corpo mantendo o título H1.
   - Se o usuário descartar ou ocorrer erro, o texto da nota permanece intocado.

## Alternativas consideradas

- **Embutir modelo local no APK**: inviável pelo tamanho (centenas de megabytes) e contrário à regra de manter o APK o menor possível.
- **Usar API em nuvem como fallback**: descartado por violar o requisito de execução 100% local e sem rede.

## Consequências

- **Positivas**: privacidade total (sem rede), zero impacto no tamanho do APK, interface limpa em aparelhos sem modelo disponível e controle explícito antes de qualquer alteração na nota.
- **Negativas / limitações**: disponibilidade restrita a aparelhos Android 14+ com AICore / Gemini Nano habilitado pelo fabricante.
