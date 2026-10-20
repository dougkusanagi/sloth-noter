// Start Vite, then: node scripts/benchmark-editor.mjs [http://localhost:5173]
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(process.argv[2] ?? 'http://localhost:5173')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const body =
    '# Benchmark\n\n' +
    Array.from(
      { length: 30 },
      (_, index) =>
        `## Seção ${index}\n\nUm parágrafo com **ênfase** e conteúdo de teste.\n\n\`\`\`js\n${Array.from({ length: 8 }, (_, line) => `const item${line} = ${index} + ${line}; // comentário`).join('\n')}\n\`\`\`\n\n`,
    ).join('')
  await page.locator('textarea').fill(body)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.waitForTimeout(200)
  console.log(
    JSON.stringify(
      await page.evaluate(async () => {
        const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
        const view = EditorView.findFromDOM(document.querySelector('.cm-content'))
        const line = view.state.doc.line(5)
        const samples = []
        for (let run = 0; run < 5; run++) {
          const start = performance.now()
          for (let index = 0; index < 100; index++)
            view.dispatch({ selection: { anchor: line.from + (index % 20) } })
          samples.push(performance.now() - start)
        }
        return {
          documentCharacters: view.state.doc.length,
          cursorMovesPerSample: 100,
          sameLineMs: samples.map((value) => +value.toFixed(2)),
        }
      }),
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
