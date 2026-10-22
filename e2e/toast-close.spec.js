import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    test(`toast close stays inside the top-right corner in ${theme} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 })
      const document = newDocument()
      document.preferences.theme = theme
      document.notes[0].body = '# Avisos\n\n```js\nconst exemplo = 1\n```'
      await page.addInitScript(
        ({ document, key }) => {
          localStorage.setItem(key, JSON.stringify(document))
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText: async () => {
                if (window.failCopy) throw new Error('Copy failed')
              },
            },
          })
        },
        { document, key: STORAGE_KEY },
      )
      await page.goto('/')
      await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
      for (const kind of ['success', 'error']) {
        await page.evaluate((fail) => (window.failCopy = fail), kind === 'error')
        await page.getByRole('button', { name: 'Copiar javascript', exact: true }).click()
        const toast = page.locator(`[data-sonner-toast][data-type="${kind}"]`)
        const close = toast.getByRole('button', { name: 'Fechar', exact: true })
        await expect(close).toBeVisible()
        const bounds = await toast.evaluate((element) => {
          const toast = element.getBoundingClientRect()
          const close = element.querySelector('[data-close-button]').getBoundingClientRect()
          const text = element.querySelector('[data-content]').getBoundingClientRect()
          return {
            top: close.top - toast.top,
            right: toast.right - close.right,
            gap: close.left - text.right,
            width: close.width,
            height: close.height,
          }
        })
        expect(bounds.top).toBeGreaterThanOrEqual(7)
        expect(bounds.right).toBeGreaterThanOrEqual(7)
        expect(bounds.right).toBeLessThanOrEqual(9)
        expect(bounds.gap).toBeGreaterThanOrEqual(0)
        expect(bounds.width).toBeGreaterThanOrEqual(28)
        expect(bounds.height).toBeGreaterThanOrEqual(28)
        await expect(close).toBeInViewport()
        await page.screenshot({ path: testInfo.outputPath(`toast-${kind}-${theme}-${width}.png`) })
        if (kind === 'success') {
          await close.focus()
          await close.press('Enter')
        } else await close.click()
        await expect(toast).toHaveCount(0)
      }
    })
  }
}
