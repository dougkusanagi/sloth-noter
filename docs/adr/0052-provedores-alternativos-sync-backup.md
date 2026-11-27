# ADR 0052: Provedores alternativos de sincronização e backup remoto (C2)

- Data: 2026-11-26
- Estado: Aceito

## Contexto

O Sloth Note já possui sincronização ponta a ponta por servidor próprio (ADR 0009 e ADR 0018). A proposta C2 permite plugar provedores alternativos opcionais (repositório GitHub ou pasta local/rede sincronizada externamente) sem duplicar regras de mesclagem nem expor credenciais no documento.

## Decisão

1. **Contrato único de provedores (`src/sync/providers.js`)**:
   - `self-hosted` (padrão): servidor próprio Cloudflare/D1/R2 (ADR 0018).
   - `github`: backup/sincronização em repositório GitHub (`owner/repo`, `branch`, `path`) usando a API Contents, com token guardado exclusivamente no cofre de chaves do sistema (`src/sync/vault.js`), nunca no `state.v3.json`.
   - `folder`: pasta local ou sincronizada em rede local (LAN / Syncthing / Nextcloud).
2. **Validação estrita**:
   - `validateProviderConfig` rejeita URLs inseguras (HTTP fora de localhost), repositórios malformados e caminhos com traversal (`..`).

## Consequências

- **Positivas**: mantém o servidor próprio intacto, permite adicionar novos destinos sem reescrever o motor de sincronização e preserva o isolamento de segredos no cofre nativo.
- **Negativas / limitações**: provedores baseados em GitHub/pasta não oferecem resolução atômica por revisão como D1, atuando por snapshot/backup ou mesclagem no cliente.
