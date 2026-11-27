# ADR 0050: Compactação configurável de imagens em WebP (C6)

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A proposta C6 reduz o espaço local e o consumo de armazenamento R2 na sincronização (ADR 0021) compactando imagens salvas no formato **WebP** (escolhido pelo usuário em 2026-11-13), com níveis configuráveis e preservando transparência, GIFs animados e removendo metadados EXIF/localização.

## Decisão

1. **Perfis disponíveis (`prefs.imageCompression`)**:
   - `original`: mantém o arquivo original sem recompressão.
   - `balanced` (**padrão**): converte para `image/webp` com qualidade `0.82` e lado máximo de `1920 px`.
   - `small`: converte para `image/webp` com qualidade `0.68` e lado máximo de `1280 px`.
2. **Preservação e segurança**:
   - `image/gif` (para preservar animação) e `image/svg+xml` nunca são recomprimidos.
   - Imagens menores que `maxDimension` não são ampliadas.
   - A re-codificação via Canvas remove automaticamente metadados EXIF e GPS e preserva canal alfa (transparência) em WebP.
   - Se o WebP gerado não for menor que o original, o original é mantido.
   - Não guardamos cópia duplicada do original para não anular a economia de espaço; o usuário escolhe `original` caso queira manter arquivos intactos.

## Consequências

- **Positivas**: redução significativa de disco e banda de sincronização sem dependências nativas extras; remoção automática de EXIF/localização.
- **Negativas / limitações**: recompressão é com perda nos perfis `balanced` e `small`; quem precisa de arquivo bruto usa `original`.
