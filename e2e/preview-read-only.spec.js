import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body = [
  '# Prévia',
  '',
  ...Array.from(
    { length: 30 },
    (_, i) => `Parágrafo ${i} com **negrito** e [link](https://example.com).`,
  ),
  '',
  '- [ ] Tarefa',
  '- Item',
  '',
  '```js',
  'const a = 1',
  '```',
  '',
  '| A | B |',
  '| - | - |',
  '| 1 | 2 |',
].join('\n')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 })
  const document = newDocument()
  document.notes[0].body = body
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('preview keeps the same layout and scroll as the visual editor, without editing', async ({
  page,
}) => {
  const layout = () =>
    page.evaluate(() => ({
      height: document.querySelector('.cm-content').getBoundingClientRect().height,
      scroll: window.scrollY,
    }))
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const before = await layout()
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.visual-editor.read-only')).toBeVisible()
  expect(await layout()).toEqual(before)

  await page.locator('.cm-line', { hasText: 'Parágrafo 10' }).click()
  await page.keyboard.type('xyz')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.cm-content')).not.toContainText('xyz')
  await expect(page.locator('.cm-line', { hasText: 'Parágrafo 10' })).toContainText(
    'Parágrafo 10 com negrito',
  )

  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.locator('.visual-editor.read-only')).toHaveCount(0)
  expect((await layout()).height).toBe(before.height)
})
