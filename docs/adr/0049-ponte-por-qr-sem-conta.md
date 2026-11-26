# ADR 0049: Ponte por QR sem conta (C1)

- Data: 2026-11-26
- Estado: Aceito

## Contexto

A proposta C1 permite transferir uma nota curta do desktop para o celular (ou vice-versa) por QR Code, 100% offline, sem conta, sem rede e sem servidor intermediário. É necessário definir o formato do payload, o limite de tamanho e o tratamento de imagens.

## Decisão

1. **Formato portável e versionado (`slothnote:qr:v1:<base64url>`)**:
   - O payload serializa `{ v: 1, body }` em UTF-8, comprime com `deflateSync` (`fflate`, já presente no projeto) e codifica em Base64URL com o prefixo `slothnote:qr:v1:`.
2. **Limite de tamanho (`QR_MAX_PAYLOAD_CHARS = 2200`)**:
   - Notas cujo payload comprimido ultrapasse 2.200 caracteres são recusadas com erro explícito (`too_large`) em vez de gerar um QR ilegível pela câmera.
3. **Imagens**:
   - Imagens binárias (`assets/...` ou `data:image/...`) não cabem em um QR Code.
   - `encodeNoteForQr` remove URIs `data:image/...` inline substituindo-as por um marcador legível e sinaliza `hasImages: true` para a interface avisar o usuário de que as imagens não acompanham o QR.

## Alternativas consideradas

- **Enviar texto puro sem compressão**: reduziria drasticamente o tamanho útil da nota em um único QR Code.
- **Sequência animada de múltiplos QR Codes (fountain codes)**: adiciona complexidade alta de câmera e leitura fora do objetivo de "nota curta".

## Consequências

- **Positivas**: transferência instantânea, 100% offline, sem conta e sem novas dependências.
- **Negativas / limitações**: restrito a notas curtas sem imagens binárias; notas longas ou com anexos continuam usando sincronização ou backup/exportação `.md`.
