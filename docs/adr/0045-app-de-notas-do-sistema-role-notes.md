# ADR 0045: App de notas do sistema (`ROLE_NOTES`, Android 14+)

- Estado: Aceito
- Data: 2026-11-26

## Contexto

O item **B4** dos [requisitos mobile](../plano-mobile.md#91-recursos-da-plataforma) prevê suporte ao papel `ROLE_NOTES` do Android 14+ (`android.intent.action.CREATE_NOTE`) para abrir uma nota nova rapidamente pela caneta ou pelo atalho da tela de bloqueio. Os requisitos determinam definir antes da implementação o que aparece com o aparelho bloqueado para garantir privacidade.

Hoje o aplicativo mantém as notas em `state.v3.json` (lido pelo backend Rust via `read_state` em `src-tauri/src/store.rs` com `STATE_WRITE_LOCK`) e exibe toda a biblioteca, busca, tarefas, imagens, histórico e configurações dentro de um único `WebView` na `MainActivity`.

## Decisão

1. **`QuickNoteActivity` isolada para `ACTION_CREATE_NOTE`**:
   - Somente a nova `QuickNoteActivity` declara `android:showWhenLocked="true"`, `android:turnScreenOn="true"`, `android:exported="true"`, `android:resizeableActivity="true"`, `android:taskAffinity=""`, `android:excludeFromRecents="true"` e o `<intent-filter>` de `android.intent.action.CREATE_NOTE`.
   - **`MainActivity` não declara `showWhenLocked`**, impedindo que o `WebView` ou qualquer frame anterior das notas do usuário apareça sobre a tela de bloqueio.

2. **Separação explícita entre aparelho bloqueado e desbloqueado (`KeyguardManager.isKeyguardLocked`)**:
   - **Desbloqueado**: `QuickNoteActivity` encaminha imediatamente para `MainActivity` com a ação `dev.slothnote.app.NEW_NOTE` e encerra-se (`finish()`), abrindo uma nota em branco diretamente no editor.
   - **Bloqueado**: `QuickNoteActivity` apresenta apenas um compositor nativo em branco (campo de título opcional e campo de corpo multiline compatível com teclado e caneta), aviso de privacidade ("Tela bloqueada — suas outras notas ficam protegidas."), e as ações **Descartar**, **Salvar** e **Desbloquear e abrir** (`KeyguardManager.requestDismissKeyguard`). Nenhuma nota existente, rascunho anterior ou configuração de sincronização é lida ou exibida enquanto o aparelho estiver bloqueado.

3. **Fila local de saída (`filesDir/pending-notes/`) em vez de escrita direta em `state.v3.json`**:
   - Cada nota criada na tela de bloqueio é gravada atomicamente (`<id>.json.tmp` + `fsync` + `rename`) em `filesDir/pending-notes/<uuid>.json`, mantendo o mesmo `sessionId` caso o rascunho precise ser salvo automaticamente em `onStop()` (por exemplo, se a tela apagar).
   - Quando `MainActivity` inicia ou volta ao primeiro plano (`onResume` e `visibilitychange`), a casca mobile consulta `SlothSystem.takePendingNotes()`, ingere as notas de forma idempotente pelo `id` (em `notes` e `trash`), aguarda a confirmação da gravação local (`writer.current.whenIdle()`) e só então remove os arquivos confirmados via `SlothSystem.ackPendingNotes(idsJson)`.

4. **Solicitação do papel em Configurações**:
   - Em dispositivos Android 14+ onde `RoleManager.isRoleAvailable(RoleManager.ROLE_NOTES)` for verdadeiro, Configurações → Sistema exibe o estado do papel e um botão para solicitá-lo ao sistema (`RoleManager.createRequestRoleIntent`). Em web, desktop e versões anteriores sem suporte ao papel, a seção permanece oculta.

## Alternativas consideradas

- **Abrir a própria `MainActivity` com `showWhenLocked="true"` e ocultar a lista por JavaScript**: descartada porque o último frame renderizado no `WebView` ou falhas de inicialização poderiam expor notas existentes na tela de bloqueio, além de manter acesso ao estado completo em memória.
- **Escrever diretamente em `state.v3.json` a partir do Kotlin**: descartada por criar condição de corrida com o `STATE_WRITE_LOCK` do processo Rust e com o documento em memória mantido por `MainActivity` quando já aberto em segundo plano.

## Consequências

- Criação rápida de notas na tela de bloqueio ou por caneta com isolamento estrutural de privacidade.
- Nenhuma nota se perde se a tela apagar antes de tocar em Salvar ou se o app demorar a abrir após o desbloqueio, e a confirmação pós-persistência evita duplicidades ou perda durante a transferência.
- A validação com atalho real na tela de bloqueio e caneta física em dispositivo Android 14+ permanece registrada na lista de validação em aparelho.
