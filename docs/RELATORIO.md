# Revisão do Sloth Note

Data: 23/09/2026. Escopo: seleção e cópia da base, inspeção do código e planejamento. Nenhuma correção funcional foi aplicada nesta revisão.

**Atualização de requisito:** o MVP web descrito neste relatório é uma etapa concluída, não o produto final. A entrega final obrigatória é o aplicativo desktop nativo com Tauri V2 e armazenamento em pasta local. A sincronização em nuvem continua fora do escopo.

## Atualização de implementação — 23/09/2026

- C01/C02 iniciados: notas em `localStorage` com esquema v1, revisões por nota, gravação síncrona e indicação baseada no resultado; editor em `textarea` único.
- Criação de nota vazia salva imediatamente; troca de nota também grava a seleção ativa. Falhas mantêm o texto em memória e permitem exportar a nota ativa.
- Testes automatizados de leitura, escrita, corrupção e falha de armazenamento foram adicionados. Ainda falta validação de interação em navegador (IME, seleção, histórico e recarga).
- Tailwind CDN e fontes remotas foram retirados. A leitura Markdown ainda é simples e será tratada na Etapa 2.

**Continuação:** o formato v2 migra v1 sem apagar o registro anterior. Se encontrar dados corrompidos, o aplicativo bloqueia gravações automáticas e permite baixar o valor armazenado antes de substituição explícita. A leitura agora cobre um subconjunto definido de Markdown; importação/exportação, abas independentes, renomeação, exclusão com desfazer e preferências foram adicionadas. Testes de navegador e pendências constam em [PLANO.md](PLANO.md#entrega-de-23092026--andamento).

**Nova continuação:** o formato v3 migra v2/v1 e guarda uma lixeira recuperável após recarga. A migração mantém dados legíveis em memória quando a gravação falha. Medições exploratórias e pendências atualizadas estão em [PLANO.md](PLANO.md#continuação-de-23092026).

**Interface:** as ações foram reunidas no menu da header; a nota voltou a ser uma superfície de escrita sem barra de botões. O teste de layout e teclado está registrado em [PLANO.md](PLANO.md#ajuste-da-superfície-de-escrita--23092026).

**Correção da interface:** ícone ☰, nome e abas passaram a ocupar uma única header. O campo de edição cobre toda a área abaixo dela e usa padding para manter a largura de leitura. Testes de abas e clique nas margens constam em [PLANO.md](PLANO.md#correção-da-header-e-área-de-edição--23092026).

## 1. Base escolhida

O destino estava vazio e não havia documentos em `docs`. Foi copiado `../sloth-note-gpt`, exceto `.git`, `node_modules` e `dist`; dependências e build foram gerados localmente. As origens não foram alteradas.

| Critério | sloth-note-gpt | sloth-note |
| --- | --- | --- |
| Recência | Commit `443d23c`, 24/07/2026 13:41:40 -03:00; árvore Git limpa | Sem Git; componente mais recente observado: 24/07/2026 13:03:21 |
| Estrutura | React/Vite, um JSX e CSS próprio | React/Vite, componentes e serviços, Tailwind e ícones |
| Edição | `contentEditable` por linha | `input` por linha |
| Persistência | Apenas memória | `localStorage` para notas e preferências |
| Recursos | Abas, temas, leitura, paleta | Também exportação e exclusão |
| Risco central | Indicador de salvamento fictício | Fechar aba remove a nota; falhas de gravação não chegam ao indicador |

**Decisão:** usar `sloth-note-gpt`, a versão mais recente verificável, pela interface enxuta. Recência não significa maturidade. A versão anterior serve de referência, mas não foi mesclada: seus formatos `title/content` diferem de `name/body`, e suas implementações têm problemas próprios. A ordenação usa commit e arquivos locais, não releases publicadas.

## 2. Essência do produto

- Escrever, localizar e recuperar texto com poucos passos.
- Markdown portável, independente da aparência.
- Uma superfície de escrita, abas opcionais e uma paleta pequena.
- Funcionamento local, sem cadastro ou serviços obrigatórios.
- Preferências discretas de tema, fonte e abas.
- Confiabilidade acima de efeitos ou prévia ao vivo sofisticada.

H1 deve ser opcional. Pode sugerir um título, mas não bloquear a escrita nem renomear arquivos silenciosamente. Documento vazio, sem título ou com front matter precisa continuar válido como texto.

## 3. Correções necessárias

P0 bloqueia uso com notas reais. P1 é necessário para uma primeira versão confiável. P2 é refinamento. Referências correspondem ao código copiado. Sintomas dependentes do navegador precisam de reprodução; não foram apresentados como testes executados.

| ID / prioridade | Evidência e impacto | Correção e validação |
| --- | --- | --- |
| C01 — P0 | `src/main.jsx:119` sempre inicia os exemplos. `update`, linha 152, apenas espera 420 ms para mostrar `saved`. Recarregar reinicia as notas. | Persistir e restaurar notas; estado de salvamento baseado na gravação concluída. Validar criação sem digitação, recarga, troca rápida de notas e falha de armazenamento. |
| C02 — P0 | `LiveEditor`, linhas 74–115: DOM editável por linha, serializado com `textContent`. Não trata Enter, junção por Backspace, seleção multiline, colagem ou IME. Quebras representadas por elementos DOM podem não virar `\n`. | Priorizar campo de texto único com leitura separada. Reproduzir Enter no meio da linha, colagem multiline, acentos, seleção entre parágrafos e undo/redo sem perda de caracteres. |
| C03 — P1 | `activeLine` permanece entre notas; `LiveEditor` na linha 171 não tem identidade por documento. Índice maior que a nova nota pode deixar todas as linhas em prévia. Efeito de foco depende só do índice e força cursor ao fim. | Restaurar seleção por nota ou reinicializá-la corretamente. Trocar de nota longa para curta deve permitir escrever imediatamente. |
| C04 — P1 | `Markdown`, linhas 21–49: apenas H1–H3, parágrafos, itens e código simples. Ênfase aparece em `RawSyntax` mas não na leitura. Links, citações e listas ordenadas não são interpretados; `li` não tem `ul`; prévia por linha perde contexto de blocos. | Definir sintaxe suportada e interpretação consistente. Preservar literalmente o restante. Não anunciar compatibilidade CommonMark antes de validar exemplos. |
| C05 — P1 | Realce duplicado em `Markdown` e `CodeBlock`: substituições processam HTML inserido pelas anteriores, inclusive aspas e a palavra `class` nos atributos gerados. | Remover realce ingênuo; código simples é suficiente inicialmente. Testar comentários, aspas, números, `<`, `>` e `&`. Há escape inicial; esta inspeção não demonstra exploração XSS. |
| C06 — P1 | `selectedIndex` não reinicia quando muda a consulta. Ao filtrar após navegar, Enter pode não executar o único resultado. A busca normaliza só a consulta, não o nome. | Reajustar seleção, normalizar os dois lados, mostrar estado vazio e manter seleção visível. |
| C07 — P1 | Paleta nas linhas 174–177 sem semântica de diálogo, nome acessível do campo ou gestão completa de foco. Linhas inativas só ativam por mouse; editor remove outline. | Fluxo por teclado, foco visível, identificação do diálogo e anúncio da seleção. Verificar Tab, Shift+Tab, Escape e leitor de tela. |
| C08 — P1 | Comandos dependem de atalhos; ocultar abas remove também o botão de criar nota. Ctrl/Cmd+P e T disputam ações do navegador. | Botão discreto para a paleta e comando de criar nota. Validar atalhos no ambiente alvo, sem presumir que `preventDefault` intercepte todos. |
| C09 — P1 | `index.html:8` carrega Tailwind CDN, apesar de CSS próprio; `src/styles.css:1` importa fontes remotas. | Retirar script desnecessário e usar fontes do sistema por padrão. App servido localmente deve funcionar sem rede externa. Isso não significa instalação offline/PWA. |
| C10 — P2 | Linha 171 sai da leitura em qualquer clique, inclusive copiar código. Clipboard não trata rejeição nem confirma sucesso. | Alternância explícita de leitura e feedback discreto para copiar. |
| C11 — P2 | `RawSyntax` bloqueia o marcador H1 da primeira linha; não existe renomeação. | H1 opcional e renomeação explícita, sem alterar arquivos silenciosamente. |
| C12 — P2 | `.editor-shell` tem `min-height:100vh` além da barra de 46 px. Layout vertical combina larguras de painel/editor sem estratégia clara para telas estreitas. | Revisar flex sizing e altura útil; validar 360 px, zoom 200%, linhas longas e muitas abas. Excesso de rolagem/compressão precisa de inspeção visual. |

## 4. Melhorias de manutenção

1. Separar editor, leitura, paleta e persistência em poucos módulos. Estado React local basta inicialmente.
2. Distinguir notas de abas abertas. Fechar aba nunca deve excluir texto.
3. Usar revisões por documento e gravações ordenadas: um timer antigo não pode marcar outra nota como salva nem sobrescrever conteúdo recente.
4. Persistir preferências e nota ativa com validação e versão de esquema. Dados corrompidos não devem ser silenciosamente substituídos por exemplos.
5. Padronizar npm. Os dois lockfiles foram preservados da origem; remover `bun.lock` em uma etapa própria. Substituir `latest` por versões deliberadas, mover ferramentas de build para `devDependencies` e verificar a necessidade do plugin React declarado.
6. Introduzir lint e testes focados em persistência, serialização e interação, sem infraestrutura excessiva.
7. Medir antes de otimizar: a cada edição há divisão do texto, varredura de cercas e renderização das linhas. Worker e virtualização só entram após demonstrar gargalo.

### Reaproveitamento da versão anterior

Armazenamento, exportação com Blob e separação em componentes são boas referências. Porém, `saveNotesToStorage` captura falhas sem devolvê-las ao chamador, que mostra `Saved` mesmo assim. Timers pendentes podem gravar snapshots antigos após criar/remover notas. `handleCloseTab` filtra a coleção de notas, apagando conteúdo. O editor por `input` também não resolve seleção multiline e insere uma linha no Enter sem dividir o texto na posição do cursor. Aproveitar conceitos, não transplantar essas implementações sem corrigir seus contratos.

## 5. Adições compatíveis com o minimalismo

| Recurso | Valor e limite | Momento |
| --- | --- | --- |
| Importar/exportar `.md` | Portabilidade UTF-8, sem conversão destrutiva; conflitos explícitos | Primeira versão confiável |
| Renomear, fechar e excluir com recuperação | Pela paleta; fechar não apaga, excluir oferece desfazer | Após persistência |
| Buscar na nota | Texto simples, próxima/anterior ocorrência; sem indexador global | Após editor confiável |
| Tema do sistema | Complementa claro/escuro e guarda preferência | Refinamento |
| Contagem de palavras | Opcional, sem barra permanente adicional | Opcional |
| Pasta local | Permissões, conflitos e fallback por importar/exportar definidos | Obrigatória na entrega desktop Tauri V2 |

Fora do plano inicial: contas, nuvem, colaboração, IA, plugins, grafo, banco de conhecimento, painéis de tarefas, matemática/diagramas e renderizadores pesados. Não são necessários para escrever Markdown com confiança.

## 6. Orçamento de leveza

Build da base com Vite 8.1.5:

| Artefato | Tamanho | Gzip informado pelo build |
| --- | --- | --- |
| JavaScript | 200,18 kB | 63,27 kB |
| CSS | 5,43 kB | 1,79 kB |
| HTML | 0,50 kB | 0,30 kB |

Não inclui Tailwind CDN nem fontes externas; não é o custo total de rede. Build em aproximadamente 676 ms nesta execução não mede abertura ou digitação.

Metas propostas, ainda não medidas: zero requisições externas obrigatórias, JavaScript inicial até 80 kB gzip e CSS até 10 kB gzip. Exceder exige registrar causa e benefício. Usar documentos de 10 kB, 100 kB e 1 MB, além de 100 notas para navegação. Em ambiente de referência documentado, buscar p95 de atualização visual abaixo de 16 ms para 10 kB e 50 ms para 100 kB. O caso de 1 MB é estresse: registrar degradação e integridade do texto sem prometer a mesma latência.

Registrar máquina, navegador, método e amostra; medir abertura, digitação e salvamento separadamente. Medir memória antes de fixar limite.

## 7. Validação realizada

- Comparados histórico disponível, arquivos, dependências e código das duas origens.
- SHA-256 de `src/main.jsx` e `src/styles.css` idêntico à origem.
- `npm ci --no-audit --no-fund`: sucesso, 19 pacotes instalados.
- `npm run build`: sucesso.
- Sem scripts de lint/testes. Não executados testes de navegador, acessibilidade, latência ou auditoria de dependências. Riscos de interação vêm da inspeção e precisam das reproduções propostas.

Build comprova empacotamento, não integridade da edição. Próximos passos no [plano](PLANO.md).
