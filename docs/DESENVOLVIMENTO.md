# Desenvolvimento e releases

[Voltar ao README](../README.md)

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
bun run desktop:build  # AppImage no Linux; NSIS no Windows
bun run desktop:test   # testes Rust do armazenamento nativo
bun run desktop:update # atualiza o AppImage (Linux) ou instala silenciosamente no Windows (NSIS)
```

No Linux, `desktop:update` encontra o Sloth Note pelo `TryExec` do atalho `.desktop` (respeitando `XDG_DATA_HOME`), independentemente da pasta escolhida no Gear Lever. Ele mantém os argumentos e ações do atalho, atualiza os tipos de arquivo aceitos e acrescenta o repasse de arquivos ao app quando ausente. A lista de aplicativos do sistema é renovada com `update-desktop-database` (pacote `desktop-file-utils`). O binário anterior e o atalho alterado ficam em `.previous`; a substituição do binário é atômica. Feche e reabra o app após atualizar.

No Windows, o comando compila um instalador NSIS (`.exe`) e o executa com `/S`, sem assistente de instalação. A instalação é feita para o usuário atual, normalmente em `%LOCALAPPDATA%\Sloth Note`, sem exigir administrador para instalar o aplicativo. Também funciona na primeira instalação e ao recompilar a mesma versão. Feche o Sloth Note antes de executar: se o editor estiver aberto, a instalação é interrompida para preservar alterações ainda não salvas. São necessários os pré-requisitos de build do Tauri para Windows (Rust, Visual Studio Build Tools com C++ e WebView2).

Se houver uma instalação MSI anterior, desinstale-a uma vez pelas Configurações do Windows antes de usar o comando; essa remoção pode exigir administrador. O comando detecta esse caso antes de compilar e informa como migrar. A pasta de notas e os dados do aplicativo continuam usando o mesmo identificador (`dev.slothnote.app`).

Em ambos os sistemas, use `bun run desktop:update --dry-run` para conferir os caminhos sem compilar nem instalar, ou `bun run desktop:update --skip-build` para usar o artefato já compilado da versão e arquitetura atuais. No Windows, o arquivo esperado fica em `src-tauri/target/release/bundle/nsis/Sloth Note_<versão>_<arquitetura>-setup.exe`.

## Release

Toda alteração de comportamento do app deve atualizar a seção **Não lançado** do `CHANGELOG.md` no mesmo conjunto de commits, descrevendo o efeito para o usuário. Mudanças de planejamento também devem atualizar o roteiro e ser identificadas como futuras, sem serem apresentadas como recursos disponíveis.

A versão fica em `package.json` (o `tauri.conf.json` a lê de lá) e deve coincidir com `src-tauri/Cargo.toml`; `bun run version:check` confere.

```sh
git tag vX.Y.Z && git push --tags
```

O workflow de release gera um rascunho no GitHub com o instalador NSIS `.exe` por usuário (Windows) e o `.AppImage` (Linux). Os artefatos ainda não são assinados. O CI (`.github/workflows/ci.yml`) roda versão, testes e build a cada push e PR.
