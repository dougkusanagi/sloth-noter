# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- CI (versão, lint, formatação, testes, build, `cargo test`) e workflow de release com `.msi` e `.AppImage`.
- ESLint, Prettier e `.editorconfig`.
- Testes E2E (Playwright) e verificação de acessibilidade (axe) no CI.

### Corrigido

- Contraste de tags e realce de código no tema claro; papéis ARIA de tabela inválidos dentro do editor.

### Adicionado (desktop)

- Diálogo da pasta de notas e importação automática de alterações externas, com resolução de conflitos.
- Pasta de notas: cada nota é um `.md` numa pasta escolhida pelo usuário; abas, preferências e lixeira ficam no diretório de dados do app.

### Alterado

- Interface em português (Brasil) por padrão, com English opcional no menu; confirmações e renomeação agora são diálogos do app (`window.prompt` não existe nos webviews do Tauri).
- Bun como gerenciador de pacotes; a versão vive em `package.json`.
- `visual-editor.jsx` e `main.jsx` divididos em módulos (`src/editor/`, `src/components/`).
- Documentação reduzida a README, `docs/RECURSOS.md` e `docs/ROADMAP.md`.

## [0.1.0]

- Editor Markdown com modos Padrão, Código e Leitura, abas, busca, lixeira, importação/exportação e backup.
- Aplicativo Tauri V2 com estado em arquivo versionado.
