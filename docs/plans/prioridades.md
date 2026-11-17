# Prioridades de execução

Tipo: contínuo

## Objetivo

Manter uma única fila entre os planos do Sloth Note. Este documento define a prioridade entre
frentes; cada plano mantém o escopo, as etapas, as dependências e as evidências da sua frente.
O [roteiro](../ROADMAP.md) guarda a direção do produto, não uma segunda fila de execução.

## Como retomar

- Ao receber “continue o plano” sem outra indicação, retomar a etapa ativa abaixo.
- Trabalhar em uma etapa por vez. Um pedido explícito pode alterar a prioridade; registrar a
  mudança aqui e no plano afetado.
- Distinguir código implementado, validação no navegador e validação nativa. Testes existentes
  e relatos antigos não comprovam que a suíte atual passa.
- Ao concluir uma etapa, registrar as evidências no plano correspondente e avançar esta fila.
  Antes de apagar um plano concluído, preservar decisões em ADR e fatos duráveis na documentação,
  corrigindo todos os links para ele. Planos com validação pendente continuam abertos.
- Publicação, implantação e alteração de dados reais seguem as autorizações próprias do projeto.

## Fila

| Prioridade | Frente e planos                                                                                                                                                        | Critério para avançar                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — ativa  | Fechar entregas do [editor](ideias-editor.md), de [imagens e navegação](melhorias-editor-imagens.md) e de [status, arquivo e Quadro](status-arquivo-quadro-tarefas.md) | Investigar as falhas registradas, concluir testes locais e inspeção exigidos, conferir Recursos/Novidades e registrar pendências nativas. Encerrar e remover os planos que cumprirem seus critérios.                       |
| 2          | Sincronização e proteção dos dados: [S4 do plano Android](mobile-interface.md#fila--2-sincronização)                                                                   | Validar o fluxo atual de conta, notas e imagens nos dois sentidos, conflito, exclusão, restauração, falhas e recuperação conforme S4 e ADR 0024. Registrar separadamente a evidência no navegador e nos aplicativos reais. |
| 3          | Uso diário no Android: [paridade A5–A19](mobile-interface.md#fila--3-restante-da-paridade)                                                                             | Seguir a ordem local, conferindo primeiro o que já existe; não reimplementar etapas parcialmente prontas. Cumprir o critério de paridade dos requisitos antes de iniciar ideias novas.                                     |
| 4          | Pendências de [leitura, modelos e variáveis](leitura-e-modelos.md)                                                                                                     | Conferir o que foi entregue e concluir as pendências funcionais antes dos opcionais tipográficos. Quando uma pendência também fizer parte da paridade Android, executá-la na prioridade 3 e atualizar ambos os planos.     |
| 5          | Recursos novos e polimento opcional do [roteiro](../ROADMAP.md)                                                                                                        | Entrar após estabilizar os fluxos anteriores; no mobile, Parte B antes da Parte C, conforme os requisitos.                                                                                                                 |

Um defeito que comprometa gravação, integridade ou recuperação dos dados passa à frente da fila;
registrar a evidência e o ajuste de prioridade antes de continuar.

## Etapa ativa — fechar entregas existentes

- [x] Conferir os cinco planos, o histórico recente e os pontos de implementação citados.
- [x] Separar funcionalidades já implementadas de validações pendentes e decisões superadas.
- [ ] Investigar `e2e/rails.spec.js` e a rolagem de `e2e/insert-trigger.spec.js:67`, registradas nos
      planos do editor e de leitura. Confirmar o estado atual antes de atribuir uma causa.
- [ ] Conferir os testes de status, arquivo, Quadro, imagens, colunas e navegação; resolver
      falhas do escopo e executar a suíte local exigida em Desenvolvimento.
- [ ] Conferir Recursos, ajuda, Novidades e interface nas larguras exigidas por cada plano.
- [ ] Preservar decisões e pendências duráveis, remover planos concluídos e ativar a prioridade 2.

## Conferência em 2026-11-17

- A árvore estava sem alterações locais ao iniciar. A versão atual é 0.25.0.
- Os planos de editor e imagens registram implementação pronta, mas ainda pedem validação final.
  A reorganização documental não executa nem declara aprovada essa validação.
- O plano do Quadro tem as quatro etapas marcadas e critérios transversais ainda abertos.
  `preferences.boardNotes` existe nas duas cascas; a diferença para o ADR 0006 precisa ser
  registrada em novo ADR antes de encerrar esse plano.
- Blocos `<details>` foram removidos pelo ADR 0029; não são uma entrega pendente.
- Modelos próprios como notas marcadas (ADR 0026), variáveis `{{nome}}` e tipos YAML (ADR 0027)
  já foram decididos. O painel desktop veio no ADR 0028 e passou para cima da nota no ADR 0030. Essas escolhas não dependem de nova consulta.
- S4 tem código e evidências anteriores, mas a validação da conexão antiga não comprova o fluxo
  atual de conta. O estado remoto de migrações e implantação precisa ser conferido na retomada.
- A5 já tem implementação descrita no histórico mobile; sua caixa continua aberta até conferir
  todos os critérios. Não é necessário começar o modo Código do zero.

## Tentativas que falharam

As tentativas técnicas permanecem nos planos de origem: guias e arraste no editor, rolagem em
leitura/modelos e execução simultânea do Playwright em imagens/navegação.

## Dúvidas abertas

Nenhuma sobre a ordem aprovada. Questões de produto ainda abertas ficam nos planos de origem e
só bloqueiam a etapa que depende delas.

## Próximo passo

Retomar a prioridade 1 investigando as guias e a rolagem do editor. Registrar resultados atuais;
não repetir testes intermitentes apenas até passarem. Depois cumprir os critérios de fechamento
acima antes de avançar para S4.
