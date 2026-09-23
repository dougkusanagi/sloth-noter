# Plano de implementação

Vigente em 23/09/2026, baseado no [relatório](RELATORIO.md). As Etapas 1–3 estão em andamento. O registro da entrega atual está no fim deste documento.

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

Para pasta local, definir ambiente suportado, permissões revogadas, alterações externas, conflitos e recuperação. Não prometer escrita atômica universal antes de escolher/verificar o mecanismo. Importação/exportação permanece como caminho simples.

## Verificação e documentação

Testes unitários para persistência, erros, migração e serialização; integração para troca de nota e gravações atrasadas; navegador para edição, foco, atalhos e recarga. Acessibilidade e layout exigem também inspeção manual. Build isolado não cobre esses aspectos.

Cada entrega registra verificações executadas e pendências. Atualizar README e relatório conforme o comportamento real; remover avisos somente após resolver o problema correspondente.

## Entrega de 23/09/2026 — andamento

- **Etapa 1:** armazenamento v2 com migração v1, validação e bloqueio de gravação quando os dados existentes estão corrompidos. Gravação síncrona a cada alteração, sem janela de debounce; falha visível e exportação disponíveis. Editor de texto único.
- **Etapa 2:** leitura separada com sintaxe delimitada, HTML bruto como texto e protocolos de link permitidos; paleta com seleção reiniciada, estado vazio, foco e Escape. Botões para ações principais, foco visível e confirmação de cópia.
- **Etapa 3:** notas separadas das abas abertas; importação UTF-8 com escolha entre manter ambas e substituir; renomeação, exclusão com desfazer durante a sessão, preferências persistidas, fontes do sistema e npm com versões fixadas. `npm audit` sem vulnerabilidades após atualização das dependências transitivas.
- **Verificado:** `npm ci`, 5 testes unitários de armazenamento, build e `npm audit` (zero vulnerabilidades); criação, edição e recarga no Chrome; busca por nome; importação Unicode e preservação de linha final; conflito de importação; fechar/reabrir; excluir/desfazer; leitura de HTML bruto e bloqueio de link `javascript:`; largura de 360 px sem rolagem horizontal. Com armazenamento v2 corrompido, a interface mostrou “Not saved” e manteve o valor original após edição.
- **Pendente:** testar IME, seleção entre parágrafos, undo/redo e zoom de 200% manualmente; testar falha de quota na interface e o fluxo completo de recuperação após recarga; medir latência em 10 kB, 100 kB, 1 MB e 100 notas. O desfazer exclusão não sobrevive à recarga. A leitura não pretende implementar todo o CommonMark. Não há integração com pasta local ou Tauri.

## Alinhamento com o plano herdado

O plano anterior antecipava pasta local, escrita atômica, Worker, CodeMirror/Lezer, remark/rehype, Tailwind Typography e shadcn/ui. Passam a alternativas, não requisitos. H1 obrigatório sai da direção de produto. Persistência, integridade e portabilidade vêm antes de realce, indexação e experiência semelhante ao Obsidian.
