# Recursos

Comportamento atual do editor. O resumo do produto está no [README](../README.md).

O ícone ☰, o nome do app e as abas ficam no cabeçalho. As abas rolam horizontalmente, limitam títulos longos com reticências e revelam o nome completo e um botão de fechar ao passar o mouse. O botão de fechar também aparece com foco de teclado. O seletor compacto de modos flutua no canto inferior direito. A biblioteca à esquerda lista todas as notas, mesmo as que estão sem aba aberta, permite buscar por nome e pode ser ocultada pelo botão no cabeçalho. Em telas estreitas começa recolhida. O menu organiza notas, arquivos e exibição em grupos, permite buscar ações e mostra os atalhos. Use as setas para navegar e Escape para fechar. O cabeçalho informa quando há gravações em andamento.

**Padrão** mostra títulos, ênfase, citações, listas, links, tags `#tag` e código estilizados nas linhas fora do cursor; a linha em edição mostra a sintaxe Markdown original. **Código** mostra todo o Markdown sem estilos; **Leitura** mostra o documento sem cursor de edição. O seletor usa ícones, mostra o nome do modo ao passar o mouse e aceita setas do teclado para alternar.

Ao selecionar texto no modo Padrão, uma barra discreta oferece negrito, itálico, código em linha, link, título H2, citação e lista. O botão de link pede o endereço na própria barra. Novas instalações começam com `Welcome.md`, uma nota de exemplo com esses estilos, listas, tabela, tags e bloco de código; notas já salvas continuam intactas.

A barra marca os estilos presentes na seleção; clicar em um botão ativo remove o estilo. Com o editor focado e o cursor de digitação em uma linha vazia, o botão `+` permite inserir títulos H2–H4, citação, listas, tabela e bloco de código. O menu principal mostra os atalhos das ações de criar e buscar notas.

No modo Padrão, tabelas aparecem como células até o cursor entrar nelas. Entrar em um bloco de código revela as duas cercas Markdown para edição. Blocos com linguagem conhecida recebem realce de sintaxe também na Leitura. Trechos como `normal *itálico*` são Markdown válido; estilos separados e aninhados são renderizados fora da linha ativa.

Enter no fim de uma lista continua o marcador ou a numeração; tarefas concluídas continuam com uma nova tarefa desmarcada; Enter em um item vazio encerra a lista. Isso também funciona para citações e no modo Código. No modo Padrão, as setas param nas cercas de um bloco de código antes de entrar no conteúdo. Clicar em uma célula da tabela revela o Markdown para editá-la. Links renderizados mostram a dica de abertura e abrem com Ctrl/Cmd + clique.

Nos modos Padrão e Código, digitar `(`, `[`, `{`, aspas simples, aspas duplas ou crase com texto selecionado envolve a seleção com o par correspondente. O texto permanece selecionado dentro dos delimitadores.

A primeira linha é sempre o título H1 (`# Título`): o app adiciona e preserva o prefixo `# ` automaticamente, inclusive após colar, apagar ou desfazer. O marcador fica oculto na edição visual e fora das seleções nos dois editores. O texto do título pode ser apagado inteiro, e o cursor pode sair dessa linha enquanto ela estiver vazia. Nessa situação, o nome atual do arquivo é preservado; digitar um novo título atualiza o nome novamente. Esse título define o nome da nota e do arquivo `.md` exportado. Alterá-lo renomeia a nota, inclusive com undo/redo. A importação e as notas já salvas também seguem essa regra. Caracteres proibidos em nomes de arquivo viram `-`; conflitos recebem um sufixo numérico. Sem H1, o nome atual permanece. A ação “Rename note” altera o H1 quando ele existe.

Use Ctrl/Cmd+F ou “Find in note” no menu para localizar texto na nota atual. Enter avança entre ocorrências e Shift+Enter retorna.

A Leitura usa `react-markdown` com `remark-gfm`: CommonMark, títulos H1–H6, listas aninhadas, tarefas, tabelas com alinhamento, texto riscado, links automáticos e de referência, notas de rodapé, imagens, separadores e blocos de código. HTML bruto não é executado. A edição sempre usa o texto original. Tarefas `- [ ]` e `- [x]` aparecem como checkboxes redondos e interativos na Leitura e nas linhas fora do cursor do modo Padrão.

### Imagens

Arraste ou cole imagens na nota, use **Biblioteca → Imagens → Adicionar imagens**, ou escolha **+ → Imagem** numa linha vazia. Essa opção oferece URL HTTPS e um campo para escolher ou arrastar arquivos. No desktop, o drop usa o evento nativo do Tauri: caminhos externos recebidos da janela são autorizados para uma única importação, e o arquivo é copiado antes da inserção do Markdown. O documento e o campo do menu `+` compartilham esse fluxo, inclusive para nomes com espaços e acentos. A imagem é inserida na seleção ou no cursor atual; no modo Padrão, soltar sobre o texto usa o ponto de queda. Ctrl/Cmd+Z desfaz a inserção, mantendo o arquivo na biblioteca como imagem sem uso. PNG, JPEG, GIF, WebP, AVIF e BMP são aceitos, até 20 MB por arquivo. Imagens externas usam URLs HTTPS e precisam de conexão para carregar; endereços HTTP não carregam no app desktop (a CSP só permite HTTPS). Imagens internas no desktop ficam em `assets/` na pasta de notas (ou no diretório de dados do app quando não há pasta escolhida), referenciadas por caminhos relativos no Markdown. No navegador ficam incorporadas na nota como data URLs.

A biblioteca permite visualizar, pesquisar pelo nome, filtrar imagens sem uso, renomear, baixar e inserir novamente uma imagem. A ficha mostra as notas que a utilizam. Imagens usadas por notas ou pela lixeira ficam protegidas contra exclusão. Nomes de exibição são independentes dos identificadores dos arquivos; as referências são preservadas durante a renomeação. Miniaturas carregam ao entrar na área visível, com cache limitado a 40 MB. No desktop também lista imagens das subpastas, até oito níveis; arquivos ocultos e links simbólicos são ignorados. No modo Padrão, imagens escritas sozinhas em uma linha são exibidas fora da linha em edição; a Leitura também suporta imagens em parágrafos e referências. O backup JSON completo inclui arquivos de imagens locais, inclusive imagens sem uso e referências da lixeira. A restauração recria os arquivos e atualiza seus caminhos no Markdown. Backups antigos continuam aceitos. Imagens externas permanecem URLs; seu conteúdo não é baixado para o backup.

Se dados salvos estiverem corrompidos, a aplicação bloqueia novas gravações para não sobrescrevê-los. A mensagem de erro oferece um download dos dados originais e uma ação explícita para substituí-los. Se o armazenamento falhar, o texto continua em memória até a página ser fechada; baixe o backup completo antes de fechar. A restauração valida o backup e pede confirmação antes de substituir as notas atuais. Com armazenamento bloqueado, a restauração fica em memória até a substituição explícita do armazenamento.

## Pasta de notas (desktop)

**Menu → Pasta de notas…** abre um diálogo com a pasta atual e o botão que chama o seletor nativo. Cada arquivo `.md` no nível superior da pasta é uma nota; subpastas, arquivos ocultos e arquivos que não são UTF-8 são ignorados e nunca alterados. Antes da troca, o app conclui as gravações e oferece **Copiar**, **Abrir sem copiar** ou **Cancelar**. Copiar leva as notas atuais e imagens, incluindo as de outra pasta conectada, preservando os originais. Todos os conflitos são verificados antes da cópia: arquivos iguais podem ser reaproveitados; arquivos diferentes com o mesmo nome interrompem a operação. Falhas durante a cópia removem os novos arquivos criados por ela. A nova pasta só é ativada depois do sucesso. Um registro de migração permite recuperar uma interrupção na próxima abertura: a configuração identifica se a operação terminou; arquivos novos sem alterações externas são removidos quando a operação não terminou. O aplicativo aceita apenas uma instância por vez para evitar gravações concorrentes. Abrir sem copiar carrega as notas da pasta escolhida e mantém a anterior intacta; Cancelar não troca de pasta. **Usar o armazenamento do app** volta ao armazenamento anterior, que continua intacto.

O nome do arquivo segue o primeiro H1, como no resto do app. Excluir uma nota apaga o arquivo e a guarda na lixeira do app até ser excluída em definitivo; só a lixeira apaga arquivos (restaurar um backup nunca remove arquivos que ele não menciona). As gravações usam um arquivo temporário oculto.

### Alterações externas

O app verifica a pasta a cada poucos segundos e ao recuperar o foco, e só relê o que mudou:

- **Nota sem edições locais:** o texto do disco a substitui.
- **Arquivo novo:** vira uma nota (sem abrir aba).
- **Arquivo apagado:** a nota some, se não tinha edições locais.
- **Editada nos dois lados:** nada é sobrescrito. Um diálogo pergunta se mantém a sua versão, usa a do disco ou mantém as duas (a do disco vira uma cópia `nome (disk).md`). Se o arquivo foi apagado, a escolha é recriá-lo com a sua versão ou apagar a nota.

## Idioma

O idioma padrão é português (Brasil); **Menu → Idioma** alterna para English. A escolha fica nas preferências, junto do tema. As mensagens técnicas de erro do sistema (por exemplo, falhas de disco) aparecem no idioma original.

## Links internos

`[[Nota]]` abre uma nota pelo nome, sem diferenciar maiúsculas. `[[Nota|rótulo]]` mostra um texto alternativo e `[[Nota#Título]]` navega até um título. Notas ausentes oferecem criação com confirmação. No modo Padrão, clique no link ou use Ctrl/Cmd+Enter com o cursor nele. Na Leitura, clique no link. Links em código ou escapados são texto literal. Ao renomear uma nota pelo menu ou pelo H1, referências internas em notas e na lixeira são atualizadas.

## Atalhos

O menu **Atalhos de teclado** lista as combinações. Use Ctrl no Windows/Linux ou Cmd no macOS.

| Ação                                              | Atalho                                    |
| ------------------------------------------------- | ----------------------------------------- |
| Nova nota / buscar nota / buscar texto            | Ctrl+T / Ctrl+P / Ctrl+F                  |
| Fechar aba / renomear / mover para lixeira        | Ctrl+W / Ctrl+Shift+R / Ctrl+Shift+Delete |
| Importar / exportar Markdown                      | Ctrl+I / Ctrl+E                           |
| Biblioteca de imagens / adicionar imagens         | Ctrl+Shift+I / Ctrl+Alt+I                 |
| Backup / pasta de notas (desktop)                 | Ctrl+Shift+S / Ctrl+Shift+O               |
| Mostrar ou ocultar biblioteca                     | Ctrl+\\                                   |
| Padrão / Código / Leitura                         | Ctrl+Alt+1 / Ctrl+Alt+2 / Ctrl+Alt+3      |
| Ajuda de atalhos                                  | Ctrl+Shift+/                              |
| Tamanho de texto: aumentar / diminuir / restaurar | Ctrl++ / Ctrl+- / Ctrl+0                  |
