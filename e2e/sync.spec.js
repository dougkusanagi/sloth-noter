import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const SERVER = 'https://sync.example.test'
const TOKEN = 'k'.repeat(40)

// The real API with an in-memory store answers the page's requests.
async function serve(context, api) {
  await context.route(`${SERVER}/**`, async (route) => {
    const request = route.request()
    const response = await api(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method())
          ? undefined
          : request.postDataBuffer(),
      }),
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    })
  })
}

// Stands in for the Android Keystore bridge so the browser build has a vault.
const fakeVault = () => {
  const values = new Map()
  window.SlothSecrets = {
    get: (name) => values.get(name) ?? '',
    set: (name, value) => (values.set(name, value), 'ok'),
    delete: (name) => (values.delete(name), 'ok'),
  }
}

async function openSync(page) {
  await page.bringToFront()
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: 'Configurações' })
  await dialog.getByRole('button', { name: 'Sincronização' }).click()
  return dialog
}

test('without a vault the web build explains why sync is off', async ({ page }) => {
  await page.goto('/')
  const dialog = await openSync(page)
  await expect(dialog.getByText(/só está disponível no app para desktop e Android/)).toBeVisible()
})

test('first device sets up sync and a second device receives its notes', async ({ browser }) => {
  const api = createApi({ store: memoryStore(), token: TOKEN })

  const first = await browser.newContext()
  await first.addInitScript(fakeVault)
  await serve(first, api)
  const desktop = await first.newPage()
  await desktop.goto('/')
  let dialog = await openSync(desktop)
  await dialog.getByLabel('Endereço do servidor').fill(SERVER)
  await dialog.getByLabel('Chave de acesso').fill(TOKEN)
  await dialog.getByRole('button', { name: 'Criar chave' }).click()
  const recovery = await dialog.getByLabel('Chave de recuperação', { exact: true }).textContent()
  expect(recovery).toMatch(/^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/)
  const next = dialog.getByRole('button', { name: 'Continuar' })
  await expect(next).toBeDisabled()
  await dialog.getByLabel('Guardei a chave de recuperação').check()
  expect(
    await new AxeBuilder({ page: desktop }).include('.settings-dialog').analyze(),
  ).toHaveProperty('violations', [])
  if (process.env.CAPTURE_UI) {
    await desktop.setViewportSize({ width: 560, height: 900 })
    await desktop.screenshot({ path: '/tmp/sloth-sync-form-narrow.png' })
    await desktop.setViewportSize({ width: 1280, height: 720 })
  }
  await next.click()
  await expect(dialog.getByText('1 nota deste aparelho será enviada.')).toBeVisible()
  await expect(dialog.getByText('Nenhuma nota é apagada nesta etapa.')).toBeVisible()
  if (process.env.CAPTURE_UI) await dialog.screenshot({ path: '/tmp/sloth-sync-preview.png' })
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  if (process.env.CAPTURE_UI) await dialog.screenshot({ path: '/tmp/sloth-sync-done.png' })

  // Second device: a wrong recovery key is refused, the right one shows the preview.
  const second = await browser.newContext()
  await second.addInitScript(fakeVault)
  await second.addInitScript(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), {
    key: STORAGE_KEY,
    doc: {
      ...newDocument(),
      notes: [{ id: 'phone', name: 'Celular.md', body: '# Celular\n\ndo celular', revision: 0 }],
      openIds: ['phone'],
      activeId: 'phone',
    },
  })
  await serve(second, api)
  const phone = await second.newPage()
  await phone.goto('/')
  dialog = await openSync(phone)
  await dialog.getByLabel('Endereço do servidor').fill(SERVER)
  await dialog.getByLabel('Chave de acesso').fill(TOKEN)
  await dialog.getByLabel(/Já sincronizo em outro aparelho/).check()
  await dialog.getByLabel('Chave de recuperação', { exact: true }).fill('0'.repeat(55))
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/erro de digitação|não abre as notas/)
  await dialog.getByLabel('Chave de recuperação', { exact: true }).fill(recovery.toLowerCase())
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByText('1 nota será baixada do servidor.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await phone.keyboard.press('Escape')
  const library = phone.getByRole('complementary', { name: 'Biblioteca' })
  await expect(library.getByRole('button', { name: /^Celular/ })).toBeVisible()
  await expect(library.getByRole('button', { name: /^Welcome/ })).toBeVisible()

  // The first device receives the phone's note with "Sincronizar agora".
  await desktop.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(desktop.getByRole('status')).toContainText('Sincronizado às')
  await desktop.keyboard.press('Escape')
  await expect(
    desktop
      .getByRole('complementary', { name: 'Biblioteca' })
      .getByRole('button', { name: /^Celular/ }),
  ).toBeVisible()

  // Turning off keeps the notes.
  dialog = await openSync(desktop)
  desktop.once('dialog', (confirm) => confirm.accept())
  await dialog.getByRole('button', { name: 'Desligar' }).click()
  await expect(dialog.getByLabel('Endereço do servidor')).toBeVisible()
  await first.close()
  await second.close()
})
