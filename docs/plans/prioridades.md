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

| Prioridade                                                      | Frente e planos                                                                                       | Critério para avançar                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — feita                                                       | Fechar entregas do editor, de imagens e navegação e de status, arquivo e Quadro (concluída na 0.25.2) | Guias e rolagem corrigidas/verificadas, suíte completa aprovada, ADR 0041 registrado, Recursos/ajuda/Novidades atualizados, pendências nativas preservadas em `mobile-interface.md` e planos concluídos removidos.                                                                         |
| 2 — feita (navegador e Worker local; nativo pendente na 0.38.7) | Sincronização e proteção dos dados: [S4 do plano Android](mobile-interface.md#fila--2-sincronização)  | Fluxo de conta única, notas, imagens, conflito, exclusão/restauração, falhas e recuperação validado no navegador (desktop ↔ mobile) e no Worker local (D1 + R2); migrações e Worker remoto conferidos; validação nos apps nativos reais registrada como pendente em `mobile-interface.md`. |
| 3 — ativa                                                       | Uso diário no Android: [paridade A5–A19](mobile-interface.md#fila--3-restante-da-paridade)            | Seguir a ordem local, conferindo primeiro o que já existe; não reimplementar etapas parcialmente prontas. Cumprir o critério de paridade dos requisitos antes de iniciar ideias novas.                                                                                                     |
| 4                                                               | Pendências de [leitura, modelos e variáveis](leitura-e-modelos.md)                                    | Conferir o que foi entregue e concluir as pendências funcionais antes dos opcionais tipográficos. Quando uma pendência também fizer parte da paridade Android, executá-la na prioridade 3 e atualizar ambos os planos.                                                                     |
| 5                                                               | Recursos novos e polimento opcional do [roteiro](../ROADMAP.md)                                       | Entrar após estabilizar os fluxos anteriores; no mobile, Parte B antes da Parte C, conforme os requisitos.                                                                                                                                                                                 |

Um defeito que comprometa gravação, integridade ou recuperação dos dados passa à frente da fila;
registrar a evidência e o ajuste de prioridade antes de continuar.

## Etapa ativa — uso diário no Android: A5 — Modo Código

- [ ] Conferir a implementação existente do modo Código em `src/mobile/mobile-shell.jsx` e `src/mobile/formatting-bar.jsx` frente aos critérios de A5 ([mobile-interface.md](mobile-interface.md#fila--3-restante-da-paridade)) e requisitos 5.6 (linha "Modo Código").
- [ ] Conferir se a escolha CodeMirror sem decorações (decisão 3) está registrada e coberta por testes de texto, seleção, desfazer/refazer, histórico, preferência por nota e teclas de símbolos, sem alterar o editor desktop.
- [ ] Corrigir lacunas encontradas, validar a suíte completa e inspecionar capturas em 320/390 px e desktop antes de avançar para A6.

## Evidências da prioridade 2 — S4 (2026-11-24, versão 0.38.7)

- **Auditoria e correções:** `src/sync/engine.js` passou a preservar `retryAfter` em erros `rate_limited` (429); `src/hooks/use-sync.js` respeita essa pausa nas rodadas automáticas (ADR 0018) e notifica `onImagesChanged` ao gravar imagens recebidas, limpando o cache de imagens e recarregando a aba **Imagens** no desktop (`src/main.jsx` e `src/mobile/mobile-shell.jsx`); `SecretsBridge.kt` no Android passou a aceitar apenas a chave `sync`, alinhado ao `src-tauri/src/secrets.rs` e ao ADR 0031.
- **Navegador (desktop ↔ mobile):** `e2e/sync.spec.js` (6 testes) e `e2e/mobile/sync.spec.js` (2 testes) validaram conta única, notas e imagens cifradas nos dois sentidos (incluindo imagem enviada do celular renderizando no desktop e aparecendo na aba Imagens), mesclagem sem conflito, conflito na mesma linha preservando as duas versões, lixeira/restauração/exclusão definitiva, falhas offline/500/429/401 e recuperação por chave.
- **Worker local (D1 + R2 reais):** validado via HTTP real contra `wrangler dev --local` com migrações 0001–0004 aplicadas e convite criado: conta, prévia, notas, imagem no R2, mesclagem, conflito, lixeira/restauração/exclusão definitiva e recuperação por chave com 401 na sessão revogada.
- **Servidor remoto (somente leitura):** `wrangler d1 migrations list --remote --config wrangler.local.toml` confirmou todas as migrações (0001–0004) aplicadas; `node server/admin.js uso` leu o uso de R2/D1; `POST /v1/sessions` no Worker publicado respondeu `400 bad_request`, confirmando rotas de conta ativas. Nenhum dado real foi modificado.
- **Aplicativos nativos reais (pendente):** `adb devices` não listou aparelho conectado; validação no desktop Tauri real e no APK Android contra o servidor implantado registrada como pendente em [mobile-interface.md](mobile-interface.md#validação-no-aparelho-pendente).

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

Iniciar a prioridade 3 ([A5 — Modo Código](mobile-interface.md#fila--3-restante-da-paridade)): conferir a implementação já existente do modo Código na casca mobile frente aos critérios da etapa antes de alterar código, mantendo a validação nativa real de S4 na lista pendente de [mobile-interface.md](mobile-interface.md#validação-no-aparelho-pendente).
