# Plano: Sloth Note no Android

Status: referência histórica do diagnóstico e da proposta inicial, baseada no APK `962b01b`.
A interface Android já tem implementação parcial; as descrições de “hoje” abaixo se referem àquele
APK, não ao estado atual. O [plano v2](plano-mobile-v2.md) define o escopo vigente e o
[plano de execução](plans/mobile-interface.md) é a única fonte de andamento e próxima etapa.
As seções 3.3–7 abaixo foram substituídas pelo v2. As seções 1–3.2 permanecem como contexto e
princípios, com as ressalvas de implementação registradas no v2.

## 1. Diagnóstico

### O bug que motivou o plano

A barra de status do Android cobre o cabeçalho (menu ☰, botão da biblioteca e abas).

- `src-tauri/gen/android/.../MainActivity.kt` chama `enableEdgeToEdge()`: o WebView ocupa a tela inteira,
  inclusive a área por baixo da barra de status e da barra de navegação.
- O CSS não reserva esse espaço: `index.html` não tem `viewport-fit=cover`, e nenhuma regra usa
  `env(safe-area-inset-*)`.
- Mesmo com `env()`, versões do Android System WebView anteriores ao suporte a edge-to-edge informam
  inset 0. Por isso não dá para confiar só no CSS: o lado nativo precisa informar os insets.
- Tirar o `enableEdgeToEdge()` não resolve: com `targetSdk` 35 ou maior, o Android 15 força edge-to-edge
  de qualquer jeito.

### O problema maior: a interface é de desktop

Mesmo sem o bug, o layout atual não funciona no toque:

| Hoje (desktop)                                                                      | Problema no celular                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Cabeçalho com ☰, biblioteca, abas roláveis, menu de exibição e controles de janela | Não cabe em 360–412 dp; abas pequenas demais para o dedo                                     |
| Abas como modelo de navegação                                                       | O celular não tem espaço para isso; o padrão Android é uma pilha de telas com o botão voltar |
| Biblioteca como painel lateral fixo (`max-width: 600px` vira overlay)               | Fica sobre o texto, sem gesto nem botão voltar para fechar                                   |
| Paleta de comandos, atalhos de teclado, `Ctrl+clique` em links                      | Não existe teclado físico; tudo precisa de um caminho por toque                              |
| Hover: seta de recolher seção, fechar aba, dica de link, nome do modo               | `hover: none` só remenda alguns casos                                                        |
| Barra de seleção flutuante e botão `+` em linha vazia                               | Disputam espaço com o menu de seleção nativo do Android e com o teclado virtual              |
| Seletor de modo flutuando no canto inferior direito                                 | Fica atrás do teclado ou sobre a barra de gestos                                             |
| Arrastar e soltar arquivos e imagens, pasta de notas, janela, instância única       | Não existem no Android (`vault_choose` já retorna erro em `cfg(mobile)`)                     |
| Gutter de 40 px para a pílula do nível do título                                    | Ocupa 10% da largura útil                                                                    |
| Salvamento conta com o app aberto até o usuário fechar                              | O Android mata o processo em segundo plano sem avisar                                        |

## 2. Princípios

1. **Desktop intacto.** Nenhuma regra, componente ou comportamento de desktop muda. O critério
   verificável: a suíte E2E atual (`e2e/*.spec.js`, incluindo `layout-parity`) e os testes unitários passam
   sem nenhuma edição em cada etapa. Refatorações do núcleo compartilhado são permitidas se a suíte
   provar que nada mudou.
2. **Duas cascas, um núcleo.** Persistência, modelo de notas, tarefas, histórico, i18n e o editor
   CodeMirror ficam compartilhados. A interface (navegação, barras, menus, diálogos) é separada:
   `DesktopShell` (o app de hoje) e `MobileShell` (novo).
3. **Plataforma decide a casca, não a largura da janela.** Uma janela desktop estreita continua sendo
   desktop. O CSS mobile vive num arquivo próprio, carregado só pela casca mobile, sob
   `[data-platform="mobile"]`. Nada vaza para o desktop.
4. **Mobile segue o roteiro do produto.** O ROADMAP prioriza, no celular, _consultar notas, capturar texto
   rápido e concluir tarefas_. Edição longa funciona, mas não dita o layout.
5. **Padrões do Android.** Botão/gesto voltar fecha a camada de cima, alvos de toque de 48 dp, barras que
   respeitam os insets do sistema e do teclado, tema claro/escuro que inclui os ícones da barra de status.

## 3. Arquitetura

### 3.1 Detecção de plataforma

Módulo `src/platform.js` que exporta `platform: 'desktop' | 'mobile'`:

- O build Android (`scripts/build-android.mjs`) define `VITE_TARGET=mobile`; o Vite elimina a casca que
  não é usada no build (o APK não carrega o código do desktop e vice-versa).
- Em `bun run dev`, `?platform=mobile` força a casca mobile no navegador, para desenvolver com o
  DevTools em modo dispositivo.
- A versão web publicada continua desktop. Oferecer a casca mobile na web para navegadores de celular
  fica como decisão em aberto (seção 7).

### 3.2 Separar o `main.jsx`

O `src/main.jsx` tem 2.770 linhas que misturam estado, ações e layout. Antes da casca mobile:

1. Extrair o estado e as ações para hooks sem JSX: `useNotesStore` (dados, abas, ativa, lixeira,
   gravação), `useNoteActions` (criar, renomear, excluir, importar, exportar, backup, imagens),
   `usePrefs`. Os `menuActions` e `buildCommands` (`src/commands.js`) viram a lista única de ações que as
   duas cascas consomem.
2. `DesktopShell` passa a ser o JSX atual, consumindo os hooks, sem mudança visual.
3. Cada extração é um commit próprio com a suíte E2E verde. É a etapa de maior risco para o desktop,
   por isso vem em passos pequenos.

O modelo de abas continua no estado (o desktop precisa dele). No mobile, as "abas abertas" viram a lista
de _recentes_ da tela inicial.

### 3.3 Ponte nativa (Kotlin)

Em `MainActivity.kt`, sobrescrever `onWebViewCreate(webView)` e registrar
`ViewCompat.setOnApplyWindowInsetsListener` para ler `systemBars`, `displayCutout` e `ime`. Converter de
px para dp e publicar como variáveis CSS no `document.documentElement`: `--inset-top`, `--inset-bottom`,
`--inset-left`, `--inset-right` e `--ime-bottom`. O CSS usa
`max(var(--inset-top, 0px), env(safe-area-inset-top))`, então funciona tanto em WebViews antigos quanto
nos novos.

A mesma ponte cuida de:

- Cor dos ícones da barra de status e de navegação conforme o tema do app
  (`WindowInsetsControllerCompat.isAppearanceLightStatusBars`), chamada quando o tema muda.
- Botão voltar: confirmar se a versão fixada do Tauri expõe `onBackButtonPress`. Se não expuser, usar a
  History API (`pushState` a cada tela ou camada; o voltar do WebView faz `popstate`) e encaminhar o
  `OnBackPressedDispatcher` para o WebView. Na tela inicial, voltar fecha o app.

## 4. Desenho da experiência mobile

### 4.1 Mapa de telas

```
Início (biblioteca)
 ├─ Nota  ──────────── ⋮ Ações da nota (folha inferior)
 │    ├─ Buscar na nota (substitui a barra superior)
 │    └─ Histórico da nota
 ├─ Busca em todas as notas
 ├─ Tarefas
 ├─ Imagens ─ Detalhe da imagem
 ├─ Lixeira
 └─ Configurações ─ Seção (Aparência, Editor, Histórico, Backup, Sobre)
```

Navegação em pilha: cada tela entra por cima e o voltar a remove. Não há abas, paleta de comandos nem
menu ☰ suspenso.

### 4.2 Início (biblioteca)

- **Barra superior:** nome do app, botão de busca e ⋮ (Configurações, Lixeira, Importar, Backup,
  Recriar página de ajuda).
- **Seletor Notas · Tarefas · Imagens** logo abaixo (as mesmas `SECTIONS` da barra lateral).
- **Notas:** primeiro as _Fixadas_, depois as _Recentes_ (o antigo conjunto de abas), depois _Todas_, por
  data de alteração. Cada item tem 56–72 dp de altura, com título e uma linha de prévia (o componente de
  prévia da `note-list.jsx` é reaproveitado). Pressionar e segurar abre a folha de ações (fixar, renomear,
  exportar, lixeira).
- **FAB "Nova nota"** no canto inferior direito, acima do inset inferior. Abre uma nota nova já em edição,
  com o teclado aberto: é o fluxo de captura rápida.
- **Busca:** toque na lupa → campo em tela cheia com resultados da busca em todo o texto (a mesma lógica
  de `Ctrl+Shift+F` e `Ctrl+P` juntas).

### 4.3 Nota

- **Barra superior (56 dp):** voltar, título (reticências), botão de alternar **Ler / Editar** e ⋮.
- **Folha ⋮:** buscar na nota, modo Código, renomear, fixar, compartilhar/exportar `.md`, histórico,
  recolher/expandir seções, tamanho do texto, modo foco, mover para a lixeira.
- **Modo ao abrir:** nota existente abre em **Leitura** (consultar e marcar tarefas sem abrir o teclado
  por engano); nota nova abre em **Padrão** com o cursor no título. Tocar em "Editar" (ou dar dois
  toques no texto) entra no Padrão naquele ponto. O padrão é configurável (seção 7).
- **Leitura no toque:** checkboxes com área de 48 dp; links `[[internos]]` e externos abrem com um toque
  (sem `Ctrl`); setas de recolher seção sempre visíveis, com área de toque maior; tabelas e blocos de
  código rolam na horizontal; botão de copiar código sempre visível.
- **Layout do texto:** margem lateral de 16 dp, sem o gutter de 40 px (a pílula do nível do título vai
  para dentro da linha ou some), corpo de 17 px, respeitando a escala de fonte do sistema.

### 4.4 Edição

- **Barra de formatação acima do teclado**, presa a `--ime-bottom` (com `visualViewport` como
  alternativa), rolável na horizontal: desfazer, refazer, título (H2–H4), negrito, itálico, lista, tarefa,
  **recuar / desrecuar** (substitutos de Tab e Shift+Tab), citação, link, código, tabela, imagem e
  esconder teclado. Os botões chamam as funções que já existem em `src/format-selection.js`,
  `src/list-indent.js`, `src/editor-shortcuts.js` e `src/commands.js`.
- A **barra de seleção flutuante** e o **botão `+`** do desktop ficam desligados no mobile. O menu de
  seleção nativo do Android continua (copiar, colar, selecionar tudo).
- O cursor fica sempre visível acima da barra e do teclado (`scrollMargin` do CodeMirror ajustado com o
  inset do teclado).
- Imagem: seletor de arquivos do sistema e câmera (`<input accept="image/*" capture>`), no mesmo fluxo de
  `addImages`.
- **Salvar ao sair de vista:** em `visibilitychange: hidden` e `pagehide`, esvaziar a fila de gravação
  (`src/write-queue.js`) e o histórico pendente na hora, sem esperar o debounce.

### 4.5 Camadas: diálogos, menus e avisos

- Menus e escolhas viram **folhas inferiores** (bottom sheets) com alça, fecháveis por arrasto, por toque
  fora ou pelo voltar.
- Confirmações (excluir, conflito, substituir dados) continuam como diálogos centrais, com botões de
  48 dp.
- Toasts (`sonner`) vão para baixo, acima do FAB ou da barra de formatação, respeitando os insets.

### 4.6 O que fica fora do mobile (por ora)

Paleta de comandos, atalhos de teclado (com exceção dos de teclado físico, que continuam funcionando),
pasta de notas externa, arrastar e soltar, controles de janela, ajuste de largura da coluna e associação
de arquivos. Abrir `.md` de outro app pelo "Abrir com" entra na fase 7.

## 5. Fases

Cada fase termina testada, com commit e push, e com a suíte desktop passando sem alterações.

| Fase | Entrega                                                                                                                                                             | Critério de pronto                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0    | **Correção imediata dos insets:** `viewport-fit=cover`, ponte Kotlin com `--inset-*`, `padding` no `.app` só em Android                                             | No aparelho, o cabeçalho atual fica abaixo da barra de status e o rodapé acima da barra de gestos; desktop sem diff visual |
| 1    | **Fundação:** `platform.js`, `VITE_TARGET`, extração dos hooks do `main.jsx`, `DesktopShell`, `MobileShell` vazio, projeto Playwright mobile                        | E2E desktop verde sem edições; `?platform=mobile` abre a casca nova                                                        |
| 1b   | **Spike de risco:** CodeMirror (modo Padrão com decorações ao vivo) com Gboard e SwiftKey: composição, autocorreção, apagar sobre sintaxe oculta, seleção por toque | Relatório com o que funciona e o que exige ajuste ou fallback (seção 6)                                                    |
| 2    | **Navegação:** pilha de telas, voltar do Android, tela Início com Notas, busca e FAB                                                                                | Abrir, criar e voltar só pelo toque e pelo botão voltar                                                                    |
| 3    | **Nota em leitura:** barra superior, Ler/Editar, folha ⋮, tarefas, links e seções no toque                                                                          | Consultar uma nota e concluir tarefas sem abrir o teclado                                                                  |
| 4    | **Edição:** barra acima do teclado, insets do teclado, recuo de listas, imagens, salvar ao sair de vista                                                            | Escrever uma nota de 1 tela com listas, tarefas e título; matar o app e não perder nada                                    |
| 5    | **Telas secundárias:** Tarefas, Imagens, Lixeira, Configurações, Histórico, importar/exportar/backup pelo seletor do sistema (SAF)                                  | Todas as funções existentes no Android têm caminho por toque                                                               |
| 6    | **Polimento:** tema nos ícones das barras do sistema, folhas com arrasto, TalkBack, escala de fonte 1,3×, rotação, tela dividida, desempenho em aparelho modesto    | Checklist manual da seção 6 completo                                                                                       |
| 7    | **Integração Android:** receber texto compartilhado (vira nota nova), "Abrir com" para `.md`, atalho de launcher "Nova nota"                                        | Capturar um texto de outro app em 2 toques                                                                                 |

A fase 0 é pequena e pode sair já, para destravar o uso do APK enquanto o resto é feito.

## 6. Testes

- **Regressão desktop:** a suíte atual, sem edições, em toda etapa. Qualquer diff nela bloqueia a etapa.
- **Playwright mobile:** novo projeto em `playwright.config.js` com `devices['Pixel 7']` (`hasTouch`,
  `isMobile`) e `?platform=mobile`, com specs em `e2e/mobile/` para navegação, voltar, leitura, tarefas,
  barra de formatação e camadas. Insets e teclado são simulados com as variáveis CSS.
- **Unitários:** `node --test` para os hooks extraídos e para a lógica de pilha de navegação.
- **Checklist manual no aparelho** (o emulador não reproduz bem teclado e gestos):
  - navegação por gestos e por 3 botões; câmera com recorte (notch);
  - Gboard e SwiftKey, com autocorreção, sugestões e digitação por voz;
  - tema claro e escuro, incluindo os ícones das barras do sistema;
  - escala de fonte do sistema em 1,0× e 1,3×; rotação; tela dividida;
  - matar o app em segundo plano logo após digitar e reabrir;
  - TalkBack na tela Início, na Nota e nas folhas.

### Riscos

- **IME no CodeMirror com sintaxe oculta.** O modo Padrão esconde marcadores fora do cursor; teclados
  Android que reescrevem a palavra inteira podem se confundir. Mitigação: o spike da fase 1b. Se não
  houver correção, mostrar a sintaxe da linha inteira durante a composição ou, no pior caso, usar o modo
  Código como editor no mobile e manter o Padrão só para leitura.
- **Refatoração do `main.jsx` quebrar o desktop.** Mitigação: passos pequenos, um commit por extração e
  suíte completa a cada passo.
- **Insets em WebViews antigos.** Mitigação: a ponte Kotlin é a fonte principal e o `env()` é a alternativa.
- **Processo morto em segundo plano.** Mitigação: gravação imediata em `visibilitychange` e teste
  explícito no checklist.

## 7. Decisões em aberto

Cada item tem uma recomendação; preciso de confirmação antes da fase correspondente.

1. **Modo ao abrir uma nota existente.** Recomendo Leitura (prioridade é consultar e concluir tarefas),
   com opção em Configurações para abrir em edição.
2. **Abas no mobile.** Recomendo não ter abas e transformar as abertas em "Recentes" na tela Início.
3. **Casca mobile na versão web em celulares.** Recomendo deixar para depois do APK estável; a decisão
   técnica (detecção por plataforma) já permite ligar isso depois.
4. **Modo Código no mobile.** Recomendo mantê-lo no menu ⋮, não na barra principal.
5. **Pasta de notas no Android** (escolher uma pasta do aparelho via SAF para sincronizar com outros
   apps). Recomendo ficar fora deste plano; entra junto com a sincronização do ROADMAP.
