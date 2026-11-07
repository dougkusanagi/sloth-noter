# Plano: status, arquivo e quadro de tarefas

Tipo: tarefa

## Objetivo

Permitir que uma nota represente um projeto, como no Trello, sem acumular tarefas concluídas
à vista:

1. as tarefas têm status (A fazer, Fazendo, Esperando, Feita, Cancelada);
2. as tarefas Feitas e Canceladas podem ser arquivadas na própria nota, sem apagar;
3. a nota pode ser vista como quadro kanban.

Decisões: [ADR 0004](../adr/0004-status-de-tarefas-no-checkbox.md) (status e datas),
[ADR 0005](../adr/0005-arquivo-de-tarefas-na-nota.md) (arquivo) e
[ADR 0006](../adr/0006-modo-quadro.md) (modo Quadro).

Critério de conclusão: as quatro etapas abaixo entregues, com testes unitários e E2E, páginas
Recursos e Novidades atualizadas e conferência visual em desktop e mobile.

Protótipo aprovado: mostrado no chat em 2026-11-03 (vistas Nota, Quadro e Markdown, menu de
status, arquivar com desfazer).

## Passos

### Etapa 1 — Status das tarefas

- [ ] `noteTasks`: ler o status do caractere (`' '`, `/`, `>`, `x`/`X`, `-`) e preservar
      caracteres desconhecidos, tratados como A fazer.
- [ ] `resolvedTasks`/`syncLinkedTasks`: em tarefas com link, gravar `/` no lugar de `-` para o
      parcial e ignorar o caractere lido; o status vem do progresso.
- [ ] `remarkPartialTasks`: renderizar `[/]`, `[>]` e `[-]` na Leitura como checkbox com status.
- [ ] Progresso das seções: Cancelada fora do total; barra com cores por status (substitui o
      anel atual) e rótulo acessível com as contagens.
- [ ] Ícones dos cinco status no modo Padrão (decoração fora do cursor) e na Leitura, com
      `aria-checked` e rótulos corretos.
- [ ] Clique no círculo: alterna entre A fazer e Feita (Fazendo/Esperando → Feita).
- [ ] Menu de status: etiqueta ao lado da tarefa, clique direito, toque longo, `Alt+1…5` na
      linha do cursor. Foco gerenciado e devolvido ao acionador.
- [ ] Datas `✅ AAAA-MM-DD` ao concluir e `❌ AAAA-MM-DD` ao cancelar; remover ao reabrir.
      Opção em Configurações para desligar. Desfazer reverte status e data num passo.
- [ ] Biblioteca de tarefas: filtro por status (Fazendo, Esperando).
- [ ] Traduções pt-BR e en para status, menu, atalhos e rótulos acessíveis.
- [ ] Testes: leitura de todos os status, caractere desconhecido preservado, migração de `[-]`
      em tarefa com link, progresso sem Canceladas, datas e desfazer.

### Etapa 2 — Arquivar concluídas

- [ ] Função pura que move tarefas Feitas e Canceladas (com subtarefas e linhas recuadas) para
      `## Arquivo`, agrupadas por `### <seção de origem>`. Só move quando a subárvore inteira
      está concluída.
- [ ] Reconhecer `Arquivo`/`Archive` e criar o título no idioma atual.
- [ ] Ação "Arquivar concluídas" na paleta e no menu da nota; um único passo de desfazer;
      aviso com o número de tarefas arquivadas.
- [ ] Arquivo recolhido por padrão no Padrão e na Leitura; tarefas arquivadas fora do
      progresso.
- [ ] Ação "Desarquivar" na tarefa arquivada, devolvendo para a seção de origem.
- [ ] Testes: listas aninhadas, linhas recuadas, blocos de código, tarefas sem seção, nota sem
      Arquivo, Arquivo existente, seção de origem renomeada.

### Etapa 3 — Modo Quadro (desktop e web)

- [ ] Quarto botão no seletor de modos, atalho e comando na paleta.
- [ ] Preferência por nota em `noteMeta` (fora do `.md`), preservada no backup, na pasta de
      notas e em notas abertas no local; os outros modos continuam globais.
- [ ] Colunas por status; Canceladas riscadas na coluna Feita; raias por seção com "Agrupar
      por seção".
- [ ] Arrastar entre colunas (muda o status) e entre raias (move a linha para a seção), com
      alternativa por menu para teclado.
- [ ] "+" na coluna cria a tarefa no fim da seção com o status da coluna.
- [ ] Mensagem de lista vazia com "Adicionar tarefa" em nota sem tarefas.
- [ ] E2E: trocar modo, mover cartão, conferir o Markdown resultante, nota sem tarefas,
      preferência por nota ao trocar de aba e ao reabrir o app.

### Etapa 4 — Quadro no celular

- [ ] Uma coluna por vez, com abas por status; mudar status pelo menu da etiqueta.
- [ ] Definir onde o Quadro fica na casca mobile (hoje sem seletor de modos).

### Em cada etapa

- [ ] Atualizar `docs/RECURSOS.md`, `README.md` se o resumo de recursos mudar, e
      `src/welcome.js` (página de ajuda) com os novos status.
- [ ] Changelog e versão conforme `AGENTS.md`, com captura em `public/changelog/`.
- [ ] Conferir em 1280 px e 390 px, temas claro e escuro.

## Tentativas que falharam

- Nenhuma até agora.

## Dúvidas abertas

- Datas `✅`/`❌` ligadas por padrão? O ADR 0004 propõe ligadas, com opção para desligar.
- Título da raia quando a tarefa está numa seção H3 ou mais funda: usar só o H2 ou o caminho
  ("Backend › API")? O mesmo vale para o agrupamento no Arquivo.
- Arquivamento automático depois de N dias: qual padrão de N, e se pergunta antes de mover.
- Relação com o item 1 do ROADMAP ("notas do tipo lista de tarefas"): o modo Quadro pode
  substituir a ideia de um tipo de nota separado; rever o item depois da etapa 3.

## Próximo passo

Começar a etapa 1 por `src/tasks.js` e `src/tasks.test.js`: modelo de status em `noteTasks` e
migração do parcial em `syncLinkedTasks`.
