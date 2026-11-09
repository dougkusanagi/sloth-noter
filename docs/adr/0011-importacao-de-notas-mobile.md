# 0011 — Importar notas como cópias no Android

- Estado: aceito
- Data: 2026-11-03

## Contexto

O Android entrega ao aplicativo um arquivo escolhido pelo seletor do sistema. O app precisa
adicionar seu conteúdo sem sobrescrever notas existentes nem depender de acesso permanente ao
arquivo escolhido.

## Decisão

A ação Importar lê um arquivo Markdown ou texto UTF-8 de até 10 MB e cria uma nota interna.
O arquivo original não é alterado. Se faltar um título Markdown de primeiro nível no início,
o nome do arquivo é acrescentado como título antes do texto. Nomes repetidos recebem um sufixo;
o conteúdo da nota anterior não muda. Imagens em arquivos separados não são importadas.

O botão Exportar grava apenas o Markdown por meio do seletor do sistema; imagens locais
referenciadas na nota não são copiadas junto. O backup é o caminho para transferir notas e
imagens locais em conjunto, conforme o formato já existente do aplicativo.

## Alternativas

Editar o arquivo escolhido no local exigiria guardar e renovar as permissões de acesso, lidar com
alterações externas e definir como resolver conflitos. Essa possibilidade continua fora desta
operação de importação e não altera o ADR 0001.

## Consequências

A cópia pode ser editada sem alterar o arquivo de origem. Referências relativas a imagens podem
não funcionar no destino. O suporte a intents de compartilhamento e a “Abrir com” permanece
separado desta ação e ainda precisa de implementação e validação.
