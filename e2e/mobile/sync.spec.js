import { test, expect } from '@playwright/test'
import { createApi } from '../../server/api.js'
import { memoryStore } from '../../server/memory-store.js'

const SERVER = 'https://sync.example.test'
const TOKEN = 'k'.repeat(40)

test('android settings set up sync and sync again after an edit', async ({ page, context }) => {
  const api = createApi({ store: memoryStore(), token: TOKEN })
  let puts = 0
  await context.route(`${SERVER}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'PUT') puts++
    const response = await api(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: ['GET', 'OPTIONS'].includes(request.method()) ? undefined : request.postDataBuffer(),
      }),
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    })
  })
  // Stands in for the Keystore bridge (SecretsBridge.kt).
  await page.addInitScript(() => {
    const values = new Map()
    window.SlothSecrets = {
      get: (name) => values.get(name) ?? '',
      set: (name, value) => (values.set(name, value), 'ok'),
      delete: (name) => (values.delete(name), 'ok'),
    }
  })
  await page.clock.install()
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await expect(page.getByRole('heading', { name: 'Sincronização' })).toBeVisible()
  await page.getByLabel('Endereço do servidor').fill(SERVER)
  await page.getByLabel('Chave de acesso').fill(TOKEN)
  await page.getByRole('button', { name: 'Criar chave' }).tap()
  await page.getByLabel('Guardei a chave de recuperação').check()
  if (process.env.CAPTURE_UI) {
    await page.getByLabel('Chave de recuperação', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: '/tmp/sloth-sync-mobile-form.png' })
  }
  await page.getByRole('button', { name: 'Continuar' }).tap()
  await expect(page.getByText('1 nota deste aparelho será enviada.')).toBeVisible()
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).tap()
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-sync-mobile-done.png' })
  const afterSetup = puts

  // Leaving the app and coming back syncs; a run with nothing new sends nothing.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.clock.runFor(20_000)
  expect(puts).toBe(afterSetup)

  // An edit is sent about 15 seconds later.
  await page.getByRole('button', { name: 'Voltar' }).tap()
  const sheet = page.getByRole('dialog', { name: 'Mais opções' })
  if (await sheet.isVisible()) await sheet.getByRole('button', { name: 'Fechar' }).tap()
  await page.getByRole('button', { name: 'Nova nota' }).first().tap()
  await page.keyboard.type('Ideia do celular')
  await page.getByRole('button', { name: 'Pronto' }).tap()
  await page.clock.runFor(16_000)
  await expect.poll(() => puts).toBeGreaterThan(afterSetup)
})
