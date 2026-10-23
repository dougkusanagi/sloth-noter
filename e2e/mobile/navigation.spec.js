import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

const notes = [
  {
    id: 'shopping',
    name: 'Compras.md',
    body: '# Compras\n\nFrutas para o café da manhã\n\n- [ ] Comprar maçãs',
    revision: 0,
  },
  {
    id: 'meeting',
    name: 'Reunião.md',
    body: '# Reunião\n\nDiscutir compras e orçamento.',
    revision: 0,
  },
  {
    id: 'long',
    name: `${'Planejamento '.repeat(17)}.md`,
    body:
      '# ' +
      'Planejamento '.repeat(17) +
      '\n\n' +
      'a'.repeat(80) +
      '\n\n' +
      '| Coluna |'.repeat(12) +
      '\n' +
      '| --- |'.repeat(12) +
      '\n' +
      '| Valor |'.repeat(12) +
      '\n\n```js\n' +
      'const dado = 123; '.repeat(20) +
      '\n```',
    revision: 0,
  },
  ...Array.from({ length: 300 }, (_, i) => ({
    id: `note-${i}`,
    name: `Registro ${i}.md`,
    body: `# Registro ${i}\n\nAnotações da semana ${i}.`,
    revision: 0,
  })),
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, notes, document }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ ...document, notes, openIds: ['shopping'], activeId: 'shopping' }),
        )
    },
    { key: STORAGE_KEY, notes, document: newDocument() },
  )
  await page.goto('/?platform=mobile')
  await expect(page.getByRole('searchbox')).toBeVisible()
})

test('#22 search prioritizes title matches and survives opening a note and back', async ({
  page,
}) => {
  await page.getByRole('searchbox').fill('compras')
  await expect(page.locator('.mobile-note-open')).toHaveCount(2)
  await expect(page.locator('.mobile-note-open').first()).toContainText('Compras')
  await page.locator('[data-note-id="shopping"]').tap()
  await expect(page.locator('.markdown')).toContainText('Frutas')
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
  await expect(page.locator('[data-note-id="shopping"]')).toBeFocused()
})

test('#7 restores the open note after reload and returns to the saved search', async ({ page }) => {
  await page.getByRole('searchbox').fill('compras')
  await page.locator('[data-note-id="meeting"]').tap()
  await page.reload()
  await expect(page.locator('.markdown')).toContainText('orçamento')
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
})

test('#22 list scroll survives opening and returning from a note', async ({ page }) => {
  await page.locator('[data-note-id="note-30"]').scrollIntoViewIfNeeded()
  const before = await page.locator('.mobile-content').evaluate((el) => el.scrollTop)
  await page.locator('[data-note-id="note-30"]').tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect
    .poll(() => page.locator('.mobile-content').evaluate((el) => el.scrollTop))
    .toBe(before)
})

test('create with no search results, edit and reload preserves the new text', async ({ page }) => {
  await page.getByRole('searchbox').fill('Viagem de férias')
  await page.getByRole('button', { name: 'Criar nota “Viagem de férias”' }).tap()
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  // Android CodeMirror resolves Enter asynchronously; wait for that edit before typing.
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const document = JSON.parse(localStorage.getItem(key))
        return document.notes.find((note) => note.id === document.activeId).body
      }, STORAGE_KEY),
    )
    .toContain('\n')
  await page.keyboard.type('Reservar hotel')
  await page.getByRole('button', { name: 'Pronto' }).tap()
  await expect(page.locator('.markdown')).toContainText('Reservar hotel')
  await page.reload()
  await expect(page.locator('.markdown')).toContainText('Reservar hotel')
})

test('#5 browser back closes action sheets and returns focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Ações de Compras', exact: true })
  await trigger.tap()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('trash provides undo and pinning remains after reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Ações de Reunião', exact: true }).tap()
  await page.getByRole('button', { name: 'Fixar nota', exact: true }).tap()
  await expect(page.locator('.mobile-note-open').first()).toContainText('Reunião')
  await page.reload()
  await expect(page.locator('.mobile-note-open').first()).toContainText('Reunião')
  await page.getByRole('button', { name: 'Ações de Reunião', exact: true }).tap()
  await page.getByRole('button', { name: 'Mover para a lixeira', exact: true }).tap()
  await expect(page.locator('[data-note-id="meeting"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).tap()
  await expect(page.locator('[data-note-id="meeting"]')).toBeVisible()
})

test('bottom navigation opens tasks without editing and hides above the keyboard', async ({
  page,
}) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Tarefas' }).tap()
  await expect(page.getByRole('checkbox', { name: 'Comprar maçãs' })).toBeVisible()
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await page.getByRole('navigation').getByRole('button', { name: 'Imagens' }).tap()
  await expect(page.getByText('Nenhuma imagem nas notas ainda.')).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Notas' }).tap()
  await page.evaluate(() => window.__insets({ top: 32, bottom: 24, ime: 300, keyboard: 'open' }))
  await expect(page.getByRole('navigation')).toBeHidden()
})

test('visible theme control persists and system follows device changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Escuro', exact: true }).tap()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Sistema', exact: true }).tap()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('recent searches are available after opening a result and returning', async ({ page }) => {
  await page.getByRole('searchbox').fill('compras')
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await page.getByRole('searchbox').fill('')
  await expect(page.getByRole('button', { name: 'compras', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'compras', exact: true }).tap()
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
})

test('save failure keeps edits and allows retry without entering them again', async ({ page }) => {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    window.__allowSave = false
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sloth-note:v3' && !window.__allowSave)
        throw new DOMException('Full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' guardado')
  await expect(page.getByRole('alert')).toContainText('Não foi possível salvar')
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await expect(page.locator('.markdown')).toContainText('guardado')
  await page.evaluate(() => {
    window.__allowSave = true
  })
  await page.getByRole('button', { name: 'Tentar de novo', exact: true }).tap()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.markdown')).toContainText('guardado')
})

test('blocked storage never displays the fallback welcome note as saved user data', async ({
  page,
}) => {
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Não foi possível ler suas notas')
  await expect(page.getByRole('button', { name: 'Nova nota', exact: true })).toHaveCount(0)
  await expect(page.locator('.mobile-note-open')).toHaveCount(0)
})

test('mobile layouts and changelog remain usable with long content in both themes', async ({
  page,
}, testInfo) => {
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('button', { name: theme === 'light' ? 'Claro' : 'Escuro', exact: true })
      .tap()
    for (const [width, height] of [
      [320, 740],
      [360, 740],
      [390, 844],
      [412, 915],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height })
      await page.evaluate(() =>
        window.__insets({ top: 32, bottom: 24, ime: 0, keyboard: 'closed' }),
      )
      await expect(page.getByRole('navigation')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({ path: testInfo.outputPath(`notes-${width}-${theme}.png`) })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Mais opções' }).tap()
    await page.getByRole('button', { name: 'Novidades', exact: true }).tap()
    await expect(page.locator('.changelog-page')).toContainText('navegação no Android')
    const illustration = page.locator('.changelog-page img[src="/changelog/mobile-navigation.png"]')
    await illustration.scrollIntoViewIfNeeded()
    await expect(illustration).toBeVisible()
    await expect
      .poll(() => illustration.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`changelog-390-${theme}.png`) })
    await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
    await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  }
})

test('reading, editing and action sheets keep long text inside the visible viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: /^Ações de Planejamento/ }).tap()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('actions-320.png') })
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await page.locator('[data-note-id="long"]').tap()
  await expect(page.locator('.markdown h1')).toContainText('Planejamento Planejamento')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('reading-320.png') })
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeFocused()
  await expect(page.locator('.cm-scroller')).toHaveCSS('padding-left', '0px')
  await page.screenshot({ path: testInfo.outputPath('editing-320.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('editing-390.png') })
})

test('notes and action sheet pass accessibility checks and keep keyboard focus inside', async ({
  page,
}) => {
  for (const open of [false, true]) {
    if (open) await page.getByRole('button', { name: 'Ações de Compras', exact: true }).tap()
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations).toEqual([])
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    expect(
      await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ações de Compras', exact: true })).toBeFocused()
})
