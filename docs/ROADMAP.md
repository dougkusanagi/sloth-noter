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

## Pendente

### Pasta local (obrigatório para o desktop ser utilizável)

- Escolher/criar a pasta por diálogo nativo; ler, criar, renomear, editar, buscar e exportar `.md` nela, preservando UTF-8, linhas vazias e texto não suportado.
- Definir se subpastas entram e ignorar arquivos internos e temporários.
- Migração explícita do armazenamento web/backup JSON para a pasta, com prévia e confirmação; nunca sobrescrever sem ação do usuário.
- Paridade com os recursos do web, ou limitação documentada.

**Aceite:** uma nota criada no desktop permanece em um `.md` verificável fora do app; fechar, reiniciar e trocar de pasta preserva conteúdo e estado.

### Alterações externas e recuperação

- Observar a pasta; recarregar automaticamente só sem edição local pendente.
- Conflito visível: manter a local, aceitar a externa ou salvar ambas; nenhuma versão some.
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
