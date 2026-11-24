# 0041 — Preferência do modo Quadro em `preferences.boardNotes`

- Estado: aceito
- Data: 2026-11-17
- Atualiza: [0006](0006-modo-quadro.md)

## Contexto

O [ADR 0006](0006-modo-quadro.md) decidiu que o modo **Quadro** seria lembrado por nota nos
metadados `noteMeta`, fora do arquivo `.md`. Durante a implementação das etapas desktop e mobile
do Quadro, observou-se que o aplicativo já armazena escolhas visuais por nota em `preferences`
(`wrapLinesByNote` e, depois, `templateNotes` no [ADR 0026](0026-modelos-proprios-como-notas-marcadas.md)),
que já participa da validação de documento, do backup JSON, do estado auxiliar da pasta de notas
e das duas cascas (desktop e mobile).

## Decisão

Guardar a escolha do modo Quadro por nota em `preferences.boardNotes` (mapa `id da nota → true`),
em vez de `noteMeta`.

- Ativar o Quadro grava `boardNotes[noteId] = true`; voltar para Padrão, Código ou Leitura
  (ou para a nota no celular) remove a chave da nota.
- Os demais modos continuam globais no desktop; no celular, o botão de alternância no cabeçalho
  da nota lê e atualiza o mesmo mapa `preferences.boardNotes`.
- O arquivo `.md` continua inalterado, preservando compatibilidade total com outros editores.
- Entradas órfãs de notas excluídas são inofensivas e ignoradas na leitura, seguindo o mesmo
  contrato de `wrapLinesByNote` e `templateNotes`.

## Alternativas

- **Campo em `noteMeta` (previsto originalmente no ADR 0006):** exigiria migrar e sincronizar
  outro recipiente para uma preferência estritamente de visualização que já tem equivalente em
  `preferences`.
- **Frontmatter YAML na nota:** descartado pelos mesmos motivos do ADR 0006 (poluiria o arquivo
  Markdown visível em outros aplicativos).

## Consequências

- `preferences.boardNotes` acompanha automaticamente o backup exportado e o estado auxiliar do
  vault local, sem tocar nos arquivos `.md`.
- O item do ADR 0006 que mencionava `noteMeta` fica substituído por esta decisão; todas as
  demais regras do modo Quadro no ADR 0006 permanecem válidas.
