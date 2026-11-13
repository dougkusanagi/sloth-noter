import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

test('mobile outline lives in the header in reading and editing modes', async ({ page }) => {
  const filler = Array.from({ length: 60 }, (_, i) => `Linha ${i}`).join('\n\n')
  await page.addInitScript(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), {
    key: STORAGE_KEY,
    doc: {
      ...newDocument(),
      notes: [
        {
          id: 'toc',
          name: 'Sumario.md',
          body: `# Sumario\n\nabc\n\n${filler}\n\n## Final\n\nfim`,
          revision: 0,
        },
      ],
      openIds: ['toc'],
      activeId: 'toc',
    },
  })
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="toc"]').tap()
  const header = page.locator('.mobile-header')
  const toggle = header.getByRole('button', { name: 'Expandir sumário' })
  await expect(toggle).toBeVisible()
  await expect(page.locator('.mobile-content .document-outline')).toHaveCount(0)
  await toggle.tap()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-outline-reading.png' })
  await page.locator('.mobile-outline').getByRole('button', { name: 'Final', exact: true }).tap()
  await expect(page.locator('.markdown h2', { hasText: 'Final' })).toBeInViewport()
  await expect(page.locator('.mobile-outline .document-outline-list')).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(header.getByRole('button', { name: 'Expandir sumário' })).toBeVisible()
  await expect(page.locator('.mobile-content .document-outline')).toHaveCount(0)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-outline-editing.png' })
})
