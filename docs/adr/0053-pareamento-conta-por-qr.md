# ADR 0053: Pareamento de conta de sincronização por QR Code nos dois sentidos

- Data: 2026-11-26
- Estado: Aceito

## Contexto

Para entrar em uma conta de sincronização existente em outro dispositivo, o usuário precisava digitar e-mail, senha e/ou chave de recuperação manualmente. O usuário solicitou pareamento por QR Code em ambos os sentidos:
1. **Desktop → Celular**: o dispositivo logado exibe um QR Code para o celular ler e entrar automaticamente na mesma conta.
2. **Celular → Desktop (estilo WhatsApp Web)**: o desktop deslogado exibe um QR Code temporário, o celular logado lê esse QR e autoriza o login automático no desktop.

## Decisão

Implementar ambos os fluxos em `src/sync/qr-pairing.js`, preservando a criptografia ponta a ponta (o servidor nunca acessa a chave de criptografia em texto claro):

1. **Fluxo direto (`slothnote:pair:v1:<base64url>`) — dispositivo logado → novo dispositivo**:
   - O dispositivo logado gera um QR Code de curta duração (TTL padrão: 2 minutos) contendo `{ v: 1, server, token, key, email, name, exp }`.
   - O novo dispositivo lê o QR (pela câmera nativa no Android ou colagem), verifica expiração e chama `sync.connect(...)`, entrando e sincronizando automaticamente.
2. **Fluxo reverso (`slothnote:pair-req:v1:<base64url>`) — estilo WhatsApp Web**:
   - O dispositivo deslogado gera um par de chaves efêmero ECDH P-256 (`crypto.subtle`), registra um `pairingId` temporário em `POST /v1/pairing` (TTL 2 minutos) e exibe o QR `{ v: 1, server, id, pub }`.
   - O dispositivo logado (ex.: celular) lê o QR, deriva um segredo compartilhado ECDH com `pub`, cifra `{ server, token, key, email, name }` com AES-256-GCM e envia `{ encrypted }` para `POST /v1/pairing/:id/approve` autenticado com sua sessão.
   - O dispositivo deslogado consulta `GET /v1/pairing/:id` (consumo único: o servidor apaga após a entrega), decifra localmente com sua chave privada efêmera e conecta automaticamente na conta.

## Consequências

- **Positivas**: login sem digitação nos dois sentidos, expiração automática de 2 minutos, consumo único no servidor e preservação integral do E2EE (o servidor vê apenas texto cifrado no fluxo reverso).
- **Negativas / limitações**: o fluxo reverso via servidor requer que o servidor remoto esteja com as rotas `/v1/pairing` publicadas (enquanto isso, o fluxo direto funciona imediatamente com qualquer servidor).
