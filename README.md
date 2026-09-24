# Sloth Note

Editor Markdown local com abas opcionais, busca de notas e de texto na nota, e três modos: Padrão, Código e Leitura.

O MVP web está concluído. Pasta local, sincronização e aplicativo desktop permanecem no roadmap como trabalhos separados.

Base copiada de `../sloth-note-gpt`, commit `443d23c`, de 24/07/2026. `../sloth-note` foi consultado como referência complementar.

**Estado atual:** as notas são gravadas no armazenamento deste navegador a cada alteração. Falhas de gravação aparecem em um alerta; o estado também é anunciado a tecnologias assistivas. É possível importar e exportar `.md`, baixar e restaurar um backup completo `.json`, renomear notas, fechar abas sem apagar o texto e mover notas para uma lixeira que persiste após recarga. A lixeira permite restaurar ou apagar definitivamente. Ainda não há pasta local conectada nem sincronização. Faça exportações para manter uma cópia fora do navegador.

O ícone ☰, o nome do app e as abas ficam na header. As abas rolam horizontalmente. O seletor de modos flutua no canto direito da área do editor; quando falta espaço na margem, mostra só os ícones e reserva espaço acima do texto. O menu reúne as ações de notas e aparência; use as setas para navegar e Escape para fechar.

**Padrão** mostra títulos, ênfase, citações, listas, links, tags `#tag` e código estilizados nas linhas fora do cursor; a linha em edição mostra a sintaxe Markdown original. **Código** mostra todo o Markdown sem estilos; **Leitura** mostra o documento sem cursor de edição. O seletor usa ícones, exibe o nome de cada modo em telas largas e aceita setas do teclado para alternar.

Ao selecionar texto no modo Padrão, uma barra discreta oferece negrito, itálico, código em linha, link, título H2, citação e lista. O botão de link pede o endereço na própria barra. Novas instalações começam com `Welcome.md`, uma nota de exemplo com esses estilos, listas, tabela, tags e bloco de código; notas já salvas continuam intactas.

A barra marca os estilos presentes na seleção; clicar em um botão ativo remove o estilo. Ao passar o ponteiro por uma linha vazia ou colocar o cursor nela, o botão `+` permite inserir títulos H2–H4, citação, listas, tabela e bloco de código. O menu principal mostra os atalhos das ações de criar e buscar notas.

No modo Padrão, tabelas aparecem como células até o cursor entrar nelas. Entrar em um bloco de código revela as duas cercas Markdown para edição. Blocos com linguagem conhecida recebem realce de sintaxe também na Leitura. Trechos como `normal *itálico*` são Markdown válido; estilos separados e aninhados são renderizados fora da linha ativa.

Enter no fim de uma lista continua o marcador ou a numeração; Enter em um item vazio encerra a lista. Isso também funciona para citações e no modo Código. No modo Padrão, as setas param nas cercas de um bloco de código antes de entrar no conteúdo. Clicar em uma célula da tabela revela o Markdown para editá-la. Links renderizados mostram a dica de abertura e abrem com Ctrl/Cmd + clique.

Nos modos Padrão e Código, digitar `(`, `[`, `{`, aspas simples, aspas duplas ou crase com texto selecionado envolve a seleção com o par correspondente. O texto permanece selecionado dentro dos delimitadores.

O primeiro H1 (`# Título`) define o nome da nota e do arquivo `.md` exportado. Alterá-lo renomeia a nota, inclusive com undo/redo. A importação e as notas já salvas também seguem essa regra. Caracteres proibidos em nomes de arquivo viram `-`; conflitos recebem um sufixo numérico. Sem H1, o nome atual permanece. A ação “Rename note” altera o H1 quando ele existe.

Use Ctrl/Cmd+F ou “Find in note” no menu para localizar texto na nota atual. Enter avança entre ocorrências e Shift+Enter retorna.

A leitura oferece um subconjunto de Markdown: títulos H1–H4, parágrafos, ênfase, links HTTP/HTTPS e `mailto:`, tags `#tag`, citações, listas, tabelas e cercas de código. HTML bruto permanece texto. A edição sempre usa o texto original.

Se dados salvos estiverem corrompidos, a aplicação bloqueia novas gravações para não sobrescrevê-los. A mensagem de erro oferece um download dos dados originais e uma ação explícita para substituí-los. Se o armazenamento falhar, o texto continua em memória até a página ser fechada; baixe o backup completo antes de fechar. A restauração valida o backup e pede confirmação antes de substituir as notas atuais. Com armazenamento bloqueado, a restauração fica em memória até a substituição explícita do armazenamento.

## Executar

Ambiente verificado: Node.js 24.21.0 e npm 11.19.0.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

`npm test` verifica armazenamento, migrações, lixeira, backup, títulos, sintaxe visual, corrupção e falha de gravação. `npm run build` gera o site.

## Documentação

- [Relatório técnico e de produto](docs/RELATORIO.md): comparação das bases, problemas, melhorias e adições.
- [Plano de implementação](docs/PLANO.md): sequência, limites e critérios de aceite. O [arquivo `IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) também fica em `docs`.
