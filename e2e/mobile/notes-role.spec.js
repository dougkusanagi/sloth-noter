import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  notes: [
    {
      id: 'welcome-test',
      name: 'Boas-vindas.md',
      body: '# Boas-vindas\n\nNota já existente na biblioteca.',
      revision: 0,
    },
  ],
  openIds: ['welcome-test'],
  activeId: 'welcome-test',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    { key: STORAGE_KEY, doc: fixture },
  )
})

test('ingests pending lock-screen quick notes once after save succeeds and skips ack on save failure', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    window.__allowSave = false
    window.__acked = []
    window.__pendingQueue = [
      { id: 'lock-note-1', title: 'Mercado', body: 'Comprar café', createdAt: 1700000001000 },
      {
        id: 'lock-note-2',
        title: '',
        body: 'Ideia anotada com a tela bloqueada',
        createdAt: 1700000002000,
      },
      { id: 'lock-note-empty', title: '  ', body: '' },
    ]
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sloth-note:v3' && !window.__allowSave)
        throw new DOMException('Full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
    window.SlothSystem = {
      takeAction: () => '',
      takeSharedText: () => '',
      takePendingNotes: () => JSON.stringify(window.__pendingQueue),
      ackPendingNotes: (idsJson) => {
        const ids = JSON.parse(idsJson)
        window.__acked.push(...ids)
        window.__pendingQueue = window.__pendingQueue.filter((item) => !ids.includes(item.id))
        return true
      },
      getNotesRoleState: () => 'unavailable',
    }
  })

  await page.goto('/?platform=mobile')
  // Save failed on first import attempt: ackPendingNotes must NOT be called.
  await expect(page.locator('.mobile-error')).toContainText('Não foi possível salvar')
  expect(await page.evaluate(() => window.__acked)).toEqual([])

  // Re-enable persistence, retry saving, and return to the library.
  await page.evaluate(() => {
    window.__allowSave = true
  })
  await page.getByRole('button', { name: 'Tentar de novo', exact: true }).tap()
  await expect(page.locator('.mobile-error')).toHaveCount(0)
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.locator('[data-note-id="lock-note-1"]')).toHaveCount(1)
  await expect(page.locator('[data-note-id="lock-note-2"]')).toHaveCount(1)

  // Re-running __nativeAction idempotently acknowledges the already-saved IDs + blank draft without duplicating.
  await page.evaluate(() => window.__nativeAction?.())
  await expect
    .poll(() => page.evaluate(() => window.__acked))
    .toEqual(['lock-note-1', 'lock-note-2', 'lock-note-empty'])
  await expect(page.locator('[data-note-id="lock-note-1"]')).toHaveCount(1)
  await expect(page.locator('[data-note-id="lock-note-2"]')).toHaveCount(1)

  // Simulate receiving a fresh batch after ack: opens last note in reading mode without keyboard.
  await page.evaluate(() => {
    window.__pendingQueue = [
      { id: 'lock-note-3', title: 'Lembrete', body: 'Ligar às 15h', createdAt: 1700000003000 },
    ]
    window.__acked = []
    window.__nativeAction?.()
  })
  await expect(page.locator('.markdown')).toContainText('Ligar às 15h')
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__acked)).toEqual(['lock-note-3'])

  // Return to library and confirm all 3 imported notes exist once.
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.locator('[data-note-id="lock-note-1"]')).toHaveCount(1)
  await expect(page.locator('[data-note-id="lock-note-2"]')).toHaveCount(1)
  await expect(page.locator('[data-note-id="lock-note-3"]')).toHaveCount(1)
})

test('settings hide System role on unsupported platforms, show ROLE_NOTES toggle at 320/390 px, and news render offline image', async ({
  page,
}) => {
  // Without ROLE_NOTES bridge support, the System section stays hidden.
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sistema' })).toHaveCount(0)

  // With ROLE_NOTES available, Settings expose the role prompt and update when granted.
  await page.addInitScript(() => {
    window.__roleRequests = 0
    window.__roleState = 'available'
    window.SlothSystem = {
      getNotesRoleState: () => window.__roleState,
      requestNotesRole: () => {
        window.__roleRequests += 1
        return true
      },
    }
  })

  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()

  const setRoleButton = page.getByRole('button', { name: 'Definir como app de notas padrão' })
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible()
  await expect(setRoleButton).toBeVisible()
  expect(
    await page
      .locator('.mobile-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page
      .locator('.mobile-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)

  await setRoleButton.tap()
  expect(await page.evaluate(() => window.__roleRequests)).toBe(1)

  await page.evaluate(() => {
    window.__roleState = 'held'
    window.__slothNotesRoleChanged?.('held')
  })
  await expect(page.getByText('Ativo como app de notas padrão')).toBeVisible()
  await expect(setRoleButton).toHaveCount(0)

  // Verify release notes 0.51.0 and its offline screenshot in Novidades.
  await page.getByRole('button', { name: 'Novidades' }).tap()
  await expect(page.locator('.changelog-page')).toContainText('0.51.0')
  const details = page
    .locator('.changelog-page h2', { hasText: 'Versão 0.51.0' })
    .locator('xpath=following-sibling::p[1]')
  await details.getByRole('link', { name: 'Ver detalhes →' }).tap()
  const article = page.locator('.changelog-page')
  await expect(article).toContainText('App de notas do sistema no Android 14+ (B4)')
  const image = article.locator('img[src="/changelog/mobile-app-notas-sistema.png"]')
  await expect(image).toBeVisible()
  expect(await image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
})
