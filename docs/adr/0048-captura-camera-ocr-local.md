# ADR 0048: Captura por câmera com OCR local no Android

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A etapa B17 do plano mobile prevê capturar fotos de texto pela câmera e convertê-las em Markdown (texto, lista ou tabela) no próprio aparelho, sem rede, inserindo o resultado como uma sugestão editável antes de alterar a nota. Antes de escolher a implementação, o plano exige avaliar o peso da dependência no APK.

## Avaliação de peso e alternativas

1. **Tesseract.js + modelos `.traineddata` embutidos no bundle/APK**: adiciona ~15–30 MB (WASM + dados de treino para português e inglês), impacta negativamente o tempo de carregamento do WebView e contraria a diretriz de manter o APK o menor possível.
2. **OCR via API em nuvem**: descartado por exigir rede e enviar fotos do usuário para terceiros.
3. **Ponte nativa sob demanda (`SlothSystem.isLocalOcrSupported` / `captureTextOcr`) + conversor Markdown puro em JS (`src/mobile/ocr-markdown.js`)**:
   - Mantém **zero peso extra** no APK base e no bundle web;
   - Permite conectar um motor de OCR local do sistema (como ML Kit Text Recognition unbundled via Play Services ou reconhecimento nativo do aparelho) sem enviar dados pela rede;
   - Oculta a ação quando o dispositivo não oferece OCR local.

## Decisão

Adotar a opção 3:

1. **Ponte nativa desacoplada**: `SlothSystem.isLocalOcrSupported()` informa se o OCR local está disponível no aparelho e `SlothSystem.captureTextOcr(requestId)` devolve o texto reconhecido via `window.__slothOcrResult?.(requestId, json)`.
2. **Conversão determinística para Markdown (`src/mobile/ocr-markdown.js`)**:
   - `formatOcrAsList`: converte linhas/itens em lista Markdown (`- item`).
   - `formatOcrAsTable`: detecta colunas separadas por tabulação, múltiplos espaços ou `|` e gera uma tabela Markdown válida com cabeçalho e separador.
   - `formatOcrToMarkdown`: escolhe automaticamente entre tabela, lista ou texto.
3. **Sugestão editável antes de inserir**:
   - O texto reconhecido abre na folha de revisão (`ocr-suggestion`), onde o usuário pode alternar entre **Texto**, **Lista** e **Tabela**, editar o Markdown livremente e confirmar com **Inserir** (ou **Descartar** sem alterar a nota).

## Consequências

- **Positivas**: zero aumento de tamanho no APK, execução 100% local sem rede, conversão testável em JS puro e controle total do usuário antes de inserir na nota.
- **Negativas / limitações**: a captura real pela câmera depende de um provedor de OCR local disponível no ambiente Android; sem ele, a ação permanece oculta.
