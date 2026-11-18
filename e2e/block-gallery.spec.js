import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Visual reference page with every block type. Look at the screenshots in
// test-results/ (or the HTML report) to review spacing and rendering:
//   bunx playwright test e2e/block-gallery.spec.js --project=chromium
const fixture = readFileSync(new URL('./fixtures/todos-os-blocos.md', import.meta.url), 'utf8')

for (const width of [390, 1280])
  for (const mode of ['Padrão', 'Leitura'])
    test(`block gallery renders every block in ${mode} at ${width}px`, async ({ page }) => {
      // Tall enough to show the whole note in one screenshot.
      await page.setViewportSize({ width, height: 3200 })
      await page.goto('/')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      await page.locator('textarea').fill(fixture)
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
      await expect(page.getByText('Parágrafo final da página de teste.').first()).toBeVisible()
      const image = page.locator('img[alt="Ilustração de exemplo"]').first()
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
      const path = test
        .info()
        .outputPath(`blocos-${mode === 'Padrão' ? 'padrao' : 'leitura'}-${width}.png`)
      await page.screenshot({ path })
      await test.info().attach('blocos', { path, contentType: 'image/png' })
    })
