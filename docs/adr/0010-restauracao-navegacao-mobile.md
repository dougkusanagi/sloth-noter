# 0010 — Restaurar a navegação mobile após reiniciar

- Estado: aceito
- Data: 2026-11-03

## Contexto

A navegação mobile guardava a tela e a posição apenas na sessão da WebView. Ao recriar a
WebView depois de encerrar o processo, essa sessão podia desaparecer. A pessoa perdia a posição
mesmo quando a nota já tinha sido salva.

## Decisão

Guardar a pilha de telas no armazenamento local da WebView e migrar o registro anterior da
sessão quando ainda não houver registro local. Guardar somente os campos da rota aceitos pelo
navegador do app: tela, identificador, busca, rolagem e posição do cursor. A busca pode conter
texto digitado pela pessoa e permanecer entre reinícios. O texto das notas continua no mecanismo
normal de armazenamento. Camadas transitórias não são restauradas; notas inexistentes descartam
as rotas dependentes. A nota abre em leitura, sem solicitar o teclado.

## Alternativas

Manter apenas a sessão não cobre reinício do processo. Guardar o conteúdo da nota na navegação
criaria uma segunda cópia a reconciliar com a gravação normal e não foi adotado.

## Consequências

A busca e os identificadores de telas persistem localmente até serem substituídos ou os dados da
WebView serem apagados. O armazenamento da WebView pode ser indisponível ou limpo pelo sistema;
nesses casos, a navegação volta ao início sem afetar o armazenamento das notas. A restauração de
rota não garante a conclusão de uma gravação interrompida.
