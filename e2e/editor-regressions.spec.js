import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
  'base64',
)
async function source(page, body) {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(body)
}
async function visual(page) {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const mode of ['visual', 'source', 'reading']) {
  test(`tab shortcuts cycle and reopen in ${mode} mode`, async ({ page }) => {
    await source(page, '# Alpha\n\nConteúdo')
    await page.keyboard.press('Control+t')
    await source(page, '# Beta\n\nConteúdo')
    await page.keyboard.press('Control+t')
    await source(page, '# Gamma\n\nConteúdo')
    if (mode === 'visual') await visual(page)
    if (mode === 'reading')
      await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    if (mode !== 'reading')
      await page.locator(mode === 'visual' ? '.cm-content' : 'textarea').focus()
    for (const title of ['Alpha', 'Beta', 'Gamma', 'Alpha']) {
      await page.keyboard.press('Control+PageDown')
      await expect(page.locator('.tab.active')).toHaveText(`${title}.md`)
    }
    await page.keyboard.press('Control+PageUp')
    await expect(page.locator('.tab.active')).toHaveText('Gamma.md')
    await page.keyboard.press('Control+w')
    await page.keyboard.press('Control+w')
    await expect(page.locator('.tab')).toHaveCount(1)
    await page.keyboard.press('Control+Shift+t')
    await expect(page.locator('.tab.active')).toHaveText('Beta.md')
    await page.keyboard.press('Control+Shift+t')
    await expect(page.locator('.tab.active')).toHaveText('Gamma.md')
    await expect(page.locator('.tab')).toHaveCount(3)
  })
}

test('reopening a discarded empty note restores its tab', async ({ page }) => {
  await page.keyboard.press('Control+t')
  await source(page, '# \n\n')
  await page.keyboard.press('Control+w')
  await page.keyboard.press('Control+Shift+t')
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect(page.locator('textarea')).toHaveValue('# \n\n')
})

test('external links open only while their line is rendered for reading', async ({ page }) => {
  await source(page, '# Links\n\n[google](https://google.com)\n\nOutro texto')
  await visual(page)
  await page.evaluate(() => {
    window.openedLinks = []
    window.open = (url) => window.openedLinks.push(url)
  })
  const link = page.locator('.cm-md-inline-link, .cm-md-link-source')
  await expect(link).toHaveAttribute('data-href', 'https://google.com')
  await link.click({ modifiers: ['Control'] })
  expect(await page.evaluate(() => window.openedLinks)).toEqual(['https://google.com'])
  await link.click()
  await expect(link).not.toHaveAttribute('data-href')
  await expect(link).toHaveCSS('cursor', 'text')
  await expect(link).toHaveCSS('text-decoration-line', 'none')
  expect(await link.evaluate((element) => getComputedStyle(element).color)).toBe(
    await link.evaluate((element) => getComputedStyle(element.closest('.cm-line')).color),
  )
  await link.click({ modifiers: ['Control'] })
  expect(await page.evaluate(() => window.openedLinks)).toHaveLength(1)
  await page.locator('.cm-line').filter({ hasText: 'Outro texto' }).click()
  await expect(link).toHaveAttribute('data-href', 'https://google.com')
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.getByRole('link', { name: 'google' })).toHaveAttribute(
    'href',
    'https://google.com',
  )
})

test('internal links have plain text styling and no click action on the active line', async ({
  page,
}) => {
  await page.keyboard.press('Control+t')
  await source(page, '# Links\n\n[[Welcome|Link Interno]]\n\nOutro texto')
  await visual(page)
  await page
    .locator('.cm-line')
    .filter({ hasText: 'Link Interno' })
    .click({ position: { x: 220, y: 10 } })
  const link = page.locator('.cm-md-link-source')
  await expect(link).toHaveText('Link Interno')
  await expect(link).not.toHaveAttribute('data-wiki')
  await expect(link).toHaveCSS('text-decoration-line', 'none')
  await expect(link).toHaveCSS('cursor', 'text')
  expect(await link.evaluate((element) => getComputedStyle(element).color)).toBe(
    await link.evaluate((element) => getComputedStyle(element.closest('.cm-line')).color),
  )
  await link.click()
  await expect(page.locator('.tab.active')).toHaveText('Links.md')
  await link.click({ modifiers: ['Control'] })
  await expect(page.locator('.tab.active')).toHaveText('Links.md')
  await page.locator('.cm-line').filter({ hasText: 'Outro texto' }).click()
  await expect(page.locator('[data-wiki]')).toHaveCSS('text-decoration-line', 'underline')
  await page.locator('[data-wiki]').click()
  await expect(page.locator('.tab.active')).toHaveText('Welcome.md')
})

for (const mode of ['visual', 'source']) {
  test(`clipboard image imports at the ${mode} cursor with undo`, async ({ page }) => {
    await source(page, '# Colagem\n\nAntes\n\nDepois')
    if (mode === 'visual') await visual(page)
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Home')
    await editor.evaluate(
      (element, bytes) => {
        const clipboardData = new DataTransfer()
        clipboardData.items.add(
          new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }),
        )
        clipboardData.setData('text/plain', 'Texto que não deve ser colado')
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
        )
      },
      [...png],
    )
    if (mode === 'source')
      await expect(editor).toHaveValue(
        `# Colagem\n\nAntes\n\n![clipboard.png](data:image/png;base64,${png.toString('base64')})\nDepois`,
      )
    else {
      const image = page.getByRole('img', { name: 'clipboard.png', exact: true })
      await expect(image).toBeVisible()
      const imageBox = await image.boundingBox()
      const beforeBox = await page.locator('.cm-line').filter({ hasText: 'Antes' }).boundingBox()
      const afterBox = await page.locator('.cm-line').filter({ hasText: 'Depois' }).boundingBox()
      expect(imageBox.y).toBeGreaterThan(beforeBox.y)
      expect(imageBox.y).toBeLessThan(afterBox.y)
    }
    await expect(editor).toBeFocused()
    await page.keyboard.press('Control+z')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Colagem\n\nAntes\n\nDepois')
    await page.keyboard.press('Control+Shift+l')
    await expect(page.locator('.image-item')).toHaveCount(1)
  })
}

test('images from trash can be reused and do not block keyboard shortcuts', async ({ page }) => {
  const document = newDocument()
  document.notes = [{ id: 'new', name: 'Nova.md', body: '# Nova\n\n', revision: 1 }]
  document.openIds = ['new']
  document.activeId = 'new'
  document.trash = [
    {
      note: {
        id: 'trashed',
        name: 'Antiga.md',
        body: `# Antiga\n\n![foto](data:image/png;base64,${png.toString('base64')})`,
        revision: 1,
      },
      index: 0,
      deletedAt: 1,
    },
  ]
  await page.evaluate(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), {
    key: STORAGE_KEY,
    document,
  })
  await page.reload()
  await page.keyboard.press('Control+Shift+l')
  await page.locator('.image-item').click()
  await expect(page.getByText('Referenciada por uma nota na lixeira')).toBeVisible()
  await page.keyboard.press('Control+t')
  await expect(page.locator('.tab')).toHaveCount(2)
  await page.getByRole('button', { name: 'Inserir na nota', exact: true }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/!\[foto\]\(data:image\/png;base64,/)
  await expect(page.getByRole('button', { name: 'Excluir imagem', exact: true })).toBeDisabled()
})

test('list text and wrapping keep their horizontal position when the cursor moves', async ({
  page,
}) => {
  await source(
    page,
    '# Listas\n\n- Primeiro item com texto longo '.padEnd(150, 'palavra ') +
      '\n\n  - Segundo item\n\nOutro texto',
  )
  await visual(page)
  const line = page.locator('.cm-md-bullet').first()
  const textPosition = () =>
    line.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const at = node.textContent.indexOf('Primeiro')
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + 8)
        return {
          left: range.getBoundingClientRect().left,
          height: element.getBoundingClientRect().height,
        }
      }
    })
  const before = await textPosition()
  await line.click()
  await expect(line).toHaveClass(/cm-md-editing/)
  const after = await textPosition()
  expect(after.left).toBeCloseTo(before.left, 0)
  expect(after.height).toBeCloseTo(before.height, 0)
  const marker = await page.locator('.cm-md-list-marker').boundingBox()
  expect(marker.x + marker.width).toBeCloseTo(after.left, 0)
  await page.locator('.cm-line').filter({ hasText: 'Outro texto' }).click()
  expect((await textPosition()).left).toBeCloseTo(before.left, 0)
})
