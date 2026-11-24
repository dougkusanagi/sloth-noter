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
  await expect(library.getByRole('button', { name: /^Rascunho/ })).toBeVisible()

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

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Simulates a native Tauri environment (state file, assets/ images and system vault).
function fakeNativeEnv({ doc, android = false }) {
  let storedState = JSON.stringify(doc)
  const secrets = new Map()
  const images = new Map()
  const callbacks = new Map()
  let callbackId = 0
  if (android) {
    window.SlothSecrets = {
      get: (name) => secrets.get(name) ?? '',
      set: (name, value) => (secrets.set(name, value), 'ok'),
      delete: (name) => (secrets.delete(name), 'ok'),
    }
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback(handler) {
      callbacks.set(++callbackId, handler)
      return callbackId
    },
    async invoke(command, args = {}) {
      if (command === 'read_state') return storedState
      if (command === 'write_state') {
        storedState = args.contents
        return null
      }
      if (command === 'persistence_info') return { statePath: '/mock/state.json' }
      if (command === 'vault_status') return { path: null, available: false }
      if (command === 'secret_get') return secrets.get(args.name) ?? null
      if (command === 'secret_set') {
        secrets.set(args.name, args.value)
        return null
      }
      if (command === 'secret_delete') {
        secrets.delete(args.name)
        return null
      }
      if (command === 'image_read') {
        if (!images.has(args.name)) throw new Error('missing')
        return images.get(args.name)
      }
      if (command === 'image_write') {
        images.set(args.name, Array.from(args.bytes))
        return null
      }
      if (command === 'image_list') return [...images.keys()]
      if (command === 'take_opened_files') return []
      if (command === 'history_load') return null
      if (command === 'history_save') return null
      if (command === 'plugin:event|listen') return args.handler
      return null
    },
  }
}

async function closeSettings(page) {
  const dialog = page.getByRole('dialog', { name: 'Configurações' })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(dialog).toBeHidden()
}

async function openMobileSync(page) {
  await page.bringToFront()
  await page.getByRole('button', { name: 'Mais opções' }).click()
  await page.getByRole('button', { name: 'Configurações' }).click()
  await expect(page.getByRole('heading', { name: 'Conta e sincronização' })).toBeVisible()
}

async function mobileSyncNow(page) {
  await openMobileSync(page)
  await page.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
}

async function mobileBackToNotes(page) {
  await page.getByRole('button', { name: 'Voltar' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mais opções' })
  if (await sheet.isVisible()) await sheet.getByRole('button', { name: 'Fechar' }).click()
}

test('desktop and mobile sync edits, conflicts, images, trash and restore on one account', async ({
  browser,
}) => {
  const api = await accountServer()
  const baseDoc = {
    ...newDocument(),
    notes: [
      {
        id: 'proj-1',
        name: 'Projeto.md',
        body: '# Projeto\n\nLinha 1\nLinha 2\nLinha 3',
        revision: 0,
        modifiedAt: 1000,
      },
      {
        id: 'extra-1',
        name: 'Apoio.md',
        body: '# Apoio\n\nTexto fixo',
        revision: 0,
        modifiedAt: 1000,
      },
    ],
    openIds: ['proj-1', 'extra-1'],
    activeId: 'proj-1',
  }
  const phoneDoc = {
    ...newDocument(),
    notes: [],
    openIds: [],
    activeId: null,
  }

  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await desktopCtx.addInitScript(fakeNativeEnv, { doc: baseDoc, android: false })
  await serve(desktopCtx, api)
  const desktop = await desktopCtx.newPage()
  await desktop.goto('/')

  // 1. Desktop creates account (using desktop Tauri keyring commands) and syncs initial notes.
  let dialog = await openSync(desktop)
  await useServer(dialog)
  await dialog.getByLabel('Nome').fill('Ana')
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Confirme a senha').fill(PASSWORD)
  await dialog.getByLabel('Código de convite').fill(INVITE)
  await dialog.getByRole('button', { name: 'Criar conta' }).click()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByText('2 notas deste aparelho serão enviadas.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)

  // 2. Mobile signs in with e-mail and password (using Android SlothSecrets bridge) and downloads both notes.
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phoneCtx.addInitScript(fakeNativeEnv, { doc: phoneDoc, android: true })
  await serve(phoneCtx, api)
  const phone = await phoneCtx.newPage()
  await phone.goto('/?platform=mobile')
  await openMobileSync(phone)
  await phone.getByText('Avançado: outro servidor').click()
  await phone.getByLabel('Endereço do servidor').fill(SERVER)
  await phone.locator('.segmented label', { hasText: 'Entrar' }).click()
  await phone.getByLabel('E-mail').fill('ana@example.com')
  await phone.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await phone.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(phone.getByText('2 notas serão baixadas do servidor.')).toBeVisible()
  await phone.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(phone.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  await mobileBackToNotes(phone)
  await expect(phone.getByRole('button', { name: /^Projeto/ })).toBeVisible()

  // 3. Concurrent edits on different lines merge cleanly in both directions.
  await desktop.bringToFront()
  await desktop.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const desktopEditor = desktop.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
  await desktopEditor.fill('# Projeto\n\nLinha 1 desktop\nLinha 2\nLinha 3')
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)

  await phone.bringToFront()
  await phone.getByRole('button', { name: /^Projeto/ }).click()
  await phone.getByRole('button', { name: 'Editar' }).click()
  await phone.locator('.cm-content').click()
  await phone.keyboard.press('Control+End')
  await phone.keyboard.insertText(' celular')
  await phone.getByRole('button', { name: 'Pronto' }).click()
  await phone.getByRole('button', { name: 'Voltar' }).click()
  await mobileSyncNow(phone)
  await mobileBackToNotes(phone)
  await phone.getByRole('button', { name: /^Projeto/ }).click()
  await expect(phone.locator('.markdown')).toContainText('Linha 1 desktop')
  await expect(phone.locator('.markdown')).toContainText('Linha 3 celular')

  await desktop.bringToFront()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)
  await expect(desktopEditor).toHaveValue(/Linha 1 desktop/)
  await expect(desktopEditor).toHaveValue(/Linha 3 celular/)

  // 4. Concurrent edit on the same line creates a conflict keeping both versions.
  await desktopEditor.fill('# Projeto\n\nLinha 1 desktop\nLinha 2 desktop\nLinha 3 celular')
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)

  await phone.bringToFront()
  await phone.getByRole('button', { name: 'Editar' }).click()
  const phoneCm = phone.locator('.cm-content')
  await phoneCm.click()
  await phone.keyboard.press('Control+a')
  await phone.keyboard.insertText('# Projeto\n\nLinha 1 desktop\nLinha 2 celular\nLinha 3 celular')
  await phone.getByRole('button', { name: 'Pronto' }).click()
  await phone.getByRole('button', { name: 'Voltar' }).click()
  await mobileSyncNow(phone)
  await expect(phone.getByRole('status').filter({ hasText: 'trechos em conflito' })).toBeVisible()
  await mobileBackToNotes(phone)
  await phone.getByRole('button', { name: /^Projeto/ }).click()
  await expect(phone.locator('.markdown')).toContainText('Conflito de sincronização')
  await expect(phone.locator('.markdown')).toContainText('Linha 2 celular')
  await expect(phone.locator('.markdown')).toContainText('Linha 2 desktop')

  await desktop.bringToFront()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)
  await expect(desktopEditor).toHaveValue(/Linha 2 celular/)
  await expect(desktopEditor).toHaveValue(/Linha 2 desktop/)

  // 5. Image inserted on mobile travels encrypted to desktop and renders there.
  await phone.bringToFront()
  await phone.getByRole('button', { name: 'Editar' }).click()
  await phone.locator('.cm-content').click()
  await phone.keyboard.press('Control+End')
  await phone.keyboard.press('Enter')
  await phone.evaluate(async (bytes) => {
    await window.__TAURI_INTERNALS__.invoke('image_write', {
      name: 'assets/mobile-foto-celular.png',
      bytes,
    })
  }, Array.from(ONE_PIXEL_PNG))
  await phone.keyboard.insertText('![foto-celular.png](assets/mobile-foto-celular.png)')
  await phone.getByRole('button', { name: 'Pronto' }).click()
  await expect(phone.locator('.markdown img')).toBeVisible()
  await phone.getByRole('button', { name: 'Voltar' }).click()
  await mobileSyncNow(phone)

  await desktop.bringToFront()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)
  await desktop.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const desktopImg = desktop.getByRole('img', { name: 'foto-celular.png' })
  await expect(desktopImg).toBeVisible()
  await expect.poll(() => desktopImg.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
  // Images tab in the desktop library refreshes automatically after sync writes an image.
  await desktop
    .getByRole('complementary', { name: 'Biblioteca' })
    .getByRole('button', { name: /^Imagens/ })
    .click()
  await expect(
    desktop.getByRole('complementary', { name: 'Biblioteca' }).locator('img'),
  ).toHaveCount(1)
  await desktop
    .getByRole('complementary', { name: 'Biblioteca' })
    .getByRole('button', { name: /^Notas/ })
    .click()

  // 6. Move to trash, restore on mobile, and permanent delete propagate both ways.
  const projRow = desktop
    .getByRole('complementary', { name: 'Biblioteca' })
    .getByRole('button', { name: /^Projeto/ })
  await projRow.click({ button: 'right' })
  await desktop.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await desktop.getByRole('button', { name: 'Mover', exact: true }).click()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)

  await phone.bringToFront()
  await phone.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(phone.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  await mobileBackToNotes(phone)
  await expect(phone.getByRole('button', { name: /^Projeto/ })).toHaveCount(0)

  // Restore from mobile trash.
  await phone.getByRole('button', { name: 'Mais opções' }).click()
  await phone.getByRole('button', { name: /Lixeira/ }).click()
  await expect(phone.getByText('Projeto')).toBeVisible()
  await phone.getByRole('button', { name: 'Restaurar' }).click()
  await mobileBackToNotes(phone)
  await expect(phone.getByRole('button', { name: /^Projeto/ })).toBeVisible()
  await mobileSyncNow(phone)

  await desktop.bringToFront()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)
  await expect(
    desktop
      .getByRole('complementary', { name: 'Biblioteca' })
      .getByRole('button', { name: /^Projeto/ }),
  ).toBeVisible()

  // Move to trash and delete permanently on desktop; mobile trash becomes empty.
  await desktop
    .getByRole('complementary', { name: 'Biblioteca' })
    .getByRole('button', { name: /^Projeto/ })
    .click({ button: 'right' })
  await desktop.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await desktop.getByRole('button', { name: 'Mover', exact: true }).click()
  await desktop
    .getByRole('complementary', { name: 'Biblioteca' })
    .getByRole('button', { name: /Lixeira/ })
    .click()
  const trashRegion = desktop.getByRole('region', { name: 'Lixeira' })
  await trashRegion.getByRole('button', { name: 'Excluir definitivamente' }).click()
  await desktop.getByRole('button', { name: 'Excluir', exact: true }).click()
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')

  await phone.bringToFront()
  await phone.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(phone.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  await mobileBackToNotes(phone)
  await expect(phone.getByRole('button', { name: /^Projeto/ })).toHaveCount(0)
  await phone.getByRole('button', { name: 'Mais opções' }).click()
  await phone.getByRole('button', { name: /Lixeira/ }).click()
  await expect(phone.getByText('Projeto')).toHaveCount(0)

  await desktopCtx.close()
  await phoneCtx.close()
})

test('network failures, 500, 429 retry-after and revoked sessions keep local text and recover', async ({
  browser,
}) => {
  const api = await accountServer()
  let mode = 'ok'
  let calls = 0

  const ctx = await browser.newContext()
  await ctx.addInitScript(fakeVault)
  await ctx.route(`${SERVER}/**`, async (route) => {
    calls++
    if (mode === 'offline') return route.abort('internetdisconnected')
    if (mode === '500')
      return route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'server_error' }),
      })
    if (mode === '429')
      return route.fulfill({
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '60' },
        body: JSON.stringify({ error: 'rate_limited' }),
      })
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

  const desktop = await ctx.newPage()
  await desktop.goto('/')
  let dialog = await openSync(desktop)
  await useServer(dialog)
  await dialog.getByLabel('Nome').fill('Ana')
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Confirme a senha').fill(PASSWORD)
  await dialog.getByLabel('Código de convite').fill(INVITE)
  await dialog.getByRole('button', { name: 'Criar conta' }).click()
  const recovery = await dialog.getByLabel('Chave de recuperação', { exact: true }).textContent()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)

  // Edit locally while offline: sync reports offline without losing text.
  await desktop.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const editor = desktop.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
  await editor.fill('# Rascunho\n\nTexto salvo offline')
  mode = 'offline'
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('Sem conexão com o servidor')
  await closeSettings(desktop)
  await expect(desktop.locator('.status-sync')).toHaveAttribute('data-state', 'error')
  await expect(editor).toHaveValue(/Texto salvo offline/)

  // Server 500 keeps local edits intact.
  mode = '500'
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('O servidor teve um problema')

  // Server 429 with Retry-After pauses automatic sync runs.
  mode = '429'
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('O servidor pediu uma pausa')
  const callsAfter429 = calls
  await desktop.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await desktop.waitForTimeout(250)
  expect(calls).toBe(callsAfter429)

  // Another device resets the password with the recovery key, revoking the first session (401).
  mode = 'ok'
  const secondCtx = await browser.newContext()
  await secondCtx.addInitScript(fakeVault)
  await serve(secondCtx, api)
  const second = await secondCtx.newPage()
  await second.goto('/')
  const secondDialog = await openSync(second)
  await useServer(secondDialog)
  await secondDialog.locator('.segmented label', { hasText: 'Entrar' }).click()
  await secondDialog.getByRole('button', { name: 'Esqueci a senha' }).click()
  await secondDialog.getByLabel('E-mail').fill('ana@example.com')
  await secondDialog.getByLabel('Chave de recuperação').fill(recovery)
  await secondDialog.getByLabel('Senha nova').fill('senha nova 456')
  await secondDialog.getByLabel('Confirme a senha').fill('senha nova 456')
  await secondDialog.getByRole('button', { name: 'Trocar a senha e entrar' }).click()
  await secondDialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(secondDialog.getByRole('status')).toContainText('Sincronizado às')

  // First device gets 401, keeps local edit, signs out, signs in with the new password and syncs.
  await desktop.bringToFront()
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText('O servidor recusou a conexão')
  desktop.once('dialog', (confirm) => confirm.accept())
  await dialog.getByRole('button', { name: 'Sair da conta' }).click()
  await useServer(dialog)
  await dialog.locator('.segmented label', { hasText: 'Entrar' }).click()
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill('senha nova 456')
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(desktop)
  await expect(editor).toHaveValue(/Texto salvo offline/)

  // Second device receives the edit that survived offline, 500, 429 and 401.
  await second.bringToFront()
  await secondDialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(secondDialog.getByRole('status')).toContainText('Sincronizado às')
  await closeSettings(second)
  await expect(second.locator('.cm-content')).toContainText('Texto salvo offline')

  await ctx.close()
  await secondCtx.close()
})
