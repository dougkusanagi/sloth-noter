# 0003 — Spike de IME no editor mobile

- Estado: investigação parcial; direção técnica definida, validação em aparelho pendente
- Data: 2026-10-23
- Escopo: fase 1b; problema 17 do plano mobile v2

## Contexto

O modo Editar usa o `VisualEditor` existente, com CodeMirror e decorações que escondem os
marcadores Markdown fora das linhas selecionadas. Um teclado pode substituir uma palavra inteira,
compor caracteres em etapas e alterar a seleção. Precisamos verificar se essas operações preservam
o documento antes de integrar o editor à casca mobile. O modo Código continua previsto, qualquer
que seja o resultado deste spike.

Esta etapa não implementa a navegação nem o editor da casca mobile. Não altera insets,
`100dvh`, os quatro estados de `data-keyboard`, importação, exportação, backup ou imagens.

## Ambiente e método

- Emulador `Sloth_Note_API_36`, perfil Pixel 7, Android 16/API 36, x86_64, densidade 420.
- APK debug do projeto, com WebView `133.0.6943.137`.
- Gboard `15.1.08.726012951-preload-x86_64`, layout inglês QWERTY, sugestões habilitadas.
- `@codemirror/view` 6.43.13 e `@codemirror/state` 6.7.6, conforme o lockfile.
- Página de diagnóstico `e2e/fixtures/ime-spike.html`, servida pelo Vite dentro do WebView do APK,
  via `adb reverse`. Ela monta o **mesmo `VisualEditor`**, sem salvar nem carregar notas reais.
  O conteúdo é uma fixture em memória. A página não entra no build de produção.
- Toques, sugestão, toque longo e Backspace feitos no teclado Android por `adb shell input touchscreen`.
  CDP foi usado para preparar documentos/seleções e consultar o estado, não para digitar nesses casos.
- Testes automatizados separados, com Chromium mobile e CDP `Input.imeSetComposition` /
  `Input.insertText`. Eles exercitam o motor do navegador, não Gboard ou SwiftKey.

### Dois caminhos de entrada

Nesta combinação de CodeMirror e WebView, o Android usa `EditContext`. Eventos de composição e
`textupdate` chegam nesse objeto; observar somente `compositionstart` no DOM produz uma coleta
incompleta. A fixture registra ambos, incluindo `isTrusted`, texto, intervalo de substituição,
seleção, documento e estado `view.composing`.

A opção `?legacy=1` desativa `EditorView.EDIT_CONTEXT` **apenas na fixture**, antes da montagem,
para exercitar também o caminho DOM. Não desativamos essa API no editor de produção.

## Resultados observados

### Chromium mobile: sete testes automatizados

- Composição de `ação`, `日本語` e `ideia 🦥`, nos caminhos EditContext e DOM: seis casos.
  O estado entra em composição e sai ao confirmar; os eventos de início/fim são registrados.
  O texto é inserido dentro de `**hello**`, preservando delimitadores, `world` e a linha `End`.
- Toque em `hello`, inicialmente com marcadores ocultos: a linha ativa mostra `**hello**`.
  Backspace antes da palavra remove um asterisco, sem remover o conteúdo ou as linhas vizinhas.
  Isso é edição do Markdown original, não exclusão automática de um par de marcadores.

### Gboard no WebView: quatro operações nativas

1. Digitação de `helo` tocando H, E, L e O: cada letra aparece uma vez, na posição preparada.
   Os marcadores e as linhas vizinhas permanecem.
2. Toque na sugestão `hello` para `**helo** world`: resultado `**hello** world`.
   A coleta mostra `textupdate` confiáveis que removem e reinserem parte da palavra.
3. Toque longo em `hello` antes de editar: seleção de 9 a 14 no documento
   `# IME\n\n**hello** world\n\nEnd`; a linha revela a sintaxe.
4. Backspace do Gboard nessa seleção: resultado `# IME\n\n**** world\n\nEnd`.
   A palavra selecionada é removida; os quatro asteriscos e o restante são preservados.

Não houve corrupção do documento nesses cenários. Na configuração inglesa testada, os eventos
nativos coletados foram `textupdate`, sem `compositionstart`/`compositionend`. Portanto, esses
resultados **não validam composição real de acentos, japonês ou ditado no Gboard**. Essa parte foi
exercitada somente pelo Chromium automatizado.

As capturas da fixture em 360, 390, 412 e 1280 px não mostraram overflow horizontal. O tema escuro
foi inspecionado em 390 px. Isso verifica a página de diagnóstico, não o layout do futuro editor mobile.

## Direção para o modo Editar

- Manter CodeMirror e seu tratamento de EditContext. O spike não trouxe evidência que justifique
  trocar o editor ou desligar a API globalmente.
- Reutilizar a regra atual de revelar a sintaxe em todas as linhas selecionadas. Ela já cobre a linha
  do cursor nos casos testados; não acrescentar agora uma segunda regra de composição sem uma
  reprodução que demonstre a necessidade.
- Ao integrar a fase 4, preservar a instância do editor durante a composição. Não remontá-la por
  mudanças de teclado/insets ou por atualizações de preferências. Verificar que ações de formatação
  e navegação não substituem uma composição em andamento nem perdem a seleção.
- Validar seleção, DOM e Markdown persistido em conjunto. Eventos DOM isolados não bastam no Android.
- Manter o modo Código disponível como modo próprio, sem troca automática silenciosa durante a digitação.

Não foi aplicada correção ao editor de produção: os casos reproduzidos não demonstraram uma falha
que exija mudar suas decorações. As recomendações de integração precisam de teste quando essa
interface existir; não são garantias de comportamento já implementado.

## Pendências para aprovação em aparelho

A fase 1b entrega a fixture, a cobertura automatizada e este relatório; a matriz de compatibilidade
continua aberta:

- SwiftKey não está instalado neste ambiente e não foi testado.
- Gboard em português: acentos, autocorreção ao digitar espaço, composição real e cancelamento.
- Japonês/chinês com IME real, emoji composto, ditado, digitação por gesto e teclado flutuante.
- Arrasto das alças de seleção, seleção entre linhas e edição sobre links, listas, tarefas e tabelas.
- Composição no título, troca de modo/foco durante a composição e confirmação antes de salvar.
- Aparelho físico, diferentes WebViews e teclados Samsung; o teste DOM no Chromium não substitui
  um Android antigo.
- Altura útil, rolagem até o cursor e animação IME (#14) continuam dependentes do aparelho. Os casos
  nativos finais usaram animações do sistema desativadas para estabilizar os toques; não validam animação.

## Reprodução

```sh
source ~/.config/sloth-note/android-env.sh # configuração local desta máquina
sloth-android-emulator
bun run dev -- --port 5201 --strictPort
adb reverse tcp:5201 tcp:5201
```

Com o APK debug aberto, use a inspeção remota do WebView para navegar até
`http://127.0.0.1:5201/e2e/fixtures/ime-spike.html`. No console, prepare um caso:

```js
window.__imeSpike.reset('# IME\n\n**helo** world\n\nEnd', 2)
// Toque no texto e use o teclado Android; depois consulte:
window.__imeSpike.snapshot()
```

`reset(body, anchor)` limpa a coleta; `select(anchor, head)` prepara uma seleção;
`snapshot()` devolve o documento e os eventos. Não confundir chamadas a essas funções com digitação
nativa. Para testar SwiftKey, selecione esse teclado nas configurações Android e repita os casos,
registrando versão do IME, idioma, WebView e evidências.

```sh
bun run e2e --project=mobile e2e/mobile/ime-spike.spec.js
```

As evidências desta execução ficam em
`~/.local/share/sloth-android/ime-spike-2026-10-23/` nesta máquina. São artefatos locais, não requisitos
para rodar os testes. Não há fragmento de changelog: esta entrega adiciona diagnóstico, testes e
registro técnico, sem alterar comportamento do aplicativo.
