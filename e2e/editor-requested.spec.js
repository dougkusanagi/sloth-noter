import { test, expect } from '@playwright/test'

test('new note placeholders, slash search and multi-selection', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+t')
  const editor = page.locator('.cm-content')
  await expect(editor.locator('.cm-empty-title')).toHaveAttribute('data-placeholder', 'Sem título')
  await expect(editor.locator('.cm-empty-body')).toHaveAttribute(
    'data-placeholder',
    'Comece a escrever…',
  )
  const hint = editor.locator('.cm-empty-hint')
  await expect(hint).toHaveText('A primeira linha aparece na lista · Digite / para inserir blocos')
  await expect(hint.locator('kbd')).toHaveText('/')
  // The tip already shows while the cursor is in the title.
  await expect(hint).toBeVisible()
  await expect(hint).toHaveCSS('opacity', '0.75')
  await page.keyboard.type('Teste')
  await expect(editor.locator('.cm-empty-body')).toHaveAttribute(
    'data-placeholder',
    'Comece a escrever…',
  )
  await page.keyboard.press('Tab')
  await expect(editor.locator('.cm-empty-body')).toBeVisible()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-preview-desktop.png' })
  await expect(editor.locator('.cm-empty-body')).toHaveCSS('position', 'relative')
  expect(
    await editor.locator('.cm-empty-body').evaluate((element) => {
      const hint = getComputedStyle(element, '::after')
      return { top: hint.top, left: hint.left }
    }),
  ).toEqual({ top: '0px', left: '0px' })
  await expect(page.locator('.insert-trigger')).toHaveCount(0)
  await page.keyboard.type('/')
  await expect(page.getByPlaceholder('Buscar blocos')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Título 1', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Título 2', exact: true })).toBeVisible()
  await expect(editor.locator('.cm-empty-body')).toBeVisible()
  await expect(page.locator('.insert-trigger')).toBeHidden()
  await page.keyboard.type('tabela')
  await expect(page.getByRole('button', { name: /Tabela/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await editor.focus()
  await page.keyboard.type('palavra palavra')
  await expect(page.locator('.note-item[aria-current="page"]')).toContainText('palavra palavra')
  await page.keyboard.press('Control+ArrowLeft')
  await page.keyboard.press('Control+d')
  await page.keyboard.press('Control+d')
  await expect(page.locator('.cm-selectionBackground')).toHaveCount(2)
  await page.keyboard.type('troca')
  await expect(editor).toContainText('troca troca')
})

test('code block wrapping can be toggled in the visual editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(`# Nota\n\n\`\`\`js\n${'linha longa '.repeat(150)}\n\`\`\``)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const toggle = page.getByRole('button', { name: 'Quebrar linhas' })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(3)
  const scrollbar = page.getByRole('region', { name: 'Rolar código horizontalmente' })
  await expect(scrollbar).toBeVisible()
  await scrollbar.evaluate((element) => {
    element.scrollLeft = 200
  })
  await expect
    .poll(() =>
      page
        .locator('.cm-code-no-wrap')
        .nth(1)
        .evaluate((element) => element.scrollLeft),
    )
    .toBeGreaterThan(0)
  await toggle.click()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(0)
})

test('global line wrapping is saved and code blocks can override it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(`# Nota\n\n\`\`\`js\n${'linha longa '.repeat(150)}\n\`\`\``)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Configurações', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Editor', exact: true }).click()
  await dialog.getByRole('switch', { name: 'Quebrar linhas' }).uncheck()
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-wrap-desktop.png' })
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(3)
  await page.getByRole('button', { name: 'Quebrar linhas' }).click()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(0)
  const row = page.locator('.cm-code-wrap').nth(1)
  expect(await row.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    100,
  )
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Alternar quebra nesta nota', exact: true }).click()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toHaveClass(/cm-lineWrapping/)
  await page.reload()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(3)
  await expect(page.locator('.cm-content')).toHaveClass(/cm-lineWrapping/)
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Alternar quebra em todas as notas e códigos' }).click()
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Alternar quebra em todas as notas e códigos' }).click()
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/)
  await expect(page.locator('.cm-code-no-wrap')).toHaveCount(3)
})

test('code blocks can be collapsed and expanded without changing their contents', async ({
  page,
}) => {
  await page.goto('/')
  const source = '# Nota\n\n```js\nprimeira linha\nsegunda linha\n```'
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.getByRole('button', { name: 'Recolher código' }).click()
  await expect(page.locator('.cm-content')).toContainText('primeira linha…')
  await expect(page.locator('.cm-content')).not.toContainText('segunda linha')
  await page.getByRole('button', { name: 'Expandir código' }).click()
  await expect(page.locator('.cm-content')).toContainText('segunda linha')
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await page.getByRole('button', { name: 'Recolher código' }).click()
  await expect(page.locator('.cm-content')).not.toContainText('segunda linha')
  await page.getByRole('button', { name: 'Expandir código' }).click()
  await expect(page.locator('.cm-content')).toContainText('segunda linha')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(source)
})

test('a collapsible block can be inserted, edited and folded without losing its contents', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.keyboard.press('Control+t')
  await expect(page.locator('.cm-empty-title')).toBeVisible()
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.keyboard.type('Projeto')
  await page.keyboard.press('Tab')
  await page.keyboard.type('/')
  await page.getByRole('textbox', { name: 'Buscar blocos' }).fill('recolhível')
  await page.getByRole('button', { name: 'Bloco recolhível', exact: true }).click()
  await page.keyboard.type('Detalhes')
  await expect(page.getByRole('button', { name: 'Recolher bloco' })).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const source =
    '# Projeto\n\n<details>\n<summary>Detalhes</summary>\n\nInformações importantes\n\n</details>'
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const content = page.locator('.cm-content')
  await expect(content).toContainText('Informações importantes')
  await page.getByRole('button', { name: 'Recolher bloco' }).click()
  await expect(content).not.toContainText('Informações importantes')
  await page.getByRole('button', { name: 'Expandir bloco' }).click()
  await expect(content).toContainText('Informações importantes')
  if (process.env.CAPTURE_UI) {
    const area = await page.locator('.editor-shell').boundingBox()
    await page.screenshot({
      path: '/tmp/sloth-accordion-desktop.png',
      clip: { x: area.x + 70, y: area.y, width: Math.min(area.width - 70, 340), height: 220 },
    })
  }
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(source)
})

test('typing a slash in an empty code line inserts it as code', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Nota\n\n```\n\n```')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('/')
  await expect(page.getByPlaceholder('Buscar blocos')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# Nota\n\n```\n/\n```')
})

test('selected text moves by dragging and can be undone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const source = '# Nota\n\nprimeiro\n\nsegundo'
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.locator('.cm-line', { hasText: 'primeiro' })
  const second = page.locator('.cm-line', { hasText: 'segundo' })
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
    const from = view.state.doc.toString().indexOf('primeiro')
    view.dispatch({ selection: { anchor: from, head: from + 'primeiro'.length } })
    view.focus()
  })
  const from = await first.boundingBox()
  const to = await second.boundingBox()
  await page.mouse.move(from.x + 20, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 50, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
        const doc = EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc
        return { first: doc.line(3).text, second: doc.line(5).text }
      }),
    )
    .toMatchObject({ first: '', second: expect.stringContaining('primeiro') })
  await page.keyboard.press('Control+z')
  await expect(first).toContainText('primeiro')
  await expect(second).toHaveText('segundo')
})

test('switching to an open note reveals it in the sidebar', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { STORAGE_KEY } = await import('/src/storage.js')
    const doc = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const notes = Array.from({ length: 35 }, (_, i) => ({
      id: `scroll-${i}`,
      name: `Nota ${i}.md`,
      body: `# Nota ${i}\n\nTexto`,
      revision: 1,
      modifiedAt: 1000 - i,
    }))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...doc, notes, openIds: ['scroll-0', 'scroll-34'], activeId: 'scroll-0' }),
    )
  })
  await page.reload()
  await page.locator('.tab').filter({ hasText: 'Nota 34' }).click()
  const visible = await page.locator('.note-item[aria-current="page"]').evaluate((element) => {
    const item = element.getBoundingClientRect()
    const box = element.closest('.sidebar-items').getBoundingClientRect()
    return item.top >= box.top && item.bottom <= box.bottom
  })
  expect(visible).toBe(true)

  const search = page.getByRole('textbox', { name: 'Buscar em todas as notas…' })
  await search.fill('Nota 0')
  await expect(page.locator('.note-item[aria-current="page"]')).toHaveCount(0)
  await search.clear()
  await expect
    .poll(() =>
      page.locator('.note-item[aria-current="page"]').evaluate((element) => {
        const item = element.getBoundingClientRect()
        const box = element.closest('.sidebar-items').getBoundingClientRect()
        return item.top >= box.top && item.bottom <= box.bottom
      }),
    )
    .toBe(true)
})

test('renaming the active note reveals its new position in the sidebar', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { STORAGE_KEY } = await import('/src/storage.js')
    const doc = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const notes = Array.from({ length: 35 }, (_, i) => ({
      id: `rename-scroll-${i}`,
      name: `Nota ${String(i).padStart(2, '0')}.md`,
      body: `# Nota ${String(i).padStart(2, '0')}\n\nTexto`,
      revision: 1,
      modifiedAt: 1000 - i,
    }))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...doc,
        notes,
        openIds: ['rename-scroll-0'],
        activeId: 'rename-scroll-0',
        preferences: { ...doc.preferences, noteSort: 'alphabetical' },
      }),
    )
  })
  await page.reload()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill('# Zzz\n\nTexto')
  const active = page.locator('.note-item[aria-current="page"]')
  await expect(active).toHaveAttribute('aria-label', 'Zzz')
  await expect
    .poll(() =>
      active.evaluate((element) => {
        const item = element.getBoundingClientRect()
        const box = element.closest('.sidebar-items').getBoundingClientRect()
        return item.top >= box.top && item.bottom <= box.bottom
      }),
    )
    .toBe(true)
})

test('a blank body shows a single placeholder on the cursor line', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+t')
  const editor = page.locator('.cm-content')
  await page.keyboard.type('abc')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  const body = editor.locator('.cm-empty-body')
  await expect(body).toHaveCount(1)
  await expect(editor.locator('.cm-line').nth(2)).toHaveClass(/cm-empty-body/)
  await expect(page.locator('.insert-trigger')).toHaveCount(0)
  await expect(editor.locator('.cm-empty-hint')).toHaveCount(1)
  await page.keyboard.press('ArrowUp')
  await expect(body).toHaveCount(1)
  await expect(editor.locator('.cm-line').nth(1)).toHaveClass(/cm-empty-body/)
})
