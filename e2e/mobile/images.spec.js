import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test('images gallery supports filter, detail actions, delete and camera insert', async ({
  page,
}) => {
  const fixture = {
    ...newDocument(),
    notes: [
      {
        id: 'n1',
        name: 'Foto.md',
        body: `# Foto\n\n![Minha foto](${tinyPng})\n`,
        revision: 0,
      },
      {
        id: 'n2',
        name: 'Destino.md',
        body: '# Destino\n\nTexto aqui.\n',
        revision: 0,
      },
    ],
    openIds: ['n1'],
    activeId: 'n1',
  }
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Imagens', exact: true }).tap()

  // Filter Sem uso shows empty state since image is used
  await page.getByRole('button', { name: 'Sem uso', exact: true }).tap()
  await expect(page.locator('.mobile-images figure')).toHaveCount(0)
  await page.getByRole('button', { name: 'Todas', exact: true }).tap()
  await expect(page.locator('.mobile-images figure')).toHaveCount(1)

  // Open detail sheet and insert into Destino
  await page.locator('.mobile-image-card').first().tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Inserir em uma nota' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Destino' }).tap()
  await expect(page.locator('.markdown img')).toHaveCount(1)

  // Return to Images, open detail and delete image (removes references keeping alt text)
  await page.getByRole('button', { name: 'Voltar' }).tap()
  await page.getByRole('button', { name: 'Imagens', exact: true }).tap()
  await page.locator('.mobile-image-card').first().tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir definitivamente' }).tap()
  await expect(page.locator('.mobile-images figure')).toHaveCount(0)
})
