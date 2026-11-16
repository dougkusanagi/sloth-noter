import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { newDocument } from '../src/storage.js'

const DOUGLAS = '6d291a0b-3451-41d0-b592-b1533e911fbe'

// Desktop bridge with two profiles; `douglas` is in use and starts with only the help page.
async function native(page, { profiles }) {
  await page.addInitScript(
    ({ document, profiles, active }) => {
      window.nativeDocument = document
      window.catalog = { active, profiles }
      window.switched = null
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command, args) => {
          if (command === 'active_profile') return window.catalog.active
          if (command === 'profiles_load') return window.catalog
          if (command === 'profiles_save') window.catalog = args.catalog
          if (command === 'profile_switch') window.switched = args.catalog.active
          if (command === 'read_state') return JSON.stringify(window.nativeDocument)
          if (command === 'write_state') window.nativeDocument = JSON.parse(args.contents)
          if (command === 'vault_status') return { path: null, available: false }
          if (command === 'plugin:event|listen') return 1
          if (['image_list', 'take_opened_files'].includes(command)) return []
          if (command === 'secret_get') return null
          return null
        },
      }
    },
    { document: newDocument(), profiles, active: profiles.at(-1).id },
  )
}

const two = [
  { id: 'primary', name: 'Principal' },
  { id: DOUGLAS, name: 'Douglas' },
]

for (const width of [1280, 390]) {
  test(`the profile in use is visible and opens the profiles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await native(page, { profiles: two })
    await page.goto('/')
    const profile = page.getByRole('button', { name: 'Perfil em uso: Douglas. Abrir perfis' })
    if (width < 700) await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
    await expect(profile).toBeVisible()
    const footer = page.locator('.sidebar-footer')
    expect(await footer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/sloth-profile-${width}.png` })
    await profile.click()
    const dialog = page.getByRole('dialog', { name: 'Configurações' })
    await expect(dialog.getByRole('heading', { name: 'Perfis', exact: true })).toBeVisible()
    expect(
      (await new AxeBuilder({ page }).include('.settings-dialog').analyze()).violations,
    ).toEqual([])

    // The switch warning says where the notes are and how to come back.
    let message = ''
    page.once('dialog', (confirm) => {
      message = confirm.message()
      confirm.accept()
    })
    await dialog.getByRole('button', { name: 'Usar o perfil Principal' }).click()
    expect(message).toContain('as notas de “Douglas” não aparecem em “Principal”')
    expect(message).toContain('escolha “Douglas” em Configurações › Perfis')
    await expect.poll(() => page.evaluate(() => window.switched)).toBe('primary')
  })
}

test('with a single profile nothing about profiles shows outside Settings', async ({ page }) => {
  await native(page, { profiles: [{ id: 'primary', name: 'Principal' }] })
  await page.goto('/')
  await expect(page.locator('.notes-sidebar')).toBeVisible()
  await expect(page.locator('.sidebar-profile')).toHaveCount(0)
})

test('a long profile name is shortened in the library footer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const name = 'Perfil com um nome muito comprido para caber no rodapé da biblioteca'
  await native(page, {
    profiles: [
      { id: 'primary', name: 'Principal' },
      { id: DOUGLAS, name },
    ],
  })
  await page.goto('/')
  const profile = page.locator('.sidebar-profile')
  await expect(profile).toHaveAttribute('title', `Perfil: ${name}`)
  const footer = page.locator('.sidebar-footer')
  expect(await footer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(page.locator('.sidebar-footer .sidebar-trash').last()).toBeInViewport()
})

test('profiles can be renamed and created from their own section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await native(page, { profiles: two })
  await page.goto('/')
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: 'Configurações' })
  await dialog.getByRole('button', { name: 'Perfis', exact: true }).click()
  const list = dialog.getByRole('list', { name: 'Perfis neste aparelho' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('listitem').filter({ hasText: 'Douglas' })).toContainText('em uso')

  await dialog.getByRole('button', { name: 'Renomear o perfil Douglas' }).click()
  const field = dialog.getByRole('textbox', { name: 'Renomear o perfil Douglas' })
  await expect(field).toBeFocused()
  await field.fill('principal')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Já existe um perfil com este nome')
  await field.fill('Trabalho')
  await field.press('Enter')
  await expect(list).toContainText('Trabalho')
  await expect.poll(() => page.evaluate(() => window.catalog.profiles[1].name)).toBe('Trabalho')
  // The library footer follows the new name.
  await expect(page.locator('.sidebar-profile')).toContainText('Trabalho')

  await dialog.getByRole('button', { name: 'Novo perfil' }).click()
  await dialog.getByLabel('Nome do novo perfil').fill('Estudos')
  if (process.env.CAPTURE_UI) await dialog.screenshot({ path: '/tmp/sloth-profiles-new.png' })
  await dialog.getByRole('button', { name: 'Criar perfil' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(3)
  // Escape cancels an edit without closing Settings.
  await dialog.getByRole('button', { name: 'Renomear o perfil Estudos' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Renomear o perfil Estudos' })).toHaveCount(0)
  expect((await new AxeBuilder({ page }).include('.settings-dialog').analyze()).violations).toEqual(
    [],
  )
  if (process.env.CAPTURE_UI) {
    for (const [w, h] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h })
      await page.screenshot({ path: `/tmp/sloth-profiles-${w}.png` })
    }
  }
})
