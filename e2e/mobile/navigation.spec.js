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
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
})

test('#22 search prioritizes title matches and survives opening a note and back', async ({
  page,
}) => {
  await openSearch(page)
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
  await openSearch(page)
  await page.getByRole('searchbox').fill('compras')
  await page.locator('[data-note-id="meeting"]').tap()
  await page.reload()
  await expect(page.locator('.markdown')).toContainText('orçamento')
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
})

test('line wrapping can be changed for one note on mobile', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-wrap-mobile.png' })
  await page.getByRole('button', { name: 'Alternar quebra nesta nota' }).tap()
  await expect(page.locator('.markdown')).toHaveAttribute('data-no-wrap', 'true')
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/)
  await page.reload()
  await expect(page.locator('.markdown')).toHaveAttribute('data-no-wrap', 'true')
})

test('columns stay readable and editable on mobile', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const view = EditorView.findFromDOM(document.querySelector('.visual-editor > .cm-editor'))
    const text =
      '# Compras\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\n**Frutas**\n\n<!-- sloth:column -->\n\nPão e café\n\n<!-- /sloth:columns -->'
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await expect(first).toContainText('**Frutas**')
  await expect(second).toContainText('Pão e café')
  const addButton = await page.getByRole('button', { name: 'Adicionar coluna' }).boundingBox()
  expect(addButton.width).toBeGreaterThanOrEqual(44)
  expect(addButton.height).toBeGreaterThanOrEqual(44)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-columns-mobile-edit.png' })
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  const columns = page.locator('.markdown-columns .markdown-column')
  await expect(columns).toHaveCount(2)
  await expect(columns.first().locator('strong')).toHaveText('Frutas')
  await expect(columns.last()).toContainText('Pão e café')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-columns-mobile.png' })
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
  await openSearch(page)
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

async function setTheme(page, name) {
  await page.getByRole('button', { name: 'Mais opções', exact: true }).tap()
  await page.getByRole('button', { name, exact: true }).tap()
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
}

test('theme control in the main menu persists and system follows device changes', async ({
  page,
}) => {
  await setTheme(page, 'Escuro')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await setTheme(page, 'Sistema')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('recent searches are available after opening a result and returning', async ({ page }) => {
  await openSearch(page)
  await page.getByRole('searchbox').fill('compras')
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await openSearch(page)
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
  test.slow() // varre vários layouts e temas; passa sozinho, mas estoura 30 s com a suíte em paralelo
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme === 'light' ? 'Claro' : 'Escuro')
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
    const changelog = page.locator('.changelog-page')
    await expect(changelog).toContainText('Versão 0.4.0')
    await expect(changelog).toContainText('Colunas, blocos recolhíveis')
    await expect(changelog).not.toContainText('páginas de memória de 16 KB')
    await changelog
      .getByRole('link', { name: 'Ver detalhes →' })
      .nth((await changelog.locator('h2').allTextContents()).indexOf('Versão 0.4.0'))
      .tap()
    await expect(changelog).toContainText('páginas de memória de 16 KB')
    await expect(changelog).toContainText('Digite / e escolha Colunas')
    for (const name of ['colunas', 'bloco-recolhivel']) {
      const image = page.locator(`.changelog-page img[src="/changelog/${name}.png"]`)
      await image.scrollIntoViewIfNeeded()
      await expect
        .poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0))
        .toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath(`changelog-390-${theme}.png`) })
    await changelog.getByRole('link', { name: '← Todas as versões' }).tap()
    await expect(changelog).toContainText('Versão 0.5.1')
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

test('rename validates, preserves text and returns focus after cancel', async ({ page }) => {
  await page.locator('.mobile-note-row').first().getByRole('button').last().tap()
  await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
  const input = page.getByRole('textbox', { name: 'Nome da nota' })
  await expect(input).toBeFocused()
  await input.fill('Reunião')
  await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
  await expect(page.getByRole('alert')).toContainText('Já existe')
  await expect(input).toHaveValue('Reunião')
  await input.fill('')
  await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
  await expect(page.getByRole('alert')).toContainText('Digite um nome')
  await input.fill('Mercado')
  await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await expect(page.locator('.mobile-note-row').first().getByRole('button').last()).toBeFocused()
  await expect(page.locator('[data-note-id="shopping"]')).toContainText('Mercado')
  await page.locator('.mobile-note-row').first().getByRole('button').last().tap()
  await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
  await input.fill('Descartar')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).tap()
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await page.locator('[data-note-id="shopping"]').tap()
  await expect(page.locator('.markdown')).toContainText('Mercado')
  await expect(page.locator('.markdown')).toContainText('Frutas')
})

test('long press opens actions without opening note; movement cancels', async ({ page }) => {
  const note = page.locator('[data-note-id="shopping"]')
  await note.dispatchEvent('pointerdown', { isPrimary: true, button: 0, clientX: 50, clientY: 100 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await note.dispatchEvent('pointerup')
  await note.dispatchEvent('click')
  await expect(page.locator('.markdown')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await expect(note).toBeFocused()
  await note.dispatchEvent('pointerdown', { isPrimary: true, button: 0, clientX: 50, clientY: 100 })
  await note.dispatchEvent('pointermove', { clientX: 50, clientY: 140 })
  await page.waitForTimeout(650)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('rename fits narrow enlarged text and desktop; controls keep touch targets', async ({
  page,
}, testInfo) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    const buttons = [
      ...(await page.locator('.mobile-header button').all()),
      ...(await page.locator('.mobile-note-row').first().getByRole('button').all()),
    ]
    for (const button of buttons) {
      const box = await button.boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(48)
      expect(box.height).toBeGreaterThanOrEqual(48)
    }
    await page.locator('.mobile-note-row').first().getByRole('button').last().tap()
    await page.getByRole('button', { name: 'Renomear nota', exact: true }).tap()
    await page
      .getByRole('textbox', { name: 'Nome da nota' })
      .fill('Planejamento com ação 🦥 e detalhes')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`rename-${width}.png`) })
    await page.getByRole('button', { name: 'Cancelar', exact: true }).tap()
    await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  }
})

async function dragNote(
  page,
  { id = 'shopping', dx = -130, dy = 0, startX, cancel = false, beforeRelease } = {},
) {
  const note = page.locator(`[data-note-id="${id}"]`)
  const box = await note.boundingBox()
  const x = startX ?? box.x + box.width - 12
  const y = box.y + box.height / 2
  const touch = await page.context().newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let step = 1; step <= 8; step++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }],
    })
  }
  if (beforeRelease) await beforeRelease()
  await touch.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  })
  await touch.detach()
}

test('swipe trashes an open, pinned search result once and undo keeps context', async ({
  page,
}) => {
  await openSearch(page)
  await page.getByRole('searchbox').fill('compras')
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await page.getByRole('button', { name: 'Ações de Compras', exact: true }).tap()
  await page.getByRole('button', { name: 'Fixar nota', exact: true }).tap()
  await dragNote(page)
  await expect(page.locator('[data-note-id="shopping"]')).toHaveCount(0)
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.markdown')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)).trash.filter(
            (entry) => entry.note.id === 'shopping',
          ).length,
        STORAGE_KEY,
      ),
    )
    .toBe(1)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).tap()
  await expect(page.locator('[data-note-id="shopping"]')).toBeVisible()
  await expect(page.locator('[data-note-id="shopping"] svg')).toHaveAttribute(
    'aria-label',
    'Fixada',
  )
  await expect(page.getByRole('searchbox')).toHaveValue('compras')
  await page.locator('[data-note-id="shopping"]').tap()
  await expect(page.locator('.markdown')).toContainText('Frutas')
})

test('short, vertical, reverse, edge and cancelled drags do not trash or open a note', async ({
  page,
}) => {
  for (const gesture of [
    { dx: -45 },
    { dx: -100, dy: -100 },
    { dx: 100, startX: 80 },
    { dx: -100, startX: 20 },
    { dx: -100, startX: 400 },
    { cancel: true },
  ]) {
    await dragNote(page, gesture)
    await expect(page.locator('[data-note-id="shopping"]')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.markdown')).toHaveCount(0)
  }
})

test('swiping a scrolled list preserves its scroll and supports undo', async ({ page }) => {
  await page.locator('[data-note-id="note-30"]').scrollIntoViewIfNeeded()
  const before = await page.locator('.mobile-content').evaluate((el) => el.scrollTop)
  await dragNote(page, { id: 'note-30' })
  await expect(page.locator('[data-note-id="note-30"]')).toHaveCount(0)
  expect(await page.locator('.mobile-content').evaluate((el) => el.scrollTop)).toBe(before)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).tap()
  await expect(page.locator('[data-note-id="note-30"]')).toBeVisible()
  expect(await page.locator('.mobile-content').evaluate((el) => el.scrollTop)).toBe(before)
})

test('gesture cancels after changing to vertical movement or scrolling; duplicate release is harmless', async ({
  page,
}) => {
  const note = page.locator('[data-note-id="shopping"]')
  const point = { pointerId: 17, isPrimary: true, button: 0, clientX: 240, clientY: 240 }
  for (const reason of ['vertical', 'scroll']) {
    await note.dispatchEvent('pointerdown', point)
    await note.dispatchEvent('pointermove', { ...point, clientX: 210 })
    if (reason === 'vertical')
      await note.dispatchEvent('pointermove', { ...point, clientX: 110, clientY: 380 })
    else await page.locator('.mobile-content').dispatchEvent('scroll')
    await note.dispatchEvent('pointerup', { ...point, clientX: 110 })
    await expect(note).toBeVisible()
  }
  const row = note.locator('xpath=ancestor::*[contains(@class,"mobile-swipe-row")]')
  await note.dispatchEvent('pointerdown', point)
  await note.dispatchEvent('pointermove', { ...point, clientX: 110 })
  await row.evaluate((el, point) => {
    el.dispatchEvent(new PointerEvent('pointerup', { ...point, clientX: 110, bubbles: true }))
    el.dispatchEvent(new PointerEvent('pointerup', { ...point, clientX: 110, bubbles: true }))
  }, point)
  await expect(note).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)).trash.filter(
            (entry) => entry.note.id === 'shopping',
          ).length,
        STORAGE_KEY,
      ),
    )
    .toBe(1)
})

test('swipe feedback fits mobile and desktop with long titles', async ({ page }, testInfo) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await dragNote(page, {
      id: 'long',
      cancel: true,
      beforeRelease: async () => {
        await expect(page.locator('[data-swipe-ready]')).toHaveCount(1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({ path: testInfo.outputPath(`swipe-${width}.png`) })
      },
    })
    await expect(page.locator('[data-note-id="long"]')).toBeVisible()
  }
})

async function openShareSheet(page) {
  await page.locator('[data-note-id="shopping"]').dispatchEvent('pointerdown', {
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 100,
  })
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('share sends the note text once and ignores cancellation', async ({ page }) => {
  await page.evaluate(() => {
    window.sent = []
    navigator.share = (data) => {
      window.sent.push(data)
      return new Promise((resolve, reject) =>
        setTimeout(
          () => (window.sent.length > 1 ? resolve() : reject(new DOMException('', 'AbortError'))),
          200,
        ),
      )
    }
  })
  await openShareSheet(page)
  const share = page.getByRole('button', { name: 'Compartilhar texto', exact: true })
  await share.dblclick()
  await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(1)
  expect(await page.evaluate(() => window.sent[0])).toEqual({
    title: 'Compras',
    text: '# Compras\n\nFrutas para o café da manhã\n\n- [ ] Comprar maçãs',
  })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('share failure keeps the sheet and shows a message', async ({ page }) => {
  await page.evaluate(() => {
    navigator.share = () => Promise.reject(new Error('falha'))
  })
  await openShareSheet(page)
  await page.getByRole('button', { name: 'Compartilhar texto', exact: true }).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('Não foi possível compartilhar')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('without system sharing the sheet offers an explicit copy', async ({ page }) => {
  await page.evaluate(() => {
    navigator.share = undefined
    window.copied = []
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text) => window.copied.push(text) },
      configurable: true,
    })
  })
  await openShareSheet(page)
  await expect(page.getByRole('button', { name: 'Compartilhar texto' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Copiar texto da nota', exact: true }).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('Copiado')
  expect(await page.evaluate(() => window.copied)).toEqual([
    '# Compras\n\nFrutas para o café da manhã\n\n- [ ] Comprar maçãs',
  ])
})

test('open note header offers the same actions as the list', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Ações de Compras', exact: true }).tap()
  await expect(
    page
      .getByRole('button', { name: 'Compartilhar texto' })
      .or(page.getByRole('button', { name: 'Copiar texto da nota' })),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'Ações de Compras', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Ações de Compras', exact: true }).tap()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).tap()
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
  await expect(page.locator('[data-note-id="shopping"]')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toContainText('lixeira')
})

test('find in note steps through matches without opening the editor', async ({ page }) => {
  await page.locator('[data-note-id="meeting"]').tap()
  await page.getByRole('button', { name: 'Ações de Reunião', exact: true }).tap()
  await page.getByRole('button', { name: 'Buscar na nota', exact: true }).tap()
  const box = page.getByRole('searchbox', { name: 'Buscar na nota' })
  await expect(box).toBeFocused()
  await box.fill('o')
  await expect(page.locator('.mobile-find output')).toHaveText(/^1\/\d+$/)
  const first = await page.evaluate(() => window.getSelection().toString())
  expect(first.toLowerCase()).toBe('o')
  await page.getByRole('button', { name: 'Próximo resultado' }).tap()
  await expect(page.locator('.mobile-find output')).toHaveText(/^2\/\d+$/)
  await box.fill('zzzz')
  await expect(page.locator('.mobile-find output')).toHaveText('Nenhum resultado')
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await expect(page.locator('.mobile-find')).toHaveCount(0)
})

test('system bar icons follow the app theme through the native bridge', async ({ page }) => {
  await page.evaluate(() => {
    window.bars = []
    window.SlothSystem = { setDarkBars: (dark) => window.bars.push(dark) }
  })
  await setTheme(page, 'Escuro')
  await expect.poll(() => page.evaluate(() => window.bars.at(-1))).toBe(true)
  await setTheme(page, 'Claro')
  await expect.poll(() => page.evaluate(() => window.bars.at(-1))).toBe(false)
})

test('reading view folds and unfolds sections', async ({ page }) => {
  await page.evaluate((key) => {
    const doc = JSON.parse(localStorage.getItem(key))
    doc.notes.unshift({
      id: 'sections',
      name: 'Seções.md',
      body: '# Seções\n\n## Primeira\n\nTexto da primeira.\n\n## Segunda\n\nTexto da segunda.',
      revision: 0,
    })
    localStorage.setItem(key, JSON.stringify(doc))
  }, STORAGE_KEY)
  await page.reload()
  await page.locator('[data-note-id="sections"]').tap()
  await expect(page.getByText('Texto da primeira.')).toBeVisible()
  await page
    .locator('.mobile-content')
    .getByRole('button', { name: /Recolher/ })
    .first()
    .tap()
  await expect(page.getByText('Texto da primeira.')).toBeHidden()
  await expect(page.getByText('Texto da segunda.')).toBeVisible()
  await page
    .locator('.mobile-content')
    .getByRole('button', { name: /Expandir/ })
    .first()
    .tap()
  await expect(page.getByText('Texto da primeira.')).toBeVisible()
})

test('wide table scrolls inside its box and keeps the first column visible', async ({ page }) => {
  await page.evaluate((key) => {
    const cols = Array.from({ length: 12 }, (_, i) => `Coluna ${i + 1} com título longo`)
    const row = (cells) => `| ${cells.join(' | ')} |`
    const lines = ['# Larga', '', row(cols), row(cols.map(() => '---'))]
    lines.push(row(cols.map((_, i) => `valor-${i}-aaaaaaaaaaaa`)))
    const doc = JSON.parse(localStorage.getItem(key))
    doc.notes.unshift({ id: 'wide', name: 'Larga.md', body: lines.join('\n'), revision: 0 })
    localStorage.setItem(key, JSON.stringify(doc))
  }, STORAGE_KEY)
  await page.reload()
  await page.locator('[data-note-id="wide"]').tap()
  const table = page.getByRole('table').first()
  await expect(table).toHaveAttribute('tabindex', '0')
  await expect(table).toHaveAttribute('aria-label', /Tabela com \d+ linhas/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const before = await table.locator('th').first().boundingBox()
  await table.evaluate((el) => (el.scrollLeft = 400))
  const after = await table.locator('th').first().boundingBox()
  const box = await table.boundingBox()
  expect(await table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(after.x).toBeGreaterThanOrEqual(box.x - 1)
})

test('opening a task highlights its line in the note', async ({ page }) => {
  await page.evaluate((key) => {
    const doc = JSON.parse(localStorage.getItem(key))
    const filler = Array.from({ length: 40 }, (_, i) => `Linha ${i}\n`).join('\n')
    doc.notes.unshift({
      id: 'tasks',
      name: 'Plano.md',
      body: `# Plano\n\n- [ ] Primeira tarefa\n\n${filler}\n- [ ] Tarefa distante`,
      revision: 0,
    })
    localStorage.setItem(key, JSON.stringify(doc))
  }, STORAGE_KEY)
  await page.reload()
  await page.getByRole('button', { name: 'Tarefas' }).tap()
  await page.getByRole('button', { name: /Abrir tarefa na nota: Tarefa distante/ }).tap()
  const target = page.locator('.mobile-task-highlight')
  await expect(target).toContainText('Tarefa distante')
  await expect(target).toBeInViewport()
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await expect(target).toHaveCount(0, { timeout: 5000 })
})

test('completing a task offers undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Tarefas' }).tap()
  const box = page.getByRole('checkbox', { name: /Comprar maçãs/ })
  await box.tap()
  await expect(box).toHaveCount(0)
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Desfazer' }).tap()
  await expect(box).toBeVisible()
  await expect(box).not.toBeChecked()
  await page.getByRole('button', { name: 'Notas' }).tap()
  await page.locator('[data-note-id="shopping"]').tap()
  await expect(page.locator('.markdown')).toContainText('Comprar maçãs')
})

test('sheet headings show no expandable marker and keep long note names readable', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: 'Sloth Note' })).toBeVisible()
  await expect(sheet.locator('summary')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Fechar' }).tap()
  await openSearch(page)
  await page.getByRole('searchbox').fill('Planejamento')
  await page.locator('[data-note-id="long"]').dispatchEvent('pointerdown', {
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 100,
  })
  const title = sheet.locator('.mobile-sheet-title')
  await expect(title).toContainText('Planejamento')
  await expect(sheet.locator('summary')).toHaveCount(0)
  await expect(title).toHaveCSS('overflow-y', 'auto')
})

test('dragging the sheet heading down closes it; a short drag does not', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').dispatchEvent('pointerdown', {
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 100,
  })
  const heading = page.locator('.mobile-sheet-heading')
  await expect(heading).toBeVisible()
  const box = await heading.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const drag = async (distance) => {
    await heading.dispatchEvent('pointerdown', { pointerId: 7, clientX: x, clientY: y })
    await heading.dispatchEvent('pointermove', { pointerId: 7, clientX: x, clientY: y + distance })
    await heading.dispatchEvent('pointerup', { pointerId: 7, clientX: x, clientY: y + distance })
  }
  await drag(30)
  await expect(page.getByRole('dialog')).toBeVisible()
  await drag(150)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('identical and nested tasks open at their own line', async ({ page }) => {
  await page.evaluate((key) => {
    const doc = JSON.parse(localStorage.getItem(key))
    const filler = Array.from({ length: 30 }, (_, i) => `Linha ${i}\n`).join('\n')
    doc.notes.unshift({
      id: 'dups',
      name: 'Repetidas.md',
      body: `# Repetidas\n\n- [ ] Igual\n\n${filler}\n- [ ] Igual\n  - [ ] Filho aninhado`,
      revision: 0,
    })
    localStorage.setItem(key, JSON.stringify(doc))
  }, STORAGE_KEY)
  await page.reload()
  await page.getByRole('button', { name: 'Tarefas' }).tap()
  const same = page.getByRole('button', { name: /Abrir tarefa na nota: Igual/ })
  await expect(same).toHaveCount(2)
  await same.nth(1).tap()
  const lines = await page.evaluate(() => {
    const target = document.querySelector('.mobile-task-highlight')
    return [target?.dataset.sourceLine, target?.textContent]
  })
  expect(Number(lines[0])).toBeGreaterThan(30)
  expect(lines[1]).toContain('Igual')
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await page.getByRole('button', { name: /Abrir tarefa na nota: Filho aninhado/ }).tap()
  await expect(page.locator('.mobile-task-highlight')).toContainText('Filho aninhado')
  await expect(page.locator('.cm-content')).toHaveCount(0)
})

test('launcher shortcut creates exactly one note and opens it for editing', async ({ page }) => {
  await page.evaluate(() => {
    let pending = 'new-note'
    window.SlothSystem = {
      takeAction: () => {
        const action = pending
        pending = ''
        return action
      },
    }
  })
  const before = await page.locator('.mobile-note-open').count()
  await page.evaluate(() => window.__nativeAction?.())
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.evaluate(() => window.__nativeAction?.())
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.locator('.mobile-note-open')).toHaveCount(before + 1)
})

test('shared text becomes one note after validation', async ({ page }) => {
  await page.evaluate(() => {
    window.queue = ['   ', 'Linha um\r\nLinha dois', 'x'.repeat(1_000_001)]
    window.SlothSystem = {
      takeAction: () => '',
      takeSharedText: () => window.queue.shift() ?? '',
    }
  })
  const before = await page.locator('.mobile-note-open').count()
  await page.evaluate(() => window.__nativeAction?.())
  await expect(page.locator('.mobile-note-open')).toHaveCount(before)
  await page.evaluate(() => window.__nativeAction?.())
  await expect(page.locator('.markdown')).toContainText('Linha um')
  await expect(page.locator('.markdown')).toContainText('Linha dois')
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await page.evaluate(() => window.__nativeAction?.())
  await expect(page.locator('[data-sonner-toast]').last()).toContainText('grande demais')
  await expect(page.locator('.mobile-note-open')).toHaveCount(before + 1)
})

test('share as .md file appears only with the native bridge and sends name and text', async ({
  page,
}) => {
  await page.locator('[data-note-id="shopping"]').dispatchEvent('pointerdown', {
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 100,
  })
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compartilhar como arquivo .md' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await page.evaluate(() => {
    window.files = []
    window.SlothShare = { shareFile: (name, text) => (window.files.push({ name, text }), true) }
  })
  await page.locator('[data-note-id="shopping"]').dispatchEvent('pointerdown', {
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 100,
  })
  await page.getByRole('button', { name: 'Compartilhar como arquivo .md' }).tap()
  expect(await page.evaluate(() => window.files)).toEqual([
    {
      name: 'Compras.md',
      text: '# Compras\n\nFrutas para o café da manhã\n\n- [ ] Comprar maçãs',
    },
  ])
})

test('a new empty note shows title and block hints', async ({ page }) => {
  await page.getByRole('button', { name: 'Nova nota', exact: true }).tap()
  await expect(page.locator('.cm-empty-title')).toHaveAttribute('data-placeholder', 'Sem título')
  await expect(page.locator('.cm-empty-body')).toHaveAttribute(
    'data-placeholder',
    'Comece a escrever…',
  )
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-mobile-real.png' })
})

test('the slash menu inserts an image URL in a mobile note', async ({ page }) => {
  await page.getByRole('button', { name: 'Nova nota', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.keyboard.type('Fotos')
  await page.keyboard.press('Tab')
  await page.keyboard.type('/')
  await page.getByRole('textbox', { name: 'Buscar blocos' }).fill('imagem')
  await page.getByRole('button', { name: 'Imagem', exact: true }).tap()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-mobile-image-panel.png' })
  await page.getByRole('textbox', { name: 'URL da imagem' }).fill('https://example.com/foto.png')
  await page.getByRole('button', { name: 'Inserir URL', exact: true }).tap()
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const document = JSON.parse(localStorage.getItem(key))
        return document.notes.find((note) => note.id === document.activeId).body
      }, STORAGE_KEY),
    )
    .toContain('![Imagem](https://example.com/foto.png)')
})

test('the slash menu imports a file in a mobile note', async ({ page }) => {
  await page.getByRole('button', { name: 'Nova nota', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.keyboard.type('Fotos')
  await page.keyboard.press('Tab')
  await page.keyboard.type('/')
  await page.getByRole('textbox', { name: 'Buscar blocos' }).fill('imagem')
  await page.getByRole('button', { name: 'Imagem', exact: true }).tap()
  await page.locator('.image-insert input[type=file]').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const document = JSON.parse(localStorage.getItem(key))
        return document.notes.find((note) => note.id === document.activeId).body
      }, STORAGE_KEY),
    )
    .toContain('![foto.png](data:image/png;base64,')
})

test('sharing a note opens the Android chooser once and preserves the note on failure', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.sharedTexts = []
    window.SlothShare = {
      shareText(text, id) {
        window.sharedTexts.push(text)
        window.__slothShareResult(id, false)
      },
    }
  })
  await page.locator('[data-note-id="shopping"]').locator('..').getByRole('button').last().tap()
  await page.getByRole('button', { name: 'Compartilhar texto' }).tap()
  await expect(page.getByText('Não foi possível compartilhar. Tente novamente.')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => window.sharedTexts)).toEqual([notes[0].body])
  await page.evaluate(() => {
    window.SlothShare.shareText = (text, id) => {
      window.sharedTexts.push(text)
      window.__slothShareResult(id, true)
    }
  })
  await page.getByRole('button', { name: 'Compartilhar texto' }).tap()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => window.sharedTexts)).toEqual([notes[0].body, notes[0].body])
})

test('trash restores notes and confirms permanent deletion', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').locator('..').getByRole('button').last().tap()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).tap()
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Lixeira', exact: true }).tap()
  await expect(page.getByRole('article', { name: 'Compras' })).toBeVisible()
  await page
    .getByRole('article', { name: 'Compras' })
    .getByRole('button', { name: 'Restaurar' })
    .tap()
  await expect(page.getByText('A lixeira está vazia.')).toBeVisible()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).tap()
  await page.locator('[data-note-id="shopping"]').locator('..').getByRole('button').last().tap()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).tap()
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Lixeira', exact: true }).tap()
  await page
    .getByRole('article', { name: 'Compras' })
    .getByRole('button', { name: 'Excluir definitivamente' })
    .tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap()
  await expect(page.getByRole('article', { name: 'Compras' })).toBeVisible()
  await page
    .getByRole('article', { name: 'Compras' })
    .getByRole('button', { name: 'Excluir definitivamente' })
    .tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).tap()
  await expect(page.getByText('A lixeira está vazia.')).toBeVisible()
})

test('settings provide language, reading size, about and news', async ({ page }) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible()
  await expect(page.getByText(/Sloth Note · Versão/)).toBeVisible()
  if (process.env.CAPTURE_UI)
    await page.screenshot({ path: '/tmp/sloth-about-mobile.png', fullPage: false })
  await page.getByLabel('Idioma').selectOption('en')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await page.getByLabel('Language').selectOption('pt-BR')
  await page.getByRole('button', { name: 'Novidades' }).tap()
  await expect(page.getByRole('heading', { name: 'Novidades', exact: true }).first()).toBeVisible()
})

test('trash can be emptied after confirmation', async ({ page }) => {
  for (const id of ['shopping', 'meeting']) {
    await page.locator(`[data-note-id="${id}"]`).locator('..').getByRole('button').last().tap()
    await page.getByRole('button', { name: 'Mover para a lixeira' }).tap()
  }
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Lixeira', exact: true }).tap()
  await expect(page.locator('.trash-library-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Esvaziar', exact: true }).tap()
  await expect(page.getByText('Excluir definitivamente as 2 notas da lixeira?')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap()
  await expect(page.locator('.trash-library-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Esvaziar', exact: true }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Esvaziar', exact: true }).tap()
  await expect(page.getByText('A lixeira está vazia.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Esvaziar', exact: true })).toHaveCount(0)
})

test('news open a release with its offline image', async ({ page }) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Novidades' }).tap()
  await expect(page.locator('.changelog-page')).toContainText('Um resumo de cada versão')
  const details = page
    .locator('.changelog-page h2', { hasText: 'Versão 0.7.0' })
    .locator('xpath=following-sibling::p[2]')
  await details.getByRole('link', { name: 'Ver detalhes →' }).tap()
  const article = page.locator('.changelog-page')
  await expect(article).toContainText('Sobre nas Configurações')
  const image = article.locator('img[src="/changelog/sobre-configuracoes-android.png"]')
  await expect(image).toBeVisible()
  expect(await image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
})

test('About fits 320 px without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await expect(page.getByText(/Sloth Note · Versão/)).toBeVisible()
  expect(
    await page
      .locator('.mobile-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
})

test('settings recreate the help page as a new note', async ({ page }) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await page.getByRole('button', { name: 'Recriar página de ajuda' }).tap()
  await expect(page.locator('.markdown')).toContainText('página de ajuda e exemplos')
  await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toBeVisible()
})

test('note actions are available while reading and deleting returns to the list', async ({
  page,
}) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await expect(page.getByRole('button', { name: 'Renomear nota' })).toBeVisible()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).tap()
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
  await expect(page.locator('[data-note-id="shopping"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Desfazer' }).tap()
  await expect(page.locator('[data-note-id="shopping"]')).toBeVisible()
})

test('code mode keeps the editor, selection and undo history across mode changes', async ({
  page,
}) => {
  await page.locator('[data-note-id="meeting"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  const editor = page.locator('.cm-content')
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' alterado')
  await page.getByRole('button', { name: 'Modo código' }).tap()
  await expect(page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })).toBeVisible()
  await expect(editor).toContainText('# Reunião')
  await page.getByRole('button', { name: '#' }).tap()
  await expect(editor).toContainText('alterado#')
  await page.getByRole('button', { name: 'Modo visual' }).tap()
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor).not.toContainText('alterado#')
  await page.getByRole('button', { name: 'Modo código' }).tap()
  await page.getByRole('button', { name: 'Pronto' }).tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })).toBeVisible()
})

test('task list locates the right repeated task and can undo completion', async ({ page }) => {
  await page.evaluate(
    ({ key }) => {
      const document = JSON.parse(localStorage.getItem(key))
      const note = document.notes.find((item) => item.id === 'shopping')
      note.body =
        '# Compras\n\n- [ ] Repetida\n\n' + 'Texto longo\n\n'.repeat(60) + '- [ ] Repetida'
      localStorage.setItem(key, JSON.stringify(document))
    },
    { key: STORAGE_KEY },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Tarefas', exact: true }).tap()
  const tasks = page.getByRole('group', { name: 'Compras.md' })
  await tasks.getByRole('checkbox', { name: 'Repetida' }).first().click()
  await page.getByRole('button', { name: 'Desfazer' }).tap()
  await expect(tasks.getByRole('checkbox', { name: 'Repetida' })).toHaveCount(2)
  await tasks.getByRole('button', { name: 'Abrir tarefa na nota: Repetida' }).last().tap()
  await expect(page.locator('.mobile-task-highlight')).toHaveCount(1)
  await expect(page.locator('.mobile-task-highlight')).toHaveAttribute('data-source-line', '125')
  await expect(page.locator('.cm-content')).toHaveCount(0)
})

test('a fresh WebView restores the note in reading mode without opening the keyboard', async ({
  page,
}) => {
  await page.locator('[data-note-id="meeting"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' salvo')
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()
  const reopened = await page.context().newPage()
  await reopened.goto('/?platform=mobile')
  await expect(reopened.locator('.markdown')).toContainText('salvo')
  await expect(reopened.locator('.cm-content')).toHaveCount(0)
  await reopened.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(
    reopened.getByRole('button', { name: 'Buscar nas notas', exact: true }),
  ).toBeVisible()
  await reopened.close()
})

test('native back closes layers before the note and exits only at the root', async ({ page }) => {
  await page.addInitScript(() => {
    window.backFinishes = 0
    window.SlothShare = {
      finishActivity: () => window.backFinishes++,
      hideKeyboard: () => {},
      requestInsets: () => {},
    }
  })
  await page.reload()
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.markdown')).toBeVisible()
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.backFinishes)).toBe(0)
  await page.evaluate(() => window.__slothMobileBack())
  await expect.poll(() => page.evaluate(() => window.backFinishes)).toBe(1)
})

test('native bridge keeps predictive back active only while a screen is open', async ({ page }) => {
  await page.addInitScript(() => {
    window.backStates = []
    window.SlothSystem = { setBackEnabled: (enabled) => window.backStates.push(enabled) }
    window.SlothShare = {
      finishActivity: () => {},
      hideKeyboard: () => {},
      requestInsets: () => {},
    }
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => window.backStates.at(-1))).toBe(false)
  await page.locator('[data-note-id="shopping"]').tap()
  await expect.poll(() => page.evaluate(() => window.backStates.at(-1))).toBe(true)
  await page.getByRole('button', { name: 'Ações de Compras', exact: true }).tap()
  await expect.poll(() => page.evaluate(() => window.backStates.at(-1))).toBe(true)
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.backStates.at(-1))).toBe(false)
})

test('back at the root warns and stays open when the last save failed', async ({ page }) => {
  await page.addInitScript(() => {
    window.backFinishes = 0
    window.SlothShare = {
      finishActivity: () => window.backFinishes++,
      hideKeyboard: () => {},
      requestInsets: () => {},
    }
  })
  await page.reload()
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('disk full')
    }
  })
  await page.keyboard.type(' falha')
  await expect(page.locator('.mobile-error')).toContainText('Não foi possível salvar')
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
  await page.evaluate(() => window.__slothMobileBack())
  await expect(page.locator('[data-sonner-toast]').last()).toContainText('continua aberto')
  expect(await page.evaluate(() => window.backFinishes)).toBe(0)
})

test('backup export sends a complete snapshot to the Android document picker', async ({ page }) => {
  await page.addInitScript(() => {
    window.savedFile = null
    window.SlothShare = {
      requestInsets() {},
      saveText(name, mime, text, id) {
        window.savedFile = { name, mime, text }
        queueMicrotask(() => window.__slothFileResult(id, 'saved'))
      },
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await page.getByRole('button', { name: 'Salvar backup' }).tap()
  await expect(page.getByText('Backup salvo.')).toBeVisible()
  const result = await page.evaluate(() => window.savedFile)
  expect(result.name).toBe('sloth-note-backup.json')
  expect(result.mime).toBe('application/json')
  const backup = JSON.parse(result.text)
  expect(backup.format).toBe('sloth-note-backup')
  expect(backup.document.notes.find((note) => note.id === 'shopping').body).toBe(notes[0].body)
})

test('backup restore requires confirmation and rejects invalid input without losing notes', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  const input = page.locator('input[type="file"][accept*="json"]')
  await input.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByText(/Não foi possível ler o backup/)).toBeVisible()
  const replacement = {
    ...newDocument(),
    notes: [
      { id: 'replacement', name: 'Nova.md', body: '# Nova\n\nConteúdo restaurado', revision: 0 },
    ],
    openIds: ['replacement'],
    activeId: 'replacement',
  }
  await input.setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'sloth-note-backup',
        version: 1,
        document: replacement,
        images: [],
      }),
    ),
  })
  await expect(page.getByRole('dialog')).toContainText('Substituir as notas atuais')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap()
  expect(
    JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).notes.some(
      (note) => note.id === 'shopping',
    ),
  ).toBe(true)
  await input.setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'sloth-note-backup',
        version: 1,
        document: replacement,
        images: [],
      }),
    ),
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Substituir' }).tap()
  await expect(page.locator('[data-note-id="replacement"]')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-note-id="replacement"]')).toBeVisible()
})

test('a failed backup restore keeps the current notes and can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (window.failBackupWrite && key === 'sloth-note:v3') throw new Error('disk full')
      return write.call(this, key, value)
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  const replacement = {
    ...newDocument(),
    notes: [{ id: 'replacement', name: 'Nova.md', body: '# Nova', revision: 0 }],
    openIds: ['replacement'],
    activeId: 'replacement',
  }
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(replacement)),
  })
  await page.evaluate(() => {
    window.failBackupWrite = true
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Substituir' }).tap()
  await expect(page.getByText(/Não foi possível restaurar o backup/)).toBeVisible()
  expect(
    JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).notes.some(
      (note) => note.id === 'shopping',
    ),
  ).toBe(true)
  await page.evaluate(() => {
    window.failBackupWrite = false
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Substituir' }).tap()
  await expect(page.locator('[data-note-id="replacement"]')).toBeVisible()
})

test('note export sends UTF-8 Markdown to the document picker and cancellation preserves the note', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.exportedNote = null
    window.SlothShare = {
      requestInsets() {},
      saveText(name, mime, text, id) {
        window.exportedNote = { name, mime, text }
        queueMicrotask(() => window.__slothFileResult(id, 'cancelled'))
      },
    }
  })
  await page.reload()
  await page.locator('[data-note-id="shopping"]').locator('..').getByRole('button').last().tap()
  await expect(
    page.getByText('O arquivo contém o texto Markdown. As imagens não são incluídas.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Exportar .md' }).tap()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => window.exportedNote)).toEqual({
    name: 'Compras.md',
    mime: 'text/markdown',
    text: notes[0].body,
  })
})

test('importing a Markdown file creates a separate note and preserves an existing namesake', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  const input = page.locator('input[type="file"][accept*="markdown"]')
  await input.setInputFiles({
    name: 'compras.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Compras\n\nPão e café'),
  })
  await expect(page.getByText('Nota importada.', { exact: false })).toBeVisible()
  await expect(page.locator('[data-note-id="shopping"]')).toBeVisible()
  const document = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
  const imported = document.notes.find(
    (note) => note.id !== 'shopping' && note.body.includes('Pão e café'),
  )
  expect(imported.name).toBe('Compras (2).md')
  expect(document.notes.find((note) => note.id === 'shopping').body).toBe(notes[0].body)
  await page.reload()
  await expect(page.locator(`[data-note-id="${imported.id}"]`)).toBeVisible()
})

test('restoring a backup keeps local images available in the restored note', async ({ page }) => {
  const pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII='
  const replacement = {
    ...newDocument(),
    notes: [{ id: 'photo', name: 'Foto.md', body: `# Foto\n\n![Imagem](${pixel})`, revision: 0 }],
    openIds: ['photo'],
    activeId: 'photo',
    assets: [{ name: 'pixel.png', src: pixel }],
  }
  await page.getByRole('button', { name: 'Mais opções' }).tap()
  await page.getByRole('button', { name: 'Configurações' }).tap()
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'sloth-note-backup',
        version: 1,
        document: replacement,
        images: [{ name: 'pixel.png', src: pixel, data: pixel }],
      }),
    ),
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Substituir' }).tap()
  await page.locator('[data-note-id="photo"]').tap()
  const image = page.getByRole('img', { name: 'Imagem', exact: true })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(1)
})

test('compact header and bottom menu stay in place across reading and editing', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  const menu = page.getByRole('button', { name: 'Mais opções', exact: true })
  const initial = await menu.boundingBox()
  await page.locator('[data-note-id="long"]').tap()
  for (const editing of [false, true]) {
    if (editing) await page.getByRole('button', { name: 'Editar', exact: true }).tap()
    const header = page.locator('.mobile-header')
    expect((await header.boundingBox()).height).toBeLessThanOrEqual(64)
    expect(await header.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    const box = await menu.boundingBox()
    expect(box.y).toBe(initial.y)
    await expect(
      page.getByRole('button', { name: editing ? 'Pronto' : 'Editar', exact: true }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`compact-${editing ? 'editing' : 'reading'}.png`),
    })
    if (!editing && process.env.CAPTURE_UI)
      await header.screenshot({ path: 'public/changelog/mobile-header-compact.png' })
  }
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await menu.tap()
  await expect(page.locator('.mobile-drawer')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Escuro', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('drawer.png') })
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'
  })
  expect((await page.locator('.mobile-header').boundingBox()).height).toBeLessThanOrEqual(64)
  expect(
    await page.locator('.mobile-header').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('compact-desktop.png') })
})

test('edit, done and system back keep the bottom menu and new note available', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.evaluate(() => window.__insets({ ime: 300, keyboard: 'open' }))
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await page.evaluate(() => window.__insets({ ime: 0, keyboard: 'closed' }))
  await page.goBack()
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nova nota', exact: true })).toBeVisible()
})

async function openSearch(page) {
  const box = page.getByRole('searchbox')
  if (!(await box.isVisible()))
    await page.getByRole('button', { name: 'Buscar nas notas', exact: true }).tap()
}
