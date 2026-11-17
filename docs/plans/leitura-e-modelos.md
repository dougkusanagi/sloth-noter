# Plano: tipografia de leitura, modelos e variáveis

Tipo: tarefa

## Objetivo

1. Deixar o texto renderizado (modo Padrão e Leitura) mais agradável de ler: hierarquia clara entre
   corpo e títulos, espaçamento com ritmo e detalhes tipográficos cuidados, em claro e escuro, no
   desktop e no celular.
2. Oferecer **modelos** de nota (começando por um modelo de tarefas bem estruturado) e **variáveis** que mostram dados da nota, como última atualização e criação.

## Restrições que o plano precisa respeitar

- **Padrão e Leitura têm as mesmas medidas.** Um teste E2E compara as posições dos blocos
  (`docs/RECURSOS.md`, linha 45). Toda regra tipográfica vale para `.visual-editor .cm-md-*` **e**
  para `.markdown` (`src/styles.css`), com as mesmas unidades.
- **O espaço entre blocos vem das linhas em branco do Markdown** (`--gap` × `--line`). O espaço
  extra só pode vir de `padding` dentro da linha, como já fazem `.cm-md-paragraph` (0.18em) e os
  títulos H2–H6 (0.8em em cima, 0.35em embaixo, `src/styles.css:2200`).
- **Guias, setas de recolher e alça de bloco seguem as linhas** (commit `cb197c5`). Mudanças de
  `padding` e `line-height` nos títulos precisam manter `.cm-fold-toggle` centralizado e as guias
  alinhadas (`e2e/rails.spec.js`).
- O CodeMirror reescreve `class` e `style` das linhas (`MEMORY.md`): estilos por linha ficam no CSS,
  não em atributos.
- Use `em` e tokens: o tamanho da fonte vai de 12 a 24 px (`FONT_SIZE`, `src/storage.js:5`).
- Contraste mínimo: corpo do texto ≥ 7:1 (AAA); texto secundário ≥ 4.5:1, nos dois temas.
- Cada commit incrementa a versão e registra Novidades (`AGENTS.md`); novidades visuais levam
  captura em `public/changelog/`. PR com mudança visual leva capturas de antes e depois.

## Parte 1 — Tipografia e espaçamento

### 1.1 Hierarquia de cor (o pedido principal)

Hoje corpo e títulos usam a mesma cor `--ink` (14.7:1 sobre `--bg`). O destaque dos títulos vem só
de tamanho e peso.

- Criar tokens de texto: `--text-body`, `--text-heading`, `--text-secondary`.
  - Claro: corpo `#3d3b35` (10.4:1), títulos `--ink` `#23221e` (14.7:1).
  - Escuro: corpo `#cfcbc2` (11.1:1), títulos `--ink` `#ece9e2` (14.8:1). No escuro a redução
    ajuda mais, porque texto claro em fundo escuro "brilha" e cansa.
- Negrito (`strong`) usa `--text-heading`, para continuar se destacando do corpo mais suave.
- Citações, marcadores de lista e notas de rodapé usam `--text-secondary` (hoje `--muted`, 5.5:1
  no claro); conferir se a citação não fica apagada demais ao lado do corpo novo.
- Teste unitário que lê os tokens de `styles.css` e confere as razões de contraste dos pares, para
  ninguém baixar o contraste sem perceber.

### 1.2 Escala e forma dos títulos

- H4, H5 e H6 têm hoje o mesmo tamanho e peso do corpo (só 600). Diferenciar:
  - H4: 1.05em, peso 650.
  - H5: versalete ou maiúsculas pequenas (0.8em, `letter-spacing: 0.06em`, fonte da interface).
  - H6: 0.9em, itálico ou `--text-secondary`.
- H1–H3: pesos variáveis da Noto Serif (650–700) em vez de 600 fixo; `letter-spacing` levemente
  negativo também em H2 (-0.01em).
- Títulos que quebram em duas linhas ficam soltos com `line-height` 1.62. Testar `line-height`
  1.3 só nos títulos, compensando com `padding` para manter a altura total da primeira linha (as
  guias dependem dela).
- `text-wrap: balance` nos títulos, para não sobrar uma palavra sozinha na segunda linha.

### 1.3 Ritmo vertical (proximidade)

- Mais espaço **acima** do título do que abaixo, para o título "pertencer" ao texto seguinte:
  H2 ≈ 1.4em em cima / 0.3em embaixo; H3 ≈ 1em / 0.25em; H4–H6 ≈ 0.7em / 0.2em.
- Primeiro bloco depois de um título sem espaço extra em cima.
- Itens de lista com um respiro menor que parágrafos (ex.: 0.08em), para a lista ler como grupo.
- Conferir o espaço entre o título da nota (primeira linha) e o corpo.

### 1.4 Largura da linha

- 760 px a 16 px de serifa dão ~90 caracteres por linha; o confortável é 60–75. Opções:
  - mudar o padrão de `CONTENT_WIDTH` para ~680 px; ou
  - limitar parágrafos, listas e citações a `70ch` e deixar tabelas, código, imagens e colunas na
    largura toda.
- A segunda opção muda as medidas entre blocos, então é preciso conferir guias e o teste de
  posições. Decidir com a pessoa (ver Dúvidas).

### 1.5 Detalhes de texto

- `text-wrap: pretty` em parágrafos (evita palavra órfã na última linha). Melhoria progressiva:
  conferir no WebKitGTK (Linux), WebView2 (Windows) e Android WebView, e se o cursor do CodeMirror
  continua no lugar certo.
- Algarismos: `font-variant-numeric: tabular-nums` em tabelas; no corpo, testar `oldstyle-nums`.
  Conferir antes se a Noto Serif Variable instalada tem esses recursos.
- No tema escuro, peso do corpo um pouco menor (ex.: 380 em vez de 400), porque texto claro
  parece mais grosso.
- `hyphens: auto` com `lang` da nota: só se ficar igual nos dois modos; deixar para o fim.

### 1.6 Elementos inline

- **Links**: sublinhado fino (`text-decoration-thickness: 1px`, `text-underline-offset: 0.2em`,
  cor do sublinhado com 40% do destaque), cheio ao passar o mouse ou com foco.
- **Código inline**: fundo mais suave, raio menor, `padding` horizontal em `em`; sem mudar a altura
  da linha.
- **Tags `#tag`**: pílula discreta, com cor própria nos dois temas.
- **Riscado e tarefas feitas**: texto em `--text-secondary`, risco na cor do texto com opacidade.

### 1.7 Blocos

- **Citação**: barra com a cor do destaque bem suave ou `--soft` mais forte; texto em corpo, não
  em `--muted`, com itálico opcional; citação aninhada com a mesma lógica.
- **Separador (`---`)**: linha mais curta e centralizada (ex.: 30% da largura) ou ornamento `⁂`,
  mantendo a altura de uma linha.
- **Listas**: marcadores diferentes por nível (•, ◦, ▪) e numeração em `--text-secondary` com
  `tabular-nums`.
- **Tabelas**: cabeçalho com borda inferior mais forte e peso 600; linhas com bordas suaves;
  números à direita já seguem o alinhamento da coluna.
- **Blocos de código**: borda `--edge` e raio `--radius-sm`; no claro, `--paper` quase some sobre
  `--bg`.
- **Imagens**: raio pequeno; legenda opcional a partir do `title` do Markdown (decidir depois).
- **Notas de rodapé**: menores e em `--text-secondary`, com separador acima.

### 1.8 Celular

- Conferir `src/mobile/mobile.css`: margens laterais de 16–20 px, mesmo ritmo, títulos que não
  quebram mal em 360–390 px de largura.

### 1.9 Opcional: preferência de estilo

- Depois de acertar o padrão, avaliar uma opção em **Exibição** (`display-menu.jsx`), por exemplo
  "Contraste do texto: suave / alto". Só se a pessoa quiser; a meta é um padrão bom sem ajustes.

### Verificação da Parte 1

- Capturas "antes" (claro, escuro, 390 px e 1280 px) de uma nota de teste com todos os elementos
  (a `Welcome.md` serve), antes de editar o CSS.
- `bun run e2e` (posições Padrão × Leitura e guias), testes unitários, `bun run lint`,
  `bun run format:check`.
- Capturas "depois" nas mesmas condições, com tamanho de fonte 12, 16 e 24.
- Fragmento em `changelog/unreleased/` com captura recortada em `public/changelog/`.

## Parte 2 — Modelos de nota

### 2.1 Como a pessoa usa

- **Nova nota a partir de modelo**: botão de nova nota com opção "A partir de modelo…", item na
  paleta de comandos e no menu principal. Abre um seletor com busca, lista à esquerda e prévia
  renderizada (`.markdown`) à direita; no celular, uma folha com a lista e a prévia ao tocar.
- **Inserir modelo na nota atual**: item "Modelo…" no menu `/` (`src/insert-block.js`).
- O cursor vai para o lugar marcado no modelo (`{{cursor}}`), ou para o título.

### 2.2 Modelos que acompanham o app

Traduzidos pelo `i18n.js`, recriáveis como a `Welcome.md` ("Recriar modelos padrão").

- **Tarefas / projeto** (o pedido): título; linha "Criado em {{date}}"; Objetivo; Critério de
  pronto; Tarefas com os status do ADR 0004 (`[ ]`, `[/]`, `[>]`, `[x]`, `[-]`) e prazos;
  Esperando/bloqueios; Decisões; Registro datado; Links. Um bloco recolhível (ADR 0007)
  "Como usar este modelo" explica os status, como escrever uma tarefa boa (verbo no início, um
  resultado verificável, prazo, responsável) e pode ser apagado.
- **Reunião**: data e hora, participantes, pauta, anotações, decisões, próximos passos com
  responsável e prazo.
- **Diário**: data por extenso, três prioridades, anotações, pendências para amanhã.
- **Quadro de projeto**: estrutura pronta para o modo quadro (ADR 0006).
- **Estudo / resumo**: perguntas, anotações, resumo final (estilo Cornell).
- **Decisão**: contexto, opções, decisão, consequências.

### 2.3 Variáveis de inserção (trocadas uma vez, ao criar)

Sintaxe compatível com o plugin de Modelos do Obsidian, porque a pasta pode ser usada nele:

| Variável              | Resultado                                      |
| --------------------- | ---------------------------------------------- |
| `{{title}}`           | nome da nota                                   |
| `{{date}}`            | data de hoje no formato do idioma (16/11/2026) |
| `{{time}}`            | hora atual (14:30)                             |
| `{{date:YYYY-MM-DD}}` | data com formato próprio                       |
| `{{cursor}}`          | onde o cursor fica (não aparece no texto)      |

Extensões do Sloth Note, depois da primeira entrega: `{{date+7d}}` (prazo daqui a uma semana),
`{{weekday}}`, `{{profile}}`. Variável desconhecida fica como está, sem erro.

### 2.4 Onde os modelos da pessoa ficam

A pasta de notas hoje é plana. Opções (ver Dúvidas):

- **A.** Subpasta `Modelos/` na pasta de notas: igual ao Obsidian e editável fora do app, mas a
  leitura da pasta e a sincronização precisam passar a enxergar subpastas.
- **B.** Notas comuns marcadas como modelo (ação "Usar como modelo", guardada nos metadados):
  sincroniza sem mudanças, mas o modelo aparece na lista de notas.
- **C.** Arquivos no diretório de dados do app: simples, mas não sincroniza nem acompanha a pasta.

Recomendação: começar só com os modelos embutidos e decidir A ou B antes da fase de modelos
próprios. A escolha vai para um ADR.

## Parte 3 — Variáveis

Mostram um valor calculado sempre que a nota é exibida. O arquivo guarda só o marcador; nada é
reescrito no arquivo, então o campo não gera alterações nem conflitos de sincronização.

### 3.1 Sintaxe

Precisa ser distinta das variáveis de inserção, para o modelo poder conter as duas. Proposta:
`{{=nome}}`, com chaves em inglês (iguais em qualquer idioma) e rótulo traduzido na tela.

| Campo                   | Mostra                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `{{=updated}}`          | última alteração ("hoje, 14:30" / "há 3 dias")             |
| `{{=created}}`          | criação da nota                                            |
| `{{=today}}`            | data de hoje                                               |
| `{{=words}}`            | número de palavras                                         |
| `{{=reading}}`          | tempo de leitura estimado                                  |
| `{{=tasks}}`            | progresso das tarefas ("7 de 12"), reutilizando `tasks.js` |
| `{{=until:2026-12-01}}` | dias até a data ("faltam 15 dias" / "venceu há 2 dias")    |

- No modo Padrão aparece como um chip; com o cursor dentro, mostra o texto cru (como os outros
  marcadores, `live-decorations.js`). Na Leitura, o chip renderizado.
- Só texto: nada de HTML nem execução de código. Campo desconhecido aparece cru, com dica.
- Formato de data e número pelo `Intl` do idioma ativo.
- Inserção pelo menu `/` ("Variável…"), para a pessoa não precisar decorar nomes.
- Em outros editores o marcador aparece cru; avaliar depois "Copiar com valores" ao exportar.

### 3.2 Variáveis do documento e da pessoa

- Usar **Variável** como nome do componente na interface. O seletor oferece dois grupos:
  **Documento** (criação, atualização, contagens e outros valores calculados) e **Personalizadas**.
- Proposta de sintaxe: manter `{{=updated}}` para as variáveis do documento e usar
  `{{=user.responsavel}}` para as personalizadas. O prefixo evita colisões com nomes reservados.
- Na primeira entrega, as personalizadas pertencem à nota e vêm do frontmatter. Variáveis globais
  por perfil ficam fora do escopo inicial: exigem definir armazenamento, sincronização e precedência.
- O seletor mostra nome e prévia do valor; permite criar uma propriedade quando ela não existe.
  A mesma variável pode aparecer várias vezes e reflete a propriedade atual sem reescrever o corpo.
- Começar com texto, números, booleanos, datas e listas simples. Definir apresentação de cada tipo;
  preservar tipos não suportados no YAML, sem convertê-los silenciosamente em texto.
- Valor ausente ou inválido mantém o marcador visível com uma indicação útil; não inventar valor.
  Não executar expressões, scripts, HTML nem interpolação recursiva entre variáveis.

### 3.3 Frontmatter YAML e propriedades

- Oferecer **Inserir propriedades (YAML)** no menu da nota e na paleta. Se já houver frontmatter,
  abrir o existente. No modo Padrão, mostrar um painel compacto e recolhível de propriedades acima
  do título; no modo Código, permitir editar o YAML diretamente.
- O bloco fica no início do arquivo, delimitado por `---`, antes do título Markdown. Exemplo:

```markdown
---
responsavel: Ana
projeto: Site novo
prazo: '2026-12-01'
tags:
  - trabalho
---

# Planejamento

Responsável: {{=user.responsavel}}
Projeto: {{=user.projeto}}
```

- Recomenda-se usar as propriedades de primeiro nível como variáveis personalizadas: facilita
  editar em outros aplicativos e evita exigir uma estrutura exclusiva do Sloth Note. Isso é uma
  proposta de interoperabilidade, sem prometer compatibilidade com plugins ou sintaxes do Obsidian.
- A interface permite adicionar, renomear, editar e remover propriedades, com tipo e validação.
  Antes de renomear ou remover, informar referências afetadas; não substituir ocorrências de texto
  indiscriminadamente. Modelos podem incluir propriedades e valores iniciais.
- Diferenciar metadados declarados pela pessoa dos dados reais do documento: uma propriedade
  `updated` não altera a última atualização calculada pelo app. Datas no YAML usam ISO; exibição
  segue o idioma ativo. Decidir o tratamento de datas e fusos antes da implementação.
- YAML inválido deve continuar editável e preservado, com erro localizado; suspender edições pelo
  painel até corrigir. Rejeitar chaves duplicadas e limitar aliases, profundidade e tamanho ao ler.
  Nunca usar carregamento de objetos executáveis. Avaliar dependências instaladas antes de escolher
  um parser; não implementar um parser YAML parcial com expressões regulares.
- Preservar propriedades desconhecidas, comentários e formatação ao editar pelo painel; avaliar
  parser com suporte a documento/AST. Se a edição sem perdas não for viável, definir explicitamente
  a limitação antes de habilitar a escrita pelo painel.
- Auditar todos os fluxos que hoje pressupõem título na primeira linha: criação, normalização,
  renomeação, navegação, editor, leitura, busca, modelos, importação/exportação e sincronização.
  Distinguir frontmatter de separadores no corpo e de blocos de código. Contagens de palavras e
  tarefas excluem os metadados. O título continua obrigatório depois do frontmatter.
- Registrar ADR antes de implementar o contrato de arquivo e as regras de resolução. Este plano
  ainda não altera o formato dos arquivos existentes.
- Testes: YAML válido/inválido, chaves duplicadas, caracteres acentuados, vazio, listas, datas,
  propriedades desconhecidas, preservação de comentários, colisão de nomes e referências ausentes;
  ida e volta por arquivo/sincronização, título depois do YAML e painel em desktop e celular.

### 3.4 Dados que faltam

- `modifiedAt` já existe (`src/storage.js`, `src/sync/document.js`). Conferir se muda só quando o
  texto muda e se é o mesmo entre aparelhos sincronizados.
- **Não existe data de criação.** Opções: `createdAt` nos metadados da nota (definido ao criar,
  sincronizado); data de criação do arquivo como alternativa para notas antigas, quando o sistema
  oferecer; sem nenhuma das duas, "data de criação desconhecida". A escolha vai para um ADR,
  porque muda o formato dos metadados e do protocolo de sincronização (ADR 0018).

## Parte 4 — Prazos em tarefas (ligada ao modelo de tarefas)

O ADR 0004 já segue o plugin Tasks do Obsidian para os status. Seguir o mesmo para datas:
`📅 2026-11-20` (prazo), `⏳` (agendada), `🛫` (início), `✅ 2026-11-16` (concluída).

- Renderizar a data como chip ("vence amanhã", "atrasada há 2 dias"), com cor por situação e
  texto, não só cor.
- Inserir prazo pelo menu `/` ou atalho, com seletor de data nativo.
- Opção para gravar `✅ data` ao marcar como feita.
- Biblioteca de tarefas (`tasks-library.jsx`) ordenada e filtrada por prazo.
- Requer ADR (formato de dados no arquivo).

## Ordem de entrega sugerida

1. Parte 1.1–1.3 (cor, títulos, ritmo): maior efeito, menor risco.
2. Parte 1.5–1.8 (detalhes, inline, blocos, celular).
3. Parte 2 com modelos embutidos e variáveis de inserção.
4. Parte 3.3 (frontmatter e propriedades, ADR), depois variáveis personalizadas e do documento:
   `updated`, `today`, `words`, `reading`, `tasks`, `until`.
5. `createdAt` (ADR) e `{{=created}}`.
6. Parte 4 (prazos, ADR).
7. Modelos próprios da pessoa (ADR sobre onde ficam).
8. Opcionais: largura em `ch`, preferência de contraste, hifenização, legendas.

Cada etapa é uma entrega com versão, Novidades e capturas próprias.

## Progresso

- 1.1 (tokens `--text-body`, `--text-heading`, `--text-secondary`, teste de contraste) e a parte da 1.2 sobre H4–H6, `text-wrap: balance` e pesos 650: entregues na 0.14.0.
- Falta da 1.2: `line-height` menor nos títulos de duas linhas.
- 1.3, espaço acima e abaixo dos títulos no modo Padrão (H2 1,4/0,3 em; H3 1/0,25 em; H4–H6 0,7/0,2 em), entregue na 0.17.1. Falta o respiro menor dos itens de lista e o primeiro bloco depois do título sem espaço extra.

- 1.5 (parcial), 1.6, 1.7 (citação, separador, listas, tabelas) e 1.8 entregues na 0.17.2: `text-wrap: pretty`, peso 380 no escuro, `tabular-nums`, links, código inline, tags, riscado, barra da citação, separador de 30%, marcadores por nível (só na Leitura), cabeçalho de tabela mais forte (só na Leitura). O celular já usava margens de 16 px. Ficaram de fora: `oldstyle-nums`, `hyphens`, borda dos blocos de código, legenda de imagem e notas de rodapé; marcadores por nível e cabeçalho de tabela no modo Padrão (a tabela do Padrão é outro componente).

- Parte 2 entregue nas 0.18.0 e 0.19.0: seis modelos embutidos (Tarefas e projeto, Quadro de projeto, Reunião, Diário, Decisão, Estudo e resumo) em pt-BR e en; variáveis `{{title}}`, `{{date}}`, `{{time}}`, `{{weekday}}`, `{{date±Nd}}`, `{{date:FORMATO}}` e `{{cursor}}`; seletor com busca e prévia (menu, aba Notas e paleta); "Modelo…" no menu `/`; e, no celular, botão de modelo na lista e "Modelo" em Inserir. Na 0.20.0: `{{profile}}` e modelos da pessoa como notas marcadas ([ADR 0026](../adr/0026-modelos-proprios-como-notas-marcadas.md)); falta a marca pelo celular.
- Na 0.20.0 também: `hyphens: auto` nos parágrafos, borda fina nos blocos de código e notas de rodapé menores na Leitura. `oldstyle-nums` não existe na Noto Serif Variable instalada (tem só `tnum` e `pnum`), então foi descartado. Na 0.21.0 também: legenda de imagem (título Markdown) nos dois modos, marcadores por nível e cabeçalho de tabela mais forte no modo Padrão. Fica de fora só `oldstyle-nums` (a fonte não tem o recurso).
- 1.2 entregue na 0.21.0: títulos H2–H6 com `line-height` 1,3; 0,16 em de `padding` em cima e embaixo mantém a altura de um título de uma linha (1,3 + 2 × 0,16 = 1,62), então guias, alças e setas continuam na grade. Verificado por medida: H2 de uma linha com 3,32 em como antes; as linhas extras de um título longo ficam 0,32 em mais curtas.
- Respiro das listas e primeiro bloco depois do título (1.3): já atendidos; os itens de lista não têm espaço extra, ao contrário dos parágrafos (0,18 em), e o parágrafo depois do título só tem o espaço do título.

## Tentativas que falharam

- Nenhuma ainda.

## Dúvidas abertas

- Largura da linha: mudar o padrão para ~680 px, limitar só o texto a `70ch` ou manter 760 px?
- Modelos próprios: subpasta `Modelos/` (A) ou notas marcadas como modelo (B)?
- Sintaxe das variáveis: `{{=nome}}` serve, ou prefere outra (ex.: compatível com o
  Dataview do Obsidian, `` `= this.file.mtime` ``, mais longa)?
- Prazos com emojis do plugin Tasks (compatível com o Obsidian) ou uma sintaxe própria em texto
  (ex.: `prazo: 20/11`)?
- O modelo de tarefas deve abrir no modo quadro ou como lista?

- Confirmar a sintaxe `{{=user.nome}}` e a proposta de propriedades de primeiro nível no YAML.
- Definir quais tipos de propriedade entram na primeira entrega e a política de edição sem perdas.

## Próximo passo

Seguir para a Parte 3.3 (frontmatter e propriedades, com ADR). Responder antes às dúvidas de sintaxe das variáveis. Responder às dúvidas de largura (1.4) e de sintaxe antes das partes que dependem delas.
