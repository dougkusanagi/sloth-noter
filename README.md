# Sloth Note

Editor Markdown local e offline, com abas opcionais, busca de notas e de texto, e três modos: Padrão (estilo ao vivo), Código (Markdown puro) e Leitura.

O produto final é um aplicativo desktop Tauri V2 que lê e grava arquivos `.md` em uma pasta escolhida pelo usuário. A versão web é a base funcional e um fallback com importação e exportação. Sincronização em nuvem está fora do escopo.

## Estado

- **Web:** as notas são gravadas no armazenamento do navegador a cada alteração.
- **Desktop:** o app abre offline e grava um arquivo de estado versionado (`state.v3.json`) no diretório de dados do aplicativo, sem `localStorage`. A pasta local com `.md` ainda não está conectada; veja o [roteiro](docs/ROADMAP.md).
- **Em ambos:** falhas de gravação aparecem em um alerta; há importação/exportação `.md`, backup completo `.json`, lixeira persistente e renomeação. Faça exportações para manter uma cópia fora do aplicativo.

Detalhes de comportamento, atalhos e limites do Markdown: [docs/RECURSOS.md](docs/RECURSOS.md).

## Desenvolvimento

Requisitos: [Bun](https://bun.sh) 1.4, Node.js 24 (executa os testes) e, para o desktop, Rust 1.82+ com as [dependências do Tauri](https://tauri.app/start/prerequisites/).

```sh
bun install
bun run dev            # site em http://localhost:5173
bun run test           # testes de domínio (Node)
bun run lint           # ESLint; `bun run format` aplica o Prettier
bun run build          # gera dist/, sem exigir Rust
bun run desktop:dev    # janela Tauri
bun run desktop:test   # testes Rust do armazenamento nativo
```

## Release

A versão fica em `package.json` (o `tauri.conf.json` a lê de lá) e deve coincidir com `src-tauri/Cargo.toml`; `bun run version:check` confere.

```sh
git tag vX.Y.Z && git push --tags
```

O workflow de release gera um rascunho no GitHub com o instalador `.msi` (Windows) e o `.AppImage` (Linux). Os artefatos ainda não são assinados. O CI (`.github/workflows/ci.yml`) roda versão, testes e build a cada push e PR.
