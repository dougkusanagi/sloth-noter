# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [0.47.0] — 2026-11-25

Adicionados gestos de estrutura no editor visual do celular (B10): deslizar um item de lista para a direita/esquerda recua ou desrecua o item, e deslizar um parágrafo comum para a direita o transforma em tarefa, usando o mesmo Markdown e histórico de desfazer dos botões da barra. Confirmado também B16 (modelos ao criar nota). Veja os [detalhes da versão](changelog/0.47.0.md).

## [0.46.3] — 2026-11-25

Trocar de nota pelo gesto horizontal no cabeçalho mobile (B9) agora substitui a nota atual na pilha de navegação em vez de empilhar histórico, para que o botão Voltar retorne direto à lista de notas. Veja os [detalhes da versão](changelog/0.46.3.md).

## [0.46.2] — 2026-11-25

Corrigida a seleção de capas da galeria (gradientes) em modo estrito do React, adicionada a remoção completa da seção de propriedades YAML (inclusive ao excluir a última propriedade) e ampliado o gesto de baralho de notas no cabeçalho mobile para alternar pela lista quando houver menos de duas notas abertas. Veja os [detalhes da versão](changelog/0.46.2.md).

## [0.46.1] — 2026-11-25

Corrigida a captura de toque nos gestos do cabeçalho no Android (B8 e B9): adicionado `touch-action: none` e `setPointerCapture` para que arrastar o cabeçalho para baixo ou na horizontal não seja cancelado pelo WebView nem perdido ao sair da área do cabeçalho. Veja os [detalhes da versão](changelog/0.46.1.md).

## [0.46.0] — 2026-11-25

Novos gestos no cabeçalho do celular (Parte B: B8 e B9): puxar o cabeçalho para baixo abre Buscar e comandos, e deslizar o cabeçalho da nota na horizontal alterna entre notas abertas preservando cursor, rolagem e modo. Veja os [detalhes da versão](changelog/0.46.0.md).

## [0.45.1] — 2026-11-25

Corrigida a referência qualificada `android.os.Build` na ponte háptica nativa (`MainActivity.kt`) para compilação do APK Android. Veja os [detalhes da versão](changelog/0.45.1.md).

## [0.45.0] — 2026-11-25

Iniciada a Parte B no Android (Prioridade 6): transições suaves ao abrir notas (View Transitions API respeitando movimento reduzido, B1) e resposta háptica discreta no limite do gesto de exclusão e na conclusão de tarefas (B2). Veja os [detalhes da versão](changelog/0.45.0.md).

## [0.44.1] — 2026-11-25

Corrigido o seletor estrito de título `h1` no teste E2E de leitura mobile (`reading-interactions.spec.js`). Veja os [detalhes da versão](changelog/0.44.1.md).

## [0.44.0] — 2026-11-25

Adicionado suporte a prazos e datas em tarefas (`📅`, `⏳`, `🛫`) com chips relativos por situação nos modos Padrão e Leitura e filtro/ordenação por prazo na biblioteca de tarefas (ADR 0044). Veja os [detalhes da versão](changelog/0.44.0.md).

## [0.43.0] — 2026-11-25

Concluídas as pendências funcionais de leitura, modelos e variáveis: variáveis renderizadas no modo Leitura, criação de propriedades direto pelo seletor de variáveis, painel de propriedades, "Variável…" e "Usar como modelo" no celular, além de `createdAt` e a variável `{{created}}` (ADR 0043). Veja os [detalhes da versão](changelog/0.43.0.md).

## [0.42.4] — 2026-11-25

Corrigida a renderização de tabelas no celular: removida a faixa cinza no cabeçalho causada por conflito de variável CSS e ajustadas tabelas de 2–3 colunas para caberem na largura da tela sem cortar texto. Veja os [detalhes da versão](changelog/0.42.4.md).

## [0.42.3] — 2026-11-25

Ritmo vertical de tabelas, colunas empilhadas e tarefas no celular alinhado ao padrão proporcional do desktop. Veja os [detalhes da versão](changelog/0.42.3.md).

## [0.42.2] — 2026-11-25

Ajustes de layout e usabilidade no Android: espaçamento das tarefas, tabelas mais legíveis, remoção da folha de abas abertas (mantendo recentes no topo), ícone dinâmico no modo Quadro e novo ícone para Buscar e comandos. Veja os [detalhes da versão](changelog/0.42.2.md).

## [0.42.1] — 2026-11-25

Cabeçalho da nota no celular mais limpo e com espaço para o título, mantendo Buscar e comandos e o modo Quadro acessíveis no menu Ações da nota. Veja os [detalhes da versão](changelog/0.42.1.md).

## [0.42.0] — 2026-11-25

Notas fixadas no topo da lista no celular, datas de conclusão e cancelamento em etiquetas, melhorias em colunas, tabelas e rolagem do editor, e atualização imediata de imagens sincronizadas. Veja os [detalhes da versão](changelog/0.42.0.md).

## [0.41.0] — 2026-11-24

Paridade mobile concluída no navegador (A11–A19): tabelas com cartões e tela cheia, colunas responsivas, galeria de imagens com câmera e exclusão, histórico de versões, classes de janela e integração Android. Veja os [detalhes da versão](changelog/0.41.0.md).

## [0.40.0] — 2026-11-24

Grupos e ordenação na lista, folha Notas abertas, ações de documento (buscar e substituir, informações, recolher/expandir e mover seção) e interações de leitura no celular. Veja os [detalhes da versão](changelog/0.40.0.md).

## [0.39.0] — 2026-11-24

Folha Buscar e comandos no celular com busca por texto e contagem, prefixo `>` para ações da tela, `#` para títulos e atalhos `Ctrl+P` / `Ctrl+Shift+P`. Veja os [detalhes da versão](changelog/0.39.0.md).

## [0.38.0] — 2026-11-24

Modo Código no celular completo com acesso pela folha da nota e botões de Desfazer, Refazer e esconder teclado na barra de símbolos. Veja os [detalhes da versão](changelog/0.38.0.md).

## [0.37.1] — 2026-11-24

Sincronização entre desktop e celular coberta por testes ponta a ponta para edições, conflitos, lixeira, falhas de rede e imagens. Veja os [detalhes da versão](changelog/0.37.1.md).

## [0.37.0] — 2026-11-23

Menus de blocos agrupados, com títulos e alertas em uma linha, e o menu da alça do alerta completo. Veja os [detalhes da versão](changelog/0.37.0.md).

## [0.36.2] — 2026-11-23

Enter no fim de um bloco de código abre um parágrafo com o espaço padrão. Veja os [detalhes da versão](changelog/0.36.2.md).

## [0.36.1] — 2026-11-23

Ajuda com o modo Quadro e os status de tarefa, e tabelas mais leves durante a edição. Veja os [detalhes da versão](changelog/0.36.1.md).

## [0.36.0] — 2026-11-23

Ícone e capa pelo topo da nota, com galeria de capas, seletor de emoji e o menu Ações da nota. Veja os [detalhes da versão](changelog/0.36.0.md).

## [0.35.1] — 2026-11-23

Os Exemplos explicam a capa da nota e as notas de tarefas. Veja os [detalhes da versão](changelog/0.35.1.md).

## [0.35.0] — 2026-11-23

A capa da nota fica no topo, de ponta a ponta, e o resumo das notas de tarefas ficou mais organizado. Veja os [detalhes da versão](changelog/0.35.0.md).

## [0.34.2] — 2026-11-23

O título fica no mesmo lugar ao alternar entre Padrão e Leitura em notas com propriedades. Veja os [detalhes da versão](changelog/0.34.2.md).

## [0.34.1] — 2026-11-23

Setas de seção com o mesmo visual nos modos Padrão e Leitura. Veja os [detalhes da versão](changelog/0.34.1.md).

## [0.34.0] — 2026-11-23

Alertas em Markdown e capas opcionais para notas. Veja os [detalhes da versão](changelog/0.34.0.md).

## [0.33.2] — 2026-11-23

Controles de tabela e alças de bloco sem sobreposição. Veja os [detalhes da versão](changelog/0.33.2.md).

## [0.33.1] — 2026-11-23

Rolagem mais fluida em notas longas. Veja os [detalhes da versão](changelog/0.33.1.md).

## [0.33.0] — 2026-11-23

Blocos recolhíveis dentro da nota. Veja os [detalhes da versão](changelog/0.33.0.md).

## [0.32.1] — 2026-11-23

Registro de manutenção da documentação do projeto. Veja os [detalhes da versão](changelog/0.32.1.md).

## [0.32.0] — 2026-11-23

Documentação e exemplos na biblioteca. Veja os [detalhes da versão](changelog/0.32.0.md).

## [0.31.3] — 2026-11-23

Ctrl+D integrado à busca na nota. Veja os [detalhes da versão](changelog/0.31.3.md).

## [0.31.2] — 2026-11-23

Ícone próprio para Encontrar notas no menu das imagens. Veja os [detalhes da versão](changelog/0.31.2.md).

## [0.31.1] — 2026-11-23

Caixa de seleção disponível durante a edição da tarefa. Veja os [detalhes da versão](changelog/0.31.1.md).

## [0.31.0] — 2026-11-23

Datas de conclusão em formato brasileiro na edição visual e na leitura. Veja os [detalhes da versão](changelog/0.31.0.md).

## [0.30.3] — 2026-11-23

Dica para reordenar tarefas no editor. Veja os [detalhes da versão](changelog/0.30.3.md).

## [0.25.2] — 2026-11-18

Correções de rolagem, barra de seleção e datas de tarefas no celular; detalhes em [changelog/0.25.2.md](changelog/0.25.2.md).

## [0.25.1] — 2026-11-18

Padronização interna de formatação; detalhes em [changelog/0.25.1.md](changelog/0.25.1.md).

## [0.25.0] — 2026-11-17

Página de apresentação e sincronização; detalhes em [changelog/0.25.0.md](changelog/0.25.0.md).

## [0.24.0] — 2026-11-17

Melhorias no editor e nas variáveis; detalhes em [changelog/0.24.0.md](changelog/0.24.0.md).

## [Não lançado]

Nenhuma mudança pendente.

## [0.10.0] — 2026-11-12

Registro completo em `changelog/0.10.0.md`.

## [0.9.2] — 2026-11-12

Registro completo em `changelog/0.9.2.md`.

## [0.9.1] — 2026-11-11

Registro completo em `changelog/0.9.1.md`.

## [0.9.0] — 2026-11-11

Registro completo em `changelog/0.9.0.md`.

## [0.8.5] — 2026-11-11

Registro completo em `changelog/0.8.5.md`.

## [0.8.4] — 2026-11-10

Registro completo em `changelog/0.8.4.md`.

## [0.8.3] — 2026-11-09

Registro completo em `changelog/0.8.3.md`.

## [0.8.2] — 2026-11-09

Registro completo em `changelog/0.8.2.md`.

## [0.8.1] — 2026-11-09

Registro completo em `changelog/0.8.1.md`.

## [0.8.0] — 2026-11-09

Registro completo em `changelog/0.8.0.md`.

## [0.7.0] — 2026-11-09

Registro completo em `changelog/0.7.0.md`.

## [0.6.2] — 2026-11-09

Registro completo em `changelog/0.6.2.md`.

## [0.6.1] — 2026-11-09

Registro completo em `changelog/0.6.1.md`.

## [0.6.0] — 2026-11-09

Registro completo em `changelog/0.6.0.md`.

## [0.5.7] — 2026-11-07

Registro completo em `changelog/0.5.7.md`.

## [0.5.6] — 2026-11-07

Registro completo em `changelog/0.5.6.md`.

## [0.5.5] — 2026-11-06

Registro completo em `changelog/0.5.5.md`.

## [0.5.4] — 2026-11-06

Registro completo em `changelog/0.5.4.md`.

## [0.5.3] — 2026-11-06

Registro completo em `changelog/0.5.3.md`.

## [0.5.2] — 2026-11-06

Registro completo em `changelog/0.5.2.md`.

## [0.5.1] — 2026-11-06

Registro completo em `changelog/0.5.1.md`.

## [0.5.0] — 2026-11-06

Registro completo em `changelog/0.5.0.md`.

## [0.4.0] — 2026-11-06

Registro completo em `changelog/0.4.0.md`.

## [0.3.0] — 2026-11-03

Registro completo em `changelog/0.3.0.md`.

## [0.2.5] — 2026-11-03

Registro completo em `changelog/0.2.5.md`.

## [0.2.4] — 2026-11-03

Registro completo em `changelog/0.2.4.md`.

## [0.2.3] — 2026-11-03

Registro completo em `changelog/0.2.3.md`.

## [0.2.2] — 2026-10-28

Registro completo em `changelog/0.2.2.md`.

## [0.2.1] — 2026-10-28

Registro completo em `changelog/0.2.1.md`.

## [0.2.0] — 2026-10-28

Registro completo em `changelog/0.2.0.md`.

## [0.1.0]

Registro completo em `changelog/0.1.0.md`.
