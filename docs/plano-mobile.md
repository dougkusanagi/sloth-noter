# Plano mobile: requisitos

Este documento define **o que** a versão Android deve fazer. O
[plano de execução](plans/mobile-interface.md) define **em que ordem** fazer, o estado de cada
etapa e o próximo passo. Não há outros documentos de escopo mobile: o antigo `plano-mobile-v2.md`
foi incorporado aqui em 2026-11-07. O diagnóstico original (APK `962b01b`) está no histórico do
git: `git show 8631437:docs/plano-mobile.md`.

O protótipo [`docs/mobile-prototype/index.html`](mobile-prototype/index.html) ilustra a proposta
inicial (barra de status, recorte, gestos, teclado, tema e escala de fonte simulados). Ele não
comprova que um recurso esteja implementado nem validado no APK.

## 1. Objetivo e prioridade

1. **Parte A — paridade com o desktop (prioridade atual).** Toda função do desktop tem um
   caminho por toque no celular, ou uma exclusão registrada com o motivo (seção 4). A Parte A
   também conclui a base Android: insets, teclado, ciclo de vida, retorno e acessibilidade.
   - **Sincronização no meio da Parte A.** Assim que a usabilidade básica estiver pronta
     (etapas A1–A4 do plano de execução), a sincronização desktop ↔ celular (seção 11) vem antes
     do restante da paridade, para testar com dados reais. Decisão do usuário em 2026-11-07
     ([ADR 0009](adr/0009-sincronizacao-por-servidor-proprio.md)).
2. **Parte B — ideias novas só do mobile (depois da Parte A).** Recursos que o desktop não tem
   e que tornam o celular melhor que um port (seção 9.1 e 9.2). Não comece nenhum item da Parte
   B antes do critério de passagem da seção 4.3, salvo pedido explícito do usuário.
3. **Parte C — ideias novas para as duas plataformas (depois da Parte B).** Recursos que mudam
   desktop e celular juntos: outros provedores de sincronização, IA, hub de projetos, listas de tarefas com
   recorrência e lembretes, ponte por QR (seção 9.3). Elas só começam quando a Parte B estiver
   concluída ou quando o usuário decidir encerrá-la, salvo pedido explícito.

A regra vale para ideias novas. O trabalho já aprovado com plano e ADRs próprios, como status,
arquivo e Quadro de tarefas (ADRs 0004–0006), segue o próprio plano, e a etapa A17 depende dele.

Todo recurso, nas três partes, passa pelo filtro do [ROADMAP](ROADMAP.md): ele precisa tornar a
nota mais rápida de criar, de achar ou de fechar. Continuam fora de escopo: colaboração em tempo
real, plugins, grafo, conta obrigatória e requisição externa obrigatória.

## 2. Princípios

1. **Desktop intacto.** Nenhuma regra, componente ou comportamento do desktop muda por causa do
   mobile. A suíte E2E desktop e os testes unitários passam sem edição. Uma refatoração do
   núcleo compartilhado é permitida quando a suíte prova que nada mudou.
2. **Duas cascas, um núcleo.** Persistência, modelo de notas, tarefas, histórico, i18n, Markdown
   e o editor CodeMirror são compartilhados. Navegação, barras, menus e diálogos são próprios de
   cada casca (`src/main.jsx` no desktop, `src/mobile/` no celular).
3. **A plataforma decide a casca, não a largura.** Uma janela desktop estreita continua desktop.
   O build Android define `VITE_TARGET=mobile` (`src/platform.js`); em desenvolvimento,
   `/?platform=mobile` abre a casca mobile no navegador. O CSS mobile fica sob
   `[data-platform="mobile"]`. Antes de dizer que o APK não contém código desktop, confira o bundle.
4. **Paridade por intenção, não por interface.** Não copie a interface do desktop. Para cada
   intenção do usuário (achar uma nota, formatar, trocar de nota aberta, consultar duas notas),
   dê o caminho por toque mais curto. Atalhos de teclado continuam com teclado físico.
5. **Dentro da casca mobile, a largura decide o layout** (seção 8). Em tablet e dobrável
   aberto, o layout se aproxima do desktop.
6. **Padrões do Android.** O voltar fecha a camada de cima; alvos de toque de 48 × 48 dp; barras
   respeitam insets do sistema e do teclado; o tema inclui os ícones das barras do sistema.
7. **Nada só por gesto ou só por hover.** Todo gesto tem um botão ou item de menu equivalente,
   acessível com TalkBack.

## 3. Base Android

### 3.1 Layout: o contrato das 3 zonas

Toda tela mobile é uma coluna com 3 zonas. Nenhuma zona usa `position: fixed` sobre outra.

```
┌───────────────────────────────┐
│ inset-top (barra de status +  │  ← espaço pintado com a cor da barra do app
│ recorte da câmera)            │
├───────────────────────────────┤
│ ZONA 1: barra do app (56 dp)  │  ← sticky; não sai da tela com o teclado aberto
├───────────────────────────────┤
│ ZONA 2: conteúdo (rola)       │  ← único elemento com overflow: auto
├───────────────────────────────┤
│ ZONA 3: barra inferior        │  ← navegação (mín. 56 dp) OU formatação (mín. 52 dp)
├───────────────────────────────┤
│ inset-bottom ou teclado       │  ← o maior dos dois
└───────────────────────────────┘
```

1. A raiz usa `height: 100dvh`; não existe `--app-height`. Na etapa de ciclo de vida e IME,
   medir a relação entre altura do WebView, viewport visual e IME. Uma viewport já reduzida não
   pode receber a mesma redução outra vez pelo padding.
2. A zona 3 troca de conteúdo com o teclado. Teclado fechado: navegação (só nas telas de topo)
   ou nada. Teclado aberto: formatação (no editor) ou nada (em campos de busca). A navegação
   nunca sobe junto com o teclado.
3. O padding de baixo é `max(inset-bottom, ime-bottom)`, nunca a soma.
4. `inset-left/right` valem em paisagem com recorte lateral; aplicar na raiz.
5. Diálogos e folhas são filhos da raiz e herdam as mesmas margens.

### 3.2 Insets: uma fonte de verdade

| Inset                     | Como                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de status + recorte | `--inset-top` publicado pelo Kotlin; CSS usa `max(var(--inset-top,0px), env(safe-area-inset-top))`                                        |
| Barra de gestos/botões    | `--inset-bottom`, mesma regra                                                                                                             |
| Laterais (paisagem)       | `--inset-left` / `--inset-right`                                                                                                          |
| Teclado (IME)             | Kotlin publica `--ime-bottom`, `--ime-progress` e `data-keyboard` (`open`, `opening`, `closing`, `closed`); não aplica padding ao WebView |

Implementado em `MainActivity.kt`: `enableEdgeToEdge()` mantido, sem `setPadding` geral (o
`setPadding` do commit `e4a0f75` encolhia o WebView e foi removido);
`setOnApplyWindowInsetsListener` converte px → dp e chama `window.__insets?.({...})`, instalado
antes do bundle por `public/insets-boot.js`; `setWindowInsetsAnimationCallback` publica os
estados do teclado; o manifesto mantém `windowSoftInputMode="adjustResize"`. Sem a ponte
(navegador, Tauri dev), o JS calcula `--ime-bottom` por `visualViewport`.

Pendente no APK: primeiro frame, republicação após recriar o WebView, direção e estado final da
animação, teclados flutuantes e divididos (não inferir ausência de teclado só de `ime = 0`). O
tratamento de IME segue o [ADR 0003](adr/0003-spike-ime-mobile.md).

### 3.3 Barras do sistema

A ponte `SlothSystem.setDarkBars` ajusta os ícones das barras ao tema efetivo. Falta alinhar o
fundo atrás das barras aos tokens do app e verificar o contraste com o véu das folhas aberto, em
Claro, Escuro e Sistema.

### 3.4 Retorno e voltar preditivo

- Telas e camadas formam duas pilhas (`src/mobile/nav-stack.js`, `history.pushState`). O voltar
  fecha sempre o que está mais em cima: folha ou diálogo → teclado → tela → sair do app.
- Na raiz com gravação pendente ou com falha, o app avisa antes de sair. Um aviso não comprova
  que o texto foi salvo.
- **Voltar preditivo.** `targetSdk = 36` ativa o voltar preditivo por padrão no Android 16 ou
  superior. O `WryActivity` gerado pelo Tauri registra um `OnBackPressedCallback(true)` sempre
  ativo. Assim, na raiz o sistema não mostra a prévia de voltar para a tela inicial. Requisito:
  a casca web informa à ponte nativa se há algo para desempilhar, e o callback fica ativo só
  nesse caso. Faça a mudança em `MainActivity.kt` ou numa ponte própria, não no código gerado.
- A rota (sem texto) fica em `sessionStorage` e em `localStorage`; o `sessionStorage` tem
  prioridade, e uma referência a nota removida volta à lista. Camadas não são restauradas.

### 3.5 Ciclo de vida e gravação

- Enviar notas e histórico em `hidden` e `pagehide`. Eventos não garantem que uma gravação
  assíncrona termine antes da morte do processo: testar recarga, recriação da Activity/WebView,
  reinício do processo e encerramento durante gravação nativa lenta.
- "Salvo" depende da confirmação da persistência. Falha no histórico tem mensagem e recuperação
  próprias e não aparece como falha de gravação da nota.
- Com dados corrompidos, o celular deve oferecer o mesmo que o desktop: baixar os dados
  originais e substituir só por ação explícita.

## 4. Matriz de paridade

Esta matriz é o critério da Parte A. Estados: **feito** (código e teste no navegador),
**parcial**, **falta**, **excluído** (com motivo) e **bloqueado** (depende de outro plano). A
validação no aparelho fica na lista própria do plano de execução e não muda o estado aqui.

### 4.1 Recursos

| #   | Desktop                                                                                                    | Equivalente no celular                                                                | Estado                                                                                                                                                                           | Etapa |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| P1  | Biblioteca: lista, prévia, busca por título e texto                                                        | Tela Notas com busca no topo                                                          | feito                                                                                                                                                                            | —     |
| P2  | Busca em todas as notas: trecho, contagem, abrir na 1ª ocorrência                                          | Resultados da busca da lista                                                          | parcial: falta contagem e abrir na ocorrência                                                                                                                                    | A6    |
| P3  | Ctrl+P (nota pelo nome) e paleta de comandos (Ctrl+Shift+P)                                                | Folha **Buscar e comandos** (seção 5.9)                                               | falta                                                                                                                                                                            | A6    |
| P4  | Grupos de notas e ordenação (recentes, alfabética)                                                         | Grupos recolhíveis e ordenação na tela Notas; mover nota de grupo pela folha de ações | falta                                                                                                                                                                            | A7    |
| P5  | Fixar notas                                                                                                | Seção Fixadas e ação na folha                                                         | feito                                                                                                                                                                            | —     |
| P6  | Abas: várias notas abertas, fechar aba, posição por nota e modo                                            | **Notas abertas** (seção 5.10)                                                        | falta                                                                                                                                                                            | A8    |
| P7  | Consultar duas notas lado a lado                                                                           | Compacta: abrir a outra nota numa folha de leitura. Média/expandida: lado a lado      | falta                                                                                                                                                                            | A16   |
| P8  | Renomear (F2 e H1), com referências wiki                                                                   | Folha de ações → Renomear                                                             | feito                                                                                                                                                                            | —     |
| P9  | Lixeira: mover, desfazer, restaurar, excluir                                                               | Deslizar/folha, toast Desfazer, tela Lixeira                                          | feito                                                                                                                                                                            | —     |
| P10 | Esvaziar lixeira                                                                                           | Ação na tela Lixeira, com confirmação                                                 | feito (`e2e/mobile/navigation.spec.js`: trash can be emptied after confirmation)                                                                                                 | A1    |
| P11 | Novidades                                                                                                  | Mais opções e Configurações                                                           | feito                                                                                                                                                                            | —     |
| P12 | Seção **Sobre** (exigida pelo `AGENTS.md`)                                                                 | Configurações → Sobre: nome e versão dos metadados nativos                            | feito (`e2e/settings-layout.spec.js`: settings show the app name and version in About; `e2e/mobile/navigation.spec.js`: settings provide language, reading size, about and news) | A1    |
| P13 | Tema Claro/Escuro/Sistema                                                                                  | Mais opções (decisão 0.5.5)                                                           | feito                                                                                                                                                                            | —     |
| P14 | Idioma pt-BR/English                                                                                       | Configurações → Idioma                                                                | feito (`e2e/mobile/navigation.spec.js`: settings provide language, reading size, about and news)                                                                                 | A1    |
| P15 | Tamanho do texto                                                                                           | Configurações                                                                         | feito                                                                                                                                                                            | —     |
| P16 | Quebra de linha global, por nota e por bloco de código                                                     | Mais opções (global), folha da nota (por nota)                                        | parcial: por bloco não conferido                                                                                                                                                 | A9    |
| P17 | Recriar página de ajuda                                                                                    | Configurações → Recriar página de ajuda                                               | feito (`e2e/mobile/navigation.spec.js`: settings recreate the help page as a new note)                                                                                           | A1    |
| P18 | Toasts e alerta persistente de falha de gravação com backup                                                | Faixa de erro com Tentar de novo e Baixar backup                                      | feito (`e2e/mobile/lifecycle.spec.js`: save failure offers a backup download without entering the text again)                                                                    | A3    |
| P19 | Dados corrompidos: bloquear, baixar originais, substituir explicitamente                                   | Tela de bloqueio com baixar dados originais e substituição confirmada                 | feito (`e2e/mobile/lifecycle.spec.js`: corrupt storage can be downloaded before an explicit replacement)                                                                         | A3    |
| P20 | Modos Padrão, Código e Leitura                                                                             | Ler e Editar (Padrão)                                                                 | parcial: falta Código                                                                                                                                                            | A5    |
| P21 | Barra de seleção: negrito, itálico, código, link, H2, citação, lista, copiar/recortar/colar                | Grupo contextual da barra de formatação + menu nativo de seleção                      | concluído no navegador: `e2e/mobile/formatting-bar.spec.js`; validação de IME no APK pendente                                                                                    | A4    |
| P22 | Comando `/` e menu de inserir blocos                                                                       | Botão **Inserir** com miniaturas; `/` continua ao digitar                             | concluído no navegador: `e2e/mobile/formatting-bar.spec.js`; validação de IME no APK pendente                                                                                    | A4    |
| P23 | Atalhos de formatação (títulos, listas, tabela, imagem, código)                                            | Barra de formatação; atalhos com teclado físico                                       | concluído no navegador: `e2e/mobile/formatting-bar.spec.js`; validação de IME no APK pendente                                                                                    | A4    |
| P24 | Tab/Shift+Tab em listas, mover itens                                                                       | Recuar/Desrecuar/Mover ↑↓ no grupo de lista                                           | concluído no navegador: `e2e/mobile/formatting-bar.spec.js`; validação de IME no APK pendente                                                                                    | A4    |
| P25 | Pares ao redor da seleção, colar inteligente, continuar listas com Enter                                   | Editor compartilhado                                                                  | feito (`e2e/mobile/lifecycle.spec.js`: pares, colar inteligente e continuação de lista no perfil Android; composição no mesmo teste de IME)                                      | A3    |
| P26 | Buscar na nota (Ctrl+F)                                                                                    | Folha da nota → Buscar na nota                                                        | parcial: só em Leitura                                                                                                                                                           | A9    |
| P27 | Substituir na nota (Ctrl+H)                                                                                | Buscar na nota em edição, com Substituir                                              | falta                                                                                                                                                                            | A9    |
| P28 | Contador de palavras e caracteres                                                                          | Folha da nota → Informações                                                           | falta                                                                                                                                                                            | A9    |
| P29 | Recolher seção; recolher/expandir todas                                                                    | Seta por seção (Leitura); ações na folha da nota                                      | parcial: falta "todas"                                                                                                                                                           | A9    |
| P30 | Mover seção                                                                                                | Folha do título → Mover seção ↑↓                                                      | falta                                                                                                                                                                            | A9    |
| P31 | Recolher bloco de código                                                                                   | Editor e Leitura compartilhados                                                       | parcial: não conferido no toque                                                                                                                                                  | A9    |
| P32 | Links wiki (`[[Nota]]`, rótulo, `#Título`, criar ausente) e links externos                                 | Toque abre                                                                            | parcial: título de destino, criar ausente e externos não conferidos no APK                                                                                                       | A10   |
| P33 | Tarefas: checkbox na Leitura, biblioteca de tarefas, progresso de seções                                   | Leitura, tela Tarefas com localizar e desfazer                                        | feito; progresso de seções não conferido em 320 dp                                                                                                                               | A10   |
| P34 | Tabelas: células, menu de contexto, navegação                                                              | Seção 5.4                                                                             | parcial: rolagem local e 1ª coluna fixa                                                                                                                                          | A11   |
| P35 | Colunas (ADR 0008) e blocos recolhíveis (ADR 0007)                                                         | Seção 5.5                                                                             | parcial: renderizam pelo núcleo; layout em 360 dp não conferido                                                                                                                  | A12   |
| P36 | Inserir imagem: arquivo, colar, `/`, URL                                                                   | Inserir → Imagem, Câmera; colar                                                       | parcial: seletor de arquivo pelo editor; sem câmera                                                                                                                              | A13   |
| P37 | Biblioteca de imagens: sem uso, renomear, baixar, inserir de novo, notas que usam, excluir com referências | Aba Imagens + detalhe                                                                 | parcial: galeria com nota de origem                                                                                                                                              | A13   |
| P38 | Importar e exportar `.md` (Ctrl+O, Ctrl+E)                                                                 | Compartilhar `.md`, Exportar e Importar pelo seletor do sistema                       | parcial: compartilhar `.md` feito                                                                                                                                                | A14   |
| P39 | Backup JSON completo e restauração                                                                         | Configurações → Backup                                                                | feito; download e seletor não conferidos no APK                                                                                                                                  | A14   |
| P40 | Histórico de versões (ADR 0002)                                                                            | Folha da nota → Histórico; Configurações → Histórico                                  | falta                                                                                                                                                                            | A15   |
| P41 | Largura da coluna de texto e modo de foco                                                                  | Compacta: excluído (a nota já ocupa a tela). Média/expandida: largura e foco          | falta (média/expandida)                                                                                                                                                          | A16   |
| P42 | Atalhos de teclado e ajuda de atalhos                                                                      | Com teclado físico, os mesmos atalhos; Configurações → Atalhos                        | falta                                                                                                                                                                            | A16   |
| P43 | Ctrl+D (próxima ocorrência igual)                                                                          | Só com teclado físico                                                                 | excluído no toque: sem gesto equivalente útil                                                                                                                                    | A16   |
| P44 | Status de tarefas, arquivo e modo Quadro (ADRs 0004–0006)                                                  | Etapa 4 do [plano de status e quadro](plans/status-arquivo-quadro-tarefas.md)         | bloqueado: o desktop ainda não tem                                                                                                                                               | A17   |
| P45 | Abrir arquivos pelo sistema ("Abrir com")                                                                  | Receber `.md` como cópia interna (recomendação; decisão 6)                            | falta                                                                                                                                                                            | A19   |
| P46 | Editar arquivo no local, pasta de notas, alterações externas, instância única                              | —                                                                                     | excluído: ADR 0001 limita ao desktop; Android sem pasta de notas                                                                                                                 | —     |
| P47 | Arrastar e soltar arquivos e imagens na janela                                                             | Compartilhar para o app (texto feito; imagens e `.md` em A19)                         | parcial                                                                                                                                                                          | A19   |
| P48 | Atualização do app pelo próprio app                                                                        | —                                                                                     | excluído: o Android atualiza pelo pacote instalado                                                                                                                               | —     |
| P49 | Controles de janela                                                                                        | —                                                                                     | excluído: não se aplica                                                                                                                                                          | —     |

### 4.2 Regras da matriz

- Ao concluir uma etapa, atualize a linha: estado, e o teste que cobre (arquivo e nome do teste).
- Uma função nova do desktop entra na matriz no mesmo commit em que é entregue, com estado
  **falta** ou **excluído**.
- Exclusão precisa de motivo concreto. "Difícil no celular" não é motivo.

### 4.3 Critério de passagem para a Parte B

Todas as linhas estão em **feito**, **excluído** ou **bloqueado**; a lista de validação no
aparelho está registrada no plano de execução, com o que foi e o que não foi verificado; a
suíte local completa passa.

## 5. Telas e interações

Cores, fontes e raios vêm dos tokens de `src/styles.css` (`--bg`, `--paper`, `--accent`,
`--radius`…); o mobile não cria uma paleta nova.

### 5.1 Navegação

- **Telas de topo** com barra inferior: **Notas**, **Tarefas**, **Imagens**. A busca fica no topo
  de Notas. Lixeira, Configurações, tema e Novidades ficam em **Mais opções** (⋯ da raiz).
- Cada tela de detalhe entra por cima (220 ms, `--ease`); o voltar remove a de cima.
- Camadas (folha, diálogo, busca na nota) ficam numa segunda pilha, acima da tela.

### 5.2 Notas

- Itens com altura mínima de 64 dp, que crescem com a fonte: título e prévia.
- Data relativa só depois de definir e persistir datas de alteração; o modelo atual não as tem.
  Não apresentar ordem de abertura como data de modificação.
- Busca com termo: "Resultados", trechos com o termo destacado. Abrir e voltar mantém termo e
  rolagem. Sem resultados: "Nada encontrado para “x”." + "Criar nota “x”". Buscas recentes ao
  focar o campo vazio.
- Toque longo → folha de ações (Fixar, Renomear, Compartilhar, Lixeira). Deslizar para a
  esquerda → Lixeira, sem confirmação, com Desfazer. O botão de ações continua visível.
- Estados: vazio, carregando, erro de leitura com "Tentar de novo".

### 5.3 Nota e os 3 modos

| Modo       | Para quê                               | Como entrar                    |
| ---------- | -------------------------------------- | ------------------------------ |
| **Ler**    | Consultar e marcar tarefas sem teclado | Padrão ao abrir nota existente |
| **Editar** | Edição visual (modo Padrão do desktop) | "Editar" na barra do app       |
| **Código** | Markdown puro, com sintaxe visível     | Folha da nota → "Modo código"  |

- Nota nova abre em Editar. "Dois toques no ponto para editar" é opcional e só entra se não
  conflitar com o zoom de acessibilidade.
- **Código:** o desktop usa `textarea`. Antes de implementar, comparar com CodeMirror sem
  decorações (composição, seleção, desfazer/refazer, busca, histórico) e registrar a escolha no
  plano de execução; propor ADR se mudar um contrato compartilhado. Fonte mono,
  `autocapitalize="off"`, `spellcheck="false"`. O modo fica salvo por nota, sem abrir o teclado
  sozinho. Preservar Markdown e seleção ao alternar.
- Barra do app: ←, título, **Editar/Pronto**, ⋯. Um selo "Código" mostra o modo.
- Indicador de gravação: "Salvo" / "Salvando…" / "Não foi possível salvar — tocar para tentar de
  novo". Nunca inventar progresso.
- Margens de 16 dp; sem o gutter de 40 px.
- **Folha da nota** (só ações implementadas): Buscar na nota, Recolher/Expandir todas as seções,
  Informações (palavras e caracteres), Modo código, Quebrar linhas, Renomear, Fixar,
  Compartilhar texto, Compartilhar `.md`, Exportar, Histórico, Lixeira.

### 5.4 Tabelas

**Leitura**

- Barra acima da tabela: "3 linhas · 5 colunas", alternador **Ver cartões / Ver tabela** e
  **tela cheia**.
- **Tabela:** rola na horizontal dentro do bloco (a página não rola de lado); 1ª coluna fixa;
  cabeçalho fixo na rolagem vertical; sombras nas bordas; células de 96 a 220 dp com
  `overflow-wrap: anywhere`.
- **Cartões:** cada linha vira um cartão "coluna: valor"; a 1ª coluna é o título. Padrão para
  mais de 3 colunas é recomendação ainda em aberto (decisão 5).
- A preferência por tabela e a rota de tela cheia identificam nota + bloco. Definir a validade
  após edição e descartar referências ambíguas. Não inserir IDs no Markdown nem trocar de tabela
  em silêncio. Testar duas tabelas iguais e edição antes do bloco.
- **Tela cheia:** sem margens, com rotação para paisagem e zoom de pinça. Voltar retorna ao ponto.

**Edição**

- Sempre em visão tabela. Tocar numa célula edita só o texto dela; o usuário não vê nem digita `|`.
- Barra contextual: célula anterior/próxima, + linha, + coluna, e ⋯ para apagar linha/coluna e
  alinhar. Enter na última célula cria a próxima linha (`table-navigation.js`).
- Inserir → Tabela → grade de até 6 × 6 → cursor na 1ª célula do cabeçalho.

**Código:** preservar o texto; alinhar colunas só por ação explícita (`markdown-table.js`).

### 5.5 Colunas e blocos recolhíveis

- **Leitura em largura compacta:** colunas viram uma pilha vertical, na ordem do Markdown, com um
  separador e o rótulo "Coluna 1 de 2". Em média e expandida, lado a lado como no desktop. O
  Markdown não muda.
- **Edição:** inserir pelo Inserir; adicionar e remover coluna pela barra contextual da coluna,
  sem apagar o conteúdo. Arrastar entre colunas (desktop) tem equivalente por toque: "Mover para
  a coluna…" na seleção, com desfazer.
- **Blocos recolhíveis:** o título abre e fecha com um toque (alvo de 48 dp); editar o título e
  o conteúdo como no desktop.
- Testar 320 dp, fonte 2×, colunas com tabela ou imagem dentro.

### 5.6 Barra de formatação

Altura mínima de 52 dp sobre o teclado. Cinco ações no grupo é um teto, não uma obrigação.

```
[ ＋ Inserir ]  ( grupo do contexto )  ··········  [ ↶ ] [ ⌨⌄ ]
```

1. **＋ Inserir:** folha com cartões e miniatura do resultado: Título, Lista, Tarefa, Tabela,
   Código, Citação, Imagem, Câmera, Link para nota, Divisor, Data de hoje, Bloco recolhível,
   Colunas. Insere na linha do cursor. Usa as mesmas ações do menu `/` (`insert-block.js`).
2. **Grupo do contexto** (até 5 ícones lucide):

   | Cursor em       | Grupo                                                                                          |
   | --------------- | ---------------------------------------------------------------------------------------------- |
   | Texto comum     | Aa (estilos) · Lista · Tarefa · Link                                                           |
   | Texto + "Aa"    | Negrito · Itálico · Tachado · Código em linha · Link                                           |
   | Seleção ativa   | Estilos + Copiar · Recortar · Colar (paridade da 0.5.0)                                        |
   | Título          | H1 · H2 · H3 · H4 · ¶                                                                          |
   | Item de lista   | Desrecuar · Recuar · Mover ↑ · Mover ↓ · Alternar tarefa                                       |
   | Tabela          | Célula ← · Célula → · + Linha · + Coluna · ⋯                                                   |
   | Bloco de código | Tab · Linguagem · Copiar bloco · Quebrar linhas                                                |
   | Modo Código     | Até 5 símbolos (Tab, `#`, `-`, `[ ]`, `\|`); demais na folha Símbolos; entra com o modo Código |

3. **Desfazer** e **esconder teclado** ficam sempre na barra. **Refazer** fica na folha de
   edição; toque longo no Desfazer é atalho adicional.
4. Em telas estreitas, manter Inserir, Desfazer e esconder teclado; o resto vai para uma folha
   explícita. Não reduzir alvos abaixo de 48 dp.
5. Preservar instância do editor, seleção e composição ao abrir folhas. Testar 320/360/390/412 dp,
   fonte 1×/1,3×/2×, teclado físico e composição.

Funções reutilizadas: `format-selection.js`, `list-indent.js`, `list-move.js`,
`markdown-table.js`, `table-navigation.js`, `insert-block.js`, `section-move.js`, `clipboard.js`.

### 5.7 Tarefas

Lista das tarefas abertas por nota; o checkbox conclui com Desfazer; o texto abre a nota em
Leitura no trecho, com realce. Se o texto mudou, abrir a nota sem apontar uma tarefa errada.
Status, arquivo e Quadro seguem a etapa 4 do
[plano de status e quadro](plans/status-arquivo-quadro-tarefas.md), depois das etapas 1–3 no
desktop: uma coluna por vez, abas por status, mudar status pelo menu da etiqueta (ADR 0006).
Recorrência e lembretes são trabalho futuro do ROADMAP.

### 5.8 Imagens

Galeria em 2 colunas, respeitando a proporção, com a nota de origem. Filtro "Sem uso". Botão de
câmera na barra do app: a foto vira imagem nova e abre "Inserir em qual nota?" (ou "Nova nota").
Detalhe: Compartilhar, Renomear, Inserir de novo, Notas que usam, Excluir (remove as referências
e mantém o texto alternativo, como no desktop). Testar permissão, cancelamento, falha, rotação e
retorno da câmera sem perder texto.

### 5.9 Buscar e comandos

Paridade de Ctrl+P, Ctrl+Shift+F e Ctrl+Shift+P numa folha só, aberta por um botão de busca no
cabeçalho de qualquer tela.

- Sem prefixo: notas por nome e por texto, com trecho e contagem; abrir leva à 1ª ocorrência.
- `>`: ações disponíveis na tela atual, com os mesmos rótulos i18n do desktop. Ações
  indisponíveis ficam ocultas, como no desktop.
- `#`: títulos da nota aberta (ou de todas as notas, sem nota aberta).
- Sem resultados: "Criar nota “x”".
- Com teclado físico, Ctrl+P e Ctrl+Shift+P abrem a mesma folha.
- Ações mobile e desktop compartilham rótulos e regras; não exigir um registro único de ações
  sem antes conferir o acoplamento de `src/commands.js` com `main.jsx`.

### 5.10 Notas abertas

Paridade das abas. O estado já guarda `openIds` e `activeId`.

- Na nota, o título no cabeçalho abre a folha **Notas abertas**: lista das abertas, a atual
  marcada, "Fechar" em cada uma e "Fechar as outras".
- Cada nota aberta guarda modo, cursor e rolagem enquanto o app estiver aberto, como no desktop.
- Fechar não exclui nem altera a nota. Abrir uma nota pela lista a acrescenta às abertas.

### 5.11 Folhas inferiores

Alça de 32 × 4 dp, arrastar para fechar, toque no véu fecha, voltar fecha. Foco no primeiro item
e retorno ao acionador. Altura máxima: viewport visível − inset-top − 24 dp; acima disso, rola
por dentro.

### 5.12 Configurações e Sobre

Configurações: Aparência (tema, tamanho do texto, quebra de linhas), Idioma, Editor (modo ao
abrir nota, se decidido), Histórico, Backup, Novidades, Recriar página de ajuda, Atalhos (com
teclado físico) e **Sobre**. Sobre mostra o nome **Sloth Note** e a versão lida dos metadados
nativos (`getVersion()` de `@tauri-apps/api/app`, que vem de `package.json` pelo
`tauri.conf.json`). Na versão web, sem Tauri, ler a mesma fonte no build (`package.json` pelo
Vite). Não manter versão literal na interface. Use um componente compartilhado com o desktop,
que também não tem Sobre hoje.

### 5.13 Compartilhamento, arquivos e histórico

- **Compartilhar texto** (feito) e **compartilhar `.md`** (feito: UTF-8, `text/markdown`,
  FileProvider com leitura temporária, um arquivo por vez em `cache/shared`).
- **Exportar:** escolher destino pelo seletor do sistema; não é sinônimo de compartilhar. Informar
  quando as imagens referenciadas não acompanham o arquivo.
- **Importar:** pelo seletor do sistema; validar formato; nome pelo H1; conflitos com o mesmo
  diálogo do desktop; preservar o documento em cancelamento e falha.
- **Backup:** inclui imagens; restaurar exige prévia e trata dados inválidos, duplicidade e falta
  de espaço. Não inclui diários de versões.
- **Histórico de versões:** ADR 0002, ativação explícita neste dispositivo, retenção, limpeza,
  restauração e aviso separado de falha. Fora da rede e do backup.
- **Receber texto** (parcial) e **"Abrir com"**: independentes do compartilhamento de saída.
  Antes de receber arquivos, fechar cópia interna versus edição do original (decisão 6).

## 6. Catálogo de problemas só do celular

Cada item vira um teste: **E2E** (Playwright mobile com insets simulados), **U** (unitário) ou
**M** (aparelho). Cada problema aponta para teste ou checklist com ambiente, resultado e
evidência; um número no nome do teste não comprova cobertura.

### 6.1 Sistema

| #   | Problema                                                         | Solução                                                                                      | Teste  |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| 1   | Barra de status cobre o topo                                     | Seção 3.2                                                                                    | E2E, M |
| 2   | Recorte da câmera                                                | União dos insets de barras e recorte, sem somar áreas sobrepostas; inset lateral em paisagem | M      |
| 3   | Barra de gestos cobre FAB e barra inferior                       | `inset-bottom` na zona 3; FAB acima                                                          | E2E    |
| 4   | Gesto voltar pela borda conflita com arrastar na margem          | Nada de arrastar a menos de 24 dp das bordas laterais; sem `systemGestureExclusionRects`     | M      |
| 5   | Voltar fecha o app em vez da folha                               | Seção 3.4                                                                                    | E2E, U |
| 6   | Processo morto em segundo plano perde o texto                    | Seção 3.5                                                                                    | E2E, M |
| 7   | Volta ao app depois de horas: estado perdido                     | Rota em `localStorage`; distinguir recarga, recriação do WebView e reinício do processo      | E2E, M |
| 8   | Rotação recria a Activity                                        | `configChanges` (o Tauri define); cursor e rolagem ficam                                     | M      |
| 9   | Tela dividida ou janela ≤ 320 dp de largura / ≤ 400 dp de altura | Reorganizar e levar excedentes para folhas, sem perder destinos e ações                      | E2E    |
| 10  | Escala de fonte do sistema 1,3×–2×                               | `rem`; `textZoom` respeitado; barras crescem em altura                                       | M      |
| 11  | Tema do sistema muda com o app aberto                            | `matchMedia` do modo Sistema; refaz cores das barras                                         | E2E    |
| 25  | Voltar preditivo sem prévia na raiz                              | Seção 3.4: callback ativo só com algo para desempilhar                                       | M      |
| 26  | Tablet, dobrável ou janela redimensionada                        | Seção 8: layout por classe de janela, sem recriar estado                                     | E2E, M |

### 6.2 Teclado

| #   | Problema                                            | Solução                                                                                | Teste  |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| 12  | Teclado cobre o cursor                              | `EditorView.scrollMargins` com `bottom = zona 3 + 24 dp`; `scrollIntoView` após `open` | E2E    |
| 13  | Teclado cobre o botão primário de diálogos          | Diálogos com campo viram folhas ancoradas na zona 3                                    | E2E    |
| 14  | Texto pula durante a animação do teclado            | Medir em `opening`/`closing`; ajustar sem remontar o editor                            | E2E, M |
| 15  | Teclado abre sem querer ao tocar para ler           | Nota existente abre em Ler                                                             | E2E    |
| 16  | Não há como esconder o teclado sem perder a posição | Botão na barra; voltar com teclado aberto só fecha o teclado                           | E2E    |
| 17  | Composição do IME quebra com sintaxe oculta         | ADR 0003: manter EditContext e sintaxe das linhas selecionadas                         | E2E, M |
| 18  | Autocorreção/maiúscula em nomes e busca             | `autocapitalize`, `autocorrect`, `spellcheck`, `enterkeyhint` por campo                | U      |
| 19  | Sem Tab/Shift+Tab nem atalhos                       | Recuar/desrecuar e desfazer/refazer na barra                                           | E2E    |
| 20  | Teclado físico (Bluetooth, DeX, Chromebook)         | Atalhos do desktop; barra de formatação some se nenhum IME abrir                       | M      |

### 6.3 Toque

| #   | Problema                                           | Solução                                                                   | Teste  |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| 21  | Alvos pequenos                                     | Área efetiva de 48 × 48 dp sem sobrepor controles                         | E2E, M |
| 22  | Hover não existe                                   | O que o desktop mostra no hover fica visível ou vai para toque longo      | E2E    |
| 23  | Menu de seleção nativo disputa com barra flutuante | Barra flutuante desligada; formatação só na zona 3                        | M      |
| 24  | Toque duplo dá zoom, 300 ms de atraso              | `touch-action: manipulation`; `user-scalable` mantido para acessibilidade | M      |

## 7. Testes

- **Por incremento:** testes afetados passando antes do commit. Mudança no núcleo ou no editor
  compartilhado também roda a regressão desktop, sem enfraquecer asserções.
- **Ao fechar uma etapa:** `bun run test`, `bun run desktop:test` e `bun run e2e` (chromium e
  mobile); também `bun run lint`, formatação dos arquivos alterados, `bun run version:check` e
  `bun run build`. Não usar CI para validar nem alterar workflows.
- **E2E mobile** (`e2e/mobile/`): fixture de insets (`window.__insets({ top: 32, bottom: 24, ime: 0 })`)
  e de teclado (`ime: 300`, `data-keyboard=open`). Capturas em 320, 360 × 740, 390 × 844 e
  412 × 915, claro e escuro, mais paisagem e 600/840 dp nas telas afetadas. Inspecionar as imagens;
  passar no axe não comprova geometria.
- **Dados de teste:** título de 200 caracteres, palavra de 80 letras, tabela de 12 colunas,
  duas tabelas iguais, células vazias e longas, código largo, 300 notas, nota vazia, lista com 6
  níveis, nomes duplicados, colunas com tabela, imagens locais com proporções variadas.
- **Aparelho:** gestos e 3 botões; Gboard, SwiftKey, Samsung Keyboard, ditado; teclado flutuante;
  fonte 1,3× e 2×; TalkBack; animações ativadas. "Não manter atividades" não substitui o teste de
  morte do processo. Registrar Android, WebView, teclado, idioma e aparelho.

## 8. Classes de janela

Dentro da casca mobile, o layout segue a largura da janela (limites do Material):

| Classe    | Largura    | Layout                                                                                                   |
| --------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| Compacta  | < 600 dp   | Casca atual: uma tela por vez                                                                            |
| Média     | 600–839 dp | Lista e nota lado a lado; barra inferior vira trilho lateral                                             |
| Expandida | ≥ 840 dp   | Biblioteca lateral, nota, e segunda nota em leitura ao lado (P7); largura da coluna e modo de foco (P41) |

- A troca de classe (girar, abrir o dobrável, janela dividida) não perde rota, texto, cursor nem
  composição do IME.
- Com teclado físico, atalhos do desktop e a folha Buscar e comandos (P42).
- Não muda o princípio 3: um desktop estreito continua desktop.

## 9. Ideias novas (Partes B e C)

A Parte B (9.1 e 9.2) só começa depois do critério da seção 4.3. A Parte C (9.3) só começa
depois da Parte B. Cada ideia tem: o que é, por que passa no filtro do ROADMAP,
restrições, alternativa acessível e "pronto quando". As marcadas com **ADR** exigem ADR aceito
antes de implementar.

### 9.1 Recursos da plataforma

| #   | Ideia                           | O que é e restrições                                                                                                                                                                           | Pronto quando                                                                  |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| B1  | Transições compartilhadas       | View Transitions API: o título da lista se transforma no H1 da nota, e o inverso ao voltar. Sem suporte ou com `prefers-reduced-motion`, troca sem animação                                    | Abrir e voltar animam sem salto; sem suporte, nada quebra                      |
| B2  | Háptica com significado         | Vibração curta só em limites: deslizar passa do ponto de exclusão, tarefa concluída, passagem por título (B11). Respeitar a configuração de vibração do sistema; sem efeito decorativo         | Cada evento tem um teste da ponte e conferência no aparelho                    |
| B3  | Bloco nas Configurações rápidas | "Nova nota" no painel do sistema (`TileService`), reutilizando a ação de 7.3                                                                                                                   | Uma nota por toque, com app aberto e fechado                                   |
| B4  | App de notas do sistema         | Papel `ROLE_NOTES` (Android 14+): abrir uma nota nova pela caneta ou pela tela de bloqueio. Definir o que aparece com o aparelho bloqueado antes de implementar (privacidade). **ADR**         | Nota criada na tela de bloqueio sem expor outras notas                         |
| B5  | Widget de lista fixada          | Widget com as tarefas de uma nota fixada; marcar tarefa sem abrir o app. Exige ler e gravar a nota no lado nativo com as mesmas regras de `tasks.js` e da fila de gravação. **ADR**            | Marcar no widget altera o Markdown igual ao app, sem conflito com o app aberto |
| B6  | Caneta                          | Escrita à mão convertida em texto no editor, onde o WebView suportar. Não criar formato de desenho                                                                                             | Escrever com caneta insere texto na posição do cursor                          |
| B7  | IA no aparelho (opcional)       | Revisar e resumir pelo Gemini Nano (ML Kit GenAI), sem rede, só em aparelhos compatíveis. Segue [IA e sync](IA-E-SYNC.md). Desligado por padrão; o resultado é uma sugestão a aceitar. **ADR** | Sem modelo disponível, a ação some; o texto só muda após aceitar               |

### 9.2 Ideias originais

| #   | Ideia                            | O que é e restrições                                                                                                                                                                                                                  | Pronto quando                                                                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B8  | Barra de comando puxada do topo  | Arrastar o cabeçalho para baixo abre a folha Buscar e comandos (5.9) com o teclado pronto. O botão de busca continua                                                                                                                  | Puxar e tocar no botão abrem a mesma folha                                                       |
| B9  | Notas abertas como baralho       | Deslizar o título na horizontal troca para a nota aberta anterior ou seguinte (5.10), com a posição de cada uma. Fica longe das bordas (problema 4); a folha Notas abertas continua                                                   | Troca sem perder cursor, rolagem e modo; não dispara durante seleção de texto                    |
| B10 | Gestos de estrutura no editor    | Deslizar um item de lista recua ou desrecua; segurar o marcador e arrastar move o item (`list-move.js`); deslizar um parágrafo o transforma em tarefa. Cada gesto tem botão na barra (5.6)                                            | Gesto e botão geram o mesmo Markdown e o mesmo desfazer                                          |
| B11 | Régua de títulos                 | Ao arrastar a barra de rolagem, aparecem os nomes dos H2 e há vibração (B2) a cada seção. A área de arraste fica a mais de 24 dp da borda (problema 4). Alternativa: Buscar e comandos com `#`                                        | Arrastar leva à seção certa; TalkBack usa a lista de títulos                                     |
| B12 | Zoom semântico por pinça         | Na Leitura, pinça alterna: texto completo → esboço (títulos + 1ª linha) → só títulos. Usa `sections.js`. Não pode tirar o zoom de acessibilidade (problema 24): definir o gesto com teste antes; botões equivalentes na folha da nota | Os três níveis funcionam por botão e por gesto; zoom do sistema continua                         |
| B13 | Lupa de tabela                   | Toque longo numa célula mostra a linha inteira como cartão flutuante. Pode resolver a decisão 5 sem impor cartões                                                                                                                     | Cartão mostra cabeçalho: valor de todas as colunas e fecha com voltar                            |
| B14 | Trackpad estrutural              | Deslizar na barra de formatação move o cursor de bloco em bloco Markdown (célula, item, título). Não conflitar com a rolagem da barra                                                                                                 | Cursor chega à célula ou item seguinte sem abrir menu                                            |
| B15 | Quadro com gestos                | Depois de A17: colunas em carrossel; arrastar o cartão para a borda passa à coluna seguinte, com vibração; o menu de status continua                                                                                                  | Gesto e menu geram o mesmo Markdown (ADR 0004)                                                   |
| B16 | Modelos de nota ao criar         | Ao criar uma nota, escolher um modelo como no Notion, por exemplo **Tarefas** (seções com checkboxes) e **Tabela** (cabeçalho e linhas); outros modelos a definir. O corpo vira Markdown comum editável                               | Escolher modelo cria a nota editável com o corpo do modelo; criação sem modelo segue um toque só |
| B17 | Captura por câmera com OCR local | Foto de texto vira Markdown (lista ou tabela) no aparelho, sem rede. Avaliar peso da dependência antes. **ADR**                                                                                                                       | Texto reconhecido entra como sugestão editável antes de inserir                                  |

Ordem sugerida na Parte B: B1, B2 (base para as outras) → B8, B9, B10 (prolongam a Parte A) →
B16 (pedido direto do usuário em 2026-11-09) → B11–B14 → B3 → B15 (depois de A17) → B4–B7, B17
(exigem ADR).

### 9.3 Parte C — ideias para as duas plataformas

Estas propostas mudam o desktop e o celular. Cada uma tem documento próprio, e nenhuma está
aprovada só por estar nesta lista.

| #   | Ideia                                                              | Onde está a proposta                                                          | Observação                                                                                                                                    |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Ponte por QR, sem conta                                            | Este documento                                                                | O desktop mostra um QR com uma nota curta; a câmera do celular cria a nota. Sem rede nem servidor. Definir limite, formato e imagens. **ADR** |
| C2  | Outros provedores de sincronização e backup remoto                 | [IA e sync](IA-E-SYNC.md#6-sincronização-opcional-e-provedor-github), ROADMAP | O servidor próprio (seção 11) vem antes, na Parte A. Aqui ficam GitHub, nuvem do usuário, rede local e a oferta a outras pessoas. **ADR**     |
| C3  | IA local e assistente                                              | [IA e sync](IA-E-SYNC.md)                                                     | O ROADMAP coloca tarefas e sincronização antes da IA local                                                                                    |
| C4  | Listas de tarefas, histórico de conclusão, recorrência e lembretes | [ROADMAP](ROADMAP.md), itens 1–3 de "Tarefas, sincronização e mobile"         | Exigem IDs estáveis e formato portável antes de implementar                                                                                   |
| C5  | Hub de projetos                                                    | [Hub de projetos](HUB-DE-PROJETOS.md)                                         | Proposta sem prioridade                                                                                                                       |

Uma ideia da Parte C que precise de algo da Parte B (por exemplo, câmera ou háptica) reaproveita
o que a Parte B entregou.

## 10. Decisões

Tomadas:

1. Barra inferior: Notas, Tarefas, Imagens; busca no topo de Notas.
2. Lixeira sem confirmação, com Desfazer no toast.
3. Modo Código faz parte do escopo mobile.
4. Sem `setPadding` nativo geral; contrato da seção 3.2.
5. Tema fora do cabeçalho; no celular, em Mais opções (0.5.5).
6. Ordem (2026-11-07): usabilidade básica (A1–A4) → sincronização por servidor próprio (seção 11)
   → restante da paridade (A5–A19) → ideias novas só do mobile (Parte B) → ideias novas para as
   duas plataformas (Parte C).
7. Sincronização por servidor próprio no Cloudflare, migrável para uma VPS (ADR 0009).

Em aberto (decidir antes da etapa indicada):

1. **Visão padrão das tabelas** (A11): cartões para mais de 3 colunas (recomendado) ou sempre
   tabela. B13 pode tornar a escolha desnecessária.
2. **Receber arquivos** (A19): cópia interna (recomendado) ou editar o original. Editar no local
   exige ADR próprio, sem alterar o ADR 0001.
3. **Editor do modo Código** (A5): `textarea` como no desktop ou CodeMirror sem decorações.
4. **Referência de bloco de tabela** (A11): como identificar a tabela e quando a referência perde
   a validade.
5. **Colunas em largura compacta** (A12): pilha vertical (recomendado) ou rolagem horizontal.
6. **Modo ao abrir nota existente** (A1): Ler sempre (atual) ou opção em Configurações.

Os ADRs 0001 e 0002 continuam aceitos e inalterados. O ADR 0003 é um relatório parcial com
matriz pendente, não uma aprovação de compatibilidade.

## 11. Sincronização

Decisão: [ADR 0009](adr/0009-sincronizacao-por-servidor-proprio.md). Ordem: logo depois da
usabilidade básica (A1–A4), antes do restante da paridade. As etapas S1–S4 estão no plano de
execução.

### 11.1 Objetivo

Manter as notas do desktop e do celular da mesma pessoa iguais, para testar o Android com dados
reais, sem pagar servidor. O servidor de referência roda no plano grátis do Cloudflare (Workers +
D1 + R2). Uma VPS barata pode substituí-lo sem mudar o app.

### 11.2 Escopo

- **Um servidor por pessoa.** O app não traz servidor embutido. Em Configurações →
  Sincronização, a pessoa informa o endereço do servidor e a chave de acesso. A sincronização
  começa desligada. Motivo: os limites grátis valem por conta do Cloudflare, e o projeto não
  guarda notas de outras pessoas.
- **Local primeiro.** Sem servidor, sem rede ou com o servidor fora do ar, o app funciona igual.
  A falha de sincronização nunca bloqueia nem atrasa a gravação local.
- **Sincroniza:** texto e nome das notas, exclusões e lixeira, imagens locais (`assets/…`),
  fixadas e grupos.
- **Não sincroniza:** preferências do aparelho (tema, tamanho do texto, quebra de linha), notas
  abertas, recentes e buscas recentes, e o histórico de versões, que continua local (ADR 0002).
- **Não é backup.** O backup JSON continua como está.
- **Fora desta entrega:** sincronização em segundo plano no Android, notificações, vários
  usuários por servidor, compartilhar notas e a versão web.

### 11.3 API do servidor

Pequena, versionada (`/v1`) e sem nada específico do Cloudflare no app, para permitir a troca
por uma VPS. Os detalhes finais saem do ADR de protocolo (S1); esta é a forma esperada:

| Pedido                           | Para quê                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /v1/changes?since=<cursor>` | Mudanças desde o cursor: ID, revisão, hash do conteúdo, exclusão; devolve o novo cursor |
| `GET /v1/notes/:id`              | Conteúdo e metadados de uma revisão                                                     |
| `PUT /v1/notes/:id`              | Grava com `If-Match: <revisão>`; responde 409 se outro aparelho gravou antes            |
| `GET` / `PUT /v1/blobs/:sha256`  | Imagens por hash; o `PUT` é idempotente e só acontece se o servidor não tiver o arquivo |

- Autenticação por `Authorization: Bearer <chave>` sobre HTTPS. A chave não fica em texto puro
  nas preferências: usar o armazenamento seguro de cada sistema (definir em S1).
- Respostas de erro com código estável (`unauthorized`, `conflict`, `rate_limited`,
  `server_error`), traduzido na interface como as mensagens de disco atuais.

### 11.4 Servidor de referência

- Código em `server/` no repositório: Worker, D1 para metadados e cursor, R2 para conteúdo e
  imagens. Implantação com `wrangler` e testes locais com `wrangler dev`/Miniflare.
- Guia curto no README: criar a conta, implantar, gerar a chave, colar endereço e chave no app.
- Exportar e importar todos os dados do servidor, para migrar para uma VPS sem perda.
- Limites do plano grátis consultados em 2026-11-07: D1 com 5 GB, 5 milhões de linhas lidas e
  100 mil gravadas por dia; R2 com 10 GB por mês, 1 milhão de gravações e listagens e 10 milhões
  de leituras por mês, saída grátis. Conferir as páginas oficiais antes de S2. O motor agrupa
  envios e evita listagens; ao passar do limite, o app mostra que o servidor recusou por limite
  e quando tentar de novo, sem perder nada.

### 11.5 Motor de sincronização

- Módulo puro `src/sync/`, sem React, com testes unitários. As duas cascas o usam pelo contrato de
  persistência; componentes não chamam a rede nem APIs nativas diretamente.
- **ID estável por nota.** As notas já têm `id` (UUID). Renomear pelo H1 não muda o ID. Na pasta
  de notas do desktop, o ID fica no estado auxiliar ligado ao nome do arquivo; uma renomeação
  feita fora do app aparece como nota nova. S1 define como evitar duplicar nesse caso.
- **Base comum.** Guardar, por nota, a última revisão sincronizada. Com edição nos dois lados,
  mesclar em três vias por linha. Se as duas edições mudarem o mesmo trecho, manter as duas
  versões ("Nome (conflito de <aparelho>)") e avisar. Nunca perder texto.
- **Exclusões** como marcas com data. Restaurar da lixeira num aparelho restaura no outro.
  Excluir de vez também se propaga.
- **Imagens** por SHA-256. No desktop e no Android as imagens já usam o mesmo formato de
  referência (`assets/<uuid>-<nome>`); a versão web usa data URLs e fica fora.
- **Pasta de notas no desktop.** Os `.md` continuam a fonte de verdade. A sincronização lê e grava
  pela mesma persistência, com as mesmas regras de conflito de alterações externas.
- **Quando sincroniza:** ao abrir o app, ao voltar ao primeiro plano, alguns segundos depois de
  gravar e pelo botão "Sincronizar agora".
- **Primeira sincronização** de um aparelho com notas num servidor com notas: mostrar antes uma
  prévia ("12 notas serão enviadas, 30 serão recebidas, 1 conflito") e só seguir com
  confirmação. Notas com o mesmo nome e o mesmo conteúdo (como a página de ajuda) não duplicam.

### 11.6 Interface

- Configurações → Sincronização nas duas cascas: endereço, chave, Testar conexão, Ligar/Desligar,
  Sincronizar agora, nome deste aparelho e horário da última sincronização confirmada.
- Estados: "Sincronizado", "Sincronizando…", "Sem conexão: as mudanças ficam neste aparelho",
  "Não foi possível sincronizar — tentar de novo", "Limite do servidor atingido". Nunca mostrar
  "Sincronizado" sem a confirmação do servidor.
- Conflito: aviso com acesso direto às duas versões.
- Ao ligar, avisar em linguagem simples: as notas ficam guardadas no servidor da pessoa, e quem
  controla a conta do Cloudflare (a própria pessoa e o Cloudflare) consegue ler o conteúdo, a
  menos que a criptografia de ponta a ponta seja adotada.

### 11.7 Testes

- Unitários do motor: mesclagem sem conflito, conflito, exclusão contra edição, restauração,
  renomeação, imagens repetidas, primeira sincronização, cursor perdido.
- Testes de contrato da API rodando contra o servidor local; o mesmo conjunto vale para a futura
  VPS.
- E2E desktop e mobile com servidor local: dois aparelhos simulados, rede caindo no meio do envio,
  servidor respondendo 401, 409, 429 e 500.
- Ponta a ponta real: desktop + APK com o servidor implantado; registrar na lista de validação.
- Dados: 300 notas, nota de 1 MB, imagens de proporções variadas até 20 MB, nomes com acentos e
  nomes repetidos.

### 11.8 Decisões em aberto (fechar em S1)

1. **Criptografia de ponta a ponta:** cifrar no aparelho antes de enviar (o servidor não lê nada)
   ou só HTTPS + chave. Recomendação: cifrar, porque o custo é baixo agora e alto depois.
2. **Armazenamento da chave** no desktop e no Android.
3. **Renomeação fora do app** na pasta de notas: como reconhecer e evitar duplicar.
4. **Retenção no servidor:** guardar só a última revisão ou algumas anteriores.
5. **Granularidade da mesclagem:** por linha (recomendado) ou por bloco Markdown.
