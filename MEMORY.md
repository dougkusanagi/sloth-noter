# Memória operacional

- Os builds desktop e Android compartilham `dist/`; execute-os em sequência para não embutir a interface da outra plataforma.
- Neste Linux, o JDK 21 fica em `/home/servidor/.local/share/sloth-android/jdk-21` e o SDK Android em `/home/servidor/Android/Sdk`; configure `JAVA_HOME` e `ANDROID_HOME` ao compilar.

- Antes de gerar APK, confirme o checkout e as mudanças locais de outros worktrees; avanços Android já ficaram fora da raiz por estarem sem commit em outro checkout.
- O CodeMirror reescreve `class` e `style` das linhas ao redesenhar; estilos dinâmicos em linhas (ex.: cabeçalho fixo de tabela) vão numa folha de estilo própria, com `transition: none` para medir posições sem animação.
- Em tabelas, o cursor do CodeMirror não fica dentro de células desenhadas como widget (o navegador o leva para outro lugar); com célula selecionada, o foco vai para `.cm-sheet-input` e transações `select` puras não mudam a seleção da planilha.
- Perfis (até 5): perfil Principal usa o segredo `sync`; os demais usam `sync-<uuid>`. Desde 0.15.0 cada perfil entra numa conta (ADR 0024); administração: `node server/admin.js` (convite, convites, contas, uso, revogar). Chaves antigas (`SYNC_TOKEN`, `profile_spaces`) seguem aceitas até serem revogadas. Troca de perfil reinicia (desktop) ou fecha (Android) o app; em `desktop:dev`, `app.restart()` derrubava o `tauri dev` e o Vite, então o app grava `SLOTH_DEV_RESTART_FILE` e o script reabre o `tauri dev`. Em 2026-11-16 a sincronização com chave antiga foi validada celular ↔ servidor real ↔ PC; contas ainda não foram testadas no servidor real nem nos aparelhos. No celular, o Samsung Pass oferece salvar credenciais. Voltar (adb keyevent 4) dentro de Configurações apaga o formulário de sincronização; feche o teclado pelo botão dele.
- Em E2E, trocar entre os modos Código e Padrão reinicia o histórico de desfazer: teste Ctrl+Z antes de ler o texto pelo modo Código.
- A página Novidades desenha só as versões perto da tela; cada versão nova empurra as antigas para baixo. Nos E2E, chegue às versões antigas com `scrollNewsTo` (`e2e/changelog-helpers.js`).
