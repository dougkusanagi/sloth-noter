# Plano de implementação

Vigente em 24/09/2026, baseado no [relatório](RELATORIO.md). As Etapas 1–3, que definem o MVP web, estão concluídas. Os registros das entregas e verificações estão abaixo. A Etapa 4 e o Tauri V2 permanecem opcionais e separados do MVP.

## Direção

Editor pequeno e confiável: texto primeiro, leitura opcional, poucas preferências e arquivos portáveis. Preservar a identidade visual, simplificando a prévia ao vivo se ela prejudicar a escrita.

- Manter React/Vite e CSS próprio.
- Começar com campo de texto único. Motor de edição e prévia avançada dependem de necessidade e medição.
- Armazenamento no navegador mais importação/exportação inicialmente. Distinguir salvar no navegador de salvar em arquivo; `default vault` não pode sugerir pasta conectada inexistente.
- H1 opcional; fechar aba diferente de excluir nota.
- Kit de componentes, store global, Worker e novos renderizadores não são requisitos prévios.

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

## Etapa 4 — Opcionais

Após as anteriores: busca textual na nota, tema do sistema e contagem opcional. Prévia avançada e pasta local são decisões separadas, justificadas por demanda e custo.

#### Tauri V2 — etapa posterior, ainda não iniciada

O Tauri V2 fica no roadmap como empacotamento opcional para desktop, depois da estabilização do fluxo web. Ele não substitui importação/exportação nem transforma automaticamente o armazenamento do navegador em uma pasta local.

Antes de iniciar essa etapa, será necessário definir e validar:

- alvo de sistema operacional e estratégia de distribuição/atualização;
- permissões mínimas do plugin de filesystem e comportamento quando forem revogadas;
- escrita segura, alterações externas e conflitos entre abas/processos;
- migração e recuperação sem perda, mantendo o modo web como fallback;
- testes de build, assinatura e execução offline no ambiente suportado.

Até esses critérios serem definidos, não haverá promessa de sincronização com pasta local. A implementação atual continua deliberadamente independente do Tauri.

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

Para pasta local, definir ambiente suportado, permissões revogadas, alterações externas, conflitos e recuperação. Não prometer escrita atômica universal antes de escolher/verificar o mecanismo. Importação/exportação permanece como caminho simples.

## Verificação e documentação

Testes unitários para persistência, erros, migração e serialização; integração para troca de nota e gravações atrasadas; navegador para edição, foco, atalhos e recarga. Acessibilidade e layout exigem também inspeção manual. Build isolado não cobre esses aspectos.

Cada entrega registra verificações executadas e pendências. Atualizar README e relatório conforme o comportamento real; remover avisos somente após resolver o problema correspondente.

## Entrega de 23/09/2026 — andamento

- **Etapa 1:** armazenamento v2 com migração v1, validação e bloqueio de gravação quando os dados existentes estão corrompidos. Gravação síncrona a cada alteração, sem janela de debounce; falha visível e exportação disponíveis. Editor de texto único.
- **Etapa 2:** leitura separada com sintaxe delimitada, HTML bruto como texto e protocolos de link permitidos; paleta com seleção reiniciada, estado vazio, foco e Escape. Botões para ações principais, foco visível e confirmação de cópia.
- **Etapa 3:** notas separadas das abas abertas; importação UTF-8 com escolha entre manter ambas e substituir; renomeação, exclusão com desfazer durante a sessão, preferências persistidas, fontes do sistema e npm com versões fixadas. `npm audit` sem vulnerabilidades após atualização das dependências transitivas.
- **Verificado:** `npm ci`, 5 testes unitários de armazenamento, build e `npm audit` (zero vulnerabilidades); criação, edição e recarga no Chrome; busca por nome; importação Unicode e preservação de linha final; conflito de importação; fechar/reabrir; excluir/desfazer; leitura de HTML bruto e bloqueio de link `javascript:`; largura de 360 px sem rolagem horizontal. Com armazenamento v2 corrompido, a interface mostrou “Not saved” e manteve o valor original após edição.
- **Pendente naquela entrega:** testar IME, seleção entre parágrafos, undo/redo e zoom de 200% manualmente; testar falha de quota na interface e o fluxo completo de recuperação após recarga; medir latência em 10 kB, 100 kB, 1 MB e 100 notas. A exclusão ainda não sobrevivia à recarga; isso foi resolvido na continuação abaixo. A leitura não pretende implementar todo o CommonMark. Não há integração com pasta local ou Tauri.

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

## Alinhamento com o plano herdado

O plano anterior antecipava pasta local, escrita atômica, Worker, CodeMirror/Lezer, remark/rehype, Tailwind Typography e shadcn/ui. Passam a alternativas, não requisitos. H1 obrigatório sai da direção de produto. Persistência, integridade e portabilidade vêm antes de realce, indexação e experiência semelhante ao Obsidian.
