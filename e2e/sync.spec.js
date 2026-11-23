import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createServer, memoryDirectory } from '../server/accounts.js'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const SERVER = 'https://sync.example.test'
const TOKEN = 'k'.repeat(40)
const INVITE = 'ABCD-EFGH-JKMN-PQRS'
const PASSWORD = 'senha forte 123'

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
  await dialog.getByRole('button', { name: 'Conta e sincronização' }).click()
  return dialog
}

test('without a vault the web build explains why sync is off', async ({ page }) => {
  await page.goto('/')
  const dialog = await openSync(page)
  await expect(dialog.getByText(/só está disponível no app para desktop e Android/)).toBeVisible()
})

test('the status bar sync button opens Account and sync when not connected', async ({ page }) => {
  await page.goto('/')
  const sync = page
    .locator('.document-info')
    .getByRole('button', { name: /Sincronização desligada/ })
  await expect(sync).toHaveAttribute('title', 'Sincronização desligada')
  await expect(sync).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(sync).toHaveCSS('border-top-width', '0px')
  await sync.click()
  const dialog = page.getByRole('dialog', { name: 'Configurações' })
  await expect(dialog.getByText(/só está disponível no app para desktop e Android/)).toBeVisible()
})

// Real server code in memory: accounts, sessions and one data store per account.
async function accountServer() {
  const directory = memoryDirectory()
  await directory.addInvite(INVITE)
  const stores = new Map()
  const legacyApi = createApi({ store: memoryStore(), token: TOKEN })
  return createServer({
    directory,
    storeFor: (account) => {
      if (!stores.has(account)) stores.set(account, memoryStore())
      return stores.get(account)
    },
    legacy: (request) =>
      request.headers.get('authorization') === `Bearer ${TOKEN}` ? legacyApi(request) : null,
  })
}

async function useServer(dialog) {
  await dialog.getByText('Avançado: outro servidor').click()
  await dialog.getByLabel('Endereço do servidor').fill(SERVER)
}

test('first device creates an account and a second device signs in with e-mail and password', async ({
  browser,
}) => {
  const api = await accountServer()

  const first = await browser.newContext()
  await first.addInitScript(fakeVault)
  await serve(first, api)
  const desktop = await first.newPage()
  await desktop.goto('/')
  let dialog = await openSync(desktop)
  await expect(dialog.getByLabel('Chave de acesso')).toHaveCount(0)
  await expect(dialog.getByRole('radio', { name: 'Criar conta' })).toBeChecked()
  await useServer(dialog)
  await dialog.getByLabel('Nome').fill('Ana')
  await dialog.getByLabel('E-mail').fill('Ana@Example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill('curta')
  await dialog.getByLabel('Confirme a senha').fill('curto')
  await expect(dialog.getByText('As senhas não são iguais.', { exact: false })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Criar conta' })).toBeDisabled()
  await dialog.getByLabel('Confirme a senha').fill('curta')
  await dialog.getByRole('button', { name: 'Mostrar senha' }).first().click()
  await expect(dialog.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text')
  await dialog.getByLabel('Código de convite').fill('wrong-code')
  const create = dialog.getByRole('button', { name: 'Criar conta' })
  await create.click()
  await expect(dialog.getByRole('alert')).toContainText('pelo menos 8 caracteres')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Confirme a senha').fill(PASSWORD)
  await create.click()
  await expect(dialog.getByRole('alert')).toContainText('código de convite não vale')
  await dialog.getByLabel('Código de convite').fill(INVITE.toLowerCase())
  expect(
    await new AxeBuilder({ page: desktop }).include('.settings-dialog').analyze(),
  ).toHaveProperty('violations', [])
  if (process.env.CAPTURE_UI) {
    await desktop.setViewportSize({ width: 390, height: 844 })
    await desktop.screenshot({ path: '/tmp/sloth-sync-account-narrow.png' })
    await desktop.setViewportSize({ width: 1280, height: 720 })
    await dialog.screenshot({ path: '/tmp/sloth-sync-account.png' })
  }
  await create.click()

  await expect(dialog.getByRole('heading', { name: 'Conta criada' })).toBeVisible()
  const recovery = await dialog.getByLabel('Chave de recuperação', { exact: true }).textContent()
  expect(recovery).toMatch(/^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/)
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByText('1 nota deste aparelho será enviada.')).toBeVisible()
  await expect(dialog.getByText('Nenhuma nota é apagada nesta etapa.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await expect(dialog.getByText('Ana · ana@example.com')).toBeVisible()
  if (process.env.CAPTURE_UI) await dialog.screenshot({ path: '/tmp/sloth-sync-done.png' })

  // Second device: a wrong password is refused; the right one shows the preview.
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
  await useServer(dialog)
  await dialog.locator('.segmented label', { hasText: 'Entrar' }).click()
  await expect(dialog.getByLabel('Código de convite')).toHaveCount(0)
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill('senha errada')
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('E-mail ou senha incorretos')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(dialog.getByText('1 nota será baixada do servidor.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await phone.keyboard.press('Escape')
  const library = phone.getByRole('complementary', { name: 'Biblioteca' })
  await expect(library.getByRole('button', { name: /^Celular/ })).toBeVisible()
  await expect(library.getByRole('button', { name: /^Welcome/ })).toBeVisible()

  // The first device receives the phone's note with "Sincronizar agora".
  await desktop
    .getByRole('dialog', { name: 'Configurações' })
    .getByRole('button', { name: 'Sincronizar agora' })
    .click()
  await expect(desktop.getByRole('status')).toContainText('Sincronizado às')
  await desktop.keyboard.press('Escape')
  await expect(
    desktop
      .getByRole('complementary', { name: 'Biblioteca' })
      .getByRole('button', { name: /^Celular/ }),
  ).toBeVisible()

  // Signing out keeps the notes and shows the account form again.
  dialog = await openSync(desktop)
  desktop.once('dialog', (confirm) => confirm.accept())
  await dialog.getByRole('button', { name: 'Sair da conta' }).click()
  await expect(dialog.getByLabel('E-mail')).toBeVisible()

  // Forgot password: the recovery key sets a new one on the same account.
  await useServer(dialog)
  await dialog.locator('.segmented label', { hasText: 'Entrar' }).click()
  await dialog.getByRole('button', { name: 'Esqueci a senha' }).click()
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Chave de recuperação').fill(recovery)
  await dialog.getByLabel('Senha nova').fill('outra senha 2')
  await dialog.getByLabel('Confirme a senha').fill('outra senha 2')
  await dialog.getByRole('button', { name: 'Trocar a senha e entrar' }).click()
  await expect(dialog.getByText('Nenhuma nota é apagada nesta etapa.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await first.close()
  await second.close()
})

test('an old access-key connection moves to an account', async ({ browser }) => {
  const api = await accountServer()
  const context = await browser.newContext()
  await context.addInitScript(fakeVault)
  await context.addInitScript(
    (secret) => window.SlothSecrets.set('sync', secret),
    JSON.stringify({ server: SERVER, token: TOKEN, key: btoa('k'.repeat(32)) }),
  )
  await serve(context, api)
  const page = await context.newPage()
  await page.goto('/')
  const dialog = await openSync(page)
  await expect(dialog.getByText('Conexão antiga')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Desligar' })).toBeVisible()
  await dialog.getByLabel('Nome').fill('Ana')
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Confirme a senha').fill(PASSWORD)
  await dialog.getByLabel('Código de convite').fill(INVITE)
  await dialog.getByRole('button', { name: 'Criar conta' }).click()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByText('1 nota deste aparelho será enviada.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await expect(dialog.getByText('Conexão antiga')).toHaveCount(0)
  await expect(dialog.getByText('Ana · ana@example.com')).toBeVisible()
  await context.close()
})
