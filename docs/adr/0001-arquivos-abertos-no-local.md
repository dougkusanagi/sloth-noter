# 0001 — Arquivos abertos no local

- Estado: aceito
- Data: 2026-10-21

## Contexto

As notas vinham todas de uma única pasta (ou do estado interno do app). Abrir ou arrastar um
`.md`/`.txt` copiava o arquivo para essa pasta, e o nome do arquivo era derivado do título.

## Decisão

No desktop, arquivos abertos pelo sistema ou arrastados para a janela viram notas com
`external: { path, seen }` e são editados **no próprio local**.

- O backend só lê e grava caminhos registrados em `external-files.json`, preenchido apenas por
  drop nativo ou abertura pelo sistema. `external_release` remove o caminho quando a nota sai
  de vez do documento (lixeira não conta).
- A gravação só acontece se o arquivo ainda contém o último texto visto (`seen`); caso contrário
  é recusada. O app verifica o arquivo ao ganhar foco e a cada poucos segundos: nota intocada
  acompanha o arquivo; nota editada dos dois lados pergunta ao usuário.
- Nunca renomeia o arquivo nem reescreve a primeira linha. Excluir a nota não apaga o arquivo.
- O caminho aparece na aba (dica) e numa faixa acima do editor, com a ação explícita
  "Copiar para minhas notas".
- Na reabertura do app, o texto é relido do arquivo pelo caminho registrado; se falhar, mantém-se
  o último texto salvo e o erro aparece no próximo salvamento.
- A versão web continua importando (sem acesso a caminhos).

## Consequências

As notas deixam de vir de uma única origem; adaptadores precisam tratar notas externas à parte
(`src/external-notes.js`). Arquivos que somem ou perdem permissão só falham ao salvar.
