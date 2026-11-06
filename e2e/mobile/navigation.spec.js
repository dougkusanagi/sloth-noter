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

test('a collapsible Markdown block opens and closes in mobile reading', async ({ page }) => {
  await page.locator('[data-note-id="shopping"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert:
          '# Compras\n\n<details>\n<summary>Detalhes</summary>\n\nTexto importante\n\n</details>',
      },
    })
  })
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  const details = page.locator('.markdown details').filter({ hasText: 'Detalhes' })
  await expect(details.locator('summary')).toHaveText('Detalhes')
  await expect(details.getByText('Texto importante')).toBeVisible()
  await details.locator('summary').tap()
  await expect(details.getByText('Texto importante')).toBeHidden()
  await details.locator('summary').tap()
  await expect(details.getByText('Texto importante')).toBeVisible()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-accordion-mobile.png' })
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

test('copies a note from its actions in the browser preview', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await page.getByRole('button', { name: 'Copiar texto' }).tap()
  await expect(page.getByText('Copiado', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(notes[0].body)
})

test('copy failure keeps the actions available to retry', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new Error('clipboard unavailable')),
    })
  })
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await page.getByRole('button', { name: 'Copiar texto' }).tap()
  await expect(
    page.getByText('Não foi possível copiar. Selecione o texto e tente de novo.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copiar texto' })).toBeEnabled()
})

test('copy ignores repeated activation while it is pending', async ({ page }) => {
  await page.evaluate(() => {
    window.copyCalls = 0
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => {
        window.copyCalls += 1
        return new Promise((resolve) => {
          window.finishCopy = resolve
        })
      },
    })
  })
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  const copy = page.getByRole('button', { name: 'Copiar texto' })
  await copy.tap()
  await expect(copy).toBeDisabled()
  await page.evaluate(() => document.querySelector('.mobile-sheet button:disabled').click())
  expect(await page.evaluate(() => window.copyCalls)).toBe(1)
  await page.evaluate(() => window.finishCopy())
  await expect(page.getByText('Copiado', { exact: true })).toBeVisible()
})

async function mockNativeShare(page, behavior) {
  await page.evaluate((behavior) => {
    window.shareCalls = []
    window.isTauri = true
    window.__TAURI_INTERNALS__ = {
      invoke: (command, args) => {
        window.shareCalls.push({ command, args })
        return behavior === 'fail' ? Promise.reject(new Error('sem app')) : Promise.resolve(null)
      },
    }
  }, behavior)
}

test('shares the note text through the native adapter and closes the sheet', async ({ page }) => {
  await mockNativeShare(page, 'ok')
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await page.getByRole('button', { name: 'Compartilhar texto' }).tap()
  await expect(page.getByRole('button', { name: 'Compartilhar texto' })).toHaveCount(0)
  expect(await page.evaluate(() => window.shareCalls)).toEqual([
    { command: 'share_text', args: { text: notes[0].body, title: 'Compras' } },
  ])
})

test('native share failure keeps the sheet open to retry', async ({ page }) => {
  await mockNativeShare(page, 'fail')
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  await page.getByRole('button', { name: 'Compartilhar texto' }).tap()
  await expect(
    page.getByText('Não foi possível abrir o compartilhamento. Tente de novo.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compartilhar texto' })).toBeEnabled()
})

test('native share ignores repeated activation while it is pending', async ({ page }) => {
  await page.evaluate(() => {
    window.shareCalls = 0
    window.isTauri = true
    window.__TAURI_INTERNALS__ = {
      invoke: () => {
        window.shareCalls += 1
        return new Promise((resolve) => {
          window.finishShare = resolve
        })
      },
    }
  })
  await page.getByRole('button', { name: 'Ações de Compras' }).tap()
  const share = page.getByRole('button', { name: 'Compartilhar texto' })
  await share.tap()
  await expect(share).toBeDisabled()
  await page.evaluate(() => document.querySelector('.mobile-sheet button:disabled').click())
  expect(await page.evaluate(() => window.shareCalls)).toBe(1)
  await page.evaluate(() => window.finishShare())
  await expect(share).toHaveCount(0)
})

test('reopens the last note after the process loses its session storage', async ({ page }) => {
  await page.locator('[data-note-id="meeting"]').tap()
  await expect(page.locator('.markdown')).toContainText('orçamento')
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/?platform=mobile')
  await expect(page.locator('.markdown')).toContainText('orçamento')
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(page.getByRole('searchbox')).toBeVisible()
})

test('a saved route to a deleted note opens the list', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.setItem(
      'sloth.mobile.navigation.v1',
      JSON.stringify({ screens: [{ name: 'notes' }, { name: 'note', id: 'inexistente' }] }),
    )
  })
  await page.goto('/?platform=mobile')
  await expect(page.getByRole('searchbox')).toBeVisible()
})
