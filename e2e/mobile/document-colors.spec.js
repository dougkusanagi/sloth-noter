import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'
test('mobile reading renders saved block and text colors; editing offers the palette', async ({
  page,
}) => {
  await page.addInitScript(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), {
    key: STORAGE_KEY,
    doc: {
      ...newDocument(),
      notes: [
        {
          id: 'colors',
          name: 'Cores.md',
          body: '# Cores\n\n<!-- sloth:block background=green -->\n\n## Organização\n\n<span style="color:#e76565">Texto com cor</span>\n\n- Item',
          revision: 0,
        },
      ],
      openIds: ['colors'],
      activeId: 'colors',
    },
  })
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="colors"]').tap()
  await expect(page.locator('.markdown h2')).toHaveCSS(
    'background-color',
    'color(srgb 0.380392 0.662745 0.427451 / 0.22)',
  )
  await expect(page.locator('.markdown span[style*="color"]')).toContainText('Texto com cor')
  await expect(page.locator('.markdown')).not.toContainText('sloth:block')
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
  await page.evaluate(() => window.__insets({ top: 32, bottom: 24, ime: 300, keyboard: 'open' }))
  await page.locator('.cm-line', { hasText: 'Item' }).click()
  await page.getByRole('button', { name: 'Cores', exact: true }).tap()
  await page
    .locator('.mobile-color-panel')
    .getByRole('group', { name: 'Cor de fundo', exact: true })
    .getByRole('button', { name: 'Azul', exact: true })
    .tap()
  await expect(page.locator('.cm-colored-block', { hasText: 'Item' })).toBeVisible()
  if (process.env.CAPTURE_UI)
    await page.screenshot({ path: '/tmp/sloth-document-colors-android.png' })
})
