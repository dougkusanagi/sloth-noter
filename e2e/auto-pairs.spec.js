import { expect, test } from '@playwright/test'

for (const width of [390, 1280])
  for (const legacy of [false, true]) {
    test.describe(`${width} ${legacy ? 'DOM' : 'EditContext'}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/e2e/fixtures/ime-spike.html' + (legacy ? '?legacy=1' : ''))
        await expect(page.locator('.cm-content')).toBeVisible()
        await page.evaluate(() => window.__imeSpike.reset('# Teste\n\n', 9))
        await page.locator('.cm-content').focus()
      })
      const body = (page) => page.evaluate(() => window.__imeSpike.snapshot().body)

      test('pairs, content, closing and deletion preserve existing punctuation', async ({
        page,
      }) => {
        await page.keyboard.type('(abc)')
        await expect.poll(() => body(page)).toBe('# Teste\n\n(abc)')
        await page.evaluate(() => window.__imeSpike.reset('# Teste\n\n()', 10))
        await page.keyboard.press('Backspace')
        await expect.poll(() => body(page)).toBe('# Teste\n\n)')
        await page.evaluate(() => window.__imeSpike.reset('# Teste\n\n', 9))
        await page.keyboard.type('[')
        await page.keyboard.press('Backspace')
        await expect.poll(() => body(page)).toBe('# Teste\n\n')
      })

      test('inline code and fences keep the cursor inside', async ({ page }) => {
        await page.keyboard.type('`code`')
        await expect.poll(() => body(page)).toBe('# Teste\n\n`code`')
        await page.evaluate(() => window.__imeSpike.reset('# Teste\n\n', 9))
        await page.keyboard.type('```')
        await expect.poll(() => body(page)).toBe('# Teste\n\n```\n\n```')
        await page.keyboard.type('code')
        await expect.poll(() => body(page)).toBe('# Teste\n\n```\ncode\n```')
        if (!legacy) await page.screenshot({ path: `/tmp/sloth-pairs-${width}.png` })
      })

      test('committed dead keys pair backticks and leave accents intact', async ({ page }) => {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Input.imeSetComposition', { text: '`', selectionStart: 1, selectionEnd: 1 })
        await expect.poll(() => body(page)).toBe('# Teste\n\n`')
        await cdp.send('Input.insertText', { text: '`' })
        await expect.poll(() => body(page)).toBe('# Teste\n\n``')
        await page.keyboard.type('code` ')
        await cdp.send('Input.imeSetComposition', { text: '`', selectionStart: 1, selectionEnd: 1 })
        await cdp.send('Input.insertText', { text: 'à' })
        await expect.poll(() => body(page)).toBe('# Teste\n\n`code` à')
      })
    })
  }
// The changelog note is virtualized: text far down exists only after scrolling to it.
async function reveal(page, entry, text) {
  await entry.hover()
  for (let step = 0; step < 80 && !(await entry.innerText()).includes(text); step++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
  }
}

for (const width of [390, 1280]) {
  test(`automatic pairs changelog is readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const entry = page.locator('.visual-editor.read-only')
    await entry.locator('[data-wiki^="Em desenvolvimento|"]').click()
    await reveal(page, entry, 'confirmação de uma crase com espaço')
    await expect(entry).toContainText('O editor completa parênteses')
    await expect(entry).toContainText('confirmação de uma crase com espaço')
  })
}
