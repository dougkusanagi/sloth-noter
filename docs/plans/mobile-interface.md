# Plano: interface Android

## Objetivo

Implementar o escopo do [plano mobile v2](../plano-mobile-v2.md), com navegação por toque e
persistência compartilhada com o desktop. Este arquivo é a única fonte de andamento e próxima
etapa; o v2 descreve os requisitos, e o v1 preserva o diagnóstico histórico.

Cada incremento termina com commit Conventional Commits e testes afetados locais passando.
Antes de fechar uma etapa e fazer push, executar toda a suíte local (unitários JS, Rust e E2E
desktop/mobile), atualizar este plano e conferir as evidências exigidas. Não enviar trabalho parcial
nem iniciar o incremento seguinte no mesmo pedido. Alteração perceptível no app inclui fragmento
de changelog no mesmo commit; documentação interna não gera novidade no aplicativo.

## Passos

### Base implementada

Os itens marcados registram código e cobertura de navegador. Não significam aprovação no Android.

- [x] Extrair hooks de estado, ações desktop e preferências; criar casca e projeto E2E mobile.
- [x] Publicar insets pelo Kotlin e boot JS; adicionar fallback de viewport. Validação nativa em 2.4/4.1.
- [x] Entregar fixture, testes automatizados e relatório parcial IME (ADR 0003).
- [x] Criar núcleo e adaptador de navegação com telas, camadas e restauração na mesma sessão.
- [x] Integrar persistência, carregamento, bloqueio por falha de leitura e nova tentativa.
- [x] Integrar lista, busca por título/conteúdo, buscas recentes, fixadas e recentes por abertura.
- [x] Criar/abrir notas, retornar com busca/rolagem, salvar texto e restaurar após recarga.
- [x] Integrar botões de fixar/lixeira com desfazer e tema visível no cabeçalho.
- [x] Integrar leitura, edição visual inicial, Tarefas, imagens referenciadas e Novidades.
- [x] Reconciliar planos, tarefas e limites dos ADRs antes de retomar implementação (2026-10-23).

### Fase 2 — concluir interações da lista e navegação

Executar 2.1 → 2.2 → 2.3 → 2.4. Essa sequência vem antes da fase 3.

- [x] **2.1 — Toque longo e renomear.** Reutilizar a folha existente e manter seu botão visível.
      Acrescentar renomeação por formulário curto com validação, preservação dos dados e referências wiki.
      Cancelar toque longo ao rolar; não abrir a nota depois de acionar a folha. Conferir nomes longos,
      duplicados, teclado e retorno de foco. Corrigir alvos de toque do cabeçalho e dos controles da lista
      afetados para 48 × 48 dp, preservando tema visível e acesso ao título em 320 dp/fonte ampliada.
      Pronto: E2E dos caminhos por botão/toque longo, renomeação/cancelamento/erro, referências, foco e
      inspeção mobile/desktop. Fora do incremento: deslizar e compartilhar.
- [x] **2.2 — Deslizar para lixeira.** Depende de 2.1. Cancelar com rolagem vertical ou gesto pela borda,
      impedir acionamentos duplicados e preservar desfazer e contexto. Pronto: regressões de gesto,
      cancelamento, exclusão e desfazer; verificar nota aberta e busca ativa.
- [x] **2.3 — Compartilhar texto.** Depende de 2.1/2.2. Implementar adaptador Android e ação na folha
      da lista; prévia web oferece alternativa explícita de copiar quando indisponível. Testar sucesso,
      cancelamento, falha e envio único; validar no APK. Não inclui arquivo `.md`, exportação ou recebimento.
- [ ] **2.4 — Retorno e recuperação nativos.** Integrar e verificar a prioridade camada → teclado →
      tela → saída, incluindo raiz com gravação pendente/falha. Distinguir recarga, recriação de WebView
      e reinício de processo. Definir persistência durável de metadados de rota e migração se necessária
      para cumprir a restauração após reinício; não salvar texto na navegação. Verificar insets iniciais,
      laterais e finais e coletar os casos pendentes do ADR 0003 que puderem ser exercitados. Pronto:
      fluxos no APK com evidências, referências inválidas tratadas e regressões automatizadas. Casos
      dependentes de aparelho ausente continuam explicitamente pendentes; não marcar aprovação nativa.

### Fase 3 — completar leitura

- [x] **3.1 — Folha de ações da nota.** Depende da fase 2. Reutilizar ações de 2.1–2.3 no cabeçalho
      da nota, com foco, retorno e tratamento da nota removida. Não exibir ações futuras como disponíveis.
- [ ] **3.2 — Interações de leitura.** Busca na nota, links internos/externos e destinos de títulos,
      recolher/expandir seções, copiar código por toque. Delimitar tamanho de texto e foco com as
      preferências existentes. Pronto: caminhos de retorno, contexto e ações sem abrir teclado de edição.
- [ ] **3.3 — Tabela com rolagem local.** Primeira coluna fixa, cabeçalho, contagem e células longas,
      sem overflow na página. Definir referência ao bloco e validade após editar; testar tabelas iguais.
- [ ] **3.4 — Cartões.** Depende de 3.3 e da confirmação do padrão para mais de três colunas.
      Alternador acessível e preferência por tabela sem escrever IDs no Markdown. Referência ambígua
      deve descartar a preferência com segurança. Não implementar recomendação como decisão tomada.
- [ ] **3.5 — Tabela em tela cheia.** Depende de 3.3/3.4. Rota identifica nota e bloco; retorno conserva
      posição. Testar paisagem, zoom, edição anterior ao bloco e tabela removida.
- [x] **3.6 — Localizar tarefa e desfazer conclusão.** Abrir a nota no trecho correto, com realce
      temporário e alternativa segura se o texto mudou. Não introduzir recorrência nem histórico de
      conclusão. Pronto: tarefas iguais, listas aninhadas, conclusão/desfazer e ausência de teclado.

### Fase 4 — edição e teclado

- [ ] **4.1 — Ciclo de vida, IME e gravação.** Depende de 2.4 e da leitura integrada. Enviar notas e
      histórico em `hidden` e `pagehide`; mensagens e recuperação independentes para suas falhas.
      Verificar confirmação nativa, composição ao sair, interrupção durante escrita, cursor, scrollMargins,
      `opening/closing/open/closed`, teclado flutuante e ausência de dupla redução da viewport.
      Preservar a instância do editor durante composição e mudanças de insets/preferências (ADR 0003).
- [ ] **4.2 — Modo Código.** Comparar `textarea` desktop com CodeMirror sem decorações e registrar a
      escolha antes de implementar. Preservar texto, seleção, histórico e desfazer/refazer; definir
      preferência por nota sem restaurar teclado automaticamente. Não alterar o editor desktop.
- [ ] **4.3 — Inserir e barra contextual.** Depende de 4.1/4.2. Até cinco ações no grupo, reduzidas
      conforme largura; folha explícita para excedentes, Refazer e símbolos. Testar alvos de 48 dp,
      fonte 2×, 320 dp, teclado físico e composição. Sem dependência exclusiva de toque longo.
- [ ] **4.4 — Tabela por célula.** Depende de 3.3–3.5 e 4.3. Inserir grade, navegar entre células,
      editar, adicionar/remover linha/coluna e alinhar, preservando o Markdown e o histórico.
- [ ] **4.5 — Câmera e inserção de imagens.** Depende de 4.1/4.3. Usar persistência de imagens existente;
      testar permissão/cancelamento/falha, rotação e nota de destino. Não perder o texto ao voltar da câmera.

### Fase 5 — telas secundárias e arquivos

- [ ] **5.1 — Compartilhar `.md` e exportar.** (parcial: compartilhar feito; exportar pendente) Depende do adaptador de 2.3. Definir nome, UTF-8,
      MIME, arquivo temporário, acesso restrito e expiração de permissões. Exportação usa seletor do
      sistema. Explicar o tratamento de imagens; testar cancelamento/falha sem perder dados.
- [ ] **5.2 — Importar e backup.** Contrato pelo seletor do sistema, validação de formato, duplicidades,
      imagens, falta de espaço e restauração sem sobrescrita silenciosa. Backup não inclui diários de
      versões conforme o contrato atual. Pronto: ida e volta de notas/imagens no APK, incluindo falhas.
- [ ] **5.3 — Histórico de versões.** Depende de 4.1. Ativação explícita neste dispositivo, retenção,
      limpeza, estados de erro e restauração registrada, conforme ADR 0002. Sem sincronização de diários.
- [ ] **5.4 — Galeria completa.** Depende de 4.5 e 5.1. Imagens soltas e referenciadas, detalhe,
      nota de origem, compartilhamento e exclusão com tratamento de referências.
- [x] **5.5 — Lixeira e Configurações.** Restauração/exclusão definitiva, preferências existentes e
      acesso a Novidades; manter a rota de Configurações distinta da tela de Novidades atual. Executar
      em dois incrementos: 5.5a para lixeira e 5.5b para configurações, cada um com testes e commit próprios.

### Fases 6–7 — validação final e integração Android

- [ ] **6.1 — Barras do sistema.** (parcial: ícones feitos) Integrar tema efetivo aos ícones nativos e ao fundo das barras;
      testar Claro/Escuro/Sistema e folhas abertas no APK.
- [ ] **6.2 — Arrastar folhas.** (parcial: ver estado) Acrescentar gesto de fechar sem conflito com rolagem, teclado ou
      gesto do sistema. Preservar botão de fechar, retorno de foco e navegação acessível.
- [ ] **6.3 — Acessibilidade nativa.** TalkBack, foco, alvos e escala 1,3×/2× nos fluxos completos.
      Acessibilidade básica das telas alteradas é verificada em cada incremento; não fica adiada até aqui.
- [ ] **6.4 — Matriz de compatibilidade.** Rotação, janela dividida, teclado físico, desempenho em
      aparelho modesto e casos pendentes do ADR 0003 com animações ativadas. Registrar resultados e
      limitações por ambiente; não marcar a matriz completa enquanto faltarem evidências.
- [ ] **7.1 — Receber texto compartilhado.** (parcial: ver estado) Criar nota apenas após validar o conteúdo; tratar app
      aberto/fechado, repetição do intent, cancelamento e gravação. Independente do compartilhamento de saída.
- [ ] **7.2 — “Abrir com” arquivos.** Fechar cópia interna versus edição do original antes de
      implementar. Definir URIs/permissões, tipos aceitos, conflitos e reabertura; não extrapolar ADR 0001.
- [ ] **7.3 — Atalho Android “Nova nota”.** (parcial: ver estado) Validar app aberto/fechado, teclado e nota única por ação.

## Estado da implementação

A seleção da casca é por plataforma; uma janela desktop estreita continua desktop. Em desenvolvimento,
`/?platform=mobile` permite a prévia no navegador. Não presumir que o build já elimina todo o código da
outra casca: conferir o bundle antes de registrar esse resultado.

`MobileShell` usa `useNotesStore` e a persistência existente. As ações desktop ainda dependem de sua
interface; mobile compartilha regras de títulos, nomes e referências wiki por `note-actions.js`, não
um registro único de ações. `useNavigation` conecta `nav-stack.js` ao histórico e a `sessionStorage`.
Notas existentes e rotas restauradas abrem em leitura; criação entra em edição visual. Não há modo
Código mobile. Restaurar após recarga não comprova sobrevivência à morte do processo Android.

A galeria mostra imagens referenciadas nas notas; não oferece ainda imagens soltas, captura,
compartilhamento ou exclusão. Tarefas abre a nota sem localizar o trecho e não oferece desfazer da
conclusão. A rota chamada `settings` atualmente exibe apenas Novidades. Não há datas de modificação
no modelo; datas relativas na lista dependem de trabalho posterior explicitamente planejado.

O tema é visível no cabeçalho e acompanha Sistema; ícones das barras nativas e alguns alvos de
40/44 px ainda não cumprem o requisito final. Kotlin publica insets, e CSS aplica o padding com
`max(barras, IME)`; não há padding nativo nem `--app-height`. Medição do APK pode exigir correção,
sem presumir o comportamento da viewport a partir dos testes que apenas injetam insets.

## Verificação e evidências

Na revisão documental de 2026-10-23 passaram localmente: 300 testes JavaScript (`bun run test`),
39 testes Rust (`bun run desktop:test`) e 307 E2E (`bun run e2e`, incluindo 26 mobile).
Esses resultados não aprovam a matriz nativa nem corrigem as pendências de implementação acima.

Na etapa 2.1 (2026-10-23) passaram localmente: 301 testes JavaScript (`bun run test`),
39 testes Rust (`bun run desktop:test`) e 310 E2E (`bun run e2e`, incluindo 29 mobile).
Também passaram lint, build e verificação de formatação dos arquivos alterados. Capturas reais
conferidas em 320 px, com fonte 2×, e em desktop: formulário de renomeação, alvos de 48 px,
nomes longos, foco e Novidades com imagem local carregada. A renomeação valida nomes vazios,
inválidos e repetidos e atualiza referências wiki nas notas e na lixeira. O toque longo cancela
com movimento/rolagem e não abre a nota ao soltar. A verificação usa navegador; teclado Android
real e ciclo nativo continuam previstos em 2.4/4.1, sem aprovação nativa nesta entrega.

Na etapa 2.2 (2026-10-23) passaram localmente: 301 testes JavaScript (`bun run test`),
39 testes Rust (`bun run desktop:test`) e 315 E2E (`bun run e2e --workers=1`, incluindo 34 mobile),
além de lint, build e formatação dos arquivos alterados. A rodada final gerenciou seu próprio
servidor pelo Playwright e passou sem falhas. Rodadas anteriores tiveram falhas desktop de foco
em paralelo e uma queda do servidor reutilizado; não foram usadas como aprovação da suíte.
Eventos reais de toque cobrem exclusão de nota aberta/fixada com busca ativa, desfazer com
fixação, manutenção da rolagem, arrastes curtos/verticais/reversos/pelas bordas, cancelamento,
mudança para vertical e soltura duplicada. Capturas em 320 px e desktop foram conferidas,
assim como a entrada de Novidades e sua imagem local. Gesto do sistema no aparelho Android
continua na validação nativa de 2.4; esta etapa qualifica a interface no navegador.

Em cada entrega, registrar testes executados e limitações reais. Vincular os problemas #1–24 do v2 a
testes/checklists com ambiente e resultado; screenshots devem ser inspecionadas. Usar notas longas,
palavras sem espaços, tabelas válidas de 12 colunas e tabelas iguais, 300 notas e imagens locais com
proporções variadas quando a tela as exibir. Falhas e dados inválidos ficam em testes específicos.

## Tentativas que falharam

- Em 2.2, capturar explicitamente o ponteiro de toque na linha interferia na captura implícita
  do botão. O componente mantém a captura nativa de toque. Reconhecer o arraste apenas pelos
  eventos de ponteiro também permitia ao Chromium suprimir o clique seguinte no Desfazer;
  bloquear o `touchmove` somente após reconhecer movimento horizontal resolveu o caso,
  preservando a rolagem vertical. A regressão usa eventos reais de toque.

- A prévia colaborativa falhou duas vezes com `Preview automation snapshot timed out after 15000ms.`
  A inspeção visual da integração inicial usou o Playwright existente; não é uma limitação permanente.
- Sincronizar texto por efeito passivo podia reaplicar texto atrasado durante digitação rápida em
  EditContext. A integração usa efeito de layout, com cobertura E2E de gravação/recarga.
- Enter do CodeMirror em perfil Android é assíncrono. O teste espera a quebra de linha antes de
  digitar, sem pausa fixa.

## Dúvidas abertas

- Confirmar cartões como padrão para tabelas com mais de três colunas antes de 3.4.
- Definir referência de bloco de tabela e validade após edição em 3.3, antes de preferência/tela cheia.
- Escolher editor Código em 4.2; o desktop atual usa `textarea`.
- Fechar cópia interna versus edição do original em 7.2. Recomendação: cópia interna. Qualquer
  proposta difícil de reverter deve passar por ADR aprovado, preservando os ADRs 0001 e 0002 aceitos.
- Compatibilidade nativa ainda pendente conforme ADR 0003: SwiftKey, Gboard em português, IMEs reais,
  aparelho físico, versões de WebView e animações. O relatório/fixture está entregue; a matriz não.

Histórico de conclusão de tarefas é recurso futuro diferente do histórico local de versões. O segundo
continua local e fora do backup/sincronização. Não criar novo ADR para cada ajuste reversível de UI;
decisões locais ficam neste plano e, ao concluir, seus fatos duráveis vão para a documentação apropriada.

## Próximo passo

2.3 foi implementada em 2026-11-02 (versão 0.3.0): ponte Kotlin `SlothShare` (ACTION_SEND), adaptador
`src/mobile/share.js`, ação na folha com alternativa de copiar. Evidências: testes JS do adaptador; 3 E2E
mobile (envio único, cancelamento, falha, cópia); E2E completa com 359 passando e 3 falhas em áreas desktop
(`tab-position` ×2, `wiki-images-menu` ×1), não comparadas com o HEAD; `update-appimage.test.js` já
falhava (3 falhas). No emulador Android 36 x86_64 (APK debug arm64, SDK 36, NDK 27, JDK 21) a folha
abriu com o texto da nota e o botão Voltar do sistema retornou à folha sem erro.
**Não verificado:** aparelho físico; envio concluído a um app de destino; caminho de falha da ponte.
O Android não informa o cancelamento da lista do sistema.

**Adiantado em 2026-11-02 (mesma sessão, a pedido do usuário):**
- 3.1 concluída: botão de ações no cabeçalho da nota; ao mover para a lixeira o app volta à lista (E2E).
- 5.5 concluída no navegador: Lixeira (Restaurar, Excluir definitivamente com confirmação) e Configurações (tamanho do texto, Restaurar, Novidades), com E2E.
- Seletor de tema movido para o menu principal; menu à esquerda do título, em uma linha (E2E).
- 2.4 parcial, verificado no emulador: Voltar fecha a folha e, na raiz, sai do app; a rota passou de
  sessionStorage para localStorage (só metadados, sem texto) e a tela Lixeira voltou após `force-stop`.
  Pendentes em 2.4: gravação pendente/falha na raiz, insets laterais/finais, casos do ADR 0003 e
  distinção entre recarga e recriação da WebView. 2.4 não está concluída.

- 3.2 quase pronta: **Buscar na nota** e recolher/expandir seções (E2E). Copiar código, links wiki e links externos já existiam no Markdown compartilhado; links externos e destinos de títulos não foram verificados no APK, então a 3.2 não está marcada como concluída.

- 3.3 parcial: rolagem local, primeira coluna fixa, contagem de linhas no rótulo e foco por teclado (E2E, tabela de 12 colunas). Faltam cabeçalho fixo na rolagem vertical, referência ao bloco e tabelas iguais; 3.3 não está concluída.
- 3.6 concluída no navegador: abrir a tarefa no trecho com realce, aviso se a nota mudou, Desfazer na conclusão, tarefas iguais e aninhadas (E2E). Sem verificação em aparelho físico.
- 6.2 implementada no navegador: arrastar o topo da folha para baixo (mais de 80 px) fecha; botão Fechar e Voltar continuam (E2E com eventos simulados; arraste real por `adb input swipe` fechou a folha no emulador; falta conferir conflito com teclado, rolagem interna e gesto do sistema).
- 6.1 parcial (só ícones; falta fundo das barras e matriz Claro/Escuro/Sistema com folhas): ponte `SlothSystem.setDarkBars` ajusta os ícones das barras ao tema do app (E2E com ponte simulada; conferência visual no emulador abaixo).

- Evidência de rotação (2026-11-02, emulador Android 36, paisagem 2400×1080): lista, cabeçalho e barra inferior respeitaram o recuo lateral e o app manteve a tela e o tema sem recriar. Não cobre aparelho físico, janela dividida nem teclado em paisagem.

- 7.3 parcial: atalho estático (`shortcuts.xml`, ação `dev.slothnote.app.NEW_NOTE`) e ponte `SlothSystem.takeAction` entregam a ação uma vez. No emulador, `am start -a` com o app fechado e aberto criou uma nota cada; girar a tela não criou outra. Não verificado: toque longo real no ícone do launcher, teclado aberto no retorno e aparelho físico. E2E usa a ponte simulada.

- 7.1 parcial: filtro `SEND text/plain`, ponte `takeSharedText` (entrega única), validação (vazio ignorado, limite de 1.000.000 caracteres) e nota "Texto compartilhado" em leitura. Emulador: `am start -a SEND` com app fechado e aberto criou uma nota por envio; girar a tela não duplicou. E2E com ponte simulada. Não verificado: compartilhamento vindo de um app real, textos muito grandes no aparelho, falha de gravação logo após o recebimento e aparelho físico.

- 5.1 parcial: **Compartilhar como arquivo .md** (`SlothShare.shareFile`: UTF-8, MIME `text/markdown`, FileProvider com leitura temporária, um arquivo por vez em `cache/shared`, apagado a cada envio e na abertura). Emulador: a lista do sistema mostrou "Sharing 1 file" com o nome correto e o arquivo existia no cache. Pendente: exportar pelo seletor do sistema, explicar o tratamento de imagens na interface, cancelamento/falha em aparelho real e conferir o conteúdo recebido por um app de destino.

**Próxima etapa: concluir 2.4**, depois 3.2 (interações de leitura).
