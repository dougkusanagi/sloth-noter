# Plano: interface Android

## Objetivo

Implementar a interface Android descrita em [plano mobile v2](../plano-mobile-v2.md),
com navegação por toque e persistência compartilhada com o aplicativo desktop.
Este arquivo registra o andamento para as próximas sessões; o documento v2 contém o escopo detalhado.

## Passos

- [x] Extrair estado, ações e preferências do desktop; publicar insets e investigar IME.
- [x] Criar núcleo e adaptador de navegação com telas, camadas e restauração de sessão.
- [x] Integrar a casca mobile à persistência, com carregamento, falha de leitura e nova tentativa.
- [x] Lista, busca por título/conteúdo, prioridade de título, buscas recentes, fixadas e recentes por abertura.
- [x] Criar e abrir notas por toque; retornar mantendo busca/rolagem; salvar texto e restaurar sessão.
- [x] Ações por botão em cada nota: fixar/desafixar e lixeira com desfazer. Tema visível no cabeçalho.
- [x] Primeira integração de leitura, edição visual, Tarefas, Imagens das notas e Novidades.
- [ ] Completar interações da lista: toque longo, deslizar, renomear e compartilhar.
- [ ] Completar fase 3: tabelas em cartões/tela cheia, realce e rolagem até a tarefa, folha de ações da nota.
- [ ] Fase 4: barra Inserir/contextual, Código, tabela por célula, câmera e integração completa do teclado.
- [ ] Fase 5: galeria completa, lixeira, configurações, histórico, importar/exportar e backup pelo sistema.
- [ ] Fases 6–7: acessibilidade nativa, gestos, escala de fonte, compartilhamento e atalhos Android.

## Estado da implementação

A seleção da casca continua sendo por plataforma, não pela largura da janela. O navegador em
modo de desenvolvimento permite `/?platform=mobile`; uma janela desktop estreita continua desktop.

`MobileShell` usa `useNotesStore` e a persistência existente. `useNavigation` conecta `nav-stack.js`
ao histórico e à sessão. `note-actions.js` reutiliza as regras de títulos, nomes e referências wiki.
As notas existentes abrem em leitura; criação entra em edição visual. A rota é restaurada em leitura,
sem abrir o teclado automaticamente. Não há modo Código mobile nesta entrega.

A galeria atual mostra imagens referenciadas nas notas e permite abrir suas notas de origem.
Não lista ainda imagens soltas do disco nem oferece captura/compartilhamento/exclusão. Tarefas
reutiliza a lista existente; tocar em abrir leva à leitura da nota, ainda sem rolar até a tarefa.
Não há datas de modificação na lista porque o modelo existente não fornece esse dado.

## Tentativas que falharam

- A inspeção pela prévia colaborativa falhou duas vezes com `Preview automation snapshot timed out
after 15000ms.` A inspeção visual desta etapa passou a usar o Playwright existente no projeto.
- A sincronização do texto controlado do editor por efeito passivo podia reaplicar texto atrasado
  durante digitação rápida em EditContext. Foi movida para efeito de layout. Há cobertura E2E de
  criação, digitação, gravação e recarga.
- O Enter do CodeMirror em perfil Android é resolvido de forma assíncrona. O teste aguarda a
  inserção da quebra de linha antes de continuar digitando; não usa uma pausa de duração fixa.

## Dúvidas abertas

- O padrão de cartões para tabelas com mais de três colunas permanece o proposto no v2.
- O botão Voltar nativo do Wry usa o histórico do WebView. Ainda é necessário verificar no APK a
  ordem teclado/camada/tela e o encerramento com gravação pendente; os testes de navegador não
  validam o comportamento do sistema Android.
- A validação em aparelho físico e a matriz de teclados do ADR 0003 continuam pendentes.

## Próximo passo

Completar a fase 3 a partir da leitura integrada: ações da nota, tabelas e localização de tarefas.
Antes de declarar a navegação nativa concluída, verificar os caminhos de retorno no APK e a
restauração após recriar o WebView. A cobertura de navegador está em `e2e/mobile/navigation.spec.js`.
