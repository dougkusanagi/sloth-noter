# Plano v2: interface Android do Sloth Note

Status: implementação parcial. Este documento define o escopo Android vigente e substitui as
seções 3.3–7 de [`plano-mobile.md`](plano-mobile.md). O diagnóstico das seções 1–3.2 do v1 é histórico;
seus princípios continuam aplicáveis. O [plano de execução](plans/mobile-interface.md) é a única fonte
de andamento, ordem dos incrementos e próxima etapa. O protótipo ilustra a proposta; não comprova
que um recurso esteja implementado ou validado no APK.

As extrações de hooks já existem, mas `main.jsx` ainda contém a interface desktop e o hook de ações
continua ligado a ela; mobile usa ações próprias com regras compartilhadas. Não presumir uma lista
única de ações nem exclusão completa do código desktop do bundle Android sem verificar o build.

Protótipo navegável: [`docs/mobile-prototype/index.html`](mobile-prototype/index.html). Abra no navegador;
o painel ao lado do celular simula barra de status, recorte da câmera, navegação por gestos ou por
3 botões, teclado virtual, tema e escala de fonte.

## 1. O que muda em relação ao v1

| Tema                 | v1                                   | v2                                                                                               |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Insets               | Variáveis CSS publicadas pelo Kotlin | Uma única fonte de verdade por tipo de inset (seção 3); conflito com `e4a0f75` resolvido         |
| Teclado              | Barra presa a `--ime-bottom`         | Contrato em 3 zonas, estados aberto/abrindo/fechando/fechado e testes de teclado flutuante       |
| Navegação            | Pilha de telas + seletor no Início   | Pilha de telas + barra inferior com 3 destinos (Notas, Tarefas, Imagens); busca no topo de Notas |
| Edição               | Barra de formatação única            | Botão "Inserir" com miniaturas + grupo contextual de até 5 ícones                                |
| Tabelas              | Rolagem horizontal                   | Cartões, tabela com 1ª coluna fixa, tela cheia e edição por célula (seção 5.4)                   |
| Modo Código          | Só se o spike falhar                 | Obrigatório na fase 4, com teclas de símbolos na barra                                           |
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
│ ZONA 3: barra inferior        │  ← navegação (mín. 56 dp) OU formatação (mín. 52 dp)
├───────────────────────────────┤
│ inset-bottom: barra de gestos │  ← ou altura do teclado, o que for maior
│ OU teclado                    │
└───────────────────────────────┘
```

Regras:

1. **Estado atual:** a raiz usa `height: 100dvh`. Não existe `--app-height`. Na fase 4, validar a
   relação entre altura do WebView, viewport visual e IME; uma viewport já reduzida não pode receber
   a mesma redução novamente pelo padding. Definir o ajuste apenas a partir dessa medição.
2. **Zona 3 troca de conteúdo com o teclado.** Teclado fechado: barra de navegação (só nas telas de
   topo) ou nada. Teclado aberto: barra de formatação (no editor) ou nada (nos campos de busca). A barra
   de navegação **nunca** sobe junto com o teclado.
3. **O padding de baixo é `max(inset-bottom, ime-bottom)`**, nunca a soma. Com o teclado aberto, a barra
   de gestos fica atrás do teclado.
4. **Laterais:** `inset-left/right` só importam em paisagem com recorte lateral; aplicar na raiz.
5. Diálogos e folhas inferiores são filhos da raiz, então herdam as mesmas margens.

## 3. Insets: uma fonte de verdade

### 3.1 O conflito anterior

O commit `e4a0f75` aplicava `setPadding` na view de conteúdo com `systemBars | displayCutout | ime`.
Esse padding já foi removido. Ele encolhia o WebView inteiro, com os efeitos que motivaram a mudança:

- Resolvia o cabeçalho sob a barra de status, sem CSS.
- A área atrás das barras ficava com o fundo da Activity, em vez da cor do tema do app.
- Mudava a altura do WebView durante a animação do teclado, exigindo novas medições do editor.
- A camada web não recebia a altura do teclado para trocar a zona 3.

### 3.2 Contrato implementado e validação pendente

| Inset                     | Quem aplica | Como                                                                                                                                      |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de status + recorte | CSS         | `--inset-top` publicado pelo Kotlin; `max(var(--inset-top,0px), env(safe-area-inset-top))`                                                |
| Barra de gestos/botões    | CSS         | `--inset-bottom`, mesma regra                                                                                                             |
| Laterais (paisagem)       | CSS         | `--inset-left` / `--inset-right`                                                                                                          |
| Teclado (IME)             | CSS         | Kotlin publica `--ime-bottom`, `--ime-progress` e `data-keyboard` (`open`, `opening`, `closing`, `closed`); não aplica padding ao WebView |

Implementação nativa (`MainActivity.kt`):

1. O `setPadding` geral de `e4a0f75` foi removido; `enableEdgeToEdge()` foi mantido.
2. `setOnApplyWindowInsetsListener` lê os insets, converte px → dp e chama
   `webView.evaluateJavascript("window.__insets?.({...})")`. `public/insets-boot.js`, carregado pelo
   `index.html`, instala o receptor antes do bundle; os valores chegam quando a ponte nativa publica.
   Ainda é necessário verificar o primeiro frame e a republicação após recriar o WebView.
3. `ViewCompat.setWindowInsetsAnimationCallback` envia estados de transição e a fração. Verificar no
   APK a direção, a publicação do estado final e o layout durante toda a animação. Publicar esses
   dados não comprova que a barra ou o cursor já acompanhem o teclado corretamente.
4. O manifesto mantém `windowSoftInputMode="adjustResize"`. Validar seu efeito junto do padding CSS
   nas versões suportadas; não acrescentar padding nativo para compensar um problema sem medir.
5. Reserva: se `window.__insets` nunca for chamado (WebView do Tauri dev, navegador), o JS usa
   `visualViewport` (`resize` + `scroll`) para calcular `--ime-bottom = innerHeight - visualViewport.height
   - visualViewport.offsetTop`.

Teclados **flutuantes** ou **divididos** podem não produzir uma redução útil da viewport. Não inferir
ausência de teclado apenas de `ime = 0`: testar foco, acesso aos controles e cursor nesses modos.
No navegador, testar também zoom e redimensionamento para não confundi-los com abertura do teclado.

A implementação da ponte não encerra a fase 1.3: geometria, animação e estados finais ainda exigem
validação no APK. O tratamento de IME segue o [ADR 0003](adr/0003-spike-ime-mobile.md).

### 3.3 Cores das barras do sistema

- Integração nativa ainda pendente: atualizar a aparência dos ícones conforme o tema efetivo
  (claro, escuro ou sistema resolvido). O nome e o contrato da ponte serão definidos na entrega;
  não existe hoje um comando `set_system_bar_style`.
- Objetivo da entrega nativa: alinhar o fundo atrás das barras ao tema do app, usando seus tokens
  existentes, e verificar o contraste dos ícones inclusive com o véu das folhas aberto.

## 4. Catálogo de problemas que só existem no celular

Cada item vira um teste: **E2E** (Playwright, perfil Pixel 7 + insets simulados), **U** (unitário) ou
**M** (checklist manual no aparelho).

### 4.1 Sistema

| #   | Problema                                                                   | Solução                                                                                                                                | Teste  |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Barra de status cobre o topo                                               | Seção 3                                                                                                                                | E2E, M |
| 2   | Recorte da câmera (notch/furo) no meio ou canto                            | União dos insets de barras e recorte, sem somar áreas sobrepostas; em paisagem, inset lateral                                          | M      |
| 3   | Barra de gestos cobre FAB e barra inferior                                 | `inset-bottom` na zona 3; FAB acima dela                                                                                               | E2E    |
| 4   | Gesto "voltar" pela borda conflita com arrastar na margem                  | Nada interativo de arrastar a menos de 24 dp das bordas laterais; `systemGestureExclusionRects` não é usado                            | M      |
| 5   | Botão voltar fecha o app em vez da folha aberta                            | Pilha de camadas (seção 5.1); voltar sempre fecha a camada de cima                                                                     | E2E, U |
| 6   | Processo morto em segundo plano perde o texto                              | Enviar notas e histórico ao perder visibilidade; testar confirmação nativa, falha e encerramento com fila pendente                     | E2E, M |
| 7   | Volta ao app depois de horas: estado perdido                               | Separar recarga da sessão e reinício do processo; hoje rotas usam `sessionStorage`, sem garantia de recuperação após morte do processo | E2E, M |
| 8   | Rotação recria a Activity                                                  | `configChanges` no manifesto (o Tauri já define); testar que cursor e rolagem ficam                                                    | M      |
| 9   | Tela dividida / janela pequena (≤ 320 dp de largura ou ≤ 400 dp de altura) | Reorganizar controles e usar folhas para excedentes, preservando acesso aos destinos e às ações essenciais                             | E2E    |
| 10  | Escala de fonte do sistema 1,3×–2×                                         | Unidades em `rem`; WebView com `textZoom` respeitado; barras crescem em altura, não cortam                                             | M      |
| 11  | Modo escuro do sistema muda com o app aberto                               | `matchMedia('(prefers-color-scheme: dark)')` já usado pelo modo Sistema; refaz cores das barras                                        | E2E    |

### 4.2 Teclado

| #   | Problema                                                        | Solução                                                                                                               | Teste  |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| 12  | Teclado cobre o cursor                                          | `EditorView.scrollMargins` com `bottom = altura da zona 3 + 24 dp`; após `opening→open`, `scrollIntoView` do cursor   | E2E    |
| 13  | Teclado cobre o botão "Salvar/Criar" de diálogos                | Diálogos com campo viram folhas inferiores ancoradas na zona 3; botão primário fica acima do teclado                  | E2E    |
| 14  | Texto "pula" durante a animação do teclado                      | Medir altura, cursor e rolagem durante `opening` e `closing`; ajustar na fase 4 sem remontar o editor                 | E2E, M |
| 15  | Teclado abre sem querer ao tocar para ler                       | Nota existente abre em **Leitura**; editar exige tocar "Editar" ou dois toques no ponto                               | E2E    |
| 16  | Não há como esconder o teclado sem perder a posição             | Botão "esconder teclado" na barra de formatação; voltar com teclado aberto só fecha o teclado                         | E2E    |
| 17  | Composição do IME (Gboard/SwiftKey) quebra com sintaxe oculta   | Seguir ADR 0003: manter EditContext e sintaxe das linhas selecionadas; só acrescentar correção com falha reproduzível | E2E, M |
| 18  | Autocorreção/maiúscula automática em títulos de arquivo e busca | `autocapitalize`, `autocorrect`, `spellcheck` e `enterkeyhint` por campo (busca: `search`; renomear: `done`)          | U      |
| 19  | Sem Tab/Shift+Tab nem atalhos                                   | Botões recuar/desrecuar e desfazer/refazer na barra de formatação                                                     | E2E    |
| 20  | Teclado físico (Bluetooth, DeX, Chromebook)                     | Atalhos do desktop continuam; barra de formatação some se nenhum IME abrir                                            | M      |

### 4.3 Toque

| #   | Problema                                                                   | Solução                                                                                                                     | Teste  |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| 21  | Alvos pequenos (checkbox, seta de seção, fechar)                           | Área efetiva mínima de 48 × 48 dp, sem sobrepor controles; medir e tocar inclusive nas bordas                               | E2E, M |
| 22  | Hover não existe (dicas de link, setas que aparecem no hover)              | Tudo que o desktop mostra no hover fica sempre visível ou vai para pressionar e segurar                                     | E2E    |
| 23  | Menu de seleção nativo do Android disputa com a barra flutuante do desktop | Barra flutuante desligada no mobile; formatação só pela zona 3                                                              | M      |
| 24  | Toque duplo dá zoom, `300 ms` de atraso                                    | `touch-action: manipulation` na raiz; `user-scalable` mantido para acessibilidade (zoom de pinça só no conteúdo de leitura) | M      |

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
- O núcleo já calcula a prioridade de retorno, mas sua integração com teclado e saída nativos
  continua pendente. Testar folha sobre teclado, botão do cabeçalho, gesto/botão Android, raiz com
  gravação pendente e falha de gravação. Um aviso para tocar de novo não comprova que o texto foi salvo.
- `sessionStorage` cobre a sessão atual. Antes de prometer restauração após reiniciar o processo,
  definir armazenamento durável dos metadados da rota, versionamento e descarte de referências
  inválidas. Texto continua exclusivamente na persistência das notas; camadas não são restauradas.

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

- Itens com altura mínima de 64 dp, podendo crescer com a fonte: título e prévia com acesso ao texto
  completo na nota. Data relativa só entra após definir e persistir datas de alteração; o modelo atual
  não as fornece. Não apresentar ordem de abertura ou revisão como data de modificação.
- **Busca:** com termo, a lista vira "Resultados" (título primeiro, depois trechos com o termo
  destacado). Abrir um resultado e voltar mantém termo e rolagem. Sem resultados: "Nada encontrado
  para “x”." + "Criar nota “x”". Buscas recentes aparecem ao focar o campo vazio.
- Pressionar e segurar → folha de ações (Fixar, Renomear, Compartilhar, Lixeira). **Deslizar para a
  esquerda → Lixeira, sem confirmação**, com "Desfazer" no toast (decidido).
- Estados: vazio ("Nenhuma nota ainda. Toque em + para escrever a primeira."), carregando (esqueleto
  de 5 itens), erro de leitura (mensagem + "Tentar de novo").
- Toque longo e deslizar são atalhos; o botão de ações continua visível e acessível. O gesto deve
  cancelar durante rolagem vertical, respeitar as bordas do sistema e não abrir a nota após excluir.
- Renomear preserva os dados em caso de erro, trata nomes duplicados e atualiza referências wiki
  pelas regras existentes. Compartilhar texto sai na fase 2; compartilhar arquivo `.md` e exportar
  pelo seletor são entregas distintas da fase 5 (contratos na seção 5.10).

### 5.3 Nota e os 3 modos

| Modo       | Para quê                               | Como entrar                                      |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| **Ler**    | Consultar e marcar tarefas sem teclado | Padrão ao abrir nota existente                   |
| **Editar** | Edição visual (modo Padrão do desktop) | "Editar" na barra do app ou dois toques no ponto |
| **Código** | Markdown puro, com sintaxe visível     | ⋮ → "Modo código"; o modo fica salvo por nota    |

- O modo Código é uma entrega obrigatória da fase 4, independente do spike 1b; ainda não está
  disponível no mobile. No desktop ele usa `textarea`, não CodeMirror. Antes de implementar, comparar
  a adaptação desse caminho com CodeMirror sem decorações, verificando composição, seleção,
  desfazer/refazer, busca e histórico. Registrar a escolha no plano; propor ADR se mudar o contrato
  compartilhado ou introduzir uma decisão difícil de reverter.
- Fonte mono, `autocapitalize="off"` e `spellcheck="false"`. A leitura e a edição por célula isolam
  a rolagem de tabelas; no modo Código a rolagem pode pertencer ao editor de texto cru. Não prometer
  rolagem por bloco a partir do `textarea` atual. Preservar Markdown e seleção ao alternar modos.
- Em Código, a barra de formatação troca "Inserir" e os grupos por **teclas de símbolos** que o teclado
  do celular esconde: Tab, `#`, `-`, `[ ]`, `|`, `` ` ``, `*`.
- Barra do app: ←, título, alternador **Ler | Editar** (em Editar e Código vira "Pronto"), ⋮. Um selo
  "Código" ao lado do status de gravação mostra o modo.
- Indicador de gravação: "Salvo" / "Salvando…" / "Não foi possível salvar — tocar para tentar de
  novo". Nunca inventa progresso.
- Margens 16 dp; corpo 17 px; sem gutter de 40 px (pílula do nível vira prefixo pequeno na linha).
- A folha da nota será definida em 3.1: renomear, fixar, compartilhar texto e lixeira; busca na nota
  e recolher/expandir seções em 3.2; acesso a Código em 4.2, exportar e histórico em 5.1/5.3.
  Só mostrar ações implementadas. Delimitar também os controles de tamanho de texto e foco nessa
  entrega, reutilizando preferências existentes. Links internos/externos e copiar código devem
  funcionar por toque; testar preservação do contexto ao voltar.

### 5.4 Tabelas

Tabelas são o caso mais difícil numa tela de 360–412 dp. Regras:

**Leitura**

- Barra pequena acima da tabela: "3 linhas · 5 colunas", alternador **Ver cartões / Ver tabela** e
  botão **tela cheia**.
- **Visão tabela:** rola na horizontal dentro do próprio bloco (a página não rola de lado); a
  **primeira coluna fica fixa**; sombras nas bordas indicam que há mais colunas. Cabeçalho sem quebra
  de palavra; células com largura entre 96 e 220 dp e `overflow-wrap: anywhere` para palavras longas.
- **Visão cartões:** cada linha vira um cartão com pares "coluna: valor"; o valor da 1ª coluna é o
  título. Cartões para **mais de 3 colunas** é a recomendação, ainda sujeita à decisão 5 da seção 8.
  Não implementar esse padrão como decisão já tomada.
- Antes de persistir a escolha por tabela, definir sua identificação (nota + referência ao bloco),
  validade após edição e descarte de referências ambíguas. A rota de tela cheia deve identificar
  a tabela, não só a nota; validar duas tabelas iguais e edições antes do bloco. Não inserir IDs no
  Markdown nem escolher outra tabela silenciosamente quando a referência perder validade.
- **Tela cheia:** abre a tabela numa tela própria, sem margens, liberando a rotação para paisagem e o
  zoom de pinça. Voltar retorna à nota no mesmo ponto.

**Edição (modo Editar)**

- Sempre em visão tabela. Tocar numa célula seleciona a célula (contorno na cor de destaque) e edita só
  o texto dela; o usuário nunca vê nem digita `|`.
- Barra contextual da tabela: célula anterior / próxima (substituem Tab e Shift+Tab), adicionar linha,
  adicionar coluna, e ⋯ para apagar linha ou coluna e alinhar coluna.
- "Enter" na última célula de uma linha cria a próxima linha (como no desktop, `table-navigation.js`).
- **Criar:** Inserir → Tabela → grade para escolher linhas × colunas com um toque (até 6 × 6) →
  "Inserir tabela"; o cursor vai para a primeira célula do cabeçalho.

**Código:** preservar o texto original; alinhar colunas só por ação explícita usando
`markdown-table.js`. O contrato de rolagem depende do editor escolhido na seção 5.3.

### 5.5 Barra de formatação

Problema da versão anterior: muitos botões de texto iguais lado a lado, sem hierarquia, todos competindo.
Estrutura proposta, com altura mínima de 52 dp sobre o teclado. A quantidade de botões depende da
largura disponível e da escala de fonte; cinco é um teto, não uma obrigação de caber numa linha:

```
[ ＋ Inserir ]  ( grupo do contexto )  ··········  [ ↶ ] [ ⌨⌄ ]
   destaque       muda com o cursor                 fixos à direita
```

1. **＋ Inserir** (botão em destaque): abre uma folha com **cartões com miniatura** de cada bloco —
   Título, Lista, Tarefa, Tabela, Código, Citação, Imagem, Câmera, Link para nota, Divisor, Data de
   hoje, Seção recolhível. A miniatura mostra o resultado, não o Markdown. Insere na linha do cursor.
2. **Grupo do contexto** (cápsula com fundo suave, ícones lucide, no máximo 5 botões): muda conforme o
   cursor. Em telas estreitas, manter Inserir, Desfazer e esconder teclado acessíveis e levar o
   restante para uma folha de contexto explícita. Não reduzir os alvos abaixo de 48 × 48 dp.

   | Cursor em       | Grupo                                                           |
   | --------------- | --------------------------------------------------------------- |
   | Texto comum     | Aa (estilos) · Lista · Tarefa · Link                            |
   | Texto + "Aa"    | Negrito · Itálico · Tachado · Código em linha · Link            |
   | Seleção ativa   | Abre direto os estilos (mesmo grupo do "Aa")                    |
   | Título          | H1 · H2 · H3 · H4 (o atual marcado) · ¶ (virar parágrafo)       |
   | Item de lista   | Desrecuar · Recuar · Mover ↑ · Mover ↓ · Alternar tarefa        |
   | Tabela          | Célula ← · Célula → · + Linha · + Coluna · Apagar/alinhar       |
   | Bloco de código | Tab · Linguagem · Copiar bloco                                  |
   | Modo Código     | Até 5 símbolos visíveis; demais na folha Símbolos (sem Inserir) |

3. **Desfazer** e **esconder teclado** ficam acessíveis na barra. **Refazer** tem ação explícita na
   folha de edição; toque longo no Desfazer pode ser um atalho adicional. Os estilos fecham pelo
   mesmo acionador ou pelo botão Fechar da folha, fora do limite de cinco ações do grupo.
4. Preservar instância do editor, seleção e composição ao abrir folhas e executar ações. Testar
   320/360/390/412 dp, fonte 1×/1,3×/2×, teclado aberto e físico; permitir aumentar a altura quando
   necessário. Não montar nove alvos de 48 dp numa única linha de 320 dp.

Atalhos de digitação do editor (`- ` vira lista, `[] ` vira tarefa, `## ` vira título) continuam e
reduzem o uso da barra. Funções: as já existentes em `format-selection.js`, `list-indent.js`,
`list-move.js`, `markdown-table.js`, `table-navigation.js`, `insert-block.js`.

### 5.6 Tarefas

Lista de todas as tarefas abertas agrupadas por nota; tocar no checkbox conclui (com desfazer); tocar no
texto abre a nota em Leitura rolada até a tarefa, com destaque de 1 s.

O próximo incremento deve acrescentar tanto o destino da tarefa quanto o desfazer da conclusão,
sem exigir IDs persistentes de tarefas nesta entrega. Usar a referência atual e validar o trecho
antes de realçar; se mudou, abrir a nota sem apontar para uma tarefa errada. Histórico de conclusão,
recorrência e lembretes são trabalho futuro do ROADMAP, não parte da adaptação mobile.

### 5.7 Imagens

Galeria em 2 colunas (alvenaria), respeitando a proporção de cada imagem, com o nome da nota de origem.
Botão de câmera na barra do app: a foto vira imagem nova e abre a escolha "Inserir em qual nota?" (ou
"Nova nota"). Tocar abre o detalhe com Compartilhar, Abrir nota e Apagar.

### 5.8 Folhas inferiores

Alça de 32 × 4 dp, arraste para fechar, toque no véu fecha, voltar fecha. Foco vai para o primeiro item
e volta para o acionador ao fechar. Altura máxima: viewport visível − inset-top − 24 dp; acima disso,
rola por dentro.

### 5.9 Tema

Seletor Claro · Escuro · Sistema discreto e visível no cabeçalho, sem abrir menus, reutilizando as
preferências existentes. Já existe na casca; ajustar seus alvos de 40/44 px para pelo menos 48 × 48 dp
sem perder o título e as ações em telas estreitas. Este projeto não é um dashboard Laravel/Inertia;
não copiar um widget específico dessa stack. Sistema acompanha o aparelho. A mudança dos ícones
das barras do sistema é uma entrega nativa separada, ainda pendente (3.3).

### 5.10 Compartilhamento, arquivos e histórico

- **2.3 — Compartilhar texto:** adaptador Android acionado pela folha da nota/lista. Testar sucesso,
  cancelamento, indisponibilidade e falha, sem duplicar envios nem alterar a nota. Na prévia web,
  oferecer alternativa explícita de copiar quando o compartilhamento não estiver disponível.
- **5.1 — Compartilhar `.md` e exportar:** arquivo temporário por mecanismo nativo restrito, nome,
  codificação UTF-8, MIME e permissões temporárias testados. Exportar escolhe destino pelo sistema;
  não é sinônimo de compartilhar texto. Definir o tratamento de imagens referenciadas e informar
  quando o arquivo isolado não as incluir.
- **5.2 — Importar e backup:** ler pelo seletor do sistema, validar conteúdo e preservar o documento
  em cancelamentos/falhas. Backup completo inclui imagens; restaurar exige prévia da operação e
  tratamento de dados inválidos, duplicidades e falta de espaço. Não confundir backup de notas com
  cópia dos diários de versões.
- **5.3 — Histórico de versões:** aplicar o ADR 0002, com escolha explícita para ativar neste
  dispositivo, limites, limpeza, restauração e aviso separado de falha. Falhar no histórico nunca
  deve ser apresentado como falha de gravação da nota se ela foi salva. Confirmar notas e histórico
  ao perder visibilidade, sem bloquear a gravação da nota pela fila de histórico.
- **7.1/7.2 — Receber texto / “Abrir com”:** independentes do compartilhamento de saída. Antes de
  receber arquivos, fechar o contrato de cópia interna versus edição do original, permissões de URI,
  conflitos e comportamento com o app aberto ou fechado. A recomendação é importar cópia; a decisão
  ainda está aberta. O ADR 0001 limita edição no local ao desktop. A presença de filtros no manifesto
  não comprova que o fluxo Android esteja pronto.
- Histórico de **versões** é local conforme ADR 0002. Histórico de **conclusão de tarefas** é outro
  recurso futuro. Sincronização do segundo não autoriza enviar o primeiro para a rede. Mudanças nos
  ADRs aceitos exigem nova decisão aprovada; não reescrever os documentos aceitos.

## 6. Fases

As fases abaixo agrupam o escopo; não são uma segunda lista de andamento. A ordem executável, as
dependências e as evidências ficam no [plano de execução](plans/mobile-interface.md). Integração
inicial, teste de navegador e validação nativa são marcos diferentes.

| Fase | Entrega                                                                                                                  | Pronto quando                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1.2  | Extrair `useNotesStore`, `useNoteActions`, `usePrefs` do `main.jsx`, um commit cada                                      | Suíte desktop verde sem editar nenhum teste                                                                    |
| 1.3  | Ponte de insets v2 (seção 3.2), script de boot em `index.html`, hook `useInsets`, `data-keyboard`                        | Problemas 1–3 e 14 resolvidos no aparelho; E2E simula insets e teclado                                         |
| 1b   | Spike IME no CodeMirror (problema 17)                                                                                    | Relatório/fixture conforme ADR 0003; matriz nativa separada, Código continua obrigatório na fase 4             |
| 2    | `nav-stack.js`, Notas com busca, barra inferior, FAB                                                                     | Problemas 5, 7, 22; criar e abrir nota só por toque                                                            |
| 3    | Nota em Leitura, alternador, folha ⋮, tabelas em leitura (cartões, 1ª coluna fixa, tela cheia), Tarefas                  | Problemas 15, 21; concluir tarefa sem abrir teclado                                                            |
| 4    | Edição: Inserir, barra contextual, edição de tabela por célula, modo Código, scrollMargins, câmera, gravação em `hidden` | Problemas 6, 12, 13, 16, 18, 19; verificar texto confirmado em disco e recuperação nos cenários de interrupção |
| 5    | Aba Imagens, Lixeira, Configurações, Histórico, importar/exportar/backup via seletor do sistema                          | Toda função existente tem caminho por toque                                                                    |
| 6    | Polimento: tema nas barras, arrastar folhas, TalkBack, escala 1,3×–2×, rotação, tela dividida                            | Problemas 2, 4, 8–11, 20, 23, 24 no checklist manual                                                           |
| 7    | Receber compartilhamento, "Abrir com" `.md`, atalho de launcher "Nova nota"                                              | Capturar texto de outro app em 2 toques                                                                        |

### Referência da primeira integração — 2026-10-23

O núcleo de navegação foi integrado à casca mobile. Lista, busca, criação, abertura em leitura,
edição visual inicial, retorno com contexto preservado, temas e ações de fixar/lixeira estão
implementados. Tarefas, imagens referenciadas e Novidades têm uma primeira integração.

O estado detalhado, limitações, tentativas e próximo passo ficam em
[plano de implementação](plans/mobile-interface.md). A fase 2 ainda tem interações da lista e
validação nativa pendentes; as fases seguintes não estão concluídas.

## 7. Testes

- **Por incremento:** testes afetados locais passando antes do commit. Mudanças do núcleo/editor
  compartilhado também executam a regressão desktop existente, sem enfraquecer suas asserções.
- **Ao fechar a etapa, antes do push:** `bun run test`, `bun run desktop:test` e `bun run e2e`
  (projetos chromium e mobile). `bun run lint`, formatação dos arquivos alterados,
  `bun run version:check` e `bun run build` são verificações complementares, não testes substitutos.
  Não usar CI para validar nem alterar workflows nesta tarefa. Não enviar trabalho parcial.
- **Critério de entrega:** fragmento de changelog no mesmo commit de cada mudança perceptível no app,
  com imagem local quando esclarecer o uso. Conferir Novidades em desktop/mobile. Documentação
  interna, testes e refatoração sem efeito perceptível não criam novidade no app.
- **E2E mobile** (`e2e/mobile/`, projeto `mobile` já criado): fixture que injeta
  `window.__insets({ top: 32, bottom: 24, ime: 0 })` e outra que simula teclado
  (`ime: 300`, `data-keyboard=open`). Specs por problema do catálogo, com o número no nome do teste.
  Capturas em 360 × 740, 390 × 844 e 412 × 915, tema claro e escuro; incluir 320 dp e paisagem nas
  telas afetadas. Inspecionar as imagens; passar no axe não comprova geometria nem usabilidade.
- **Seeds de teste:** notas com título de 200 caracteres, palavra de 80 letras sem espaço, tabela de
  12 colunas válidas (conferir a quantidade renderizada), duas tabelas iguais, células vazias e longas,
  bloco de código largo, 300 notas (rolagem), nota vazia, lista com 6 níveis e nomes duplicados.
- **Rastreabilidade:** cada problema #1–24 deve apontar para teste ou checklist com ambiente,
  resultado e evidência. Um título de teste com o número do problema não comprova cobertura total.
- **Ciclo de vida:** testar recarga na mesma sessão, recriação da Activity/WebView, reinício do
  processo e encerramento durante escrita nativa lenta. Confirmar seleção/composição, texto
  persistido, fila e comportamento após falha. Eventos `hidden`/`pagehide` não são garantia de
  conclusão de uma gravação assíncrona antes da morte do processo.
- **Falhas independentes:** simular nota salva com histórico indisponível, nota não salva, histórico
  desligado e tentativa de recuperação. O estado “Salvo” depende da confirmação da persistência;
  erro do histórico deve ter mensagem e recuperação próprias.
- **Manual (aparelho):** gestos e 3 botões; Gboard, SwiftKey, Samsung Keyboard, ditado por voz; teclado
  flutuante; escala de fonte 1,3× e 2×; TalkBack; animações ativadas. “Não manter atividades” exercita
  destruição de Activity, não substitui o cenário de morte/reinício do processo. Registrar o método
  de interrupção e inspecionar o texto nativo recuperado, não só o estado do DOM.
- **APK:** executar fluxos reais no pacote compilado, além da fixture IME e da ponte simulada no
  navegador. Registrar Android/WebView/teclado/idioma/dispositivo. A matriz do ADR 0003 permanece
  aberta até haver evidência dos casos pendentes; não repetir o spike inteiro a cada commit.

## 8. Decisões

Tomadas:

1. **Barra inferior:** Notas, Tarefas, Imagens. A busca fica no topo de Notas.
2. **Lixeira sem confirmação**, com "Desfazer" no toast. No celular, menos etapas.
3. **Modo Código obrigatório no escopo** mobile, com entrega na fase 4; ainda não disponível.
4. **Remoção do `setPadding` de `e4a0f75`:** já implementada junto da ponte. O contrato vigente é o
   da seção 3.2; a validação nativa ainda não está concluída.

Em aberto:

5. **Visão padrão das tabelas:** cartões para mais de 3 colunas (recomendado) ou sempre tabela.
6. **Receber arquivos Android:** cópia interna (recomendação) versus editar original; fechar antes
   de 7.2. Edição no local requer proposta de ADR específica, aprovada, sem alterar o ADR 0001 aceito.

Possível evolução, fora desta entrega: trocar a aba Imagens só se o uso real justificar uma nova
proposta. A navegação atual continua decidida; não tratar essa hipótese como pendência bloqueante.

As escolhas locais de editor Código e referência de tabela devem ser registradas no incremento
correspondente. Os ADRs 0001 e 0002 permanecem aceitos e inalterados; o ADR 0003 é um relatório
parcial com direção técnica e matriz pendente, não uma aprovação completa de compatibilidade.
