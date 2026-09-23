# Sloth Note

Editor Markdown local com abas opcionais, busca de notas e modos de edição e leitura.

Base copiada de `../sloth-note-gpt`, commit `443d23c`, de 24/07/2026. `../sloth-note` foi consultado como referência complementar.

**Estado atual:** as notas são gravadas no armazenamento deste navegador a cada alteração. O indicador mostra o resultado da gravação. É possível importar e exportar `.md`, renomear notas, fechar abas sem apagar o texto e mover notas para uma lixeira que persiste após recarga. A lixeira permite restaurar ou apagar definitivamente. Ainda não há pasta local conectada nem sincronização. Faça exportações para manter uma cópia fora do navegador.

A leitura oferece um subconjunto de Markdown: títulos H1–H3, parágrafos, ênfase simples, links HTTP/HTTPS e `mailto:`, citações, listas e cercas de código. HTML bruto permanece texto. A edição sempre usa o texto original.

Se dados salvos estiverem corrompidos, a aplicação bloqueia novas gravações para não sobrescrevê-los. A mensagem de erro oferece um download dos dados originais e uma ação explícita para substituí-los. Se o armazenamento falhar, o texto continua em memória até a página ser fechada; exporte as notas afetadas.

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

`npm test` verifica armazenamento, migrações, lixeira, corrupção e falha de gravação. `npm run build` gera o site.

## Documentação

- [Relatório técnico e de produto](docs/RELATORIO.md): comparação das bases, problemas, melhorias e adições.
- [Plano de implementação](docs/PLANO.md): sequência, limites e critérios de aceite. O [arquivo `IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) também fica em `docs`.
