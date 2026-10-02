# Roteiro

## Contrato de produto

- **Um bloco de notas com Markdown.** O fluxo do Notepad (criar, escrever, fechar sem salvar) com Markdown de verdade. É o critério para aceitar ou recusar qualquer recurso: ele precisa tornar a nota mais rápida de criar, de achar ou de fechar.
- Editor pequeno e confiável: texto primeiro, poucas preferências, arquivos portáveis.
- Texto denso: títulos com pouca diferença de tamanho e corpo de 16 px por padrão, para caber mais texto na tela, como num editor de texto simples.
- Desktop: os `.md` UTF-8 da pasta escolhida são a fonte de verdade. Abas, preferências, revisões, conflitos e lixeira são estado auxiliar versionado, no diretório de dados do app, sem alterar os `.md` silenciosamente.
- Componentes React não chamam APIs nativas de arquivo: tudo passa pelo contrato de persistência (`src/persistence*.js`), com implementação web e desktop testadas pela mesma suíte.
- O webview não recebe acesso global ao filesystem; comandos e capabilities são mínimos.
- Fora de escopo: nuvem, contas, colaboração, IA, plugins, grafo, renderizadores pesados.
- Orçamento de leveza: nenhuma requisição externa obrigatória. O JavaScript já excede a meta antiga de 80 kB gzip por causa do editor visual (CodeMirror) e do realce de sintaxe; novas dependências precisam resolver um problema demonstrado (o `sonner` entrou porque quatro avisos fixos empilhavam sobre o editor).

## Concluído

- **MVP web:** persistência versionada (v1→v3) com migração, bloqueio em dados corrompidos e fila de gravação; importação/exportação, backup, lixeira, busca, leitura, editor visual.
- **Desktop, base:** projeto Tauri V2 com versões fixadas; estado em arquivo com gravação temporária e cópia `.previous`; capability sem plugin de filesystem.
- **Pasta de notas:** `.md` como fonte de verdade, estado auxiliar no diretório de dados, comandos restritos à pasta escolhida no diálogo nativo, importação de alterações externas com resolução de conflitos.
- **Interface:** Configurações (Ctrl+,), paleta de comandos (Ctrl+K) separada da busca de notas (Ctrl+P), toasts, biblioteca com prévia e busca no texto, tipografia de interface sem monoespaçada, atalhos sem colisão com ferramentas do navegador (ver `docs/RECURSOS.md`).
- **Erros de disco:** pasta ausente, permissão negada, somente leitura e disco cheio têm mensagens próprias (código estável vindo do Rust, texto no idioma da interface). Uma instância por vez cobre o caso de duas janelas na mesma pasta.
- **Interface:** pt-BR por padrão, English opcional; confirmações e renomeação em diálogos próprios do app.

## Pendente

### Pasta local: complementos

- Decidir se subpastas entram.
- Trocar a verificação periódica por eventos do sistema de arquivos, se o custo de ler o carimbo da pasta a cada poucos segundos incomodar em pastas muito grandes.

### Distribuição

- CI/CD gera `.msi` e `.AppImage` (feito). Falta: política de atualização e validação manual de upgrade/desinstalação preservando as notas.
- **Decisão:** os artefatos não serão assinados (fora de escopo, sem previsão de mudar).
- Rodada de uso real: edição longa, IME, zoom 200%, teclado, leitor de tela, nomes Unicode, pasta grande.

### Rumo ao "Notepad com Markdown"

Ideias avaliadas contra o contrato acima, em ordem de valor:

- **Abrir arquivo pelo sistema** (duplo clique em `.md`/`.txt` e "Abrir com"): é o que faz o app substituir o Notepad de verdade. Exige associação de arquivo no instalador e um argumento de linha de comando.
- **Nota nova ao abrir** (opção): o app já abre na última nota; quem quer anotar rápido prefere uma página em branco.
- **Substituir (Ctrl+H)** na busca da nota.
- **Contador discreto** de palavras/caracteres e quebra de linha opcional.
- **Zoom com Ctrl+rolagem** além de Ctrl++/−.
- **Atalho global** para trazer o app (plugin `global-shortcut` do Tauri; só vale se não pesar).
- Fora de escopo: temas personalizados, plugins, sincronização.

## Verificação

Testes unitários para persistência, migração, serialização e erros; verificação manual no navegador e na janela nativa para edição, foco, atalhos e layout. Build isolado não cobre esses aspectos.
