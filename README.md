# Sloth Note

Um bloco de notas com Markdown para escrever, organizar ideias e fechar a janela sem pensar em salvar. Local, sem conta e com salvamento automático.

![Uma preguiça escrevendo com calma em um caderno](src/assets/welcome-sloth.png)

## Escreva do seu jeito

- **Três modos para a mesma nota:** Padrão, com Markdown formatado enquanto você escreve; Código, com o texto original; e Leitura.
- **Notas conectadas:** abas, links `[[Nota]]`, referências a títulos e lista de notas que apontam para o documento atual.
- **Busca onde precisar:** encontre notas pelo nome, pesquise no conteúdo de todas elas com trechos destacados ou busque e substitua dentro de uma nota.
- **Listas e tarefas:** sublistas, reordenação pelo teclado, visão de tarefas na biblioteca e controles para concluir as tarefas de uma seção.
- **Markdown além do básico:** tabelas editáveis, citações, notas de rodapé, blocos de código com realce de sintaxe e botão de copiar.
- **Imagens junto das ideias:** cole ou arraste arquivos, reutilize imagens da biblioteca e encontre as que estão sem uso.
- **Um espaço para se concentrar:** modo de foco, temas claro e escuro, fonte, tamanho e largura do texto ajustáveis. Interface em português do Brasil ou inglês.

## Primeiros passos

O aplicativo desktop usa **Tauri 2**. O fluxo de release prepara instaladores para **Windows** (`.exe`, NSIS) e **Linux** (`.AppImage`). Consulte as [releases do projeto](https://github.com/dougkusanagi/sloth-noter/releases) para os artefatos publicados. Os pacotes ainda não são assinados.

1. Abra o app e explore a nota **Welcome**, com exemplos editáveis dos recursos de Markdown.
2. Crie uma nota. A primeira linha com `# Título` também dá nome ao arquivo.
3. Para trabalhar com arquivos `.md` em uma pasta sua, abra **Configurações → Dados** e escolha a pasta de notas.

A página Welcome pode ser excluída. Para gerar uma cópia atualizada, abra a paleta com `Ctrl+K` e escolha **Recriar página de ajuda**.

### Atalhos para começar

Use `Ctrl` no Windows/Linux e `Cmd` no macOS. Atalhos como criar e fechar abas podem ser interceptados pelo navegador; no desktop, pertencem ao app.

| Ação                                 | Atalho                   |
| ------------------------------------ | ------------------------ |
| Nova nota                            | `Ctrl+T`                 |
| Encontrar nota pelo nome             | `Ctrl+P`                 |
| Buscar no conteúdo de todas as notas | `Ctrl+Alt+F`             |
| Buscar / substituir na nota atual    | `Ctrl+F` / `Ctrl+H`      |
| Paleta de comandos                   | `Ctrl+K`                 |
| Padrão / Código / Leitura            | `Ctrl+Alt+1` / `2` / `3` |
| Modo de foco                         | `Ctrl+Shift+F`           |
| Configurações                        | `Ctrl+,`                 |

A lista completa está em **Configurações → Atalhos** e na [documentação de recursos](docs/RECURSOS.md).

## Seus dados

**No desktop**, as notas ficam inicialmente no diretório de dados do aplicativo. Ao conectar uma pasta, cada nota vira um arquivo `.md`; imagens locais ficam em `assets/`. Preferências, abas e lixeira continuam no diretório do app. Alterações externas na pasta são detectadas, e conflitos de edição pedem uma escolha antes de sobrescrever o conteúdo.

**Na versão web**, as notas ficam no armazenamento do navegador. É possível importar e exportar Markdown e baixar um backup completo, mas a versão web não mantém uma pasta de arquivos sincronizada como o desktop.

**Em ambos**, você pode exportar notas `.md`, baixar e restaurar um backup `.json` com imagens locais e recuperar notas da lixeira. Imagens externas dependem de conexão; a ilustração da ajuda acompanha o app e carrega offline. Mantenha um backup fora do aplicativo, especialmente antes de limpar dados do navegador.

Não há conta nem sincronização em nuvem integrada. A pasta de notas pode ser mantida por uma ferramenta de sincronização escolhida por você.

## Rodar localmente

Requisitos da versão web: **Bun 1.4.2** e **Node.js 24 ou superior**.

```sh
bun install
bun run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

```sh
bun run test   # testes de domínio
bun run build  # build web em dist/
```

Para desenvolver o desktop, instale também Rust e os pré-requisitos do Tauri e execute `bun run desktop:dev`. Comandos de teste, instalação local, atualização e publicação estão no [guia de desenvolvimento](docs/DESENVOLVIMENTO.md).

## Documentação

- [Recursos, comportamento e atalhos](docs/RECURSOS.md)
- [Desenvolvimento, testes e releases](docs/DESENVOLVIMENTO.md)
- [Roteiro do projeto](docs/ROADMAP.md)
