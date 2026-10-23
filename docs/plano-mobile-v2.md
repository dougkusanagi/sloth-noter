# Plano v2: interface Android do Sloth Note

Status: proposta. Substitui as seções 3.3, 4 e 5 de [`plano-mobile.md`](plano-mobile.md) e mantém as
seções 1 (diagnóstico), 2 (princípios) e 3.1–3.2 (detecção de plataforma e separação do `main.jsx`).

Protótipo navegável: [`docs/mobile-prototype/index.html`](mobile-prototype/index.html). Abra no navegador;
o painel ao lado do celular simula barra de status, recorte da câmera, navegação por gestos ou por
3 botões, teclado virtual, tema e escala de fonte.

## 1. O que muda em relação ao v1

| Tema                 | v1                                   | v2                                                                                               |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Insets               | Variáveis CSS publicadas pelo Kotlin | Uma única fonte de verdade por tipo de inset (seção 3); conflito com `e4a0f75` resolvido         |
| Teclado              | Barra presa a `--ime-bottom`         | Contrato de layout em 3 zonas, com estados de teclado aberto, abrindo e flutuante                |
| Navegação            | Pilha de telas + seletor no Início   | Pilha de telas + barra inferior com 3 destinos (Notas, Tarefas, Imagens); busca no topo de Notas |
| Edição               | Barra de formatação única            | Botão "Inserir" com miniaturas + grupo contextual de até 5 ícones                                |
| Tabelas              | Rolagem horizontal                   | Cartões, tabela com 1ª coluna fixa, tela cheia e edição por célula (seção 5.4)                   |
| Modo Código          | Só se o spike falhar                 | Sempre disponível, com teclas de símbolos na barra                                               |
| Captura rápida       | FAB                                  | FAB + compartilhar de outros apps (fase 7)                                                       |
| Problemas só-celular | Checklist manual                     | Catálogo de 24 problemas, cada um com solução e teste (seção 4)                                  |

## 2. Layout: o contrato das 3 zonas

Toda tela mobile é uma coluna com 3 zonas. Nenhuma zona usa `position: fixed` sobre outra.

```
┌───────────────────────────────┐
│ inset-top (barra de status +  │  ← espaço vazio pintado com a cor da barra do app
│ recorte da câmera)            │
├───────────────────────────────┤
│ ZONA 1: barra do app (56 dp)  │  ← sticky, nunca rola para fora com o teclado aberto
├───────────────────────────────┤
│                               │
│ ZONA 2: conteúdo (rola)       │  ← único elemento com overflow: auto
│                               │
├───────────────────────────────┤
│ ZONA 3: barra inferior        │  ← navegação (56 dp) OU barra de formatação (48 dp)
├───────────────────────────────┤
│ inset-bottom: barra de gestos │  ← ou altura do teclado, o que for maior
│ OU teclado                    │
└───────────────────────────────┘
```

Regras:

1. **A raiz ocupa a viewport visível**, não `100vh`: `height: var(--app-height, 100dvh)`.
2. **Zona 3 troca de conteúdo com o teclado.** Teclado fechado: barra de navegação (só nas telas de
   topo) ou nada. Teclado aberto: barra de formatação (no editor) ou nada (nos campos de busca). A barra
   de navegação **nunca** sobe junto com o teclado.
3. **O padding de baixo é `max(inset-bottom, ime-bottom)`**, nunca a soma. Com o teclado aberto, a barra
   de gestos fica atrás do teclado.
4. **Laterais:** `inset-left/right` só importam em paisagem com recorte lateral; aplicar na raiz.
5. Diálogos e folhas inferiores são filhos da raiz, então herdam as mesmas margens.

## 3. Insets: uma fonte de verdade

### 3.1 O conflito atual

O commit `e4a0f75` aplica `setPadding` na view de conteúdo com `systemBars | displayCutout | ime`. Isso
encolhe o WebView inteiro. Efeitos:

- **Bom:** resolve o bug do cabeçalho sob a barra de status hoje, sem CSS.
- **Ruim:** a área atrás da barra de status e da barra de gestos fica com o fundo da Activity (branco ou
  preto fixo), não com a cor do tema do app. Em tema escuro aparece uma faixa clara.
- **Ruim:** a altura do WebView muda a cada quadro da animação do teclado → o CodeMirror remede e o
  texto "pula" durante ~250 ms.
- **Ruim:** o web não sabe a altura do teclado, então não sabe quando trocar a zona 3.

### 3.2 Decisão

| Inset                     | Quem aplica                  | Como                                                                                                                                   |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de status + recorte | CSS                          | `--inset-top` publicado pelo Kotlin; `max(var(--inset-top,0px), env(safe-area-inset-top))`                                             |
| Barra de gestos/botões    | CSS                          | `--inset-bottom`, mesma regra                                                                                                          |
| Laterais (paisagem)       | CSS                          | `--inset-left` / `--inset-right`                                                                                                       |
| Teclado (IME)             | Nativo **e** CSS, sem dobrar | Nativo: `setPadding(bottom = ime)` só quando o teclado está **totalmente** aberto. CSS: `--ime-bottom` + atributo `data-keyboard="open | opening | closed"` |

Implementação nativa (`MainActivity.kt`):

1. Remover o `setPadding` geral de `e4a0f75`. Manter `enableEdgeToEdge()`.
2. `setOnApplyWindowInsetsListener` lê os insets, converte px → dp e chama
   `webView.evaluateJavascript("window.__insets?.({...})")`. Um script em `index.html` grava as variáveis
   em `document.documentElement.style` antes do primeiro render (evita o salto inicial).
3. `ViewCompat.setWindowInsetsAnimationCallback` (API 30+) envia `opening` / `closing` com a fração,
   para a zona 3 animar junto com o teclado em vez de saltar no fim.
4. `windowSoftInputMode="adjustResize"` no manifesto, para WebViews antigos que não entregam insets do IME.
5. Reserva: se `window.__insets` nunca for chamado (WebView do Tauri dev, navegador), o JS usa
   `visualViewport` (`resize` + `scroll`) para calcular `--ime-bottom = innerHeight - visualViewport.height
   - visualViewport.offsetTop`.

Teclado **flutuante** ou **dividido** (tablets, Samsung): o inset `ime` vem 0. A zona 3 continua no
fundo; não há nada a fazer além de não assumir que o teclado sempre empurra.

### 3.3 Cores das barras do sistema

- `WindowInsetsControllerCompat.isAppearanceLightStatusBars` / `NavigationBars` conforme o tema
  efetivo (claro, escuro ou sistema resolvido). Ponte: `invoke('set_system_bar_style', { dark })`
  chamada pelo mesmo hook que aplica `data-theme`.
- Fundo atrás das barras: o padding da raiz usa a cor da barra do app (`--bar-bg`), então a barra de
  status "continua" a barra do app.
- Ao abrir folha inferior com véu escuro, a barra de status também escurece (o véu cobre o inset-top).

## 4. Catálogo de problemas que só existem no celular

Cada item vira um teste: **E2E** (Playwright, perfil Pixel 7 + insets simulados), **U** (unitário) ou
**M** (checklist manual no aparelho).

### 4.1 Sistema

| #   | Problema                                                                   | Solução                                                                                                     | Teste  |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Barra de status cobre o topo                                               | Seção 3                                                                                                     | E2E, M |
| 2   | Recorte da câmera (notch/furo) no meio ou canto                            | `displayCutout` somado ao inset-top; em paisagem, inset lateral                                             | M      |
| 3   | Barra de gestos cobre FAB e barra inferior                                 | `inset-bottom` na zona 3; FAB acima dela                                                                    | E2E    |
| 4   | Gesto "voltar" pela borda conflita com arrastar na margem                  | Nada interativo de arrastar a menos de 24 dp das bordas laterais; `systemGestureExclusionRects` não é usado | M      |
| 5   | Botão voltar fecha o app em vez da folha aberta                            | Pilha de camadas (seção 5.1); voltar sempre fecha a camada de cima                                          | E2E, U |
| 6   | Processo morto em segundo plano perde o texto                              | Gravação imediata em `visibilitychange:hidden` e `pagehide`; histórico idem                                 | E2E, M |
| 7   | Volta ao app depois de horas: estado perdido                               | Persistir rota atual, nota aberta, posição de rolagem e cursor em `sessionStorage`/prefs; restaurar no boot | E2E    |
| 8   | Rotação recria a Activity                                                  | `configChanges` no manifesto (o Tauri já define); testar que cursor e rolagem ficam                         | M      |
| 9   | Tela dividida / janela pequena (≤ 320 dp de largura ou ≤ 400 dp de altura) | Barra de formatação esconde rótulos; barra de navegação some se altura < 400 dp                             | E2E    |
| 10  | Escala de fonte do sistema 1,3×–2×                                         | Unidades em `rem`; WebView com `textZoom` respeitado; barras crescem em altura, não cortam                  | M      |
| 11  | Modo escuro do sistema muda com o app aberto                               | `matchMedia('(prefers-color-scheme: dark)')` já usado pelo modo Sistema; refaz cores das barras             | E2E    |

### 4.2 Teclado

| #   | Problema                                                        | Solução                                                                                                             | Teste |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| 12  | Teclado cobre o cursor                                          | `EditorView.scrollMargins` com `bottom = altura da zona 3 + 24 dp`; após `opening→open`, `scrollIntoView` do cursor | E2E   |
| 13  | Teclado cobre o botão "Salvar/Criar" de diálogos                | Diálogos com campo viram folhas inferiores ancoradas na zona 3; botão primário fica acima do teclado                | E2E   |
| 14  | Texto "pula" durante a animação do teclado                      | Altura da raiz não muda durante `opening`; só a zona 3 translada; reflow uma vez no fim                             | M     |
| 15  | Teclado abre sem querer ao tocar para ler                       | Nota existente abre em **Leitura**; editar exige tocar "Editar" ou dois toques no ponto                             | E2E   |
| 16  | Não há como esconder o teclado sem perder a posição             | Botão "esconder teclado" na barra de formatação; voltar com teclado aberto só fecha o teclado                       | E2E   |
| 17  | Composição do IME (Gboard/SwiftKey) quebra com sintaxe oculta   | Durante `compositionstart…end`, a linha atual mostra a sintaxe (como se o cursor estivesse nela); spike 1b          | M     |
| 18  | Autocorreção/maiúscula automática em títulos de arquivo e busca | `autocapitalize`, `autocorrect`, `spellcheck` e `enterkeyhint` por campo (busca: `search`; renomear: `done`)        | U     |
| 19  | Sem Tab/Shift+Tab nem atalhos                                   | Botões recuar/desrecuar e desfazer/refazer na barra de formatação                                                   | E2E   |
| 20  | Teclado físico (Bluetooth, DeX, Chromebook)                     | Atalhos do desktop continuam; barra de formatação some se nenhum IME abrir                                          | M     |

### 4.3 Toque

| #   | Problema                                                                   | Solução                                                                                                                     | Teste                              |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 21  | Alvos pequenos (checkbox, seta de seção, fechar)                           | Mínimo 48 × 48 dp de área, mesmo com ícone menor; `::before` estende a área                                                 | E2E (mede `getBoundingClientRect`) |
| 22  | Hover não existe (dicas de link, setas que aparecem no hover)              | Tudo que o desktop mostra no hover fica sempre visível ou vai para pressionar e segurar                                     | E2E                                |
| 23  | Menu de seleção nativo do Android disputa com a barra flutuante do desktop | Barra flutuante desligada no mobile; formatação só pela zona 3                                                              | M                                  |
| 24  | Toque duplo dá zoom, `300 ms` de atraso                                    | `touch-action: manipulation` na raiz; `user-scalable` mantido para acessibilidade (zoom de pinça só no conteúdo de leitura) | M                                  |

## 5. Desenho das telas

Referência visual: o protótipo. Cores, fontes e raios vêm dos tokens de `src/styles.css` (`--bg`,
`--paper`, `--accent`, `--radius`…); o mobile não cria uma paleta nova.

### 5.1 Navegação

- **Telas de topo** (com barra inferior): **Notas**, **Tarefas**, **Imagens**. A busca não é uma aba:
  ela fica no topo da lista de Notas e filtra a própria lista (uma aba "Busca" repetiria a tela Notas).
  Imagens ganha a aba porque é uma galeria que funciona bem no celular e recebe fotos da câmera.
  Lixeira e Configurações ficam no ⋮ do Início, porque são usadas raramente.
- **Pilha:** cada tela de detalhe entra por cima (deslizando da direita, 220 ms, `--ease`). Voltar tira
  a de cima.
- **Camadas** (folha, diálogo, busca na nota) formam uma segunda pilha acima da tela. O voltar fecha
  sempre o que está mais em cima: folha ou diálogo → teclado → tela de cima → sair do app (com toast
  "Toque de novo para sair" só se houver gravação pendente).
- Implementação: `history.pushState` por tela e por camada; `popstate` desempilha. Módulo puro
  `src/mobile/nav-stack.js` com testes unitários.

### 5.2 Notas (Início)

```
[status]
 Sloth Note                    ⋮
 ┌─────────────────────────────┐
 │ 🔍 Buscar nas notas          │   ← filtra a lista abaixo enquanto digita
 └─────────────────────────────┘
 FIXADAS
  ▸ Lista de compras        2 min
 RECENTES
  ▸ Reunião 23/10            ontem
  ▸ …
                         [ + ]    ← FAB: nota nova com teclado aberto
 ─────────────────────────────────
  📝 Notas   ☑ Tarefas   🖼 Imagens  ← barra inferior
[gestos]
```

- Itens com 64 dp: título (1 linha, reticências) + prévia (1 linha) + data relativa.
- **Busca:** com termo, a lista vira "Resultados" (título primeiro, depois trechos com o termo
  destacado). Abrir um resultado e voltar mantém termo e rolagem. Sem resultados: "Nada encontrado
  para “x”." + "Criar nota “x”". Buscas recentes aparecem ao focar o campo vazio.
- Pressionar e segurar → folha de ações (Fixar, Renomear, Compartilhar, Lixeira). **Deslizar para a
  esquerda → Lixeira, sem confirmação**, com "Desfazer" no toast (decidido).
- Estados: vazio ("Nenhuma nota ainda. Toque em + para escrever a primeira."), carregando (esqueleto
  de 5 itens), erro de leitura (mensagem + "Tentar de novo").

### 5.3 Nota e os 3 modos

| Modo       | Para quê                               | Como entrar                                      |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| **Ler**    | Consultar e marcar tarefas sem teclado | Padrão ao abrir nota existente                   |
| **Editar** | Edição visual (modo Padrão do desktop) | "Editar" na barra do app ou dois toques no ponto |
| **Código** | Markdown puro, com sintaxe visível     | ⋮ → "Modo código"; o modo fica salvo por nota    |

- O modo Código **sempre existe** no mobile, independente do resultado do spike 1b. Ele usa o modo
  Código do CodeMirror que já existe, com fonte mono, sem quebrar linhas de tabela (cada bloco de
  tabela rola na horizontal) e com `autocapitalize="off"` e `spellcheck="false"`.
- Em Código, a barra de formatação troca "Inserir" e os grupos por **teclas de símbolos** que o teclado
  do celular esconde: Tab, `#`, `-`, `[ ]`, `|`, `` ` ``, `*`.
- Barra do app: ←, título, alternador **Ler | Editar** (em Editar e Código vira "Pronto"), ⋮. Um selo
  "Código" ao lado do status de gravação mostra o modo.
- Indicador de gravação: "Salvo" / "Salvando…" / "Não foi possível salvar — tocar para tentar de
  novo". Nunca inventa progresso.
- Margens 16 dp; corpo 17 px; sem gutter de 40 px (pílula do nível vira prefixo pequeno na linha).

### 5.4 Tabelas

Tabelas são o caso mais difícil numa tela de 360–412 dp. Regras:

**Leitura**

- Barra pequena acima da tabela: "3 linhas · 5 colunas", alternador **Ver cartões / Ver tabela** e
  botão **tela cheia**.
- **Visão tabela:** rola na horizontal dentro do próprio bloco (a página não rola de lado); a
  **primeira coluna fica fixa**; sombras nas bordas indicam que há mais colunas. Cabeçalho sem quebra
  de palavra; células com largura entre 96 e 220 dp e `overflow-wrap: anywhere` para palavras longas.
- **Visão cartões:** cada linha vira um cartão com pares "coluna: valor"; o valor da 1ª coluna é o
  título. É o padrão para tabelas com **mais de 3 colunas**; a escolha fica salva por tabela.
- **Tela cheia:** abre a tabela numa tela própria, sem margens, liberando a rotação para paisagem e o
  zoom de pinça. Voltar retorna à nota no mesmo ponto.

**Edição (modo Editar)**

- Sempre em visão tabela. Tocar numa célula seleciona a célula (contorno na cor de destaque) e edita só
  o texto dela; o usuário nunca vê nem digita `|`.
- Barra contextual da tabela: célula anterior / próxima (substituem Tab e Shift+Tab), + linha,
  - coluna, e ⋯ para apagar linha ou coluna e alinhar coluna.
- "Enter" na última célula de uma linha cria a próxima linha (como no desktop, `table-navigation.js`).
- **Criar:** Inserir → Tabela → grade para escolher linhas × colunas com um toque (até 6 × 6) →
  "Inserir tabela"; o cursor vai para a primeira célula do cabeçalho.

**Código:** a tabela aparece em Markdown alinhado (`markdown-table.js` já formata as colunas) e rola na
horizontal, sem quebra de linha.

### 5.5 Barra de formatação

Problema da versão anterior: muitos botões de texto iguais lado a lado, sem hierarquia, todos competindo.
Nova estrutura, da esquerda para a direita, numa linha de 52 dp sobre o teclado:

```
[ ＋ Inserir ]  ( grupo do contexto )  ··········  [ ↶ ] [ ⌨⌄ ]
   destaque       muda com o cursor                 fixos à direita
```

1. **＋ Inserir** (botão em destaque): abre uma folha com **cartões com miniatura** de cada bloco —
   Título, Lista, Tarefa, Tabela, Código, Citação, Imagem, Câmera, Link para nota, Divisor, Data de
   hoje, Seção recolhível. A miniatura mostra o resultado, não o Markdown. Insere na linha do cursor.
2. **Grupo do contexto** (cápsula com fundo suave, ícones lucide, no máximo 5 botões): muda conforme o
   cursor, então a barra nunca precisa rolar.

   | Cursor em       | Grupo                                                          |
   | --------------- | -------------------------------------------------------------- |
   | Texto comum     | Aa (estilos) · Lista · Tarefa · Link                           |
   | Texto + "Aa"    | Negrito · Itálico · Tachado · Código em linha · Link · ✕       |
   | Seleção ativa   | Abre direto os estilos (mesmo grupo do "Aa")                   |
   | Título          | H1 · H2 · H3 · H4 (o atual marcado) · ¶ (virar parágrafo)      |
   | Item de lista   | Desrecuar · Recuar · Mover ↑ · Mover ↓ · Alternar tarefa       |
   | Tabela          | Célula ← · Célula → · + Linha · + Coluna · Apagar/alinhar      |
   | Bloco de código | Tab · Linguagem · Copiar bloco                                 |
   | Modo Código     | Tab · `#` · `-` · `[ ]` · `\|` · `` ` `` · `*` (sem o Inserir) |

3. **Desfazer** e **esconder teclado** ficam fixos à direita. Refazer fica no toque longo do
   Desfazer, para economizar espaço.

Atalhos de digitação do editor (`- ` vira lista, `[] ` vira tarefa, `## ` vira título) continuam e
reduzem o uso da barra. Funções: as já existentes em `format-selection.js`, `list-indent.js`,
`list-move.js`, `markdown-table.js`, `table-navigation.js`, `insert-block.js`.

### 5.6 Tarefas

Lista de todas as tarefas abertas agrupadas por nota; tocar no checkbox conclui (com desfazer); tocar no
texto abre a nota em Leitura rolada até a tarefa, com destaque de 1 s.

### 5.7 Imagens

Galeria em 2 colunas (alvenaria), respeitando a proporção de cada imagem, com o nome da nota de origem.
Botão de câmera na barra do app: a foto vira imagem nova e abre a escolha "Inserir em qual nota?" (ou
"Nova nota"). Tocar abre o detalhe com Compartilhar, Abrir nota e Apagar.

### 5.8 Folhas inferiores

Alça de 32 × 4 dp, arraste para fechar, toque no véu fecha, voltar fecha. Foco vai para o primeiro item
e volta para o acionador ao fechar. Altura máxima: viewport visível − inset-top − 24 dp; acima disso,
rola por dentro.

### 5.9 Tema

Seletor Claro · Escuro · Sistema no topo do ⋮ do Início e na folha ⋮ da nota (`variant="panel"` do
padrão do projeto, abas com ícones sol/lua/monitor, só a ativa com nome). Persiste em prefs; Sistema
acompanha o aparelho. Muda também a cor dos ícones das barras do sistema (3.3).

## 6. Fases

Fase 0 (insets) e fase 1 parte 1 (`platform.js`, `MobileShell` vazio, projeto Playwright mobile) já estão
feitas. O resto:

| Fase | Entrega                                                                                                                  | Pronto quando                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1.2  | Extrair `useNotesStore`, `useNoteActions`, `usePrefs` do `main.jsx`, um commit cada                                      | Suíte desktop verde sem editar nenhum teste                                                            |
| 1.3  | Ponte de insets v2 (seção 3.2), script de boot em `index.html`, hook `useInsets`, `data-keyboard`                        | Problemas 1–3 e 14 resolvidos no aparelho; E2E simula insets e teclado                                 |
| 1b   | Spike IME no CodeMirror (problema 17)                                                                                    | Relatório em `docs/adr/`: o que o modo Editar precisa corrigir; o modo Código existe de qualquer forma |
| 2    | `nav-stack.js`, Notas com busca, barra inferior, FAB                                                                     | Problemas 5, 7, 22; criar e abrir nota só por toque                                                    |
| 3    | Nota em Leitura, alternador, folha ⋮, tabelas em leitura (cartões, 1ª coluna fixa, tela cheia), Tarefas                  | Problemas 15, 21; concluir tarefa sem abrir teclado                                                    |
| 4    | Edição: Inserir, barra contextual, edição de tabela por célula, modo Código, scrollMargins, câmera, gravação em `hidden` | Problemas 6, 12, 13, 16, 18, 19; matar o app após digitar e não perder nada                            |
| 5    | Aba Imagens, Lixeira, Configurações, Histórico, importar/exportar/backup via seletor do sistema                          | Toda função existente tem caminho por toque                                                            |
| 6    | Polimento: tema nas barras, arrastar folhas, TalkBack, escala 1,3×–2×, rotação, tela dividida                            | Problemas 2, 4, 8–11, 20, 23, 24 no checklist manual                                                   |
| 7    | Receber compartilhamento, "Abrir com" `.md`, atalho de launcher "Nova nota"                                              | Capturar texto de outro app em 2 toques                                                                |

## 7. Testes

- **Desktop:** suíte atual sem edição em toda fase.
- **E2E mobile** (`e2e/mobile/`, projeto `mobile` já criado): fixture que injeta
  `window.__insets({ top: 32, bottom: 24, ime: 0 })` e outra que simula teclado
  (`ime: 300`, `data-keyboard=open`). Specs por problema do catálogo, com o número no nome do teste.
  Capturas em 360 × 740, 390 × 844 e 412 × 915, tema claro e escuro.
- **Seeds de teste:** notas com título de 200 caracteres, palavra de 80 letras sem espaço, tabela de
  12 colunas, bloco de código largo, 300 notas (rolagem), nota vazia, lista com 6 níveis.
- **Manual (aparelho):** gestos e 3 botões; Gboard, SwiftKey, Samsung Keyboard, ditado por voz; teclado
  flutuante; escala de fonte 1,3× e 2×; TalkBack; matar processo pelas opções do desenvolvedor
  ("Não manter atividades").

## 8. Decisões

Tomadas:

1. **Barra inferior:** Notas, Tarefas, Imagens. A busca fica no topo de Notas.
2. **Lixeira sem confirmação**, com "Desfazer" no toast. No celular, menos etapas.
3. **Modo Código sempre disponível** no mobile.
4. **Remover o `setPadding` de `e4a0f75`** na fase 1.3, junto com a ponte de insets nova. Removê-lo
   antes, sozinho, traria de volta o bug do cabeçalho sob a barra de status.

Em aberto:

5. **Visão padrão das tabelas:** cartões para mais de 3 colunas (recomendado) ou sempre tabela.
6. **Imagens na barra inferior:** se o uso real mostrar que é rara, trocar por "Recentes" ou
   "Fixadas" sem mudar o resto da navegação.
