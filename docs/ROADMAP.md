# Roteiro

## Contrato de produto

- Editor pequeno e confiável: texto primeiro, poucas preferências, arquivos portáveis.
- Desktop: os `.md` UTF-8 da pasta escolhida são a fonte de verdade. Abas, preferências, revisões, conflitos e lixeira são estado auxiliar versionado, no diretório de dados do app, sem alterar os `.md` silenciosamente.
- Componentes React não chamam APIs nativas de arquivo: tudo passa pelo contrato de persistência (`src/persistence*.js`), com implementação web e desktop testadas pela mesma suíte.
- O webview não recebe acesso global ao filesystem; comandos e capabilities são mínimos.
- Fora de escopo: nuvem, contas, colaboração, IA, plugins, grafo, renderizadores pesados.
- Orçamento de leveza: nenhuma requisição externa obrigatória. O JavaScript já excede a meta antiga de 80 kB gzip por causa do editor visual (CodeMirror) e do realce de sintaxe; novas dependências precisam resolver um problema demonstrado.

## Concluído

- **MVP web:** persistência versionada (v1→v3) com migração, bloqueio em dados corrompidos e fila de gravação; importação/exportação, backup, lixeira, busca, leitura, editor visual.
- **Desktop, base:** projeto Tauri V2 com versões fixadas; estado em arquivo com gravação temporária e cópia `.previous`; capability sem plugin de filesystem.
- **Pasta de notas:** `.md` como fonte de verdade, estado auxiliar no diretório de dados, comandos restritos à pasta escolhida no diálogo nativo, recusa de sobrescrever edições externas.

## Pendente

### Pasta local: complementos

A base está pronta (escolha da pasta, notas em `.md`, migração explícita, proteção contra sobrescrita). Falta:

- Decidir se subpastas entram.
- Reabrir a pasta mostrando notas criadas fora do app sem reiniciar (depende da observação abaixo).
- Traduzir o fluxo de escolha de pasta.

### Alterações externas e recuperação

- Observar a pasta; recarregar automaticamente só sem edição local pendente.
- Conflito visível: hoje o app apenas se recusa a sobrescrever e mostra o erro. Falta oferecer manter a local, aceitar a externa ou salvar ambas; nenhuma versão pode sumir.
- Tratar pasta ausente, arquivo movido/removido, somente leitura, permissão revogada, disco cheio.
- Escrita por arquivo temporário e substituição segura; não mostrar "salvo" antes da confirmação real.
- Comportamento com duas janelas/processos e conflito de renomeação; scopes mínimos para a pasta escolhida.

**Aceite:** alterações externas detectadas, conflitos recuperáveis, falhas sem falso sucesso, interrupção sem perda da versão anterior.

### Distribuição

- CI/CD gera `.msi` e `.AppImage` (feito). Falta: assinatura dos artefatos, política de atualização e validação de upgrade/desinstalação preservando as notas.
- Rodada de uso real: edição longa, IME, zoom 200%, teclado, leitor de tela, nomes Unicode, pasta grande.
- Interface em pt-BR: o `index.html` já declara `pt-BR`, mas os textos da UI ainda estão em inglês.

## Verificação

Testes unitários para persistência, migração, serialização e erros; verificação manual no navegador e na janela nativa para edição, foco, atalhos e layout. Build isolado não cobre esses aspectos.
