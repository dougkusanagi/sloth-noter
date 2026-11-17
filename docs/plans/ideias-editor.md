# Plano: melhorias do editor

> Prioridade entre frentes e etapa ativa: [fila central](prioridades.md). Este plano mantém
> os detalhes da sua frente; seu próximo passo só entra quando ela estiver ativa na fila.

Tipo: tarefa

## Objetivo

Revisar e implementar as melhorias solicitadas para navegação e organização de notas.

## Passos

- [x] Conferir a rolagem até a nota aberta e corrigir o retorno após limpar a busca.
- [x] Conferir os placeholders da nota nova e a dica do comando `/`, já existentes.
- [x] Permitir recolher blocos de código, mostrando a primeira linha e reticências.
- [x] Acrescentar controle global de quebra de linhas e escolhas individuais por nota e por bloco de código.
- [x] Permitir consultar duas notas por arraste de aba ou menu de contexto; a lateral abre em leitura e troca de lugar ao clicar no nome para editá-la.
- Retirado do escopo atual: bloco recolhível com `<details>`/`<summary>`, removido pelo
  [ADR 0029](../adr/0029-remover-blocos-recolhiveis.md). Não reimplementar ao fechar este plano.
- [x] Acrescentar layout em colunas, com inserção, acréscimo e remoção sem apagar o conteúdo.
- [x] Permitir arrastar conteúdo selecionado com o mouse da nota para uma coluna e entre colunas, com desfazer; recortar e colar oferece alternativa pelo teclado.

## Tentativas que falharam

- O arraste nativo entre editores aninhados selecionava parte do texto; o gesto entre a nota e as colunas agora usa uma transação única e tem teste de desfazer.
- Recalcular guias com observadores de tamanho e de mutação não resolveu de forma consistente o alinhamento no modo Leitura; a tentativa foi descartada.

## Dúvidas abertas

- Nenhuma.

## Próximo passo

Investigar a falha intermitente de alinhamento das guias no teste `e2e/rails.spec.js`; depois executar a suíte E2E completa, revisar Novidades e concluir a entrega. O relato anterior de testes aprovados e ausência de commit é histórico; os recursos já aparecem
no código e no histórico de versões. Falta conferir a suíte atual, sem presumir aprovação.
