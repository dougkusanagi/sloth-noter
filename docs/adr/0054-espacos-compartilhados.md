# ADR 0054: Espaços compartilhados entre contas

- **Status:** Aceito
- **Data:** 2026-11-27

## Contexto

O Sloth Note já possui contas com sincronização cifrada de ponta a ponta (ADR 0018, ADR 0019 e ADR 0024), onde cada conta tem sua própria chave simétrica de notas (`noteKey`) protegida pela senha (`wrapKey`). Para permitir que duas ou mais contas compartilhem um conjunto de notas sem expor o conteúdo ao servidor e sem misturar notas pessoais, precisamos definir o nome do recurso, os níveis de acesso, o modelo criptográfico, o armazenamento local e o comportamento ao remover membros.

## Decisão

### 1. Nome
O recurso chama-se **Espaço compartilhado** ("Espaço" na interface em português; "Shared space" em inglês). As notas pessoais permanecem fora de qualquer espaço compartilhado e não mudam de comportamento.

### 2. Níveis de acesso
Cada espaço possui exatamente um **Dono** (`owner`) e membros com papel **Editor** (`editor`) ou **Leitor** (`viewer`):

| Nível | Ver notas | Criar, editar e apagar notas | Convidar, alterar nível e remover pessoas | Excluir o espaço |
| --- | --- | --- | --- | --- |
| Dono (`owner`) | sim | sim | sim | sim |
| Editor (`editor`) | sim | sim | não | não |
| Leitor (`viewer`) | sim | não | não | não |

Qualquer membro pode sair do espaço. A autorização é verificada no servidor em toda leitura e gravação (`GET`/`PUT` de notas, `changes` e `blobs`), retornando `403 forbidden` quando um leitor tenta gravar ou quando uma conta não é membro.

### 3. Modelo de chaves (E2EE)
- Cada conta possui um par de chaves assimétricas **ECDH P-256** (Web Crypto nativa nos WebViews de desktop e Android):
  - `public_key` (JWK) armazenada em claro na tabela `accounts`.
  - `wrapped_private_key` (PKCS#8 cifrado com AES-256-GCM usando a `wrapKey` da conta, com `additionalData` vinculado ao e-mail).
- Contas novas geram o par de chaves no cadastro. Contas existentes geram e enviam o par automaticamente no próximo login (`PUT /v1/accounts/me/keys`), sem pedir a senha novamente.
- Cada espaço compartilhado possui uma chave simétrica AES-256-GCM própria (`spaceKey`, 256 bits).
- Para entregar a `spaceKey` a um membro (inclusive ao próprio dono na criação), o remetente gera um par efêmero ECDH P-256, deriva uma chave de transporte via HKDF-SHA256 vinculada ao `spaceId` e cifra os 32 bytes da `spaceKey` com AES-256-GCM.
- **Verificação de chave pública:** neste nível básico, adota-se confiança na primeira entrega pelo servidor (TOFU). A verificação fora de banda por QR/fingerprint fica como evolução futura e o risco residual fica registrado aqui.

### 4. Sincronização e armazenamento local
- O servidor armazena notas e blobs de espaços compartilhados em tabelas próprias (`shared_space_notes` e `shared_space_blob_sizes`, prefixo `shared/<spaceId>/<sha>` no R2), usando o mesmo contrato de revisões, ETag e cursor do ADR 0018 sob `/v1/spaces/:spaceId/...`.
- No cliente, cada espaço mantém seu próprio estado de sincronização (`cursor`, `bases`, `blobs`) separado das notas pessoais. Notas pertencentes a um espaço carregam `spaceId` no modelo do documento, mantendo a biblioteca pessoal isolada.
- Não há colaboração em tempo real: edições simultâneas seguem o mesmo fluxo de mesclagem e conflitos já existente.
- O armazenamento de imagens (R2) de um espaço compartilhado soma na cota global do servidor e é contabilizado para o dono do espaço.

### 5. Remoção de membro e exclusão de espaço
- Ao remover um membro, o servidor exclui o vínculo em `space_members` imediatamente, cortando leituras e gravações futuras.
- O cliente do dono rotaciona a chave do espaço (`POST /v1/spaces/:id/rotate-key`), distribuindo a nova `spaceKey` cifrada apenas aos membros restantes, para que notas futuras e recifradas não sejam legíveis pelo membro removido.
- Ao excluir o espaço, o servidor remove o espaço, membros, convites pendentes, notas e referências de blobs associados.

## Alternativas consideradas

- **Usar X25519 em vez de ECDH P-256:** descartado por ainda não ter suporte garantido em todos os WebViews alvo (Linux/WebKitGTK, Windows/WebView2, Android WebView).
- **Salvar notas do espaço em subpastas `.md` separadas na pasta pessoal:** adiado para evitar conflitos com renomeação/exclusão externa da subpasta; o modelo unificado com `spaceId` funciona de forma idêntica no desktop e no Android.

## Consequências

- Contas antigas migram de forma transparente no próximo login.
- Leitores têm proteção garantida tanto na interface (editor somente leitura com aviso) quanto no servidor (`403`).
- O servidor continua incapaz de ler o conteúdo das notas e imagens dos espaços compartilhados.
