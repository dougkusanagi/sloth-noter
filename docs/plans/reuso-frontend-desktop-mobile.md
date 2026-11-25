# Reuso de frontend entre desktop e mobile (“mesmo cérebro, duas cascas”)

Tipo: ativo

## Objetivo

Reduzir a duplicação de lógica de aplicação e de componentes de conteúdo entre o desktop
([main.jsx](../../src/main.jsx)) e o mobile ([mobile-shell.jsx](../../src/mobile/mobile-shell.jsx)),
**mantendo separadas as cascas e a ergonomia de cada plataforma** (abas/sidebar/atalhos no desktop;
pilha de telas/bottom nav/bottom sheets/barra de formatação acima do teclado no mobile).

## Princípio arquitetural

1. **Camada 1 — Domínio + Hooks headless (100% compartilhado):** mutações puras de documento,
   boot do workspace, tema, sincronização, backup e importação de imagens.
2. **Camada 2 — Componentes de conteúdo (compartilhado com variações leves):** componentes que
   não assumem se estão num modal/popover (desktop) ou numa tela/bottom sheet (mobile), seguindo o
   padrão de `TaskBoard`, `SyncPanel`, `CoverPicker` e `DocumentOutline`.
3. **Camada 3 — Casca e ergonomia (separado por plataforma):** navegação, gestos, barras,
   teclado virtual e integrações nativas permanecem dedicados em `src/mobile/`.

## Etapas

### R1 — Unificar mutações puras de documento
- [x] Criar `src/document-mutations.js` com operações puras compartilhadas (`createNoteDocument`,
  `updateNoteBody`, `renameNoteDocument`, `togglePinnedNote`, `setNoteBoardView`,
  `toggleNoteWrap`, `applyNoteCover`, `applyNoteIcon`).
- [x] Garantir comportamento consistente entre desktop e mobile (`modifiedAt`, `revision`,
  `renameWikiReferences`, `ensureTitle`, `isExternalNote`).
- [x] Integrar `src/document-mutations.js` em `src/mobile/note-actions.js`, `src/mobile/mobile-shell.jsx`,
  `src/main.jsx` e `src/hooks/use-note-actions.js`.
- [x] Cobrir com testes unitários (`src/document-mutations.test.js`) e manter toda a suíte existente verde.

### R2 — Extrair hooks compartilhados de sessão
- [x] Criar `src/hooks/use-workspace-boot.js` (carregamento de persistência + workspace + retry/reload)
  e aplicar em `App` (`src/main.jsx`) e `MobileShell` (`src/mobile/mobile-shell.jsx`).
- [x] Criar `src/hooks/use-theme.js` (aplicação de `data-theme` com `prefers-color-scheme`) e
  aplicar em ambos os shells (`src/main.jsx` e `src/mobile/mobile-shell.jsx`).
- [ ] Avaliar extração de `use-backup-actions.js` e `use-image-import.js` onde a lógica for comum.

### R3 — Compartilhar componentes de conteúdo
- [x] Extrair controles compartilhados de Editor em `src/components/settings-sections.jsx` e aplicar
  em `src/components/settings-dialog.jsx` e na tela de Configurações do mobile.
- [x] Integrar `NoteCoverBanner` no modo de leitura do mobile (`src/mobile/mobile-shell.jsx`).

### R4 — Unificar catálogos de blocos e comandos
- [x] Criar `src/block-catalog.js` com `BLOCK_LABELS`, `CALLOUT_VARIANTS` e `MOBILE_INSERT_BLOCKS`
  compartilhados entre desktop (`src/visual-editor.jsx`) e mobile (`src/mobile/editing-sheet.jsx`).

## Critério de conclusão

- `bun test` (unitários JS + servidor), `bun run lint` e `bun run build` aprovados.
- `mobile-shell.jsx` e `main.jsx` sem duplicação de mutações de documento nem de boot/tema.
- Evidências registradas aqui e em [prioridades.md](prioridades.md).
