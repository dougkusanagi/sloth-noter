# Prioridades de execução

Tipo: contínuo

## Objetivo

Manter uma única fila entre os planos do Sloth Note. Este documento define a prioridade entre
frentes; cada plano mantém o escopo, as etapas, as dependências e as evidências da sua frente.
O [roteiro](../ROADMAP.md) guarda a direção do produto, não uma segunda fila de execução.

## Como retomar

- Ao receber “continue o plano” sem outra indicação, retomar a etapa ativa abaixo.
- Trabalhar em uma etapa por vez. Um pedido explícito pode alterar a prioridade; registrar a
  mudança aqui e no plano afetado.
- Distinguir código implementado, validação no navegador e validação nativa. Testes existentes
  e relatos antigos não comprovam que a suíte atual passa.
- Ao concluir uma etapa, registrar as evidências no plano correspondente e avançar esta fila.
  Antes de apagar um plano concluído, preservar decisões em ADR e fatos duráveis na documentação,
  corrigindo todos os links para ele. Planos com validação pendente continuam abertos.
- Publicação, implantação e alteração de dados reais seguem as autorizações próprias do projeto.

## Fila

| Prioridade | Frente e planos                                                                                                                                                                            | Critério para avançar                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — feita  | Fechar entregas do editor, de imagens e navegação e de status, arquivo e Quadro (concluída na 0.25.2)                                                                                      | Guias e rolagem corrigidas/verificadas, suíte completa aprovada, ADR 0041 registrado, Recursos/ajuda/Novidades atualizados, pendências nativas preservadas em `mobile-interface.md` e planos concluídos removidos.                             |
| 2 — feita  | Sincronização e proteção dos dados: [S4 do plano Android](mobile-interface.md#fila--2-sincronização) (navegador concluído na 0.37.1; validação nativa registrada em `mobile-interface.md`) | Fluxo de conta única, notas e imagens nos dois sentidos, conflito, exclusão, restauração, falhas de rede e recuperação validados no navegador; rotas de contas confirmadas no Worker; pendências nativas preservadas em `mobile-interface.md`. |
| 3 — feita  | Reuso de frontend desktop ↔ mobile: [R1–R4](reuso-frontend-desktop-mobile.md) (concluída em 2026-11-24)                                                                                    | Unificar mutações puras de documento, hooks compartilhados de sessão e componentes de conteúdo sem misturar as cascas de plataforma; manter testes unitários, lint e build verdes antes de retomar A7–A19.                                     |
| 4 — feita  | Uso diário no Android: [paridade A5–A19](mobile-interface.md#fila--3-restante-da-paridade) (navegador concluído em 2026-11-24; validação nativa registrada em `mobile-interface.md`)       | Seguir a ordem local, conferindo primeiro o que já existe; não reimplementar etapas parcialmente prontas. Cumprir o critério de paridade dos requisitos antes de iniciar ideias novas.                                                         |
| 5 — feita  | Pendências de [leitura, modelos e variáveis](leitura-e-modelos.md) (concluída na 0.43.0)                                                                                                   | Conferir o que foi entregue e concluir as pendências funcionais antes dos opcionais tipográficos. Quando uma pendência também fizer parte da paridade Android, executá-la na prioridade 4 e atualizar ambos os planos.                         |
| 6 — ativa  | Recursos novos e polimento opcional do [roteiro](../ROADMAP.md)                                                                                                                            | Entrar após estabilizar os fluxos anteriores; no mobile, Parte B antes da Parte C, conforme os requisitos.                                                                                                                                     |

Um defeito que comprometa gravação, integridade ou recuperação dos dados passa à frente da fila;
registrar a evidência e o ajuste de prioridade antes de continuar.

## Etapa ativa — pendências de leitura, modelos e variáveis (Prioridade 5)

### Concluído em reuso de frontend desktop ↔ mobile (R1–R4, 2026-11-24)

- [x] **R1 — Unificar mutações puras de documento** ([reuso-frontend-desktop-mobile.md](reuso-frontend-desktop-mobile.md#r1--unificar-mutações-puras-de-documento)): `src/document-mutations.js` criado e integrado em desktop e mobile.
- [x] **R2 — Extrair hooks compartilhados de sessão**: `use-workspace-boot.js` e `use-theme.js` integrados em ambos os shells.
- [x] **R3 — Compartilhar componentes de conteúdo**: `EditorToggleSettings` (`src/components/settings-sections.jsx`) e `NoteCoverBanner` integrados em desktop e mobile.
- [x] **R4 — Unificar catálogos de blocos**: `src/block-catalog.js` compartilhado entre `VisualEditor` e `EditingSheet`.

### Próxima frente ativa — uso diário no Android (A7–A19)

- [x] A5 — Modo Código concluída no navegador em 2026-11-24 (0.38.0).
- [x] A6 — Buscar e comandos concluída no navegador em 2026-11-24 (0.39.0): folha única com busca por nome/texto, contagem e abertura na 1ª ocorrência, `>` comandos, `#` títulos, criação rápida e `Ctrl+P`/`Ctrl+Shift+P` (`e2e/mobile/commands.spec.js`).
- [x] A7 — Grupos e ordenação da lista concluída no navegador em 2026-11-24: grupos do desktop recolhíveis, busca ocultando grupos sem resultado, ordenação recentes/alfabética (`prefs.noteSort`) e mover nota de pasta pela folha de ações (`e2e/mobile/groups.spec.js`).
- [x] A8 — Notas abertas concluída no navegador em 2026-11-24: título no cabeçalho abre folha **Notas abertas** com nota atual marcada, fechar individual, fechar as outras, preservação de modo/cursor/rolagem por nota e persistência de `openIds` (`e2e/mobile/open-notes.spec.js`).
- [x] A9 — Ações de documento concluída no navegador em 2026-11-24: buscar e substituir em edição (`EditorFind` com desfazer), Informações (`textStatistics`), recolher/expandir todas as seções e mover seção (`moveSectionBy` com desfazer) (`e2e/mobile/document-actions.spec.js`).
- [x] A10 — Leitura: concluir interações concluída no navegador em 2026-11-24: `[[Nota#Título]]`, criação de nota ausente por toast, links externos e progresso de seções validados em 320 dp sem abrir teclado (`e2e/mobile/reading-interactions.spec.js`).
- [x] A11 — Tabelas concluída no navegador em 2026-11-24 (`e2e/mobile/tables.spec.js`, `e2e/mobile/formatting-bar.spec.js`).
- [x] A12 — Colunas concluída no navegador em 2026-11-24 (`e2e/mobile/columns.spec.js`).
- [x] A13 — Imagens concluída no navegador em 2026-11-24 (`e2e/mobile/images.spec.js`).
- [x] A14 — Arquivos concluída no navegador em 2026-11-24 (`src/mobile/mobile-shell.jsx`, `src/mobile/backup-panel.jsx`).
- [x] A15 — Histórico de versões concluída no navegador em 2026-11-24 (`e2e/mobile/history.spec.js`).
- [x] A16 — Classes de janela e teclado físico concluída no navegador em 2026-11-24 (`e2e/mobile/window-classes.spec.js`).
- [x] A17 — Status de tarefas e Quadro concluída em 2026-11-17 (`e2e/mobile/task-board.spec.js`).
- [x] A18 — Polimento nativo concluída no navegador em 2026-11-24 (validação nativa pendente registrada em `mobile-interface.md`).
- [x] A19 — Integração Android concluída no navegador em 2026-11-24 (ponte `takeOpenedFile` como cópia interna; validação nativa pendente registrada em `mobile-interface.md`).

## Evidências da prioridade 2 (2026-11-24, versão 0.37.1)

- Conferido o alinhamento de `src/sync/`, `src/hooks/use-sync.js`, `src/components/sync-panel.jsx` e `server/` com os ADRs 0024 (contas com e-mail, senha, convite e chave de recuperação) e 0031 (conta única sem perfis locais, segredo único `sync`).
- Expandido `e2e/sync.spec.js` com dois testes ponta a ponta desktop ↔ celular contra o servidor real em memória (`server/accounts.js` + `server/api.js`): edição bidirecional da mesma nota, conflito na mesma linha preservando ambas as versões, lixeira, restauração, exclusão definitiva, falha de rede com preservação local e retomada, e imagem inserida no celular enviada como blob cifrado (`/v1/blobs/`) e exibida no desktop.
- Validação no navegador: 7/7 testes de `e2e/sync.spec.js` e `e2e/mobile/sync.spec.js` aprovados; suíte unitária JS + servidor (597 testes), Rust (`cargo test`), lint, formatação, versão e build aprovados.
- Conferência do Worker publicado (`https://sloth-note-sync.dl-aguiar.workers.dev/v1/sessions`): responde `400 {"error":"bad_request"}`, confirmando que as rotas de contas estão no ar.
- Validação nativa real (desktop Tauri e APK Android): nenhum aparelho conectado via `adb devices` em 2026-11-24; os cenários reais de aparelho permanecem registrados separadamente em [mobile-interface.md](mobile-interface.md#validação-no-aparelho-pendente).

## Evidências da prioridade 1 (2026-11-17, versão 0.25.2)

- `e2e/rails.spec.js` passou em 30/30 execuções consecutivas (`--repeat-each=10` nas três verificações).
- `e2e/insert-trigger.spec.js:67` falhava quando `liveMarkdown` decorava parágrafos recém-revelados após `Control+End`, empurrando a última linha para baixo de `.document-info`. Corrigido em `src/visual-editor.jsx` ajustando a rolagem somente após transações com `scrollIntoView`, sem afetar `tab-position` nem `tab-scroll` (30/30 execuções em `insert-trigger.spec.js`).
- `e2e/chrome-refinements.spec.js:94` falhava em 390 px porque `.document-info` quebrava em duas linhas (74 px) após a entrada do botão de sincronização, estourando `min-height: calc(100dvh - 80px)`. Corrigido em `src/styles.css` usando `min-height: 0` nos contêineres flexíveis.
- No celular, `src/mobile/mobile-shell.jsx` passou a sincronizar `taskSettings.dates` com `prefs.taskDates`, coberto em `e2e/mobile/task-board.spec.js`.
- Registrado o [ADR 0041](../adr/0041-preferencia-do-quadro-em-preferences.md) (`preferences.boardNotes` em vez de `noteMeta`, atualizando o ADR 0006). Atualizados `README.md`, `docs/RECURSOS.md`, `src/welcome.js`, `docs/ROADMAP.md`, `docs/HUB-DE-PROJETOS.md`, `docs/plano-mobile.md`, `docs/plans/mobile-interface.md` e `docs/plans/leitura-e-modelos.md`. Removidos os três planos concluídos (`ideias-editor.md`, `melhorias-editor-imagens.md` e `status-arquivo-quadro-tarefas.md`).
- Suíte local completa aprovada no Windows (Node, Rust, lint, build e Playwright desktop + mobile) e interface conferida em 1280 px e 390 px nos temas claro e escuro, incluindo a entrada 0.25.2 em **Novidades**.

## Conferência em 2026-11-17

- A árvore estava sem alterações locais ao iniciar. A versão atual é 0.25.0.
- Os planos de editor e imagens registram implementação pronta, mas ainda pedem validação final.
  A reorganização documental não executa nem declara aprovada essa validação.
- O plano do Quadro tem as quatro etapas marcadas e critérios transversais ainda abertos.
  `preferences.boardNotes` existe nas duas cascas; a diferença para o ADR 0006 precisa ser
  registrada em novo ADR antes de encerrar esse plano.
- Blocos `<details>` foram removidos pelo ADR 0029; não são uma entrega pendente.
- Modelos próprios como notas marcadas (ADR 0026), variáveis `{{nome}}` e tipos YAML (ADR 0027)
  já foram decididos. O painel desktop veio no ADR 0028 e passou para cima da nota no ADR 0030. Essas escolhas não dependem de nova consulta.
- S4 tem código e evidências anteriores, mas a validação da conexão antiga não comprova o fluxo
  atual de conta. O estado remoto de migrações e implantação precisa ser conferido na retomada.
- A5 já tem implementação descrita no histórico mobile; sua caixa continua aberta até conferir
  todos os critérios. Não é necessário começar o modo Código do zero.

## Tentativas que falharam

As tentativas técnicas permanecem nos planos de origem: guias e arraste no editor, rolagem em
leitura/modelos e execução simultânea do Playwright em imagens/navegação.

## Dúvidas abertas

Nenhuma sobre a ordem aprovada. Questões de produto ainda abertas ficam nos planos de origem e
só bloqueiam a etapa que depende delas.

## Próximo passo

Prioridades 1 a 5 concluídas (0.43.0). Próxima frente: recursos novos e polimento opcional do [roteiro](../ROADMAP.md) (Prioridade 6) ou validação nativa pendente em [mobile-interface.md](mobile-interface.md).
