# ADR 0043: Data de criação da nota (`createdAt`) e variável `{{created}}`

- Estado: Aceito
- Data: 2026-11-25

## Contexto

O plano de leitura, modelos e variáveis (`docs/plans/leitura-e-modelos.md`, Parte 3.4) prevê a
variável `{{created}}` para exibir a data de criação da nota sem reescrever o texto do arquivo.
Antes desta mudança, cada nota armazenava apenas `modifiedAt` nos metadados do documento
(`src/storage.js`, `src/document-mutations.js`, `src/sync/document.js`). Notas antigas criadas
antes desta versão não possuem data de criação registrada.

## Decisão

1. **Metadado `createdAt`**: novas notas passam a gravar `createdAt` (timestamp em milissegundos,
   inteiro seguro não negativo) no momento da criação (`createNoteDocument`), com o mesmo valor
   inicial de `modifiedAt`.
2. **Compatibilidade com notas existentes**: `createdAt` é opcional na validação de `src/storage.js`.
   Notas antigas não recebem uma data inventada; quando `createdAt` está ausente, `{{created}}`
   exibe o texto traduzido "data de criação desconhecida" (`unknown creation date`).
3. **Sincronização**: o payload cifrado da nota em `src/sync/document.js` inclui `createdAt`
   quando presente e preserva o valor existente ao aplicar atualizações remotas, sem alterar o
   protocolo do servidor (ADR 0018).

## Alternativas consideradas

- **Usar a data de criação do arquivo no sistema operacional (`birthtime`)**: descartada como fonte
  principal porque Linux e cópias/restaurações de backup frequentemente não preservam `birthtime`,
  e o app web/Android em armazenamento interno não expõe `birthtime` de forma consistente.
- **Preencher `createdAt` com `modifiedAt` em notas antigas**: descartada para não apresentar uma
  data de edição como se fosse a data original de criação.

## Consequências

- Novas notas criadas no desktop ou no celular exibem a data de criação correta em `{{created}}`,
  inclusive após sincronizar entre aparelhos.
- Notas antigas continuam válidas sem migração destrutiva e informam claramente quando a data de
  criação não está registrada.
