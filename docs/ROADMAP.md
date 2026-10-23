# Roteiro

## Contrato de produto

- **Um bloco de notas com Markdown.** O fluxo do Notepad (criar, escrever, fechar sem salvar) com Markdown de verdade. É o critério para aceitar ou recusar qualquer recurso: ele precisa tornar a nota mais rápida de criar, de achar ou de fechar.
- Editor pequeno e confiável: texto primeiro, poucas preferências, arquivos portáveis.
- Tarefas são uma evolução opcional: listas dedicadas, recorrência e lembretes devem preservar a rapidez de criar e editar notas comuns.
- Texto denso: títulos com pouca diferença de tamanho e corpo de 16 px por padrão, para caber mais texto na tela, como num editor de texto simples.
- Desktop: os `.md` UTF-8 da pasta escolhida são a fonte de verdade. Abas, preferências, revisões, conflitos e lixeira são estado auxiliar versionado, no diretório de dados do app, sem alterar os `.md` silenciosamente.
- Componentes React não chamam APIs nativas de arquivo: tudo passa pelo contrato de persistência (`src/persistence*.js`), com implementação web e desktop testadas pela mesma suíte.
- O webview não recebe acesso global ao filesystem; comandos e capabilities são mínimos.
- Uso local e sem conta continua sendo o padrão. Sincronização opcional e versão mobile entram no planejamento; IA permanece como proposta posterior em [IA e sync](IA-E-SYNC.md).
- Fora de escopo: colaboração em tempo real, plugins, grafo, renderizadores pesados e conta obrigatória para usar o app localmente.
- Orçamento de leveza: nenhuma requisição externa obrigatória. O JavaScript já excede a meta antiga de 80 kB gzip por causa do editor visual (CodeMirror) e do realce de sintaxe; novas dependências precisam resolver um problema demonstrado (o `sonner` entrou porque quatro avisos fixos empilhavam sobre o editor).

## Concluído

- **MVP web:** persistência versionada (v1→v3) com migração, bloqueio em dados corrompidos e fila de gravação; importação/exportação, backup, lixeira, busca, leitura, editor visual.
- **Desktop, base:** projeto Tauri V2 com versões fixadas; estado em arquivo com gravação temporária e cópia `.previous`; capability sem plugin de filesystem.
- **Pasta de notas:** `.md` como fonte de verdade, estado auxiliar no diretório de dados, comandos restritos à pasta escolhida no diálogo nativo, importação de alterações externas com resolução de conflitos.
- **Abrir arquivos pelo sistema:** associações para `.md`, `.markdown` e `.txt`; argumentos encaminhados à janela existente. `.md`, `.markdown` e `.txt` abertos ou soltados na janela são editados no próprio arquivo, inclusive fora da pasta de notas; soltá-los sobre o texto pergunta se o original deve ser editado ou se uma cópia deve ser importada.
- **Interface:** Configurações (Ctrl+,), paleta de comandos (Ctrl+K) separada da busca de notas (Ctrl+P), toasts, biblioteca com prévia e busca no texto, tipografia de interface sem monoespaçada, atalhos sem colisão com ferramentas do navegador (ver `docs/RECURSOS.md`).
- **Erros de disco:** pasta ausente, permissão negada, somente leitura e disco cheio têm mensagens próprias (código estável vindo do Rust, texto no idioma da interface). Uma instância por vez cobre o caso de duas janelas na mesma pasta.
- **Interface:** pt-BR por padrão, English opcional; confirmações e renomeação em diálogos próprios do app.

## Pendente

### Pasta local: complementos

- Decidir se subpastas entram.
- Trocar a verificação periódica por eventos do sistema de arquivos, se o custo de ler o carimbo da pasta a cada poucos segundos incomodar em pastas muito grandes.

### Distribuição

- CI/CD gera instalador NSIS `.exe` por usuário no Windows e `.AppImage` no Linux (feito). Falta: política de atualização e validação manual de upgrade/desinstalação preservando as notas.
- **Decisão:** os artefatos não serão assinados (fora de escopo, sem previsão de mudar).
- Rodada de uso real: edição longa, IME, zoom 200%, teclado, leitor de tela, nomes Unicode, pasta grande.

### Rumo ao "Notepad com Markdown"

Ideias avaliadas contra o contrato acima, em ordem de valor:

- **Nota nova ao abrir** (opção): o app já abre na última nota; quem quer anotar rápido prefere uma página em branco.
- **Substituir (Ctrl+H)** na busca da nota.
- **Contador discreto** de palavras/caracteres e quebra de linha opcional.
- **Zoom com Ctrl+rolagem** além de Ctrl++/−.
- **Atalho global** para trazer o app (plugin `global-shortcut` do Tauri; só vale se não pesar).
- Fora de escopo: temas personalizados e plugins.

### Tarefas, sincronização e mobile

Planejado, ainda não implementado. Esta evolução tem prioridade sobre a proposta de IA local, sem substituir os complementos de edição e distribuição acima. Ordem de implementação:

1. **Notas do tipo lista de tarefas e histórico de conclusão.** Criar listas com título e itens na mesma biblioteca, com identificação e filtro por tipo para não misturar com notas comuns. Checkboxes continuam disponíveis no Markdown das notas comuns. Registrar a tarefa, a ocorrência quando houver e a data/hora da conclusão; permitir desfazer a conclusão e consultar “Concluídas hoje” e o histórico por dia. O histórico registra ações do usuário, sem depender do histórico de commits do provedor de armazenamento.
2. **Recorrência.** Começar com repetição diária e por dias da semana. Cada período tem sua própria ocorrência: uma tarefa diária concluída ontem aparece pendente hoje, mantendo a conclusão anterior. A virada é à meia-noite no fuso definido para a recorrência, sem exigir o app aberto nesse horário; reconciliar as ocorrências ao reabrir. Definir antes da implementação como apresentar períodos não concluídos e como mudanças de fuso afetam a agenda.
3. **Data, hora e lembretes no desktop.** Separar prazo de conclusão e horário do lembrete; ambos são opcionais. Começar com notificações do sistema e som opcional. Definir o comportamento com app fechado, computador suspenso e lembrete vencido; alarmes persistentes entram em etapa própria, após validar o suporte de cada plataforma.
4. **Backup remoto e sincronização opcionais.** Manter os dados locais e o funcionamento offline. Planejar GitHub como um provedor e avaliar uma alternativa gratuita que dispense conta no GitHub, preferencialmente aproveitando uma conta que a pessoa já tenha. Tratar backup e sincronização como funções distintas: restaurar uma cópia não equivale a reconciliar dispositivos. Sincronização deve cobrir notas, imagens, exclusões, metadados das tarefas e histórico, preservar conflitos e evitar duplicar conclusões. A proposta de GitHub está em [IA e sync](IA-E-SYNC.md#6-sincronização-opcional-e-provedor-github).
5. **Versão mobile.** Plano de usabilidade do Android em [plano-mobile](plano-mobile.md). Priorizar consultar notas, capturar texto rapidamente e concluir tarefas, com dados offline e sincronização com o desktop. Avaliar web instalável versus app nativo conforme armazenamento, notificações e execução em segundo plano; escolher a plataforma inicial e validar alarmes antes de prometer avisos no horário exato com o app fechado.

Decisões de base antes de implementar:

- Definir IDs estáveis para listas, tarefas, ocorrências e eventos do histórico, independentes do título e da posição no texto.
- Definir o formato portável das listas e onde ficam prazo, recorrência e histórico, mantendo os `.md` comuns como fonte de verdade e sem reescritas silenciosas. Incluir esses dados no backup/exportação e prever migração dos formatos existentes.
- Avaliar o provedor alternativo por gratuidade e limites vigentes, privacidade, autenticação simples e suporte às plataformas; hospedagem própria e custos operacionais ainda não estão aprovados.
- Definir permissões e comportamento de notificações por plataforma, incluindo se o lembrete deve tocar em todos os dispositivos ou somente em um.

## Verificação

Testes unitários para persistência, migração, serialização e erros; verificação manual no navegador e na janela nativa para edição, foco, atalhos e layout. Build isolado não cobre esses aspectos.
