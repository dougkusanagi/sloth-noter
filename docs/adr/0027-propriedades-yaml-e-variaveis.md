# 0027 — Propriedades YAML no início da nota e variáveis `{{nome}}`

- Estado: aceito
- Data: 2026-11-17

## Contexto

O plano `docs/plans/leitura-e-modelos.md` (partes 3.1 a 3.3) propõe variáveis que mostram dados da
nota (última atualização, contagens, prazo) e propriedades guardadas no próprio arquivo. As notas
são arquivos Markdown que outros programas também abrem. Até esta decisão, o app reescrevia a
primeira linha de toda nota para `# título`; uma nota com bloco YAML no início perdia o bloco
(`---` virava `# ---`). A pessoa respondeu, em 2026-11-17, que a sintaxe das variáveis pode usar só
`{{` (sem o `=` proposto no plano) e que a primeira entrega aceita texto, número, booleano, data e
lista simples.

## Decisão

- **Bloco de propriedades.** Uma nota pode começar com um bloco YAML: linha `---`, o YAML e uma
  linha `---` (ou `...`). O título (`# …`) fica depois do bloco e continua obrigatório. O bloco só
  conta se a linha 1 for exatamente `---`; sem fechamento, não é bloco.
- **Leitura do YAML.** Biblioteca `yaml` (nova dependência), versão 1.2, esquema padrão (datas
  ficam como texto `AAAA-MM-DD`). São rejeitados, sem alterar o texto: chaves repetidas, aliases
  (`&` e `*`), raiz que não seja um mapa, YAML inválido e blocos acima de 64 KiB. Tipos: texto,
  número, booleano, data ISO e lista de valores simples; os demais (mapas, listas de objetos) são
  preservados no arquivo e ignorados pelas variáveis. Nenhum código é executado.
- **Edição.** `writeProperty` (`src/frontmatter.js`) usa o documento da biblioteca e preserva
  comentários, ordem e formato das outras propriedades. A interface desta entrega edita o bloco
  como texto (modo Padrão e Código); não há painel de propriedades ainda.
- **Variáveis.** Sintaxe `{{nome}}` ou `{{nome:argumento}}`, em minúsculas. Valem `today`,
  `updated`, `words`, `reading`, `tasks`, `until:AAAA-MM-DD` e `user.<propriedade>`. O arquivo
  guarda só o marcador; o valor é calculado ao exibir (chip no modo Padrão e na Leitura) e nada é
  reescrito. Fora de blocos de código e de código em linha. Variável desconhecida ou propriedade
  ausente aparece como o texto original, sublinhado, com a explicação ao passar o mouse. Um valor
  nunca vira outra variável.
- **Convivência com os modelos.** As variáveis de inserção dos modelos (`{{title}}`, `{{date}}`,
  `{{time}}`, `{{weekday}}`, `{{profile}}`, `{{date:FORMATO}}`, `{{date+7d}}`, `{{cursor}}`) são
  trocadas uma vez, ao criar a nota. Os nomes das duas famílias não se repetem, então um modelo
  pode ter as duas.
- **Metadados declarados × dados reais.** `{{updated}}` vem da data de alteração guardada pelo app;
  uma propriedade `updated` no YAML não a muda e só aparece como `{{user.updated}}`.
- **Contagens.** Palavras, caracteres, tarefas e seções ignoram o bloco YAML (o texto do bloco é
  mascarado antes de o Markdown ser lido).

## Alternativas

- Manter `{{=nome}}`: evita qualquer choque com texto comum, mas é mais longo; a pessoa preferiu
  `{{`. O risco aceito é que um `{{texto}}` escrito à mão em minúsculas seja lido como variável;
  ele aparece sublinhado e continua legível.
- Parser YAML próprio com expressões regulares: descartado pelo plano (não preserva comentários
  nem trata os casos do formato).
- `js-yaml`: já está instalado como dependência indireta, mas não preserva comentários ao editar.

## Consequências

- Notas com YAML deixam de ser corrompidas pela normalização do título.
- Colar uma nota inteira com YAML numa nota vazia deixa o `# ` obrigatório antes de `---`; o
  caminho seguro é "Inserir propriedades (YAML)" ou abrir o arquivo.
- Comentários do YAML que começam com `#` não contam como título nem como seção.
- Ainda não existem: variável `{{created}}` (não há data de criação gravada; exige outro ADR sobre
  o formato dos metadados e a sincronização), painel de propriedades, "Variável…" no menu `/` e
  edição das propriedades pelo celular (o celular já lê o bloco e mostra os valores).
