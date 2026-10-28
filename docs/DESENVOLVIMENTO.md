# Desenvolvimento e releases

[Voltar ao README](../README.md)

## Desenvolvimento

Antes de fechar uma etapa, execute localmente `bun run test`, `bun run desktop:test` e
`bun run e2e` (desktop e mobile). Use testes afetados a cada incremento e a suíte completa antes de
commit em `main` e do push da etapa. Lint, build e versão são verificações complementares. Não
depender de CI nem alterar workflows de testes para validar uma entrega.

E2E com ponte nativa simulada não valida o armazenamento dentro da janela Tauri ou os eventos de
ciclo de vida Android. Os testes Rust verificam o backend local; fluxos de integração ainda exigem
o aplicativo nativo. Para Android, registrar ambiente e evidências conforme o
[plano de execução](plans/mobile-interface.md) e a matriz do [ADR 0003](adr/0003-spike-ime-mobile.md).
O histórico desktop já foi entregue; seu contrato está no [ADR 0002](adr/0002-historico-de-alteracoes.md)
e o uso em [Recursos](RECURSOS.md#histórico-local-de-alterações-desktop), sem plano de execução pendente.

Requisitos: [Bun](https://bun.sh) 1.4, Node.js 24 (executa os testes) e, para o desktop, Rust 1.85+ com as [dependências do Tauri](https://tauri.app/start/prerequisites/).

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

Toda alteração de comportamento do app deve criar ou atualizar um fragmento em `changelog/unreleased/` no mesmo commit, descrevendo o efeito para o usuário. Novidades e o documento Markdown aberto pelo app leem essas fontes e `CHANGELOG.md`. Mudanças de planejamento também devem atualizar o roteiro e ser identificadas como futuras, sem serem apresentadas como recursos disponíveis.

A versão fica em `package.json` (o `tauri.conf.json` a lê de lá) e deve coincidir com `src-tauri/Cargo.toml`; `bun run version:check` confere.

```sh
git tag vX.Y.Z && git push --tags
```

O workflow de release gera um rascunho no GitHub com o instalador NSIS `.exe` por usuário (Windows) e o `.AppImage` (Linux). Os artefatos de atualização recebem a assinatura do updater, sem assinatura de código reconhecida pelo sistema operacional. O CI (`.github/workflows/ci.yml`) roda versão, testes e build a cada push e PR.

## Atualizações automáticas publicadas

O desktop instalado consulta o manifesto público
`https://github.com/dougkusanagi/sloth-noter/releases/latest/download/latest.json` ao abrir e quando
se usa **Verificar atualizações** no menu ou na paleta. As notas não são enviadas. Falhas na consulta
automática não interrompem a edição offline; na consulta manual, o app informa o erro.

**Baixar atualização** transfere o pacote dentro do app, com progresso quando o servidor informa o
tamanho. Você pode continuar editando. O pacote só fica pronto após a verificação da assinatura.
**Instalar e reiniciar** bloqueia a edição por um instante, grava o documento atual, espera a fila de
gravacao e o histórico e só então instala. Se a gravação das notas falhar, o app permanece aberto.
Uma falha ao reiniciar permite tentar apenas o reinício novamente. No Windows, o instalador NSIS
mostra seu progresso sem exigir interação e reabre o aplicativo; no Linux, o AppImage instalado é
substituído e o aplicativo é reiniciado pelo Tauri.

Para publicar uma atualização:

1. Faça o lançamento com uma versão SemVer superior à instalada, mantendo manifesto JS e Rust alinhados.
2. Envie a tag `vX.Y.Z`. O workflow de release usa `tauri.updater.conf.json` para gerar pacotes
   assinados, suas assinaturas e `latest.json`, com os alvos Linux e Windows.
3. Confira os instaladores anexados e o manifesto antes de publicar o release como estável.
   Uma tag isolada, um rascunho ou uma prévia não é oferecida como atualização.

A chave pública está em `src-tauri/tauri.conf.json`; `requireSignedVersion` exige que a assinatura
vincule também a versão anunciada, evitando aceitar um pacote antigo com uma versão falsa.
A chave privada está fora do repositório, em
`~/.local/share/sloth-note/signing/updater.key`, e no secret `TAURI_SIGNING_PRIVATE_KEY` do
repositório GitHub. O arquivo local tem permissão 600, em uma pasta com permissão 700. Mantenha uma
cópia segura: perder ou trocar essa chave impede atualizar instalações que confiam na chave atual.
Não coloque a chave privada em arquivos versionados nem nos logs. A chave não tem senha adicional;
o acesso depende das permissões locais e do armazenamento de secrets do GitHub.

Um build local comum não exige a chave porque não gera artefatos de updater. Para gerar um AppImage
assinado localmente, sem instalar nem alterar o aplicativo atual:

```sh
TAURI_SIGNING_PRIVATE_KEY="$HOME/.local/share/sloth-note/signing/updater.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
bun run desktop:build --config src-tauri/tauri.updater.conf.json --bundles appimage
```

As atualizações automáticas são oferecidas no AppImage Linux e no aplicativo Windows compilados
para distribuição. `desktop:dev` não instala atualizações; `desktop:update` continua sendo o fluxo
local de desenvolvimento. A primeira versão com o updater precisa ser instalada manualmente.
Pacotes baixados ainda não instalados ficam na memória da sessão; fechar o app exige baixar outra vez.
Esta assinatura é do updater, não uma assinatura de código do Windows ou notarização do macOS.
