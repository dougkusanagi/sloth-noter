import { test, expect, devices } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createServer, memoryDirectory } from '../server/accounts.js'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const SERVER = 'https://sync.example.test'
const TOKEN = 'k'.repeat(40)
const INVITE = 'ABCD-EFGH-JKMN-PQRS'
const PASSWORD = 'senha forte 123'
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
  'base64',
)

// The real API with an in-memory store answers the page's requests.
async function serve(context, api, hooks = {}) {
  await context.route(`${SERVER}/**`, async (route) => {
    const request = route.request()
    if (hooks.isOffline?.()) return route.abort('failed')
    hooks.onRequest?.(request)
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

// Simulates the native Tauri bridge (state + images + desktop keyring) for browser E2E.
function installNativeBridge({ document: initial, useAndroidSecrets: android = false }) {
  const secrets = new Map()
  window.nativeDocument = initial
  window.nativeImages = {}
  if (android) {
    window.SlothSecrets = {
      get: (name) => secrets.get(name) ?? '',
      set: (name, value) => (secrets.set(name, value), 'ok'),
      delete: (name) => (secrets.delete(name), 'ok'),
    }
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: () => 1,
    invoke: async (command, args) => {
      if (command === 'plugin:event|listen') return 1
      if (command === 'plugin:event|unlisten') return null
      if (command === 'read_state') return JSON.stringify(window.nativeDocument)
      if (command === 'write_state') {
        window.nativeDocument = JSON.parse(args.contents)
        return null
      }
      if (command === 'vault_status') return { path: null, available: false }
      if (command === 'persistence_info') return { statePath: '/native/state.json' }
      if (command === 'take_opened_files') return []
      if (command === 'history_load') return { entries: [] }
      if (command === 'history_save' || command === 'history_maintain') return null
      if (command === 'secret_get') return secrets.get(args.name) ?? null
      if (command === 'secret_set') {
        secrets.set(args.name, args.value)
        return null
      }
      if (command === 'secret_delete') {
        secrets.delete(args.name)
        return null
      }
      if (command === 'image_write') {
        window.nativeImages[args.name] = args.bytes
        return null
      }
      if (command === 'image_read') {
        if (!(args.name in window.nativeImages)) throw new Error('Image not found')
        return window.nativeImages[args.name]
      }
      if (command === 'image_list') return Object.keys(window.nativeImages)
      if (command === 'image_delete') {
        delete window.nativeImages[args.name]
        return null
      }
      return null
    },
  }
}

async function openMobileSettings(phone) {
  await phone.bringToFront()
  await phone.getByRole('button', { name: 'Mais opções' }).tap()
  await phone.getByRole('button', { name: 'Configurações' }).tap()
  await expect(phone.getByRole('heading', { name: 'Conta e sincronização' })).toBeVisible()
}

async function closeMobileSettings(phone) {
  await phone.getByRole('button', { name: 'Voltar' }).tap()
  const sheet = phone.getByRole('dialog', { name: 'Mais opções' })
  if (await sheet.isVisible()) await sheet.getByRole('button', { name: 'Fechar' }).tap()
}

async function closeDesktopSettings(desktop) {
  const dialog = desktop.getByRole('dialog', { name: 'Configurações' })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(dialog).toBeHidden()
}

async function desktopSyncNow(desktop, expected = /Sincronizado às/) {
  const dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText(expected)
  await closeDesktopSettings(desktop)
}

async function mobileSyncNow(phone, expected = /Sincronizado às/) {
  await openMobileSettings(phone)
  await phone.getByRole('button', { name: 'Sincronizar agora' }).tap()
  await expect(phone.getByRole('status').filter({ hasText: expected })).toBeVisible()
  await closeMobileSettings(phone)
}

async function setDesktopNoteBody(desktop, text) {
  await desktop.bringToFront()
  const editor = desktop.locator('.cm-content')
  await editor.click()
  await desktop.keyboard.press('Control+a')
  await desktop.keyboard.insertText(text)
}

async function setMobileNoteBody(phone, text) {
  await phone.bringToFront()
  const editor = phone.locator('.cm-content')
  await editor.tap()
  await phone.keyboard.press('Control+a')
  await phone.keyboard.insertText(text)
}

test('desktop and mobile sync edits both ways, conflicts, trash, restore, deletion and offline recovery', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const api = await accountServer()
  let offline = false

  const desktopContext = await browser.newContext()
  await desktopContext.addInitScript(fakeVault)
  await desktopContext.addInitScript(
    ({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)),
    {
      key: STORAGE_KEY,
      doc: {
        ...newDocument(),
        notes: [
          {
            id: 'shared',
            name: 'Projeto.md',
            body: '# Projeto\n\nLinha 1\nLinha 2\nLinha 3',
            revision: 0,
          },
          {
            id: 'extra',
            name: 'Temporaria.md',
            body: '# Temporaria\n\nTexto temporario',
            revision: 0,
          },
        ],
        openIds: ['shared'],
        activeId: 'shared',
      },
    },
  )
  await serve(desktopContext, api, { isOffline: () => offline })
  const desktop = await desktopContext.newPage()
  await desktop.goto('/')

  // Desktop creates the account and uploads the two notes.
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
  await closeDesktopSettings(desktop)

  // Mobile signs in and downloads both notes.
  const mobileContext = await browser.newContext({ ...devices['Pixel 7'] })
  await mobileContext.addInitScript(fakeVault)
  await mobileContext.addInitScript(
    ({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)),
    {
      key: STORAGE_KEY,
      doc: { ...newDocument(), notes: [], openIds: [], activeId: null },
    },
  )
  await serve(mobileContext, api, { isOffline: () => offline })
  const phone = await mobileContext.newPage()
  await phone.goto('/?platform=mobile')
  await openMobileSettings(phone)
  await phone.getByText('Avançado: outro servidor').tap()
  await phone.getByLabel('Endereço do servidor').fill(SERVER)
  await phone.locator('.segmented label', { hasText: 'Entrar' }).tap()
  await phone.getByLabel('E-mail').fill('ana@example.com')
  await phone.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await phone.getByRole('button', { name: 'Entrar', exact: true }).tap()
  await expect(phone.getByText('2 notas serão baixadas do servidor.')).toBeVisible()
  await phone.getByRole('button', { name: 'Sincronizar', exact: true }).tap()
  await expect(phone.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  await closeMobileSettings(phone)
  await expect(phone.locator('[data-note-id="shared"]')).toBeVisible()
  await expect(phone.locator('[data-note-id="extra"]')).toBeVisible()

  // 1. Bidirectional edit of the same note: Desktop -> Mobile, then Mobile -> Desktop.
  await setDesktopNoteBody(desktop, '# Projeto\n\nLinha 1 desktop\nLinha 2\nLinha 3')
  await desktopSyncNow(desktop)

  await mobileSyncNow(phone)
  await phone.locator('[data-note-id="shared"]').tap()
  await expect(phone.getByText('Linha 1 desktop')).toBeVisible()
  await phone.getByRole('button', { name: 'Editar' }).tap()
  await setMobileNoteBody(phone, '# Projeto\n\nLinha 1 desktop\nLinha 2\nLinha 3 celular')
  await phone.getByRole('button', { name: 'Pronto' }).tap()
  await phone.getByRole('button', { name: 'Voltar' }).tap()
  await mobileSyncNow(phone)

  await desktopSyncNow(desktop)
  await expect(desktop.locator('.cm-content')).toContainText('Linha 1 desktop')
  await expect(desktop.locator('.cm-content')).toContainText('Linha 3 celular')

  // 2. Conflict: both edit the same line before syncing; both versions survive.
  await setDesktopNoteBody(desktop, '# Projeto\n\nLinha 1 desktop\nLinha 2 PC\nLinha 3 celular')
  await desktopSyncNow(desktop)

  await phone.locator('[data-note-id="shared"]').tap()
  await phone.getByRole('button', { name: 'Editar' }).tap()
  await setMobileNoteBody(phone, '# Projeto\n\nLinha 1 desktop\nLinha 2 celular\nLinha 3 celular')
  await phone.getByRole('button', { name: 'Pronto' }).tap()
  await phone.getByRole('button', { name: 'Voltar' }).tap()
  await mobileSyncNow(phone, /conflito/i)

  await phone.locator('[data-note-id="shared"]').tap()
  await expect(phone.getByText(/Conflito de sincronização/).first()).toBeVisible()
  await expect(phone.getByText('Linha 2 celular')).toBeVisible()
  await expect(phone.getByText('Linha 2 PC')).toBeVisible()
  await phone.getByRole('button', { name: 'Voltar' }).tap()

  await desktopSyncNow(desktop)
  await expect(desktop.locator('.cm-content')).toContainText('Conflito de sincronização')
  await expect(desktop.locator('.cm-content')).toContainText('Linha 2 celular')
  await expect(desktop.locator('.cm-content')).toContainText('Linha 2 PC')

  // 3. Trash, restore, and permanent deletion travel between desktop and mobile.
  await desktop.bringToFront()
  const sidebar = desktop.getByRole('complementary', { name: 'Biblioteca' })
  await sidebar.getByRole('button', { name: /^Temporaria/ }).click({ button: 'right' })
  await desktop.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await desktop.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
  await desktopSyncNow(desktop)

  await mobileSyncNow(phone)
  await expect(phone.locator('[data-note-id="extra"]')).toHaveCount(0)
  await phone.getByRole('button', { name: 'Mais opções' }).tap()
  await phone.getByRole('button', { name: 'Lixeira', exact: true }).tap()
  await expect(phone.getByRole('article', { name: 'Temporaria' })).toBeVisible()
  await phone
    .getByRole('article', { name: 'Temporaria' })
    .getByRole('button', { name: 'Restaurar' })
    .tap()
  await expect(phone.getByText('A lixeira está vazia.')).toBeVisible()
  await phone.getByRole('button', { name: 'Voltar', exact: true }).tap()
  const moreSheet = phone.getByRole('dialog', { name: 'Mais opções' })
  if (await moreSheet.isVisible()) await moreSheet.getByRole('button', { name: 'Fechar' }).tap()
  await mobileSyncNow(phone)

  await desktopSyncNow(desktop)
  await expect(sidebar.getByRole('button', { name: /^Temporaria/ })).toBeVisible()

  // Permanent deletion on desktop removes the note from mobile completely.
  await sidebar.getByRole('button', { name: /^Temporaria/ }).click({ button: 'right' })
  await desktop.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await desktop.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
  await sidebar.getByRole('button', { name: /^Lixeira/ }).click()
  const trashRegion = sidebar.getByRole('region', { name: 'Lixeira', exact: true })
  await trashRegion.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click()
  await desktop.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(trashRegion).toContainText('A lixeira está vazia.')
  await sidebar.getByRole('button', { name: 'Voltar para a biblioteca' }).click()
  await desktopSyncNow(desktop)

  await mobileSyncNow(phone)
  await expect(phone.locator('[data-note-id="extra"]')).toHaveCount(0)
  await phone.getByRole('button', { name: 'Mais opções' }).tap()
  await phone.getByRole('button', { name: 'Lixeira', exact: true }).tap()
  await expect(phone.getByText('A lixeira está vazia.')).toBeVisible()
  await phone.getByRole('button', { name: 'Voltar', exact: true }).tap()
  if (await moreSheet.isVisible()) await moreSheet.getByRole('button', { name: 'Fechar' }).tap()

  // 4. Network failure preserves local edits and recovers when back online.
  offline = true
  await setDesktopNoteBody(desktop, '# Projeto\n\nSalvo offline sem perder nada')
  dialog = await openSync(desktop)
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(dialog.getByRole('status')).toContainText(/conexão|servidor|alcançar|tente/i)
  await closeDesktopSettings(desktop)
  await expect(desktop.locator('.cm-content')).toContainText('Salvo offline sem perder nada')

  offline = false
  await desktopSyncNow(desktop)
  await mobileSyncNow(phone)
  await phone.locator('[data-note-id="shared"]').tap()
  await expect(phone.getByText('Salvo offline sem perder nada')).toBeVisible()

  await desktopContext.close()
  await mobileContext.close()
})

test('image inserted on mobile syncs as an encrypted blob and renders on desktop', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const api = await accountServer()
  let blobPuts = 0
  let blobGets = 0
  const trackBlobs = {
    onRequest: (request) => {
      if (new URL(request.url()).pathname.startsWith('/v1/blobs/')) {
        if (request.method() === 'PUT') blobPuts++
        if (request.method() === 'GET') blobGets++
      }
    },
  }

  // Mobile uses Android Keystore bridge + Tauri image_read/image_write.
  const mobileContext = await browser.newContext({ ...devices['Pixel 7'] })
  await mobileContext.addInitScript(installNativeBridge, {
    document: {
      ...newDocument(),
      notes: [{ id: 'foto-note', name: 'Fotos.md', body: '# Fotos\n\n', revision: 0 }],
      openIds: ['foto-note'],
      activeId: 'foto-note',
    },
    useAndroidSecrets: true,
  })
  await serve(mobileContext, api, trackBlobs)
  const phone = await mobileContext.newPage()
  await phone.goto('/?platform=mobile')

  // Insert an image on mobile via the slash menu; Tauri invoke stores it under assets/.
  await phone.locator('[data-note-id="foto-note"]').tap()
  await phone.getByRole('button', { name: 'Editar' }).tap()
  await phone.locator('.cm-content').tap()
  await phone.keyboard.press('End')
  await phone.keyboard.type('/')
  await phone.getByRole('textbox', { name: 'Buscar blocos' }).fill('imagem')
  await phone.getByRole('button', { name: 'Imagem', exact: true }).tap()
  await phone.locator('.image-insert input[type=file]').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  })
  await expect
    .poll(() =>
      phone.evaluate(() => {
        const note = window.nativeDocument.notes.find((item) => item.id === 'foto-note')
        return note?.body ?? ''
      }),
    )
    .toMatch(/!\[foto\.png\]\(assets\/[^)]+-foto\.png\)/)
  const uploadedAsset = await phone.evaluate(() => Object.keys(window.nativeImages)[0])
  expect(uploadedAsset).toMatch(/^assets\/.+-foto\.png$/)
  await phone.getByRole('button', { name: 'Pronto' }).tap()
  await phone.getByRole('button', { name: 'Voltar' }).tap()

  // Mobile creates account and syncs the note + encrypted image blob.
  await openMobileSettings(phone)
  await phone.getByText('Avançado: outro servidor').tap()
  await phone.getByLabel('Endereço do servidor').fill(SERVER)
  await phone.getByLabel('Nome').fill('Ana')
  await phone.getByLabel('E-mail').fill('ana@example.com')
  await phone.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await phone.getByLabel('Confirme a senha').fill(PASSWORD)
  await phone.getByLabel('Código de convite').fill(INVITE)
  await phone.getByRole('button', { name: 'Criar conta' }).tap()
  await phone.getByRole('button', { name: 'Continuar' }).tap()
  await phone.getByRole('button', { name: 'Sincronizar', exact: true }).tap()
  await expect(phone.getByRole('status').filter({ hasText: 'Sincronizado às' })).toBeVisible()
  expect(blobPuts).toBe(1)

  // Desktop uses Tauri keyring + Tauri image_read/image_write, signs in, and renders the image.
  const desktopContext = await browser.newContext()
  const desktopDoc = { ...newDocument(), notes: [], openIds: [], activeId: null }
  await desktopContext.addInitScript(installNativeBridge, {
    document: desktopDoc,
    useAndroidSecrets: false,
  })
  await serve(desktopContext, api, trackBlobs)
  const desktop = await desktopContext.newPage()
  await desktop.goto('/')

  const dialog = await openSync(desktop)
  await useServer(dialog)
  await dialog.locator('.segmented label', { hasText: 'Entrar' }).click()
  await dialog.getByLabel('E-mail').fill('ana@example.com')
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(dialog.getByText('1 nota será baixada do servidor.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Sincronizado às')
  expect(blobGets).toBe(1)
  await closeDesktopSettings(desktop)

  // Verify the decrypted bytes landed in desktop's image store and the <img> renders cleanly.
  const desktopBytes = await desktop.evaluate((name) => window.nativeImages[name], uploadedAsset)
  expect(desktopBytes).toEqual([...PNG_BYTES])
  const renderedImage = desktop.locator('.cm-content img[alt="foto.png"]')
  await expect(renderedImage).toBeVisible()
  await expect
    .poll(() => renderedImage.evaluate((img) => img.complete && img.naturalWidth > 0))
    .toBe(true)

  await desktopContext.close()
  await mobileContext.close()
})
