import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { newDocument } from '../src/storage.js'

async function native(page, options = {}) {
  await page.addInitScript(
    ({ document, options }) => {
      window.nativeDocument = document
      window.updateCalls = []
      window.updateOptions = options
      window.updateSavedAtInstall = null
      window.updateDownloadReady = false
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command, args) => {
          if (command.startsWith('plugin:updater|') || command === 'update_restart')
            window.updateCalls.push(command)
          if (command === 'read_state') return JSON.stringify(window.nativeDocument)
          if (command === 'write_state') {
            window.updateCalls.push('save')
            if (window.updateOptions.saveFails) throw new Error('disk full')
            window.nativeDocument = JSON.parse(args.contents)
          }
          if (command === 'vault_status') return { path: null, available: false }
          if (command === 'plugin:event|listen') return 1
          if (['image_list', 'take_opened_files'].includes(command)) return []
          if (command === 'update_environment') return !window.updateOptions.development
          if (command === 'plugin:updater|check') {
            if (window.updateOptions.holdCheck)
              await new Promise((resolve) => {
                window.finishCheck = resolve
              })
            if (window.updateOptions.checkFails) throw new Error('network unavailable')
            if (window.updateOptions.current) return null
            return { rid: 10, version: '0.2.0', currentVersion: '0.1.0', rawJson: {} }
          }
          if (command === 'plugin:updater|download') {
            args.onEvent.onmessage({
              event: 'Started',
              data: { contentLength: window.updateOptions.unknownSize ? null : 100 },
            })
            args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 40 } })
            if (window.updateOptions.holdDownload)
              await new Promise((resolve) => {
                window.finishDownload = resolve
              })
            args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 60 } })
            args.onEvent.onmessage({ event: 'Finished' })
            if (window.updateOptions.holdVerification)
              await new Promise((resolve) => {
                window.finishVerification = resolve
              })
            if (window.updateOptions.invalidSignature) throw new Error('Signature version mismatch')
            window.updateDownloadReady = true
            return 11
          }
          if (command === 'plugin:updater|install') {
            if (!window.updateDownloadReady) throw new Error('Download was not verified')
            window.updateSavedAtInstall = JSON.stringify(window.nativeDocument.notes)
            if (window.updateOptions.installFails) throw new Error('access denied')
            return
          }
          if (command === 'update_restart') {
            if (window.updateOptions.restartFails) throw new Error('restart failed')
          }
          return null
        },
      }
    },
    { document: newDocument(), options },
  )
}
async function check(page) {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Verificar atualizações', exact: true }).click()
}
const download = (page) => page.getByRole('button', { name: 'Baixar atualização', exact: true })
const install = (page) => page.getByRole('button', { name: 'Instalar e reiniciar', exact: true })
const notice = (page) => page.getByRole('complementary', { name: 'Atualização do aplicativo' })

for (const width of [390, 1280]) {
  test(`signed updates download in the app and save the latest edits before install at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await native(page, { holdDownload: true, holdVerification: true })
    await page.goto('/')
    await expect(notice(page)).toContainText('Sloth Note 0.2.0 está disponível.')
    if (width === 1280)
      await page
        .getByRole('radiogroup', { name: 'Tema', exact: true })
        .getByRole('radio', { name: 'Escuro', exact: true })
        .click()
    await download(page).click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '40')
    await expect(download(page)).toBeDisabled()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Minha nota\n\nÚltima edição durante o download.')
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-update-downloading-${width}.png` })
    await page.evaluate(() => window.finishDownload())
    await expect(notice(page)).toContainText('Verificando a assinatura')
    await expect(install(page)).toHaveCount(0)
    await page.evaluate(() => window.finishVerification())
    await expect(install(page)).toBeEnabled()
    await page.evaluate(() => window.scrollTo(0, 600))
    expect((await notice(page).boundingBox()).y).toBeGreaterThanOrEqual(46)
    if (process.env.CAPTURE_UI && width === 390)
      await notice(page).screenshot({ path: 'public/changelog/download-updates.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('.update-notice').analyze()).violations).toEqual(
      [],
    )
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-update-ready-${width}.png` })
    await install(page).click()
    await expect
      .poll(() => page.evaluate(() => window.updateCalls.includes('update_restart')))
      .toBe(true)
    const calls = await page.evaluate(() => window.updateCalls)
    expect(calls.lastIndexOf('save')).toBeLessThan(calls.indexOf('plugin:updater|install'))
    expect(calls.indexOf('plugin:updater|install')).toBeLessThan(calls.indexOf('update_restart'))
    expect(await page.evaluate(() => window.updateSavedAtInstall)).toContain(
      'Última edição durante o download.',
    )
    await expect(page.locator('.workspace-layout')).toHaveAttribute('inert', '')
  })
}

test('signature rejection cannot enable installation and download can retry', async ({ page }) => {
  await native(page, { invalidSignature: true })
  await page.goto('/')
  await download(page).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'Não foi possível baixar ou verificar',
  )
  await expect(install(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.updateCalls.includes('plugin:updater|install'))).toBe(
    false,
  )
  await page.evaluate(() => {
    window.updateOptions.invalidSignature = false
  })
  await download(page).click()
  await expect(install(page)).toBeEnabled()
})

test('save failure keeps editing available and never installs or restarts; retry preserves edits', async ({
  page,
}) => {
  await native(page, { saveFails: true })
  await page.goto('/')
  await download(page).click()
  await expect(install(page)).toBeEnabled()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Não perder\n\nTrabalho ainda não salvo.')
  // Dismiss the persistent storage warning before using the action beneath it.
  await page.locator('[data-sonner-toast][data-y-position="top"] [data-close-button]').click()
  await install(page).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'A atualização não foi instalada' }),
  ).toBeVisible()
  expect(await page.evaluate(() => window.updateCalls.includes('plugin:updater|install'))).toBe(
    false,
  )
  expect(await page.evaluate(() => window.updateCalls.includes('update_restart'))).toBe(false)
  await expect(page.locator('.workspace-layout')).not.toHaveAttribute('inert')
  await expect(page.locator('textarea')).toHaveValue(/Trabalho ainda não salvo/)
  await page.evaluate(() => {
    window.updateOptions.saveFails = false
  })
  await install(page).click()
  await expect
    .poll(() => page.evaluate(() => window.updateCalls.includes('update_restart')))
    .toBe(true)
  expect(await page.evaluate(() => window.updateSavedAtInstall)).toContain(
    'Trabalho ainda não salvo',
  )
})

test('installation failure restores editing and allows another download', async ({ page }) => {
  await native(page, { installFails: true })
  await page.goto('/')
  await download(page).click()
  await install(page).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('Não foi possível instalar')
  await expect(page.locator('.workspace-layout')).not.toHaveAttribute('inert')
  await page.evaluate(() => {
    window.updateOptions.installFails = false
  })
  await download(page).click()
  await install(page).click()
  await expect
    .poll(() => page.evaluate(() => window.updateCalls.includes('update_restart')))
    .toBe(true)
})

test('restart failure can retry without installing again and saves any new edit', async ({
  page,
}) => {
  await native(page, { restartFails: true })
  await page.goto('/')
  await download(page).click()
  await install(page).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('A atualização foi instalada')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Mais trabalho\n\nUma edição depois da instalação.')
  await page.evaluate(() => {
    window.updateOptions.restartFails = false
  })
  await page.getByRole('button', { name: 'Reiniciar aplicativo', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.updateCalls.filter((call) => call === 'update_restart').length),
    )
    .toBe(2)
  expect(
    await page.evaluate(
      () => window.updateCalls.filter((call) => call === 'plugin:updater|install').length,
    ),
  ).toBe(1)
  expect(await page.evaluate(() => JSON.stringify(window.nativeDocument.notes))).toContain(
    'Uma edição depois da instalação',
  )
})

test('failed automatic checks stay quiet, and manual checks can retry', async ({ page }) => {
  await native(page, { checkFails: true })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await check(page)
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'Não foi possível verificar atualizações',
  )
  await page.evaluate(() => {
    window.updateOptions.checkFails = false
  })
  await check(page)
  await expect(notice(page)).toBeVisible()
})

test('current version and development mode do not offer an installer', async ({ page }) => {
  await native(page, { current: true })
  await page.goto('/')
  await check(page)
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'Nenhuma versão estável mais nova',
  )
  await expect(notice(page)).toHaveCount(0)
  await page.evaluate(() => {
    window.updateOptions.development = true
  })
  await check(page)
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'A atualização automática está disponível no AppImage instalado',
  )
  await expect(notice(page)).toHaveCount(0)
})

test('manual check while startup is pending shares the result', async ({ page }) => {
  await native(page, { holdCheck: true, current: true })
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => typeof window.finishCheck)).toBe('function')
  await check(page)
  await expect(page.locator('[data-sonner-toast]')).toContainText('Verificando atualizações')
  await page.evaluate(() => window.finishCheck())
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'Nenhuma versão estável mais nova',
  )
  expect(
    await page.evaluate(
      () => window.updateCalls.filter((call) => call === 'plugin:updater|check').length,
    ),
  ).toBe(1)
})

test('web editor does not check native updates', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Verificar atualizações' })).toHaveCount(0)
})

test('checking again preserves the verified package and does not download it again', async ({
  page,
}) => {
  await native(page)
  await page.goto('/')
  await download(page).click()
  await expect(install(page)).toBeEnabled()
  await check(page)
  await expect(notice(page)).toContainText('está pronto para instalar')
  await install(page).click()
  await expect
    .poll(() => page.evaluate(() => window.updateCalls.includes('update_restart')))
    .toBe(true)
  expect(
    await page.evaluate(
      () => window.updateCalls.filter((call) => call === 'plugin:updater|download').length,
    ),
  ).toBe(1)
})

test('download without a reported size remains indeterminate and can finish', async ({ page }) => {
  await native(page, { unknownSize: true, holdDownload: true })
  await page.goto('/')
  await download(page).click()
  await expect(notice(page)).toContainText('Baixando')
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await page.evaluate(() => window.finishDownload())
  await expect(install(page)).toBeEnabled()
})
