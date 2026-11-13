# Arquitetura

O Sloth Note edita Markdown localmente. As interfaces desktop e mobile compartilham o formato das
notas e a persistência; a plataforma determina a interface, sem depender da largura da janela.

```mermaid
flowchart TD
  platform[Detecção de plataforma] --> desktop[Workspace desktop]
  platform --> mobile[MobileShell Android]
  desktop --> store[useNotesStore e fila de gravação]
  mobile --> store
  mobile --> navigation[useNavigation e nav-stack]
  navigation --> browser[Histórico do WebView e sessionStorage]
  desktop --> updates[Consulta de atualizações desktop]
  updates --> updater[Plugin updater Tauri]
  updater --> github[Manifesto e pacotes assinados no GitHub Releases]
  updater --> binary[Instalação do AppImage ou NSIS]
  updates --> saves[Fila de gravação antes de instalar e reiniciar]
  desktop --> editor[VisualEditor CodeMirror e Markdown]
  desktop --> sideNote[Nota lateral em leitura]
  sideNote --> editor
  editor --> colors[Cores em comentários de bloco e spans Markdown]
  mobile --> editor
  editor --> spreadsheets[Exportação local CSV e XLSX com fflate]
  editor --> tableSizes[Proporções e cores no comentário sloth:table]
  editor --> richCells[Células ricas e tarefas no Markdown]
  editor --> columns[Editores de colunas e visualização Markdown]
  columns --> store
  store --> runtime[createAppPersistence]
  runtime --> web[Armazenamento do navegador]
  runtime --> native[Ponte Tauri Rust]
  native --> state[Arquivo interno de estado]
  native --> vault[Vault e arquivos externos]
  native --> history[Histórico local desktop]
  android[MainActivity Android] --> insets[Boot de insets e useInsets]
  insets --> mobile
  syncServer[Servidor de sincronização Worker - ainda não ligado ao app] --> d1[D1: revisão atual e cursor]
  syncServer --> r2[R2: imagens cifradas]
```

## Componentes

- `src/main.jsx`: inicialização e interface desktop, além da seleção da casca.
- `src/mobile/`: casca, adaptação dos insets, navegação serializável e ações mobile de notas.
- `src/hooks/use-notes-store.js`: documento em memória, gravações serializadas e histórico.
- `src/visual-editor.jsx` e `src/markdown.jsx`: edição e leitura compartilhadas.
- `src/persistence-runtime.js`: escolhe navegador, arquivo interno Tauri ou vault configurado.
- `server/`: servidor de sincronização (ADR 0018), um Cloudflare Worker com D1 e R2. A API em
  `server/api.js` não depende do armazenamento; o app ainda não usa este servidor.
- `src-tauri/`: operações nativas de arquivos, imagens, histórico e integração com a plataforma.

O histórico de navegação contém rotas, busca, rolagem e cursor; o texto das notas permanece na
persistência do documento. Camadas transitórias não reabrem ao iniciar uma nova sessão. A rota
usa `sessionStorage`; a recuperação após morte do processo Android ainda precisa de contrato e
validação nativos. Compartilhar modelo e persistência não sincroniza dispositivos.

O Kotlin publica insets; `public/insets-boot.js` recebe os valores e o CSS mobile aplica o espaço de
barras/IME, sem padding nativo no WebView. A combinação de `adjustResize`, `100dvh`, viewport visual
e padding CSS ainda exige medição no APK. O boot instala o receptor antes do bundle, mas não garante
que os valores nativos já tenham chegado no primeiro frame.

As ações de `use-note-actions.js` permanecem ligadas ao desktop. Mobile reutiliza funções de domínio
por `mobile/note-actions.js`; não existe ainda um registro único de ações entre as cascas. Código no
desktop usa `textarea`; o editor desse modo mobile será escolhido no incremento correspondente.
As telas mobile ainda não oferecem todos os recursos desktop; veja o plano em andamento.

O histórico de versões permanece local, conforme ADR 0002. Sua interface foi entregue no desktop;
a integração mobile completa ainda está pendente. Não confundir com histórico de navegação nem
com o futuro histórico de conclusão de tarefas.

## Decisões

Veja `docs/adr/`. O andamento da interface Android está em
[docs/plans/mobile-interface.md](plans/mobile-interface.md).

Atualizações desktop: `useAppUpdates` consulta o manifesto público de releases pelo plugin oficial
Tauri, coordena download, verificação, instalação e reinício. A assinatura e a versão do pacote são
verificadas no Rust com a chave pública incluída no app. A consulta automática é silenciosa em caso
de falha e não impede edição offline. A instalação só começa após uma ação explícita, bloqueio da
edição e conclusão das gravações pendentes. O updater substitui o AppImage ou executa o instalador
NSIS; `updates.rs` oferece o reinício e restringe o fluxo às compilações distribuídas. As permissões
do plugin pertencem apenas à janela principal Linux/Windows. A rede de atualização fica no Rust;
a CSP da interface não libera domínios externos para essa operação.
