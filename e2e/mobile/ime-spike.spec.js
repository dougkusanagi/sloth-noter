import { expect, test } from '@playwright/test'

// Browser composition covers document integrity. Gboard/SwiftKey still need native runs (ADR 0003).
test.beforeEach(async ({ page }) => {
  await page.goto(
    '/e2e/fixtures/ime-spike.html' + (test.info().title.includes('[DOM]') ? '?legacy=1' : ''),
  )
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const path of ['EditContext', 'DOM']) {
  for (const word of ['ação', '日本語', 'ideia 🦥']) {
    test(`[${path}] IME composition preserves Markdown and surrounding text: ${word}`, async ({
      page,
    }) => {
      await page.evaluate(() => {
        window.__imeSpike.reset('# IME\n\n**hello** world\n\nEnd', 9)
      })
      await page.locator('.cm-content').focus()
      await page.evaluate(() => new Promise(requestAnimationFrame))
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', {
        text: word,
        selectionStart: word.length,
        selectionEnd: word.length,
      })
      await expect
        .poll(() => page.evaluate(() => window.__imeSpike.snapshot().composing))
        .toBe(true)
      await cdp.send('Input.insertText', { text: word })
      await expect
        .poll(() => page.evaluate(() => window.__imeSpike.snapshot().body))
        .toBe(`# IME\n\n**${word}hello** world\n\nEnd`)
      const snapshot = await page.evaluate(() => window.__imeSpike.snapshot())
      expect(snapshot.editContext).toBe(path === 'EditContext')
      expect(
        snapshot.events.some(
          (event) =>
            event.trusted && event.target === (path === 'EditContext' ? 'edit-context' : 'dom'),
        ),
      ).toBe(true)
      expect(snapshot.events.some((event) => event.type === 'compositionstart')).toBe(true)
      expect(snapshot.events.some((event) => event.type === 'compositionend')).toBe(true)
      await expect
        .poll(() => page.evaluate(() => window.__imeSpike.snapshot().composing))
        .toBe(false)
    })
  }
}

test('touching a rendered word reveals its syntax before deleting at its boundary', async ({
  page,
}) => {
  await page.evaluate(() => window.__imeSpike.reset('# IME\n\n**hello** world\n\nEnd', 2))
  await expect(page.locator('.cm-md-inline-strong')).toHaveText('hello')
  await page.locator('.cm-md-inline-strong').tap()
  await expect(page.locator('.cm-content')).toContainText('**hello** world')
  await page.evaluate(() => window.__imeSpike.select(9))
  await page.keyboard.press('Backspace')
  await expect
    .poll(() => page.evaluate(() => window.__imeSpike.snapshot().body))
    .toBe('# IME\n\n*hello** world\n\nEnd')
})
