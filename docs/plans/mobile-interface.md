# Plano: interface Android

Tipo: tarefa

## Objetivo

Ordem fixa:

1. **Usabilidade básica no Android** (A1–A4).
2. **Sincronização** desktop ↔ celular por servidor próprio no Cloudflare (S1–S4), para começar a
   testar com dados reais ([ADR 0009](../adr/0009-sincronizacao-por-servidor-proprio.md)).
3. **Restante da paridade** com o desktop (A5–A19).
4. **Ideias novas só do mobile** (Parte B).
5. **Ideias novas para as duas plataformas** (Parte C).

O **que** fazer está em [requisitos mobile](../plano-mobile.md); este arquivo é a única
fonte de **ordem, estado e próximo passo**. Se os dois divergirem, os requisitos valem para o
escopo e este plano vale para o andamento; corrija a divergência no mesmo commit.

## Como trabalhar (para o agente)

1. Leia `AGENTS.md`, `MEMORY.md`, os [requisitos](../plano-mobile.md) e este plano.
2. Pegue a **primeira etapa não marcada** da fila cujas dependências estão feitas. Não pule etapas
   nem adiante itens de outra etapa, salvo pedido explícito do usuário. A fila abaixo já está na
   ordem do objetivo. Não comece a Parte B antes do critério da seção 4.3 dos requisitos, nem a
   Parte C antes de concluir a Parte B.
3. Faça uma etapa por pedido. Se a etapa for grande, divida em incrementos com commit próprio e
   registre a divisão aqui antes de começar.
4. Em cada commit, siga o `AGENTS.md`: incremente a versão (`package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/Cargo.lock`), adicione o changelog e consolide em `changelog/X.Y.Z.md` no mesmo
   commit, inclusive em commits só de documentação ou testes. Para mudança visual, inclua captura
   em `public/changelog/`.
5. Antes do commit, rode os testes afetados. Ao fechar a etapa, rode a suíte completa da seção 7
   dos requisitos e confira capturas em 320/390 dp e desktop.
6. Ao fechar a etapa: marque a caixa, atualize a linha da matriz de paridade (estado e teste que
   cobre), acrescente à lista "Validação no aparelho" o que ficou sem verificar e atualize o
   "Próximo passo".
7. **O aparelho não bloqueia a fila.** Uma etapa fica concluída com código e testes no navegador
   (e emulador, se houver). O que exige aparelho vai para a lista de validação. Não marque
   aprovação nativa sem evidência. Antes de dizer que não há aparelho, rode `adb devices`.
8. Decisão difícil de reverter: escreva ADR na mesma entrega. Ajustes reversíveis de UI ficam
   registrados neste plano.

## Estado atual (conferido no código em 2026-11-07)

- `src/mobile/mobile-shell.jsx` usa `useNotesStore`, `usePrefs` e a persistência existente.
  Regras de títulos, nomes e referências wiki são compartilhadas por `src/mobile/note-actions.js`;
  não há um registro único de ações entre as cascas.
- Navegação: `nav-stack.js` + `use-navigation.js`, com telas Notas, Tarefas, Imagens, Nota,
  Lixeira, Configurações (`prefs`) e Novidades (`settings`). Rota sem texto em `sessionStorage` e
  `localStorage`.
- Notas: busca por título e texto com trecho, buscas recentes, fixadas, recentes por abertura,
  toque longo, deslizar para lixeira com desfazer, renomear, compartilhar texto e `.md`.
- Nota: abre em Ler; Editar usa o `VisualEditor` compartilhado (a barra de seleção flutuante é
  ocultada pelo CSS mobile). Não há barra de formatação, modo Código nem busca em edição. Leitura
  tem buscar na nota e recolher seções. Quebra de linha global e por nota.
- Tarefas: `TasksLibrary` com localizar o trecho e desfazer a conclusão.
- Imagens: galeria das imagens referenciadas, com a nota de origem. Inserir imagem por arquivo no
  editor (`addMobileImages`).
- Configurações: tamanho do texto, backup (exportar e restaurar) e Novidades. Mais opções: tema,
  Lixeira, Configurações, quebrar linhas, Novidades. Não há Sobre nem idioma.
- Android: insets e estados do teclado publicados pelo Kotlin; ícones das barras pelo tema
  (`SlothSystem.setDarkBars`); atalho "Nova nota" e receber texto (`SlothSystem.takeAction`,
  `takeSharedText`); compartilhar por `SlothShare`. O `WryActivity` gerado mantém o callback de
  voltar sempre ativo.

## Concluído

Códigos antigos entre parênteses, para ligar com commits e changelogs.

- [x] Base: hooks extraídos, casca e projeto E2E mobile, insets, fixture IME (ADR 0003), núcleo de
      navegação, persistência, lista, busca, criação, leitura, edição visual inicial, Tarefas,
      imagens referenciadas, Novidades.
- [x] Toque longo e renomear, alvos de 48 dp (2.1).
- [x] Deslizar para lixeira com desfazer (2.2).
- [x] Compartilhar texto (2.3). Aparelho: abrir e cancelar o seletor verificados.
- [x] Folha de ações da nota (3.1).
- [x] Localizar tarefa e desfazer conclusão (3.6).
- [x] Lixeira e Configurações (5.5).

## Fila — 1. Usabilidade básica no Android

Os códigos `P#` são linhas da matriz de paridade (requisitos, seção 4). Usabilidade básica é
criar, achar, ler, editar com formatação e não perder dados.

- [ ] **A1 — Sobre, Configurações e Lixeira completas.** P10, P12, P14, P17.
      Faz: seção Sobre compartilhada com o desktop (requisitos 5.12), Idioma, Recriar página de
      ajuda e Esvaziar lixeira com confirmação. Reutiliza `i18n.js`, `welcome.js`, ações de
      lixeira de `notes.js`. Decidir a decisão em aberto 6 (modo ao abrir) com o usuário ou
      manter Ler.
      Pronto: versão exibida igual à de `package.json` no desktop, na web e no APK; idioma muda na
      hora sem chaves expostas; E2E das quatro ações; Novidades conferida.
- [ ] **A2 — Retorno, recuperação e voltar preditivo** (2.4, restante). Problemas 5, 7, 25.
      Faz: prioridade camada → teclado → tela → saída; aviso na raiz com gravação pendente ou
      falha; ponte que ativa o callback de voltar só quando há algo para desempilhar (requisitos
      3.4); distinguir recarga, recriação do WebView e reinício.
      Pronto: unitários e E2E com ponte simulada; casos de aparelho na lista de validação.
- [ ] **A3 — Ciclo de vida, IME e gravação** (4.1). P18, P19, P25; problemas 6, 12, 14, 17.
      Faz: envio em `hidden` e `pagehide`; mensagens e recuperação separadas para nota e
      histórico; ações de backup na falha de gravação; baixar originais com dados corrompidos;
      medir viewport e IME sem dupla redução; preservar o editor na composição.
      Pronto: testes de falha independentes (requisitos 3.5); pares, colar inteligente e
      continuação de listas conferidos com o perfil Android.
- [ ] **A4 — Barra de formatação, Inserir e seleção** (4.3). P21–P24; problemas 13, 16, 19, 23.
      Depende de A3. Requisitos 5.6, exceto a linha "Modo Código", que entra em A5.
      Pronto: todas as ações do grupo por contexto; Inserir com miniaturas e as mesmas ações do
      `/`; copiar/recortar/colar na seleção; alvos de 48 dp em 320 dp e fonte 2×; teclado físico
      sem barra; composição preservada.

**Marco — usabilidade básica:** A1–A4 concluídas no navegador e suíte local completa passando.
Ao chegar aqui, comece a sincronização.

## Fila — 2. Sincronização

Requisitos na seção 11 dos [requisitos](../plano-mobile.md#11-sincronização); decisão no
[ADR 0009](../adr/0009-sincronizacao-por-servidor-proprio.md). Depende do marco (A3 é obrigatória:
a gravação local precisa ser confiável antes de sincronizar).

- [ ] **S1 — Protocolo e decisões.** Fechar as decisões em aberto da seção 11.8 e registrar o
      protocolo num ADR próprio: formato no servidor, base comum por nota, conflitos, exclusões,
      imagens entre plataformas, armazenamento da chave e criptografia.
      Pronto: ADR aceito pelo usuário; testes de contrato da API (casos de sucesso, 409, 401, 429)
      escritos antes da implementação.
- [ ] **S2 — Servidor de referência.** `server/` com Worker + D1 + R2, testes locais
      (`wrangler dev`/Miniflare), script de implantação e guia de instalação no README.
      Pronto: testes de contrato passam no servidor local; implantação no plano grátis conferida;
      `docs/architecture.md` atualizado com o novo componente.
- [ ] **S3 — Motor e desktop.** `src/sync/` puro e testado; Configurações → Sincronização no
      desktop; estados visíveis; primeira sincronização com prévia; pasta de notas respeitada.
      Pronto: unitários do motor (mesclagem, conflito, exclusão, imagens, primeira sincronização);
      E2E desktop com servidor local; texto local nunca perdido em falha de rede ou de servidor.
- [ ] **S4 — Android e teste ponta a ponta.** Mesma tela no celular; sincronizar ao abrir, ao
      voltar ao primeiro plano, após gravar e por botão.
      Pronto: editar a mesma nota no desktop e no celular e ver a mudança chegar nos dois
      sentidos; conflito gera as duas versões; exclusão e restauração chegam ao outro lado;
      imagem inserida no celular aparece no desktop. Casos de aparelho na lista de validação.

## Fila — 3. Restante da paridade

- [ ] **A5 — Modo Código** (4.2). P20. Depende de A3 e A4.
      Faz: comparar `textarea` e CodeMirror sem decorações e registrar a escolha (decisão 3);
      preferência por nota; teclas de símbolos na barra (linha "Modo Código" de 5.6).
      Pronto: texto, seleção, desfazer/refazer e histórico preservados ao alternar; editor
      desktop inalterado.
- [ ] **A6 — Buscar e comandos.** P2, P3. Requisitos 5.9.
      Pronto: notas por nome e texto com contagem e abertura na 1ª ocorrência; `>` com as ações
      da tela; `#` com títulos; Ctrl+P e Ctrl+Shift+P com teclado físico; foco e voltar corretos.
- [ ] **A7 — Grupos e ordenação da lista.** P4.
      Faz: mostrar os grupos do desktop (recolhíveis), ordenação recentes/alfabética e mover de
      grupo pela folha de ações. Reutiliza o modelo de grupos de `note-list.jsx` sem mudar o
      desktop.
      Pronto: grupos criados no desktop aparecem iguais; busca mostra só grupos com resultado.
- [ ] **A8 — Notas abertas.** P6. Requisitos 5.10.
      Pronto: abrir, trocar e fechar notas abertas; posição e modo por nota; `openIds` igual ao
      desktop após recarga.
- [ ] **A9 — Ações de documento.** P16, P26–P31.
      Faz: buscar e substituir em edição; Informações (palavras e caracteres por
      `text-statistics.js`); recolher/expandir todas; mover seção (`section-move.js`); conferir
      quebra e recolher por bloco de código no toque.
      Pronto: E2E de cada ação, com desfazer onde o desktop tem.
- [ ] **A10 — Leitura: concluir interações** (3.2). P32, P33.
      Faz: conferir destinos `[[Nota#Título]]`, criar nota ausente, links externos e progresso de
      seções em 320 dp. Buscar na nota e recolher seções já existem.
      Pronto: retorno e contexto preservados; sem abrir teclado.
- [ ] **A11 — Tabelas** (3.3 → 3.4 → 3.5 → 4.4). P34. Requisitos 5.4. Decisões 1 e 4 antes de 3.4.
      Já feito em 3.3: rolagem local, 1ª coluna fixa, contagem no rótulo, foco por teclado.
      Pronto por parte: cabeçalho fixo e tabelas iguais; cartões; tela cheia com retorno ao
      ponto; edição por célula preservando Markdown e histórico.
- [ ] **A12 — Colunas e blocos recolhíveis.** P35. Requisitos 5.5. Decisão 5 antes. Depende de A4.
      Pronto: leitura e edição em 320 dp e 840 dp; "Mover para a coluna…" com desfazer; Markdown
      igual ao do desktop.
- [ ] **A13 — Imagens** (4.5 e 5.4). P36, P37. Requisitos 5.8. Depende de A4.
      Pronto: câmera e arquivo inserem na nota certa; detalhe com todas as ações do desktop;
      excluir remove referências; permissão, cancelamento e falha testados.
- [ ] **A14 — Arquivos** (5.1 restante e 5.2). P38, P39.
      Já feito: compartilhar `.md` e backup em Configurações.
      Pronto: exportar e importar pelo seletor do sistema; aviso sobre imagens; conflitos de nome;
      ida e volta de notas e imagens.
- [ ] **A15 — Histórico de versões** (5.3). P40. Depende de A3.
      Pronto: ativação explícita, retenção, limpeza, restauração e aviso separado de falha (ADR 0002).
- [ ] **A16 — Classes de janela e teclado físico.** P7, P41–P43; problema 26. Requisitos 8.
      Pronto: média e expandida em 600 e 840 dp e em paisagem; consultar duas notas; troca de
      classe sem perder estado; atalhos com teclado físico.
- [ ] **A17 — Status de tarefas e Quadro.** P44. **Bloqueada** até as etapas 1–3 do
      [plano de status e quadro](status-arquivo-quadro-tarefas.md). Executa a etapa 4 daquele plano.
- [ ] **A18 — Polimento nativo** (6.1–6.4). Problemas 2, 4, 8–11, 20, 24.
      Já feito: ícones das barras (6.1); arrastar folhas no navegador (6.2).
      Falta: fundo das barras e matriz de temas com folhas; conflito do arraste com teclado,
      rolagem interna e gesto do sistema; TalkBack e escala 1,3×/2× nos fluxos completos; matriz
      de compatibilidade (rotação, janela dividida, aparelho modesto, casos do ADR 0003).
- [ ] **A19 — Integração Android** (7.1–7.3). P45, P47.
      Já feito: receber texto (validação, limite de 1.000.000 caracteres, entrega única) e atalho
      "Nova nota" (entrega única) no emulador.
      Falta: decisão 2 e "Abrir com" `.md`; receber imagens e `.md`; casos do aparelho.

## Fila — Parte B: ideias novas só do mobile

Começa só com o critério da seção 4.3 dos requisitos cumprido. Ordem e detalhes nas seções 9.1 e
9.2 dos requisitos: B1, B2 → B8, B9, B10 → B11–B14 → B3 → B15 → B4–B7, B17 (essas exigem ADR).

## Depois deste plano — Parte C: ideias para as duas plataformas

Começa só depois da Parte B. As propostas C1–C5 (seção 9.3 dos requisitos) mudam desktop e
celular e têm documentos próprios; cada uma recebe plano de tarefa próprio quando for aprovada.
A sincronização pelo servidor próprio não espera a Parte C: ela está na fila 2, acima.

## Validação no aparelho (pendente)

Itens que o navegador e o emulador não comprovam. Registre ambiente e resultado ao verificar.

- Insets: primeiro frame, recriação do WebView, laterais e finais; teclado flutuante e dividido.
- IME (ADR 0003): Gboard em português, SwiftKey, Samsung Keyboard, ditado, versões de WebView,
  animações ativadas.
- Retorno: gesto e 3 botões; raiz com gravação pendente/falha; prévia do voltar preditivo.
- Morte do processo durante a escrita e reabertura.
- Compartilhar: envio concluído a um app de destino; caminho de falha da ponte; conteúdo do `.md`
  recebido.
- Receber texto de um app real; textos muito grandes; falha de gravação logo após receber.
- Atalho "Nova nota" por toque longo real no ícone do launcher, com teclado aberto no retorno.
- Arrastar folha com teclado aberto, rolagem interna e gesto do sistema.
- Links externos e destinos de títulos.
- Rotação em aparelho físico, janela dividida, teclado em paisagem.
- Backup: download e seletor de restauração no WebView.

## Evidências registradas

- 2026-10-23, revisão: 300 testes JS, 39 Rust, 307 E2E (26 mobile).
- 2.1 (2026-10-23): 301 JS, 39 Rust, 310 E2E (29 mobile); capturas em 320 px com fonte 2× e
  desktop; renomeação valida vazio, inválido e repetido e atualiza referências wiki.
- 2.2 (2026-10-23): 301 JS, 39 Rust, 315 E2E (34 mobile) com `--workers=1`; eventos reais de toque.
  Rodadas anteriores com falhas desktop de foco em paralelo não valeram como aprovação.
- 2.3 (2026-11-02 a 06): emulador Android 36 x86_64 (APK debug arm64, SDK 36, NDK 27, JDK 21) abriu
  a folha e voltou sem erro; Samsung SM-S921B com Android 17 abriu e cancelou o seletor;
  alinhamento ARM64 de 16 KB confirmado por `llvm-readelf`. Entrega 0.4.0: 348 JS, 43 Rust e 410
  E2E (dois workers, uma repetição permitida, todos na 1ª tentativa).
- 2.4 parcial (0.5.4): rota em `localStorage`; no emulador, Voltar fechou a folha e saiu na raiz; a
  tela Lixeira voltou após `force-stop`.
- 6.2: `adb input swipe` fechou a folha no emulador. 6.1: ícones das barras conferidos no emulador.
- Rotação (2026-11-02, emulador, 2400×1080): recuo lateral respeitado; tela e tema mantidos.
- 7.1 e 7.3: `am start` com app fechado e aberto criou uma nota por ação; girar não duplicou.
- 5.1 parcial: a lista do sistema mostrou "Sharing 1 file" com o nome correto.

## Tentativas que falharam

- Em 2.2, capturar explicitamente o ponteiro de toque na linha interferia na captura implícita do
  botão; o componente mantém a captura nativa. Reconhecer o arraste só por eventos de ponteiro
  deixava o Chromium suprimir o clique seguinte no Desfazer; bloquear `touchmove` só após
  reconhecer movimento horizontal resolveu, preservando a rolagem vertical.
- A prévia colaborativa falhou duas vezes com `Preview automation snapshot timed out after 15000ms.`;
  a inspeção usou o Playwright do projeto.
- Sincronizar texto por efeito passivo reaplicava texto atrasado em digitação rápida com
  EditContext; a integração usa efeito de layout.
- Enter do CodeMirror no perfil Android é assíncrono; o teste espera a quebra de linha, sem pausa fixa.

## Dúvidas abertas

- Decisões em aberto 1–6 da seção 10 dos requisitos, cada uma antes da etapa indicada.
- Matriz nativa do ADR 0003 continua aberta.
- Os dois worktrees t3 antigos têm alterações não commitadas; preservá-los com seus branches. Não
  incorporar nem apagar essas alterações numa limpeza.

## Próximo passo

**A1 — Sobre, Configurações e Lixeira completas.** Comece por um componente Sobre compartilhado
que lê a versão por `getVersion()` no Tauri e por `package.json` no build web.

Validar a lixeira e configurações no APK; continuar retorno e recuperação, leitura e edição,
seguindo as dependências e preservando os dados. A matriz nativa permanece aberta.

## Retomada em 2026-11-03

- Corrigida a detecção de teclado no fallback web: diferenças menores que 100 px e zoom
  não ocultam a navegação nem Nova nota. Relato no Android ainda requer reprodução nativa;
  não considerar esta correção como confirmação da causa no APK.
- Validação: 336 testes JS, quatro E2E de insets e build web passaram.
- Próximo passo: reproduzir o desaparecimento no APK e validar a ponte nativa antes de
  retomar 2.3. Inspeção visual e implementação das demais funções básicas continuam pendentes.

## Continuação: compartilhamento e lixeira

- Compartilhamento de texto implementado pela folha de ações, com seletor Android e alternativa
  de cópia na prévia. O seletor abriu no emulador API 36 x86_64 com o texto da nota; os testes
  E2E cobrem abertura e falha simuladas. Cancelar e outros aplicativos ainda exigem verificação.
- Lixeira acessível pelo menu: restauração e exclusão definitiva com confirmação, cobertas por E2E.
  Falta inspeção visual e validação nativa da tela antes de concluir 5.5a.
- A ponte de insets reenvia os limites após a inicialização da interface e publica o estado final
  da animação. No emulador API 36, a barra do sistema não cobre mais a navegação e o menu e Nova
  nota voltam após fechar Gboard. Outros teclados e dispositivos continuam pendentes.
- Próximo passo: validar a lixeira no APK e implementar configurações, recuperação nativa e os
  demais fluxos básicos ainda abertos neste plano.

- Configurações mobile agora têm idioma, tamanho de texto, Novidades e Sobre com versão do
  pacote. A navegação tem regressão para paisagem baixa; o CSS não oculta mais o menu nessa condição.
- Em 2026-11-03, 40 testes E2E mobile passaram; mais cinco testes de insets passaram após
  remover a regra de paisagem. Configurações foram inspecionadas em 390 e 1280 px.
- O pedido atual amplia a execução para além de um único incremento; o plano anterior de
  parar após 2.3 deixa de orientar a sequência. Não houve autorização de push ou publicação.
- A folha de ações também está disponível no cabeçalho de leitura; mover a nota aberta para a
  lixeira retorna à lista e mantém Desfazer. Caminho coberto por E2E e cabeçalho inspecionado a 320 px.

## Continuação: edição e tarefas

- Modo Código usa a mesma instância CodeMirror da edição visual, reconfigurada sem decorações;
  a alternativa textarea desktop exigiria transferir a seleção e substituir o histórico de desfazer.
  A escolha é local à interface mobile e não muda o formato Markdown. A preferência por nota é
  guardada nas preferências existentes. A troca espera o fim da composição. Testes de navegador
  cobrem troca, símbolos, desfazer e recarga; validação de IME e composição no APK ainda falta.
- A lista de tarefas abre o trecho pela posição e pelo conteúdo da linha, realça-o sem teclado e
  permite desfazer se a nota não tiver mudado desde a ação. Tarefas idênticas foram testadas.
- Histórico é enviado ao ocultar a janela; falhas de histórico agora aparecem separadas das falhas
  de gravação da nota. A interrupção de processo durante escrita ainda requer validação nativa.
- Ao testar o editor desktop, 28 dos 31 testes passaram na primeira rodada; duas falhas de links
  também ocorreram com o arquivo original, e a falha do campo vazio passou ao repetir isoladamente.
  Não considerar a suíte desktop aprovada até investigar essas falhas.
- A navegação migra a sessão anterior para armazenamento local da WebView, sem gravar texto da
  nota; referências inválidas são descartadas. Novo contexto de navegador recupera a nota em leitura
  sem teclado. Ainda falta testar encerramento do processo no APK e gravação pendente.
- No emulador API 36, a troca visual/código preservou foco e teclado após ajuste de toque. Não há
  evidência ainda para composição ativa nem Gboard em português.
- O botão Voltar nativo prioriza camada, teclado e tela. Na raiz, espera a fila de gravação e
  permanece aberto se ela falhar; testes unitários cobrem fila, falha e toques repetidos. No emulador
  API 36, Voltar retornou da nota à lista e saiu na raiz. Após `adb force-stop`, a nota aberta foi
  restaurada em leitura e Voltar retornou à lista. Falta testar falha de gravação no APK e IMEs reais.
- Próxima implementação: backup e importação/exportação com o seletor Android, tratando falhas e
  sem sobrescrita silenciosa; depois concluir ferramentas de edição e galeria. O APK ARM64 inclui
  o estado atual, mas não representa a conclusão das etapas pendentes.

## Continuação: transferência de arquivos

- Backup no Android usa o seletor do sistema e inclui notas e imagens locais; o histórico e imagens
  externas não são incluídos. A restauração valida o arquivo, exige confirmação e salva antes de
  substituir a memória, mantendo a cópia anterior. O limite é 100 MB. Backups com notas vinculadas
  a arquivos externos são recusados para não modificar arquivos fora do app.
- No emulador API 36, o backup foi salvo em Downloads e selecionado e restaurado pelo seletor.
  E2E cobre cancelamento, arquivo inválido, falha de gravação, nova tentativa e imagem local no
  navegador; falta repetir com imagens locais reais no APK e falha de espaço nativa.
- A importação de Markdown/texto cria cópia com nome único e limite de 10 MB. A exportação usa
  o seletor Android e informa que imagens separadas não acompanham o texto. Testes de navegador
  cobrem nome repetido e cancelamento; validação nativa dos arquivos Markdown ainda falta.
- Próximo passo: testar transferência Markdown e backup com imagens no APK; continuar galeria,
  inserção e as demais interações de edição e leitura pendentes.

## Ajuste solicitado em 2026-11-06 — cabeçalho e menu

No checkout `t3-ca486162`, que preserva as correções Android anteriores, o cabeçalho agora usa
uma linha sem quebra, com título truncado e ações de 48 px. Editar/Pronto e alternância do modo
usam ícones com rótulos acessíveis. O menu principal está no canto inferior direito da navegação,
também nas notas e telas secundárias, e abre um drawer lateral com o tema. A barra recolhe com
o teclado, conforme o comportamento existente. O status de gravação fica acima da navegação.
Teste de regressão cobre 320 px, título longo, leitura/edição, fonte ampliada, posição do menu,
drawer e devolução do foco. Capturas mobile/desktop inspecionadas. Passaram 53 E2E mobile, 339 testes JS, lint e formatação; a entrada e a captura de Novidades foram verificadas. APK compilado e instalado;
a conferência física foi concluída no Samsung SM-S921B: leitura e edição mantêm o cabeçalho em uma linha, lápis/check alternam corretamente, a barra recolhe com o teclado e retorna ao tocar Pronto, e Menu abre o drawer lateral com o tema. Nenhum texto foi alterado na nota usada para conferir. Não usar o checkout raiz antigo para gerar
APKs Android: ele não contém os avanços ainda não commitados deste checkout.

## Planejado — Novidades por versão e índice Markdown

Solicitado em 2026-11-06. Ainda não implementado.

- [ ] Manter um arquivo Markdown por versão em `changelog/X.Y.Z.md`, consolidando os fragmentos
      de `changelog/unreleased/` no lançamento, sem duplicar os textos na interface.
- [ ] Usar `CHANGELOG.md` como índice Markdown: cada versão terá número, data, resumo curto e
      link relativo para seu arquivo completo. Preservar os registros existentes.
- [ ] Adaptar Novidades para listar as versões pelo índice e abrir o registro selecionado,
      com retorno ao índice e links/imagens locais funcionando offline.
- [ ] Identificar mudanças gerais, desktop e Android nos registros, permitindo mostrar as
      novidades da plataforma ativa sem manter cópias divergentes do mesmo histórico.
- [ ] Validar leitura do índice, ordenação, navegação, ausência de registros, links e imagens
      no desktop e no Android. Atualizar a documentação do processo ao entregar a mudança.

Próximo passo deste item: conferir o carregamento atual de `CHANGELOG.md` e `changelog/*.md`,
definir o formato do resumo no índice e implementar a navegação preservando a fonte única.

## APK de teste compacto — 2026-11-06

Build ARM64 após `gradlew clean`, com `CARGO_PROFILE_DEV_DEBUG=0`,
`CARGO_PROFILE_DEV_STRIP=debuginfo` e
`CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS='-C link-arg=-Wl,-z,max-page-size=16384'`.
O pacote passou de 307.127.011 para 38.555.465 bytes. Conferidas a integridade ZIP, a assinatura
de teste, o alinhamento ZIP de 16 KB e os segmentos ELF de 16 KB. Esta compilação mantém
os recursos da versão de teste; continua sendo um APK de depuração, sem publicação.

## Consolidação em 2026-11-09

Os avanços locais dos dois worktrees foram incorporados à main na versão 0.6.0. A raiz passa a ser a origem dos APKs. As notas históricas acima descrevem o estado na data indicada; Novidades por versão já está implementado.
