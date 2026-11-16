import { test, expect } from '@playwright/test'
import { newDocument } from '../../src/storage.js'

test('the more-options drawer shows the profile in use and opens Settings', async ({ page }) => {
  await page.addInitScript((document) => {
    window.nativeDocument = document
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command, args) => {
        if (command === 'active_profile') return 'douglas-0000-4000-8000-000000000001'
        if (command === 'profiles_load')
          return {
            active: 'douglas-0000-4000-8000-000000000001',
            profiles: [
              { id: 'primary', name: 'Principal' },
              { id: 'douglas-0000-4000-8000-000000000001', name: 'Douglas' },
            ],
          }
        if (command === 'read_state') return JSON.stringify(window.nativeDocument)
        if (command === 'write_state') window.nativeDocument = JSON.parse(args.contents)
        if (command === 'vault_status') return { path: null, available: false }
        if (command === 'plugin:event|listen') return 1
        if (['image_list', 'take_opened_files'].includes(command)) return []
        return null
      },
    }
  }, newDocument())
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  const profile = page.getByRole('button', { name: 'Perfil em uso: Douglas. Abrir perfis' })
  await expect(profile).toHaveText('Perfil: Douglas')
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-profile-mobile.png' })
  await profile.tap()
  await expect(page.getByRole('heading', { name: 'Perfis', exact: true })).toBeVisible()
})
