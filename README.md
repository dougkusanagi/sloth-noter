# Sloth Note

Editor Markdown local com abas opcionais, busca de notas e de texto na nota, e modos de edição e leitura.

O MVP web está concluído. Pasta local, sincronização e aplicativo desktop permanecem no roadmap como trabalhos separados.

Base copiada de `../sloth-note-gpt`, commit `443d23c`, de 24/07/2026. `../sloth-note` foi consultado como referência complementar.

**Estado atual:** as notas são gravadas no armazenamento deste navegador a cada alteração. Falhas de gravação aparecem em um alerta; o estado também é anunciado a tecnologias assistivas. É possível importar e exportar `.md`, baixar e restaurar um backup completo `.json`, renomear notas, fechar abas sem apagar o texto e mover notas para uma lixeira que persiste após recarga. A lixeira permite restaurar ou apagar definitivamente. Ainda não há pasta local conectada nem sincronização. Faça exportações para manter uma cópia fora do navegador.

O ícone ☰, o nome do app e as abas compartilham uma única header. As abas rolam horizontalmente. O menu reúne as ações de notas e aparência; use as setas para navegar e Escape para fechar. Toda a área abaixo da header é clicável para editar, inclusive as margens laterais.

Use Ctrl/Cmd+F ou “Find in note” no menu para localizar texto na nota atual. Enter avança entre ocorrências e Shift+Enter retorna.

A leitura oferece um subconjunto de Markdown: títulos H1–H3, parágrafos, ênfase simples, links HTTP/HTTPS e `mailto:`, citações, listas e cercas de código. HTML bruto permanece texto. A edição sempre usa o texto original.

Se dados salvos estiverem corrompidos, a aplicação bloqueia novas gravações para não sobrescrevê-los. A mensagem de erro oferece um download dos dados originais e uma ação explícita para substituí-los. Se o armazenamento falhar, o texto continua em memória até a página ser fechada; baixe o backup completo antes de fechar. A restauração valida o backup e pede confirmação antes de substituir as notas atuais. Com armazenamento bloqueado, a restauração fica em memória até a substituição explícita do armazenamento.

## Executar

Ambiente verificado: Node.js 24.21.0 e npm 11.19.0.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

`npm test` verifica armazenamento, migrações, lixeira, backup, corrupção e falha de gravação. `npm run build` gera o site.

## Documentação

- [Relatório técnico e de produto](docs/RELATORIO.md): comparação das bases, problemas, melhorias e adições.
- [Plano de implementação](docs/PLANO.md): sequência, limites e critérios de aceite. O [arquivo `IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) também fica em `docs`.
