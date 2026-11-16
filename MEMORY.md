# Memória operacional

- Os builds desktop e Android compartilham `dist/`; execute-os em sequência para não embutir a interface da outra plataforma.
- Neste Linux, o JDK 21 fica em `/home/servidor/.local/share/sloth-android/jdk-21` e o SDK Android em `/home/servidor/Android/Sdk`; configure `JAVA_HOME` e `ANDROID_HOME` ao compilar.

- Antes de gerar APK, confirme o checkout e as mudanças locais de outros worktrees; avanços Android já ficaram fora da raiz por estarem sem commit em outro checkout.
- O CodeMirror reescreve `class` e `style` das linhas ao redesenhar; estilos dinâmicos em linhas (ex.: cabeçalho fixo de tabela) vão numa folha de estilo própria, com `transition: none` para medir posições sem animação.
- Em tabelas, o cursor do CodeMirror não fica dentro de células desenhadas como widget (o navegador o leva para outro lugar); com célula selecionada, o foco vai para `.cm-sheet-input` e transações `select` puras não mudam a seleção da planilha.
- Perfis (até 5): perfil Principal usa o segredo `sync`; os demais usam `sync-<uuid>`. Servidor: `node server/profile-admin.js <1-4>` gera chave e SQL de um espaço; a chave antiga `SYNC_TOKEN` guarda os dados legados. Perfis não podem ser excluídos nesta versão. Troca de perfil reinicia (desktop) ou fecha (Android) o app; em 2026-11-16 a sincronização celular (Android, via adb) ↔ servidor real ↔ PC foi validada nos dois sentidos no perfil Principal; a troca de perfil nativa e o isolamento entre perfis no servidor real ainda não foram testados. No celular, o Samsung Pass oferece salvar a chave de acesso: recuse. Voltar (adb keyevent 4) dentro de Configurações apaga o formulário de sincronização; feche o teclado pelo botão dele.
