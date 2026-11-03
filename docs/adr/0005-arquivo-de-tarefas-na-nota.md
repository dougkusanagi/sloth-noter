# 0005 — Arquivo de tarefas na própria nota

- Estado: aceito
- Data: 2026-11-03

## Contexto

Uma nota de projeto acumula tarefas concluídas que não precisam mais ficar à vista. Apagar as
tarefas perde o histórico. Esconder as tarefas só na tela não resolve o acúmulo no arquivo, e
o Obsidian e o modo Código continuariam mostrando tudo.

## Decisão

A ação **Arquivar concluídas** move as tarefas Feitas e Canceladas
([ADR 0004](0004-status-de-tarefas-no-checkbox.md)) para uma seção `## Arquivo` no fim da
mesma nota.

- Dentro do Arquivo, as tarefas ficam agrupadas pelo título da seção de origem
  (`### Backend`). As tarefas que estavam fora de qualquer seção ficam no início do Arquivo,
  sem subtítulo.
- Uma tarefa só é movida quando ela e todas as subtarefas estão Feitas ou Canceladas. As linhas
  recuadas abaixo da tarefa (descrição, subitens) vão junto.
- A seção é reconhecida pelo título `Arquivo` ou `Archive`, nos dois idiomas da interface. O
  app cria o título no idioma atual.
- O Arquivo aparece recolhido por padrão no modo Padrão e na Leitura. Recolher continua sendo só
  visual: o Markdown não muda.
- As tarefas arquivadas não contam no progresso das seções de origem.
- A ação inteira é um único passo de desfazer.
- A primeira etapa é só a ação manual (paleta de comandos e menu da nota). O arquivamento
  automático depois de N dias fica para uma etapa posterior, usando as datas `✅`/`❌` do
  ADR 0004.
- Desarquivar uma tarefa a devolve para a seção de origem. Se a seção não existir mais, a
  tarefa vai para o fim da nota, antes do Arquivo.

## Alternativas

- **Só ocultar as concluídas na tela:** não muda o arquivo, mas não resolve o acúmulo.
- **Nota separada (`Projeto — Arquivo.md`):** deixa a nota principal mais leve, mas cria mais
  um arquivo na biblioteca e exige atualizar o link e o nome ao renomear o projeto. Pode virar
  uma opção futura para projetos muito longos.
- **Apagar as concluídas:** perde o histórico.

## Consequências

- O arquivo continua crescendo, mas o conteúdo arquivado fica no fim e recolhido. A busca
  continua encontrando as tarefas arquivadas.
- Uma seção da pessoa chamada "Arquivo" ou "Archive" passa a ser tratada como arquivo de
  tarefas. Isso precisa constar na documentação.
- Mover linhas entre seções exige preservar o recuo das listas, as linhas em branco e os blocos
  de código.
- Arquivar tarefas é diferente de concluir a nota (`completedAt`): a nota continua ativa.
