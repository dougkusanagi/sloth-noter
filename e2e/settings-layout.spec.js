import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390, 846, 1280]) {
    test(`settings options contain their full labels at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 })
      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/')
      await expect(page.locator('.cm-content')).toBeVisible()
      await page.keyboard.press('Control+,')
      const settings = page.getByRole('dialog', { name: 'Configurações', exact: true })
      await expect(settings).toBeVisible()
      const options = settings.locator('.segmented label')
      for (const option of await options.all()) {
        const geometry = await option.evaluate((label) => {
          const text = label.querySelector('span').getBoundingClientRect()
          const box = label.getBoundingClientRect()
          const group = label.parentElement.getBoundingClientRect()
          return {
            leading: text.left - box.left,
            trailing: box.right - text.right,
            inside: box.left >= group.left && box.right <= group.right,
          }
        })
        expect(geometry.leading).toBeGreaterThanOrEqual(7.5)
        expect(geometry.trailing).toBeGreaterThanOrEqual(7.5)
        expect(geometry.inside).toBe(true)
      }
      expect(
        await settings
          .locator('.settings-panel')
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true)
      await settings.getByRole('radio', { name: 'English', exact: true }).check({ force: true })
      await expect(
        page.getByRole('radio', { name: 'Português (Brasil)', exact: true }),
      ).toBeVisible()
    })
  }
}
