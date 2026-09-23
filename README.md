# Sloth Note

Editor Markdown local com abas opcionais, busca de notas e modos de edição e leitura.

Base copiada de `../sloth-note-gpt`, commit `443d23c`, de 24/07/2026. `../sloth-note` foi consultado como referência complementar.

**Estado atual:** as notas são gravadas no armazenamento deste navegador a cada alteração. O indicador mostra o resultado da gravação. O botão **Export .md** baixa a nota ativa. Ainda não há pasta local conectada, importação, exclusão ou sincronização. A leitura Markdown é básica; edite sempre o texto original para preservar sua formatação.

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

`npm test` verifica armazenamento, corrupção e falha de gravação. `npm run build` gera o site.

## Documentação

- [Relatório técnico e de produto](docs/RELATORIO.md): comparação das bases, problemas, melhorias e adições.
- [Plano de implementação](docs/PLANO.md): sequência, limites e critérios de aceite.
