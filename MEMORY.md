# Memória operacional

- Os builds desktop e Android compartilham `dist/`; execute-os em sequência para não embutir a interface da outra plataforma.
- Neste Linux, o JDK 21 fica em `/home/servidor/.local/share/sloth-android/jdk-21` e o SDK Android em `/home/servidor/Android/Sdk`; configure `JAVA_HOME` e `ANDROID_HOME` ao compilar.

- Antes de gerar APK, confirme o checkout e as mudanças locais de outros worktrees; avanços Android já ficaram fora da raiz por estarem sem commit em outro checkout.
- O CodeMirror reescreve `class` e `style` das linhas ao redesenhar; estilos dinâmicos em linhas (ex.: cabeçalho fixo de tabela) vão numa folha de estilo própria, com `transition: none` para medir posições sem animação.
