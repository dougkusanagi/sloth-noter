# 0026 — Modelos próprios como notas marcadas

- Estado: aceito
- Data: 2026-11-17

## Contexto

O plano `docs/plans/leitura-e-modelos.md` (seção 2.4) listava três lugares para os modelos da
pessoa: (A) uma subpasta `Modelos/` na pasta de notas, (B) notas comuns marcadas como modelo e
(C) arquivos no diretório de dados do app. A pasta de notas é plana, e a sincronização (ADR 0018)
e a leitura da pasta não enxergam subpastas. O plano recomendava decidir entre A e B antes de
implementar. Não foi encontrado registro de que a pessoa tenha escolhido; esta decisão segue o
critério de não mudar o formato dos arquivos nem o protocolo de sincronização.

## Decisão

Escolher B. Uma nota vira modelo pela ação "Usar esta nota como modelo" (paleta de comandos e
menu principal; "Remover esta nota dos modelos" desfaz). A marca fica em
`preferences.templateNotes` (mapa `id da nota → true`), no mesmo lugar e com a mesma validação de
`boardNotes` e `wrapLinesByNote`. O `.md` da nota não muda. Os modelos próprios aparecem antes dos
embutidos, com o rótulo "Seu modelo", e usam as mesmas variáveis (`{{date}}`, `{{cursor}}`…).
Notas externas (abertas em outro local) não podem ser modelos. Marcas de notas apagadas são
ignoradas.

## Alternativas

- A, subpasta `Modelos/`: igual ao Obsidian e editável fora do app, mas exige que a leitura da
  pasta e a sincronização passem a tratar subpastas.
- C, diretório de dados do app: simples, mas não sincroniza nem acompanha a pasta de notas.

## Consequências

- O modelo continua aparecendo na lista de notas, junto das demais; a marca só muda o seletor.
- A marca viaja com as preferências (backup e pasta de notas). Não foi verificado se as
  preferências são sincronizadas entre aparelhos; se não forem, a marca vale só no aparelho.
- No celular os modelos próprios aparecem no seletor, mas a marca só pode ser feita no desktop.
- Migrar para A depois é possível: basta copiar as notas marcadas para a subpasta.
