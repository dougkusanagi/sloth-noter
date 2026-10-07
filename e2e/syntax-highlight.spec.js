import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

for (const theme of ['light', 'dark']) {
  for (const mode of ['Padrão', 'Leitura']) {
    test(`Markdown styles and multiline code highlighting in ${mode}, ${theme}`, async ({
      page,
    }) => {
      const document = newDocument()
      document.preferences.theme = theme
      await page.addInitScript(
        ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
        { key: STORAGE_KEY, document },
      )
      await page.goto('/')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      const body =
        '# Realce\n\n```md\n# Diretrizes\n\nTexto normal\n\n**forte** e *ênfase*\n- Item\n[link](https://example.com)\n```\n\n```js\n/* primeira linha\nsegunda linha\n*/\nconst texto = `primeira\ncontinuação`\n```'
      await page.locator('textarea').fill(body)
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
      const title = page.locator('.syntax-title, .token.title').first()
      await expect(title).toBeVisible()
      const colors = await title.evaluate((element) => ({
        highlighted: getComputedStyle(element).color,
        plain: getComputedStyle(element.closest('.cm-md-code, code')).color,
      }))
      expect(colors.highlighted).not.toBe(colors.plain)
      await expect(
        page.locator('.syntax-bold, .token.bold').filter({ hasText: 'forte' }).first(),
      ).toHaveCSS('font-weight', '700')
      await expect(
        page.locator('.syntax-italic, .token.italic').filter({ hasText: 'ênfase' }).first(),
      ).toHaveCSS('font-style', 'italic')
      await expect(
        page
          .locator('.syntax-comment, .token.comment')
          .filter({ hasText: 'segunda linha' })
          .first(),
      ).toBeVisible()
      await expect(
        page.locator('.syntax-string, .token.string').filter({ hasText: 'continuação' }).first(),
      ).toBeVisible()
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      await expect(page.locator('textarea')).toHaveValue(body)
    })
  }
}
