# 0019 — Criptografia da sincronização com Web Crypto

- Status: Aceito
- Data: 2026-11-13
- Complementa: [0018](0018-protocolo-sincronizacao.md)

## Contexto

O ADR 0018 exige cifrar notas e imagens no aparelho, sem criptografia própria, e pede
escolher a implementação antes de S3. O app roda no WebView do Android e no do Tauri
(WebKitGTK no Linux, WebView2 no Windows), além do navegador na versão web.

## Decisão

Usar a Web Crypto API da plataforma (`crypto.subtle`), sem dependência nova:

- AES-256-GCM, chave aleatória de 32 bytes, IV aleatório de 12 bytes por envelope.
- O ID da nota (`note:<id>`) ou da imagem (`blob:<id>`) entra como dado autenticado:
  um envelope não pode ser trocado de nota sem falhar a decifragem.
- Formato do envelope: byte de versão (1) + IV + texto cifrado com a etiqueta GCM. Notas
  viajam em base64url; imagens, em bytes. O endereço do blob é o SHA-256 do envelope.
- Chave de recuperação: a chave em base32 Crockford, mais 2 bytes de verificação (SHA-256),
  em grupos de cinco caracteres. Erros de digitação são detectados antes do uso.

O código está em `src/sync/crypto.js`, com testes em `src/sync-crypto.test.js`.

## Alternativas

- libsodium (XChaCha20-Poly1305): IV maior e API mais difícil de usar errado, mas acrescenta
  uma dependência WASM ao app nas três plataformas. AES-GCM com IV aleatório é seguro para o
  volume de envelopes de uma pessoa.
- Cifrar em Rust no Tauri: não serve à versão web nem ao Android sem outra ponte.

## Consequências

- `crypto.subtle` exige contexto seguro. Ainda falta conferir no APK e no AppImage/NSIS que
  a origem do app é tratada como segura (lista de validação do plano mobile).
- Trocar de algoritmo depois exige novo byte de versão e decifrar os envelopes antigos.
- O cofre de chaves de cada plataforma continua em aberto (S3.2).
