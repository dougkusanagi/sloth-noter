# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- Tab e Shift+Tab em listas criam e desfazem sublistas (quatro espaços), com um item ou vários selecionados, nos modos Padrão e Código. Shift+Tab em itens sem recuo não faz nada; um item numerado que inicia uma sublista recomeça em 1.
- Seções recolhíveis: seta ao lado de cada título H2–H6 (Padrão e Leitura) e comandos “Recolher/Expandir todas as seções” na paleta.
- Linhas pontilhadas na margem que mostram o aninhamento de seções e de sublistas (Padrão e Leitura), sem gastar largura do texto.
- `Welcome.md` virou uma página de ajuda e exemplos (títulos, estilos, links, tags, imagem, citações, listas, tarefas, tabela, código, notas de rodapé e dicas). Pode ser excluída sem perda: o comando **Recriar página de ajuda** (Ctrl+K ou menu → Aplicativo) cria outra, no idioma da interface.
- Testes de todos os formatos Markdown nos modos Padrão e Leitura (E2E e unidade) e da página de ajuda.
- Janela de Configurações (Ctrl+,) com tema, idioma, tamanho do texto, abas, pasta de notas, backup e atalhos.
- Paleta de comandos (Ctrl+K) com todas as ações do app, separada da busca de notas (Ctrl+P). Substitui a busca dentro do menu.
- Alertas em toasts empilháveis (sonner): erros de gravação e de pasta com ações, importação e cópia de código.
- Arrastar arquivos `.md`, `.markdown` ou `.txt` para a janela os importa como notas (vários de uma vez; nomes repetidos pedem decisão, um por vez). No desktop o arquivo é lido pelo backend, só se veio do drop nativo.
- CI (versão, lint, formatação, testes, build, `cargo test`) e workflow de release com `.msi` e `.AppImage`.
- ESLint, Prettier e `.editorconfig`.
- Testes E2E (Playwright) e verificação de acessibilidade (axe) no CI.

### Corrigido

- Padrão e Leitura agora têm exatamente o mesmo layout (espaços entre blocos, entrelinhas, listas, tarefas, citações, tabelas, código, imagens e rodapé), então trocar de modo não move o texto; a Leitura mostra quebras simples de linha como quebras.
- Modo Padrão: tarefas e itens numerados aninhados ficavam sem recuo fora da linha em edição; o recuo segue a estrutura da lista e o texto de continuação de um item acompanha o item.
- Modo Padrão: escapes (`\*`) e quebras de linha com `\` mostravam a barra invertida; citações vazias (`>`) e aninhadas (`> >`) apareciam como texto; tabelas ignoravam o alinhamento das colunas.
- Modo Padrão: clicar abaixo de um título H5/H6 posicionava o cursor uma linha adiante (margem de linha não medida pelo CodeMirror).
- Leitura: tags `#tag` não eram destacadas.
- Falhas de disco no desktop apareciam como "Storage is unavailable"; agora mostram o erro real e, para pasta ausente, permissão negada, somente leitura e disco cheio, uma mensagem própria.
- Contraste de tags e realce de código no tema claro; papéis ARIA de tabela inválidos dentro do editor.

### Adicionado (desktop)

- Diálogo da pasta de notas e importação automática de alterações externas, com resolução de conflitos.
- Pasta de notas: cada nota é um `.md` numa pasta escolhida pelo usuário; abas, preferências e lixeira ficam no diretório de dados do app.

### Alterado

- Interface refeita: tipografia sem monoespaçada, janela de Configurações em duas colunas (tema, idioma e tamanho do texto com prévia, abas, biblioteca, dados, atalhos), paleta de comandos, biblioteca com prévia e busca no texto, grade de imagens, diálogos, menus, abas e toasts com o mesmo sistema visual (`src/ui.css`).
- Texto mais denso: títulos H1–H4 com diferença menor de tamanho e corpo padrão de 16 px (antes 18); o tamanho já salvo é mantido, use Restaurar nas Configurações.
- Atalhos que colidiam com ferramentas do navegador mudaram: biblioteca de imagens Ctrl+Shift+L (era Ctrl+Shift+I, que abre o inspetor), renomear F2 (era Ctrl+Shift+R, recarga forçada); "adicionar imagens" perdeu o atalho Ctrl+Alt+I e fica na paleta de comandos.
- Menu principal enxuto (sem preferências, que vão para Configurações); atalhos compactos, estado atual destacado e contagem da lixeira só quando há itens.
- Biblioteca e abas mostram o nome sem sintaxe Markdown inicial (`- [ ]`, `![[`, cercas de código); nomes sem texto aparecem como "Sem título". O arquivo não é alterado.
- Imagens externas só carregam por HTTPS (CSP e campo de URL); endereços HTTP deixam de carregar no app desktop.
- Abas e menu de contexto das abas extraídos de `main.jsx` para `components/tabs.jsx`.
- Interface em português (Brasil) por padrão, com English opcional no menu; confirmações e renomeação agora são diálogos do app (`window.prompt` não existe nos webviews do Tauri).
- Bun como gerenciador de pacotes; a versão vive em `package.json`.
- `visual-editor.jsx` e `main.jsx` divididos em módulos (`src/editor/`, `src/components/`).
- Documentação reduzida a README, `docs/RECURSOS.md` e `docs/ROADMAP.md`.

## [0.1.0]

- Editor Markdown com modos Padrão, Código e Leitura, abas, busca, lixeira, importação/exportação e backup.
- Aplicativo Tauri V2 com estado em arquivo versionado.
