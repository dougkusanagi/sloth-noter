import { expect, test } from '@playwright/test'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
  'base64',
)

const BODY = [
  '# Formatos',
  '',
  '## Seção dois',
  '### Seção três',
  '#### Seção quatro',
  '##### Seção cinco',
  '###### Seção seis',
  '',
  'Texto **forte**, *ênfase*, ***ambos***, ~~riscado~~, `código` e \\*literal\\*.',
  '',
  'Links: https://example.com e <https://example.org> e [texto](https://example.net) e [ref][site] e [[Welcome|Início]] e #etiqueta',
  '',
  'Primeira linha\\',
  'segunda linha',
  '',
  '> citação',
  '>',
  '> > aninhada',
  '',
  '- item',
  '  - filho',
  '',
  '1. um',
  '2. dois',
  '',
  '- [x] feito',
  '- [ ] aberto',
  '',
  '| A | B | C |',
  '| :-- | :-: | --: |',
  '| 1 | 2 | 3 |',
  '',
  '---',
  '',
  'Nota[^1]',
  '',
  '![Foto](https://example.com/photo.png)',
  '',
  '```js',
  'const resposta = 42',
  '```',
  '',
  '[site]: https://example.com/site',
  '[^1]: Rodapé',
  '',
  'Fim',
].join('\n')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 4000 })
  await page.route('https://example.com/photo.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(BODY)
})

test('Padrão renders every Markdown format away from the cursor', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const live = page.locator('.cm-content')

  for (const level of [1, 2, 3, 4, 5, 6])
    await expect(live.locator(`.cm-md-h${level}`)).toHaveCount(1)
  await expect(live.locator('.cm-md-h6')).toHaveText('Seção seis')

  await expect(live.locator('.cm-md-inline-strong').first()).toHaveText('forte')
  await expect(live.locator('.cm-md-inline-em').first()).toHaveText('ênfase')
  await expect(live.locator('.cm-md-inline-strong').nth(1)).toHaveText('ambos')
  await expect(live.locator('.cm-md-inline-strike')).toHaveText('riscado')
  await expect(live.locator('.cm-md-inline-code')).toHaveText('código')
  await expect(live.locator('.cm-line', { hasText: 'literal' })).toContainText('*literal*')
  await expect(live.locator('.cm-line', { hasText: 'literal' })).not.toContainText('\\')

  await expect(live.locator('[data-href="https://example.com"]')).toBeVisible()
  await expect(live.locator('[data-href="https://example.org"]')).toBeVisible()
  await expect(live.locator('[data-href="https://example.net"]')).toHaveText('texto')
  await expect(live.locator('[data-href="https://example.com/site"]')).toHaveText('ref')
  await expect(live.locator('.cm-md-wiki')).toHaveText('Início')
  await expect(live.locator('.cm-md-inline-tag')).toHaveText('#etiqueta')

  await expect(live.locator('.cm-line', { hasText: 'Primeira linha' })).toHaveText('Primeira linha')

  await expect(live.locator('.cm-md-quote')).toHaveCount(3)
  await expect(live.locator('.cm-md-quote-nested')).toHaveText('aninhada')
  await expect(live.locator('.cm-md-quote').first()).toHaveText('citação')

  await expect(live.locator('.cm-md-bullet')).toHaveCount(2)
  await expect(live.locator('.cm-md-ordered')).toHaveCount(2)
  await expect(live.locator('.cm-task-checkbox')).toHaveCount(2)
  await expect(live.locator('.cm-task-checkbox:checked')).toHaveCount(1)

  await expect(live.locator('.cm-md-table-cell[data-align="center"]')).toHaveText(['B', '2'])
  await expect(live.locator('.cm-md-table-cell[data-align="right"]')).toHaveText(['C', '3'])
  await expect(live.locator('.cm-md-table-cell[data-align="center"]').first()).toHaveCSS(
    'text-align',
    'center',
  )
  await expect(live.locator('.cm-md-table-cell[data-align="right"]').first()).toHaveCSS(
    'text-align',
    'right',
  )
  await expect(live.locator('.cm-md-table-cell[data-column="0"]').first()).toHaveCSS(
    'text-align',
    'start',
  )

  await expect(live.locator('.cm-md-rule')).toHaveCount(1)
  await expect(live.locator('.cm-md-inline-footnote')).toHaveText('1')
  await expect(live.locator('.cm-image-preview')).toHaveJSProperty('naturalWidth', 1)
  await expect(live.locator('.cm-md-code').first()).toContainText('const resposta = 42')
  await expect(live.locator('.cm-md-code .syntax-keyword')).toHaveText('const')
})

test('Padrão shows the Markdown source of the clicked line, even below H5 and H6 titles', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.locator('.cm-line', { hasText: 'Primeira linha' }).click()
  await expect(page.locator('.cm-line', { hasText: 'Primeira linha' })).toContainText('linha\\')
  await page.locator('.cm-line', { hasText: 'literal' }).click()
  await expect(page.locator('.cm-line', { hasText: 'literal' })).toContainText('\\*literal\\*')
  await page.locator('.cm-line', { hasText: 'aninhada' }).click()
  await expect(page.locator('.cm-line', { hasText: 'aninhada' })).toContainText('> > aninhada')
})

test('Leitura renders every Markdown format and never reveals its source', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const read = page.locator('.visual-editor.read-only .cm-content')

  for (const level of [1, 2, 3, 4, 5, 6])
    await expect(read.locator(`.cm-md-h${level}`)).toHaveCount(1)
  await expect(read.locator('.cm-md-inline-strike')).toHaveText('riscado')
  await expect(read.locator('[data-href="https://example.net"]')).toHaveText('texto')
  await expect(read.locator('.cm-md-table-cell[data-align="right"]')).toHaveText(['C', '3'])
  await expect(read.locator('.cm-md-rule')).toHaveCount(1)
  await expect(read.locator('.cm-image-preview')).toHaveJSProperty('naturalWidth', 1)
  await expect(read.locator('.cm-md-code .syntax-keyword')).toHaveText('const')

  // Clicking a line in Padrão reveals its Markdown; in Leitura it stays rendered.
  for (const [text, rendered, source] of [
    ['Primeira linha', 'Primeira linha', 'linha\\'],
    ['literal', '*literal*', '\\*literal\\*'],
    ['aninhada', 'aninhada', '> > aninhada'],
  ]) {
    const line = read.locator('.cm-line', { hasText: text })
    await line.click()
    await expect(line).toContainText(rendered)
    await expect(line).not.toContainText(source)
  }
  await expect(read.locator('.cm-md-editing')).toHaveCount(0)
})

test('Leitura keeps raw HTML inert and unsafe links unclickable', async ({ page }) => {
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill(
      '# Seguro\n\n<script>window.pwned = 1</script>\n\n<img src=x onerror="window.pwned = 1">\n\n[Perigo](javascript:alert%281%29) e [Dados](data:text/html;base64,AAAA)',
    )
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const read = page.locator('.visual-editor.read-only .cm-content')
  await expect(read).toContainText('Perigo')
  await expect(read.locator('script, img[onerror]')).toHaveCount(0)
  await expect(read.locator('[data-href^="javascript:"], [data-href^="data:"]')).toHaveCount(0)
  await page.evaluate(() => {
    window.openedLinks = []
    window.open = (url) => window.openedLinks.push(url)
  })
  await read.getByText('Perigo').click()
  expect(await page.evaluate(() => window.openedLinks)).toEqual([])
  expect(await page.evaluate(() => window.pwned)).toBeUndefined()
})

test('Padrão alternates a separator between its source and rendered line', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const rule = page.locator('.cm-md-rule')
  await expect(rule).not.toContainText('---')
  await expect(rule).toHaveCSS('background-size', '100% 1px')
  await expect(rule).toHaveCSS('background-position', '50% 50%')
  const rendered = await rule.boundingBox()
  const following = await rule.evaluate((line) => line.nextElementSibling.getBoundingClientRect().y)
  await rule.click()
  await expect(rule).toHaveText('---')
  await expect(rule).toHaveCSS('background-image', 'none')
  const editing = await rule.boundingBox()
  expect(editing.height).toBe(rendered.height)
  expect(editing.y).toBe(rendered.y)
  expect(await rule.evaluate((line) => line.nextElementSibling.getBoundingClientRect().y)).toBe(
    following,
  )
  await page.keyboard.press('ArrowDown')
  await expect(rule).not.toContainText('---')
  await expect(rule).toHaveCSS('background-size', '100% 1px')
  await expect(rule).toHaveCSS('background-position', '50% 50%')
})

test('Padrão keeps list text readable when hidden link targets are very long', async ({ page }) => {
  const target = `https://example.com/${'a'.repeat(900)}`
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill(
      `# Título\n\n- **Rótulo:** texto de apoio com [link](${target}) e mais palavras para quebrar linha\n\nFim`,
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const bullet = page.locator('.cm-md-bullet')
  const box = await bullet.boundingBox()
  const content = await page.locator('.cm-content').boundingBox()
  expect(content.width).toBeLessThanOrEqual(page.viewportSize().width)
  expect(box.height).toBeLessThan(200)
})
