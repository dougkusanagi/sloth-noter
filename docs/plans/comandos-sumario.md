# Comandos e sumário

Objetivo: concluir o sumário e completar os comandos globais ausentes; integrar e instalar no celular.

- Implementados comandos de sumário, navegação de abas e restauração de tamanho/largura.
- Atalho do sumário centralizado no despachante global; tooltip compartilhado e camada abaixo do menu.
- 25 E2E afetados aprovados, incluindo desktop, largura de celular, Novidades e shell mobile. Testes JavaScript, lint e versão aprovados.
- A suíte completa encontrou falhas em blocos recolhíveis nas colunas e alinhamento de controles dos títulos; integração no principal depende da validação completa exigida em docs/DESENVOLVIMENTO.md.
- A tentativa de ajustar guias de listas foi revertida para preservar o escopo da entrega.
- Próximo passo: concluir build release ARM64 e atualização por ADB; preservar commit no branch fix/comandos-sumario e resolver o bloqueio da integração.
