# 0034 — Documentação embutida somente leitura

- Status: Aceito
- Data: 2026-11-23

## Contexto

A ajuda era uma nota gravada na instalação nova. O comando de ajuda criava outra cópia editável, com um sufixo quando o nome já existia. Atualizar o conteúdo embutido não atualizava as cópias existentes. Uma cópia antiga pode conter anotações pessoais.

## Decisão

O aplicativo oferece a documentação em uma árvore Docs recolhível na biblioteca. O desktop usa a mesma apresentação de leitura de Novidades. O celular tem uma tela de leitura no navegador de telas do aplicativo. A documentação é distribuída com o aplicativo e fica fora dos arquivos da biblioteca. Novas instalações começam com uma nota de rascunho.

## Alternativas

- Continuar criando cópias editáveis exigiria atualizar ou recriar notas para acompanhar a versão do aplicativo.
- Remover automaticamente Welcome.md existente poderia apagar conteúdo acrescentado pelo usuário.

## Consequências

- Pastas Docs podem ser recolhidas na interface. Seus itens acompanham as atualizações do aplicativo e ficam fora da sincronização e do backup de notas.
- Notas Welcome.md já salvas continuam sendo notas comuns.
