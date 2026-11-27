# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [0.69.3] — 2026-11-27

Unificados lado a lado os comparativos de antes e depois nas novidades das versões `0.66.0` e `0.67.0` e adicionadas capturas faltantes nas entradas visuais (`0.65.2` e `0.61.1`). Veja os [detalhes da versão](changelog/0.69.3.md).

## [0.69.2] — 2026-11-27

Corrigida a exibição de imagens com número de versão no nome na página **Novidades** (como nas versões `0.66.0` e `0.67.0`) e adicionadas capturas lado a lado de antes e depois nos detalhes das versões `0.68.0` e `0.69.0`. Veja os [detalhes da versão](changelog/0.69.2.md).

## [0.69.1] — 2026-11-27

O aplicativo desktop agora verifica novas versões automaticamente a cada 30 minutos (e ao retornar à janela após esse intervalo), sem precisar reiniciar o app. Veja os [detalhes da versão](changelog/0.69.1.md).

## [0.69.0] — 2026-11-27

Imagens citadas no meio ou no final de uma linha de texto ou tarefa agora aparecem como **miniaturas inline (thumbs)** clicáveis com visualização ampliada, sem ocupar um bloco inteiro. Veja os [detalhes da versão](changelog/0.69.0.md).

## [0.68.0] — 2026-11-27

Adicionados **espaços compartilhados entre contas** com criptografia de ponta a ponta (ECDH P-256), níveis de acesso (Dono, Editor e Leitor), convites por e-mail, remoção de membros com rotação de chave e gerenciamento nas Configurações do desktop e do celular. Veja os [detalhes da versão](changelog/0.68.0.md).

## [0.67.0] — 2026-11-27

Revisão de conflitos de sincronização movida para exibição inline diretamente na nota e redesenho da seção **Conta e sincronização** nas Configurações (desktop e celular). Veja os [detalhes da versão](changelog/0.67.0.md).

## [0.66.0] — 2026-11-27

Adicionada a revisão de conflitos de sincronização por diferenças (estilo VS Code), atalho `F1` para abrir a seção **Sobre**, melhoria na priorização da pesquisa de notas e correções no alinhamento e no ícone de tarefas vazias. Veja os [detalhes da versão](changelog/0.66.0.md).

## [0.65.2] — 2026-11-26

Redesenho do menu principal no celular seguindo o visual de cards das Configurações e correção da sobreposição entre as opções de modelo e a barra de ações com o teclado aberto. Veja os [detalhes da versão](changelog/0.65.2.md).

## [0.65.1] — 2026-11-26

Registrado no roteiro o plano de espaços compartilhados entre contas; o recurso ainda não está disponível. Veja os [detalhes da versão](changelog/0.65.1.md).

## [0.65.0] — 2026-11-26

Adicionado no celular o modo **Reordenar blocos**, para mudar a ordem de parágrafos, títulos e tarefas arrastando ou usando setas. Veja os [detalhes da versão](changelog/0.65.0.md).

## [0.64.1] — 2026-11-26

Alterado o menu de ações da nota no celular: atalhos rápidos no topo e as demais opções em grupos (Exibição, Organizar, Ferramentas, Enviar e exportar). Veja os [detalhes da versão](changelog/0.64.1.md).

## [0.64.0] — 2026-11-26

Alterado o topo da aba Tarefas: os filtros foram para um botão ao lado da busca, como na aba Notas, e a lista de tarefas mostra a barra de progresso de cada nota e de cada título, no desktop e no celular. Veja os [detalhes da versão](changelog/0.64.0.md).

## [0.63.2] — 2026-11-26

Corrigida a ordem das notas abertas no topo da biblioteca: agora elas seguem a ordem das abas, inclusive as fixadas. Veja os [detalhes da versão](changelog/0.63.2.md).

## [0.63.1] — 2026-11-26

Ajustado o build Android para gerar por padrão um APK release compacto (com minificação e remoção de recursos não usados) e copiá-lo automaticamente para `~/Downloads`, conforme regra registrada no `AGENTS.md`. Veja os [detalhes da versão](changelog/0.63.1.md).

## [0.63.0] — 2026-11-26

Adicionado pareamento de conta de sincronização por QR Code nos dois sentidos — Desktop → Celular e Celular → Desktop estilo WhatsApp Web com criptografia ECDH ponta a ponta ([ADR 0053](docs/adr/0053-pareamento-conta-por-qr.md)) — e reorganizada a tela de Configurações no celular em submenus com resumo de estado. Veja os [detalhes da versão](changelog/0.63.0.md).

## [0.62.4] — 2026-11-26

Igualado o espaçamento interno de blocos de código dentro de colunas ao bloco normal e movida a alça de blocos internos de colunas para cima do bloco, exibindo o ícone do tipo junto da alça de arraste. Veja os [detalhes da versão](changelog/0.62.4.md).

## [0.62.3] — 2026-11-26

Ajustado o alinhamento superior exato (`top: 0`) da alça lateral esquerda em blocos de colunas e tabelas para ficar rente à borda superior como nos blocos sem colunas. Veja os [detalhes da versão](changelog/0.62.3.md).

## [0.62.2] — 2026-11-26

Alinhada ao topo a alça lateral esquerda de tabelas e blocos de colunas (seguindo o padrão dos demais blocos) e corrigida a exibição da alça lateral ao passar o mouse sobre a área da coluna. Veja os [detalhes da versão](changelog/0.62.2.md).

## [0.62.1] — 2026-11-26

Corrigido o posicionamento dos botões de blocos de código dentro de múltiplas colunas no editor visual: cada coluna agora exibe seus próprios controles de forma compacta sem duplicar nem sobrepor botões na coluna vizinha. Veja os [detalhes da versão](changelog/0.62.1.md).

## [0.62.0] — 2026-11-26

Adicionada a interface completa de transferência por QR Code (geração no desktop/celular e leitura por câmera nativa no Android), integrados OCR local real (ML Kit Text Recognition) e IA no aparelho (ML Kit GenAI) no Android, e ocultada a largura do campo de texto em celulares compactos (exibindo 2 opções apenas em tablets ≥ 600 dp). Veja os [detalhes da versão](changelog/0.62.0.md).

## [0.61.1] — 2026-11-26

Corrigido o estilo mobile do card **Histórico de versões** em Configurações e alinhados o seletor de IA no aparelho e as folhas de sugestão (IA e OCR) ao padrão visual do app, além de registrar regras de consistência visual no `AGENTS.md`. Veja os [detalhes da versão](changelog/0.61.1.md).

## [0.61.0] — 2026-11-26

Adicionados o ciclo seguro de propostas de seleção para IA local no desktop (C3) e o agregador de progresso do Hub de projetos (C5). Veja os [detalhes da versão](changelog/0.61.0.md).

## [0.60.0] — 2026-11-26

Adicionada a camada de provedores alternativos de sincronização e backup remoto (C2, [ADR 0052](docs/adr/0052-provedores-alternativos-sync-backup.md)), suportando servidor próprio, repositório GitHub e pasta local/rede com validação estrita. Veja os [detalhes da versão](changelog/0.60.0.md).

## [0.59.0] — 2026-11-26

Adicionado suporte portável em Markdown a recorrência (`🔁`), histórico de conclusões (`✅`) e lembretes locais (`⏰`) em tarefas (C4, [ADR 0051](docs/adr/0051-recorrencia-e-lembretes-em-tarefas.md)). Veja os [detalhes da versão](changelog/0.59.0.md).

## [0.58.0] — 2026-11-26

Adicionada a compactação configurável de imagens em WebP (C6, [ADR 0050](docs/adr/0050-compactacao-imagens-webp.md)) com perfis Original, Equilibrada e Pequena, preservação de GIF/SVG e remoção de EXIF. Veja os [detalhes da versão](changelog/0.58.0.md).

## [0.57.0] — 2026-11-26

Adicionada a base da ponte por QR sem conta (C1, [ADR 0049](docs/adr/0049-ponte-por-qr-sem-conta.md)): codificação e decodificação offline de notas curtas em `slothnote:qr:v1:` com compressão, limite de tamanho e aviso para imagens. Veja os [detalhes da versão](changelog/0.57.0.md).

## [0.56.0] — 2026-11-26

Adicionado suporte à captura de texto por câmera com OCR local no Android (B17, [ADR 0048](docs/adr/0048-captura-camera-ocr-local.md)), convertendo o texto reconhecido em Markdown (texto, lista ou tabela) como sugestão editável antes de inserir na nota. Veja os [detalhes da versão](changelog/0.56.0.md).

## [0.55.0] — 2026-11-26

Adicionado suporte opcional à IA no aparelho no Android (B7, [ADR 0047](docs/adr/0047-ia-no-aparelho-mobile.md)): desligada por padrão, oculta quando não há modelo local disponível, com ações de resumir e revisar exibidas como sugestão editável antes de alterar a nota. Veja os [detalhes da versão](changelog/0.55.0.md).

## [0.54.0] — 2026-11-26

Adicionado suporte à escrita à mão com caneta convertida em texto no editor mobile e na nota rápida (B6), habilitando o reconhecimento nativo do Android 14+ e evitando que traços de caneta acionem gestos de deslizar. Veja os [detalhes da versão](changelog/0.54.0.md).

## [0.53.0] — 2026-11-26

Adicionado o widget **Tarefas fixadas** para a tela inicial do Android (B5, [ADR 0046](docs/adr/0046-widget-de-lista-fixada.md)), exibindo as tarefas de uma nota fixada e permitindo marcá-las ou desmarcá-las sem abrir o aplicativo. Veja os [detalhes da versão](changelog/0.53.0.md).

## [0.52.0] — 2026-11-26

Ajustado o bloco "Nova nota" das Configurações rápidas no Android para abrir a tela protegida de nota rápida (`QuickNoteActivity`) quando o aparelho estiver bloqueado. Veja os [detalhes da versão](changelog/0.52.0.md).

## [0.51.0] — 2026-11-26

Adicionado suporte ao papel de app de notas do sistema no Android 14+ (B4, `ROLE_NOTES`), com solicitação em Configurações → Sistema e tela isolada na tela de bloqueio para criar e salvar notas novas sem exibir suas notas existentes ([ADR 0045](docs/adr/0045-app-de-notas-do-sistema-role-notes.md)). Veja os [detalhes da versão](changelog/0.51.0.md).

## [0.50.0] — 2026-11-25

Adicionados gestos no modo Quadro compacto do celular (B15): deslizar um cartão move a tarefa para a coluna seguinte ou anterior com vibração curta usando o mesmo Markdown do menu, e deslizar a área da coluna navega entre as colunas como carrossel. Veja os [detalhes da versão](changelog/0.50.0.md).

## [0.49.1] — 2026-11-25

Corrigida a referência de rótulo `@string/shortcut_new_note` no `NewNoteTileService` do `AndroidManifest.xml`. Veja os [detalhes da versão](changelog/0.49.1.md).

## [0.49.0] — 2026-11-25

Adicionados a lupa de tabela por toque longo (B13), o trackpad estrutural na barra de formatação (B14) e o bloco "Nova nota" nas Configurações rápidas do Android (B3, `TileService`). Veja os [detalhes da versão](changelog/0.49.0.md).

## [0.48.0] — 2026-11-25

Adicionados a régua de títulos na leitura mobile (B11, com feedback háptico por seção) e o zoom semântico por pinça ou botão (B12: Completo → Esboço → Só títulos, preservando o zoom de acessibilidade). Veja os [detalhes da versão](changelog/0.48.0.md).

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
