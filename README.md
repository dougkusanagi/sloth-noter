# Sloth Note

Editor Markdown local e offline, em português (Brasil) ou inglês, com abas opcionais, busca de notas e de texto, e três modos: Padrão (estilo ao vivo), Código (Markdown puro) e Leitura.

## Ideia

Um **bloco de notas com Markdown**: o fluxo simples do Notepad do Windows — criar uma nota, escrever, fechar sem pensar em salvar — mas com compatibilidade real com Markdown, que é justamente o que o Notepad faz mal. Sem contas, sem nuvem, sem plugins. Cada decisão de produto passa por esta pergunta: isso deixa a nota mais rápida de criar e de fechar?

O produto final é um aplicativo desktop Tauri V2 que lê e grava arquivos `.md` em uma pasta escolhida pelo usuário. A versão web é a base funcional e um fallback com importação e exportação. Sincronização em nuvem está fora do escopo.

## Estado

- **Web:** as notas são gravadas no armazenamento do navegador a cada alteração.
- **Desktop:** o app abre offline, sem `localStorage`. Por padrão grava um arquivo de estado versionado (`state.v3.json`) no diretório de dados do aplicativo. Em **Configurações → Dados** (Ctrl+,) você escolhe uma pasta: cada nota vira um `.md` nela, e abas, preferências e lixeira ficam no diretório de dados do app. Alterações feitas por fora na pasta são importadas automaticamente. Veja o [roteiro](docs/ROADMAP.md) para o que falta.
- **Em ambos:** falhas de gravação aparecem como alertas empilháveis (toasts) com as ações possíveis; há importação/exportação `.md`, backup completo `.json` com imagens locais, lixeira persistente e renomeação. Links `[[Nota]]` conectam documentos; a biblioteca de imagens oferece busca, renomeação e exclusão de arquivos sem uso. Faça exportações para manter uma cópia fora do aplicativo.

Detalhes de comportamento, atalhos e limites do Markdown: [docs/RECURSOS.md](docs/RECURSOS.md).

## Desenvolvimento

Requisitos: [Bun](https://bun.sh) 1.4, Node.js 24 (executa os testes) e, para o desktop, Rust 1.82+ com as [dependências do Tauri](https://tauri.app/start/prerequisites/).

```sh
bun install
bun run dev            # site: porta 5173 ou próxima livre
bun run test           # testes de domínio (Node)
bun run e2e            # Playwright: fluxos principais e acessibilidade (axe); 1ª vez: bunx playwright install chromium
bun run lint           # ESLint; `bun run format` aplica o Prettier
bun run build          # gera dist/, sem exigir Rust
bun run desktop:dev    # Vite em porta livre + janela Tauri no mesmo endereço
bun run desktop:build  # AppImage no Linux; MSI no Windows
bun run desktop:test   # testes Rust do armazenamento nativo
```

## Release

A versão fica em `package.json` (o `tauri.conf.json` a lê de lá) e deve coincidir com `src-tauri/Cargo.toml`; `bun run version:check` confere.

```sh
git tag vX.Y.Z && git push --tags
```

O workflow de release gera um rascunho no GitHub com o instalador `.msi` (Windows) e o `.AppImage` (Linux). Os artefatos ainda não são assinados. O CI (`.github/workflows/ci.yml`) roda versão, testes e build a cada push e PR.
