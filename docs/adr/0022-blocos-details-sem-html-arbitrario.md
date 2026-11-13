# 0022 — Blocos recolhíveis sem HTML arbitrário

Status: Aceito

## Contexto

Os testes de colunas exigem a leitura de blocos `details` e seu recolhimento no editor. O leitor usa ReactMarkdown, sem habilitar HTML arbitrário. As notas precisam continuar como Markdown, sem converter arquivos existentes.

## Decisão

Reconhecer pares de `<details>` e `</details>` em linhas próprias, com `<summary>` de texto simples em uma linha. Tags com atributos e exemplos dentro de código não são interpretados. O leitor transforma apenas esses delimitadores em nós semânticos `details` e `summary`, sem executar HTML da nota. O editor compartilha o reconhecimento e o mecanismo de recolhimento de seções; colunas dentro de uma região recolhida não são desenhadas.

## Alternativas

- Habilitar HTML bruto no leitor: ampliaria a superfície de conteúdo interpretado além dos delimitadores necessários.
- Converter as notas para um formato próprio: exigiria alterar os arquivos existentes.
- Ignorar os delimitadores: não atenderia o comportamento exigido pelos testes de colunas.

## Consequências

O conteúdo e os delimitadores originais são preservados. A leitura começa expandida. O estado de recolhimento é local à visualização. Títulos com tags, atributos e outras variantes de HTML continuam fora desse suporte.
