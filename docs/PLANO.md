# Plano de implementação

Vigente em 24/09/2026, baseado no [relatório](RELATORIO.md). As Etapas 1–3, que definem o MVP web, estão concluídas. O MVP web é a base funcional e de validação do editor, mas não é a entrega final do produto. O requisito obrigatório é concluir a aplicação desktop nativa com Tauri V2, incluindo armazenamento em pasta local, recuperação e distribuição. O produto só será considerado completo depois da validação das etapas desktop descritas abaixo.

## Direção

Editor pequeno e confiável: texto primeiro, leitura opcional, poucas preferências e arquivos portáveis. Preservar a identidade visual, simplificando a prévia ao vivo se ela prejudicar a escrita.

- Manter React/Vite e CSS próprio.
- Começar com campo de texto único. Motor de edição e prévia avançada dependem de necessidade e medição.
- Armazenamento no navegador mais importação/exportação inicialmente. Distinguir salvar no navegador de salvar em arquivo; a versão web não pode sugerir uma pasta conectada inexistente.
- H1 opcional; fechar aba diferente de excluir nota.
- Kit de componentes, store global, Worker e novos renderizadores não são requisitos prévios.

### Contrato de produto

- A versão web continua sendo uma superfície funcional para desenvolvimento, uso provisório e importação/exportação, mas não substitui a entrega desktop.
- A versão final obrigatória será um aplicativo nativo em Tauri V2, executável sem rede e capaz de trabalhar com uma pasta local escolhida pelo usuário.
- No desktop, os arquivos `.md` UTF-8 da pasta escolhida serão a fonte de verdade do conteúdo. O armazenamento do navegador não será usado como banco principal do desktop.
- Abas abertas, preferências, revisões/hash dos arquivos, conflitos pendentes e lixeira persistente serão dados auxiliares versionados do aplicativo, sem alterar silenciosamente o conteúdo dos `.md`.
- Sincronização em nuvem, contas, colaboração e serviços externos continuam fora deste plano. “Desktop” não significa sincronização automática.
- A interface e os testes do MVP web devem ser reaproveitados por meio de um adaptador de persistência; componentes React não devem chamar diretamente APIs nativas de arquivos.

## Etapa 1 — Integridade e salvamento real

P0; cobre C01/C02. Necessária antes de usar notas reais.

- Persistir notas com esquema versionado, validação de leitura e estado por revisão/documento.
- Em falhas, manter texto em memória e permitir exportação `.md`; mostrar erro sem falso sucesso.
- Simplificar edição para preservar quebras, cursor, seleção e histórico; remover bloqueio do H1.
- Corrigir mensagem de boas-vindas para descrever o comportamento real.
- Definir frequência de gravação e janela de alterações pendentes. Se houver debounce, limitar atraso, tratar troca de nota/saída e ordenar gravações. Não depender apenas de eventos de encerramento para proteger o texto.

**Aceite:** criar, editar, recarregar e recuperar conteúdo confirmado, inclusive criação sem digitação. Repetir com duas notas e digitação rápida. Simular quota/falha: texto mantido e exportável, estado correto. Verificar Enter no meio do texto, Backspace entre linhas, colagem multiline, IME/acentos, seleção e undo/redo.

## Etapa 2 — Leitura e navegação consistentes

Depende da etapa 1; cobre C03–C08 e C10.

- Separar módulos essenciais e estabilizar identidade/seleção da nota ativa.
- Remover realce por regex que altera HTML gerado.
- Definir e testar títulos, parágrafos, ênfase, links, citações, listas e cercas. Preservar texto não suportado. HTML bruto permanece texto por padrão; definir protocolos permitidos antes de ativar links.
- Corrigir seleção da paleta ao filtrar e estado vazio.
- Acesso discreto por botão aos comandos, incluindo criar nota.
- Foco visível, teclado, nomes acessíveis e feedback ao copiar.
- Leitura não deve sair ao selecionar texto ou copiar código.

**Aceite:** exemplos de Markdown com Unicode, caracteres HTML e cercas abertas preservam o original. Após navegar e filtrar, Enter executa o único resultado. Fluxo criar → escrever → trocar → ler → copiar → voltar funciona pelo teclado. Nota longa seguida de curta continua editável.

## Etapa 3 — Portabilidade e leveza

Depende da etapa 2; cobre C09/C11/C12 e manutenção.

- Importação UTF-8 com conflitos explícitos, renomeação e abas separadas da coleção de notas.
- Exclusão com recuperação; fechar não apaga.
- Persistir preferências com validação.
- Retirar Tailwind CDN e fontes remotas obrigatórias.
- Padronizar npm/lockfile, versões e scripts de verificação.
- Ajustar layout a 360 px, zoom 200%, muitas abas e documentos longos.
- Medir tamanho e latência conforme o relatório.

**Aceite:** exportar/reimportar sem alterar texto, incluindo linhas vazias e Unicode; fechar/reabrir sem perda e recuperar exclusão. Build servido localmente funciona sem rede externa. Verificações passam e medições são registradas com ambiente/método.

## Etapa 4 — Preparação obrigatória para o desktop Tauri V2

Depende das Etapas 1–3 e inicia a entrega final do produto. Esta etapa não é empacotamento cosmético: cria a fronteira entre a interface e as implementações de armazenamento.

- Criar o projeto `src-tauri` com Tauri V2 fixado, scripts de desenvolvimento/build e uma execução local que funcione sem rede.
- Reaproveitar React/Vite como frontend e introduzir um contrato de persistência/vault com implementação web e implementação desktop.
- Mover operações privilegiadas para o lado nativo ou para plugins oficiais com capabilities explícitas; não liberar filesystem global ao webview.
- Manter importação/exportação, backup e recuperação disponíveis enquanto a migração para o vault desktop estiver em andamento.
- Testar a mesma suíte de domínio (serialização, títulos, conflitos, lixeira e backup) contra as duas implementações quando o contrato estiver isolado.

**Aceite:** o aplicativo abre como janela Tauri V2, funciona offline, não depende de `localStorage` para considerar uma nota salva no desktop e o build web continua funcionando separadamente.

## Etapa 5 — Vault em pasta local e paridade funcional

Obrigatória para considerar o desktop utilizável. O usuário escolhe ou cria uma pasta de notas por um diálogo nativo.

- Ler, criar, renomear, editar, buscar e exportar notas `.md` diretamente na pasta selecionada, preservando UTF-8, Unicode, linhas vazias e texto não suportado.
- Definir a extensão do vault (apenas a pasta escolhida ou subpastas) e ignorar explicitamente arquivos internos/temporários.
- Manter o conteúdo dos `.md` como fonte de verdade. Guardar estado auxiliar em diretório de dados do aplicativo, com esquema versionado e caminho do vault associado.
- Persistir abas, preferências, revisões, lixeira e conflitos pendentes após reiniciar o aplicativo. Fechar uma aba nunca exclui a nota.
- Reaproveitar os três modos de visualização, edição visual, busca, formatação, tabelas, blocos de código, importação, exportação e backup do MVP web.
- Oferecer migração explícita do armazenamento web/backup JSON para um vault, com prévia, conflitos e confirmação; nunca sobrescrever um vault sem ação do usuário.

**Aceite:** uma nota criada no desktop permanece em um `.md` verificável fora do app; fechar, reiniciar, trocar de vault e reabrir preserva o conteúdo e o estado permitido. Cada recurso já entregue no web possui fluxo equivalente no desktop ou uma limitação documentada.

## Etapa 6 — Alterações externas, permissões e recuperação

Obrigatória antes de chamar a pasta local de armazenamento confiável.

- Observar alterações no vault e coalescer eventos; ao detectar alteração, comparar revisão/hash e recarregar automaticamente apenas quando não houver edição local pendente.
- Exibir conflito quando o arquivo mudou fora do app durante uma edição local. Permitir manter a versão local, aceitar a externa ou salvar ambas com nomes distintos; nenhuma versão pode desaparecer silenciosamente.
- Tratar pasta inexistente, arquivo movido/removido, arquivo somente leitura, permissão revogada, caminho inválido, pouco espaço e falhas de leitura/escrita.
- Gravar com arquivo temporário no mesmo diretório e substituição segura conforme o sistema suportado; preservar a versão anterior quando a operação falhar. Não mostrar “salvo” antes da confirmação real.
- Definir e testar o comportamento de duas janelas/processos, incluindo revisão obsoleta e conflito de renomeação.
- Configurar capabilities e scopes mínimos para a janela principal e para o diretório escolhido. O usuário deve conseguir negar/reautorizar acesso sem corromper o vault.
- Manter backup completo `.json` e exportação individual como recuperação quando o filesystem estiver indisponível.

**Aceite:** alterações externas são detectadas, conflitos são visíveis e recuperáveis, falhas não resultam em falso sucesso e testes de interrupção/reinício não perdem a versão anterior nem o texto em memória.

## Etapa 7 — Distribuição nativa e acabamento

Obrigatória para a entrega do app completo, após a paridade e a integridade do vault.

- Definir e registrar a matriz de sistemas operacionais suportados. A primeira matriz deve cobrir integralmente o ambiente de lançamento; outros sistemas só entram na promessa após build e teste próprios.
- Gerar instalador(es) Tauri V2, identificar versão, nome do produto, ícone e diretórios de dados; documentar atualização e desinstalação sem apagar notas do usuário.
- Validar execução offline, primeiro uso, upgrade, downgrade suportado ou bloqueado, reparo/reinstalação e preservação do vault.
- Assinar artefatos quando a plataforma exigir e documentar o processo de release; não considerar um build local isolado como distribuição concluída.
- Repetir a rodada de uso real: edição longa, IME, seleção/undo, zoom real de 200%, navegação somente por teclado, leitores de tela, nomes Unicode, caminhos longos, vault grande e recuperação após falhas.
- Revisar textos ainda em inglês, mensagens de erro, atalhos e fluxo de escolha/troca de pasta.

**Aceite de release:** uma pessoa consegue instalar, escolher um vault, criar/editar/fechar/reabrir notas, lidar com uma alteração externa e recuperar um erro sem terminal ou ferramentas de desenvolvimento; o pacote é reproduzível e os limites por sistema operacional estão publicados.

### Critério de conclusão do produto

O Sloth Note só sai do estado “MVP web + desktop em desenvolvimento” quando as Etapas 4–7 estiverem aceitas. A ausência de sincronização em nuvem não bloqueia a conclusão; a ausência do aplicativo Tauri V2, da pasta local confiável ou da distribuição validada bloqueia.

### Entrega de 23/09/2026 — busca textual

- Busca dentro da nota disponível pelo menu e por Ctrl/Cmd+F.
- Enter avança para a próxima ocorrência; Shift+Enter retorna à anterior; a seleção nativa do editor destaca o trecho.
- A busca é case-insensitive, não altera o Markdown original e informa a quantidade de ocorrências.

### Ajuste de 24/09/2026 — posições da busca

- A busca passa a obter posições diretamente do texto original. A seleção permanece correta após caracteres cuja conversão para minúsculas muda o comprimento, como `İ`.
- Caracteres especiais de expressão regular digitados na busca são tratados como texto literal.
- Verificação: 12 testes automatizados passaram e o build concluiu. A interação visual da busca ainda não foi repetida no navegador nesta entrega.

### Continuação de 24/09/2026 — backup completo

- O menu permite baixar um backup `.json` com notas, lixeira, abas e preferências. O alerta de falha de armazenamento oferece o mesmo download, inclusive para notas mantidas apenas em memória.
- A restauração valida a estrutura, pede confirmação antes de substituir o estado atual e informa erros de leitura. Quando a gravação está bloqueada por dados corrompidos, o backup restaurado permanece em memória até a ação explícita de substituir o armazenamento.
- Verificação: 14 testes automatizados passaram, incluindo preservação de Unicode e linhas vazias no backup e rejeição de dados inválidos; build concluído. O fluxo visual de restauração ainda precisa de validação no navegador.

### Validação de interface de 24/09/2026 — edição e busca

- No build servido localmente no Chrome, criação e gravação de nota, restauração de backup com confirmação, falha simulada de quota, retomada da gravação e recuperação após recarga passaram. Dados v3 corrompidos permaneceram intactos até a ação explícita de substituição.
- Enter no meio do texto, substituição de seleção entre linhas, Backspace, undo e redo mantiveram o valor salvo igual ao editor. A busca selecionou o trecho esperado.
- O diálogo de busca agora mantém o foco dentro dele ao navegar entre ocorrências e fecha o ciclo de Tab. Verificado no Chrome com seleção correta e foco no campo de busca após avançar.
- Viewports de 360 e 180 pixels CSS não produziram rolagem horizontal. O caso de 180 pixels é uma aproximação do espaço de 200% de zoom, não uma medição de zoom real.

### Fechamento do MVP web — 24/09/2026

- Importação `.md` preservou acentos e linhas vazias. Conflitos permitiram manter ambas as notas ou substituir a existente; exportação devolveu o nome e o texto exatos. Backup inválido foi rejeitado sem alterar os dados salvos.
- Leitura apresentou título, ênfase e código, manteve HTML bruto como texto e não ativou link `javascript:`. A paleta filtrou 100 notas e Enter abriu o resultado selecionado.
- Ao reduzir a largura com 100 abas abertas, a aba ativa passou a ser trazida de volta à área visível. Em 360 px, a página não teve rolagem horizontal; a lista de abas rolou internamente. A mudança de largura foi verificada com evento de `resize` após emulação de viewport.
- Uma nota de 1 MiB aceitou nova digitação, persistiu o texto completo e voltou intacta após recarga. Em 30 inserções por tamanho no Chrome/Windows, as chamadas do browser-harness tiveram p95 de 21,3 ms (10 KiB), 30,6 ms (100 KiB) e 47,5 ms (1 MiB). Esses tempos incluem IPC da automação e processamento do navegador; não são medidas isoladas de atualização visual nem devem ser comparados diretamente às metas de renderização.
- Verificação final: 14 testes automatizados, build com 66,18 kB gzip de JavaScript e 1,94 kB gzip de CSS, `npm audit` sem vulnerabilidades. O build não contém referências a CDN ou fontes remotas obrigatórias.
- Limites conhecidos: a leitura implementa o subconjunto Markdown descrito no README; o zoom real de 200% e leitores de tela específicos não foram medidos nesta rodada. O armazenamento continua no navegador, com backup e importação/exportação como portabilidade.

### Ampliação solicitada — edição visual e título como arquivo

- O modo Visual tornou-se padrão. CodeMirror mantém texto, seleção, composição e histórico de edição; decorações mostram Markdown estilizado nas linhas fora do cursor e revelam a sintaxe completa na linha ativa. Tags `#tag` aparecem destacadas também na Leitura. Texto puro e Leitura continuam disponíveis por três botões de opção na header.
- O primeiro H1 controla o nome da nota e do `.md` exportado. Edição e undo/redo atualizam o nome; importação e abertura de notas salvas reconciliam nomes com títulos. Sem H1, o nome existente é mantido. Conflitos recebem sufixo e caracteres inválidos são substituídos.
- Verificado no Chrome: edição de H1 com renomeação imediata, undo/redo do texto e nome, alternância entre os três modos sem mudar o conteúdo, revelação da sintaxe ao entrar na linha de ênfase, busca no modo Visual, importação com H1 e reconciliação ao recarregar. Nota de 1 MiB aceitou inserção e recarga sem perda. Viewport de 360 px permaneceu sem rolagem horizontal.
- `npm test`: 19 testes. `npm run build`: 154,14 kB gzip de JavaScript e 2,38 kB gzip de CSS; `npm audit` sem vulnerabilidades. O JavaScript excede a meta anterior de 80 kB gzip porque a edição visual solicitada requer um motor de edição com seleção, IME, histórico e decorações. Esse custo substitui a premissa anterior de campo de texto único como modo padrão.

### Ajuste do seletor de modos

- Padrão, Código e Leitura usam ícones e aparência segmentada, sem círculos visíveis; as opções continuam sendo radios nativos com nomes acessíveis.
- O seletor flutua no canto direito da área do editor, deixando a header para as abas. Até 1300 px, os nomes visuais se recolhem e os ícones permanecem. Até 1000 px, o texto começa abaixo do seletor. Verificado no Chrome em 1680, 1200, 960, 360 e 180 px CSS sem rolagem horizontal.

### Envolvimento da seleção

- Nos modos Padrão e Código, os delimitadores `()`, `[]`, `{}`, aspas simples, aspas duplas e crases envolvem o texto selecionado ao digitar o caractere de abertura. A seleção permanece no conteúdo interno; sem seleção, a digitação segue o comportamento normal.

### Nota inicial e barra de formatação

- Novas instalações abrem `Welcome.md` com exemplos de títulos, negrito, itálico, código, link, citação, listas, tag e bloco de código. Documentos já salvos não são substituídos.
- Selecionar texto no modo Padrão mostra uma barra flutuante com negrito, itálico, código em linha, link com campo de endereço, título H2, citação e lista. A formatação altera o Markdown original e mantém a seleção. Links aceitam endereços HTTP/HTTPS, `mailto:` e caminhos locais suportados pelo leitor.

### Estados de formatação e inserção de blocos

- A barra da seleção marca estilos ativos e o mesmo botão os remove, preservando o texto selecionado. Estilos aninhados como negrito e código são reconhecidos separadamente.
- O menu principal exibe os atalhos Ctrl+T, Ctrl+P e Ctrl+F com alinhamento próprio; os títulos de grupo ganharam cor e espaçamento distintos.
- O botão `+` aparece ao passar por uma linha vazia ou colocar o cursor nela. Insere H2–H4, citação, listas, tabela e bloco de código. Tabelas são exibidas no modo Leitura; a nota inicial inclui um exemplo.

### Refinamento do modo Padrão

- Tabelas passam a mostrar células no editor visual; ao entrar em uma linha da tabela, o Markdown da tabela inteira fica visível para edição.
- O cursor em um bloco de código revela as cercas de abertura e fechamento. Código com linguagem indicada recebe realce de sintaxe no editor e na Leitura; linguagens desconhecidas permanecem como texto simples.
- Ênfases separadas e aninhadas são renderizadas, inclusive `normal *itálico*` e `**forte *suave***`. O menu principal mostra atalhos em teclas visuais e o menu `+` ganhou ícones.

Para pasta local, definir ambiente suportado, permissões revogadas, alterações externas, conflitos e recuperação. Não prometer escrita atômica universal antes de escolher/verificar o mecanismo. Importação/exportação permanece como caminho simples.

## Verificação e documentação

Testes unitários para persistência, erros, migração e serialização; integração para troca de nota e gravações atrasadas; navegador para edição, foco, atalhos e recarga. Acessibilidade e layout exigem também inspeção manual. Build isolado não cobre esses aspectos.

Cada entrega registra verificações executadas e pendências. Atualizar README e relatório conforme o comportamento real; remover avisos somente após resolver o problema correspondente.

## Entrega de 23/09/2026 — andamento

- **Etapa 1:** armazenamento v2 com migração v1, validação e bloqueio de gravação quando os dados existentes estão corrompidos. Gravação síncrona a cada alteração, sem janela de debounce; falha visível e exportação disponíveis. Editor de texto único.
- **Etapa 2:** leitura separada com sintaxe delimitada, HTML bruto como texto e protocolos de link permitidos; paleta com seleção reiniciada, estado vazio, foco e Escape. Botões para ações principais, foco visível e confirmação de cópia.
- **Etapa 3:** notas separadas das abas abertas; importação UTF-8 com escolha entre manter ambas e substituir; renomeação, exclusão com desfazer durante a sessão, preferências persistidas, fontes do sistema e npm com versões fixadas. `npm audit` sem vulnerabilidades após atualização das dependências transitivas.
- **Verificado:** `npm ci`, 5 testes unitários de armazenamento, build e `npm audit` (zero vulnerabilidades); criação, edição e recarga no Chrome; busca por nome; importação Unicode e preservação de linha final; conflito de importação; fechar/reabrir; excluir/desfazer; leitura de HTML bruto e bloqueio de link `javascript:`; largura de 360 px sem rolagem horizontal. Com armazenamento v2 corrompido, a interface mostrou “Not saved” e manteve o valor original após edição.
- **Pendente naquela entrega:** testar IME, seleção entre parágrafos, undo/redo e zoom de 200% manualmente; testar falha de quota na interface e o fluxo completo de recuperação após recarga; medir latência em 10 kB, 100 kB, 1 MB e 100 notas. A exclusão ainda não sobrevivia à recarga; isso foi resolvido na continuação abaixo. A leitura não pretende implementar todo o CommonMark. Naquela entrega ainda não havia integração com pasta local ou Tauri.

## Continuação de 23/09/2026

- `IMPLEMENTATION_PLAN.md` foi movido da raiz para `docs/`; [este plano](PLANO.md) continua sendo a fonte detalhada.
- Armazenamento v3 migra v2 e v1, mantendo as chaves antigas. Exclusões vão para lixeira persistida; restauração resolve conflito de nome e funciona após recarga. Apagar definitivamente exige confirmação.
- Falha ao gravar durante migração mantém as notas legíveis em memória. Falha de leitura bloqueia substituição automática, mesmo quando o conteúdo bruto não está disponível para download.
- Verificação: 10 testes unitários; exclusão, recarga e restauração no Chrome. Composição IME via CDP preservou Unicode; substituição de seleção e inserção de quebra de linha atualizaram o texto e o armazenamento. Teclas físicas de Backspace e undo/redo ainda exigem verificação manual.
- Medição exploratória no Chrome 153 / Windows 10, 30 amostras por caso, medindo `JSON.stringify` mais `localStorage.setItem` em uma chave temporária: 10 kB p95 0,1 ms; 100 kB p95 0,3 ms; 1 MB p95 2,9 ms; 100 notas com 1 kB cada p95 0,3 ms. O build tem 65,07 kB gzip de JS e 1,75 kB gzip de CSS. Esses números não medem a atualização visual, que continua pendente.

## Ajuste da superfície de escrita — 23/09/2026

- A barra de ações e os botões de criar/fechar nas abas saíram do topo da nota. O menu principal agora fica na header, antes das abas, com criação, busca, importação/exportação, leitura, preferências e lixeira.
- O menu abre com foco no primeiro item, aceita setas, Home, End, Escape e fechamento por clique externo. Criar ou abrir uma nota e voltar da leitura colocam o foco no editor.
- Verificado no Chrome: abertura/fechamento do menu, navegação por setas, criação, leitura/edição e busca. Em viewports de 360 e 180 pixels CSS não houve rolagem horizontal; 180 pixels CSS apenas aproxima a largura disponível em zoom de 200%, sem substituir teste de zoom real.
- `npm test`: 10 testes passaram. `npm run build`: 65,42 kB gzip de JavaScript e 1,90 kB gzip de CSS.

## Correção da header e área de edição — 23/09/2026

- A segunda faixa de abas foi eliminada. Uma única header contém o botão ☰ com nome acessível, o nome do app e as abas. O estado de salvamento bem-sucedido é anunciado sem ocupar espaço visual; falhas continuam visíveis no alerta.
- As abas têm rolagem horizontal interna e a aba ativa é trazida para a área visível. Com 20 notas e viewport de 360 px, a lista tinha 226 px visíveis e 1667 px de conteúdo, enquanto a página continuou com 360 px de largura.
- O `textarea` cobre toda a área de conteúdo; o texto mantém uma coluna central por meio de padding. O cursor de texto aparece nas margens. No Chrome, cliques à esquerda e à direita em quatro linhas explícitas posicionaram o cursor respectivamente no início e no fim da linha correspondente, usando o comportamento nativo do campo.

## Usabilidade do editor — 24/09/2026

- Enter continua listas com `-`, `*`, `+`, números e citações; item vazio encerra o bloco. O comportamento é compartilhado entre Padrão e Código e não altera o texto dentro de cercas de código.
- Setas acima e abaixo de blocos de código param na cerca adjacente. Clicar em uma célula da tabela revela o Markdown e posiciona o cursor na célula.
- Links renderizados usam cursor de ponteiro, dica de Ctrl/Cmd + clique e abrem somente com esse modificador.
- Verificado por testes unitários e no Chrome, incluindo continuação e término de lista, navegação por setas, clique em tabela e ativação de link.

## Alinhamento com o plano herdado

O plano anterior antecipava pasta local, escrita atômica, Worker, CodeMirror/Lezer, remark/rehype, Tailwind Typography e shadcn/ui. Passam a alternativas, não requisitos. H1 obrigatório sai da direção de produto. Persistência, integridade e portabilidade vêm antes de realce, indexação e experiência semelhante ao Obsidian.
