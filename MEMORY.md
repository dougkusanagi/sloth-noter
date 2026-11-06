# Memória operacional

- Os builds desktop e Android compartilham `dist/`; execute-os em sequência para não embutir a interface da outra plataforma.
- Neste Linux, o JDK 21 fica em `/home/servidor/.local/share/sloth-android/jdk-21` e o SDK Android em `/home/servidor/Android/Sdk`; configure `JAVA_HOME` e `ANDROID_HOME` ao compilar.
