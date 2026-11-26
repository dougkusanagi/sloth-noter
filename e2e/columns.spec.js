import { test, expect } from '@playwright/test'
import { STORAGE_KEY } from '../src/storage.js'

test('columns can be edited without losing text or the cursor', async ({ page }) => {
  await page.goto('/')
  if (process.env.CAPTURE_UI) {
    await expect(page.locator('.cm-content').first()).toBeVisible()
    await page.evaluate((key) => {
      const document = JSON.parse(localStorage.getItem(key))
      document.preferences.fontSize = 24
      localStorage.setItem(key, JSON.stringify(document))
    }, STORAGE_KEY)
    await page.reload()
  }
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const source =
    '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->'
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await expect(first).toContainText('Primeira')
  await expect(second).toContainText('Segunda')
  const firstBox = await first.boundingBox()
  await first.click({ position: { x: 20, y: firstBox.height - 4 } })
  await page.keyboard.press('End')
  await page.keyboard.type(' editada')
  await expect(first).toContainText('Primeira editada')
  await expect(first).toBeFocused()
  await second.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' alterada')
  await expect(second).toContainText('Segunda alterada')
  await page.keyboard.press('Control+z')
  await expect(second).toHaveText('Segunda')
  await expect(second).toBeFocused()
  await page.keyboard.press('Control+Shift+z')
  await expect(second).toContainText('Segunda alterada')
  if (process.env.CAPTURE_UI)
    await page.locator('.cm-columns').screenshot({ path: '/tmp/sloth-columns-desktop.png' })
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    source.replace('Primeira', 'Primeira editada').replace('Segunda', 'Segunda alterada'),
  )
})

test('the slash menu creates two editable columns', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content').first()).toBeVisible()
  await page.keyboard.press('Control+t')
  await expect(page.locator('.cm-empty-title')).toBeVisible()
  await expect(page.locator('.cm-content').first()).toBeFocused()
  await page.keyboard.type('Projeto')
  await page.keyboard.press('Tab')
  await page.keyboard.type('/')
  await page.getByRole('textbox', { name: 'Buscar blocos' }).fill('colunas')
  await page.getByRole('button', { name: 'Colunas', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toBeFocused()
  await page.keyboard.type('Conteúdo')
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toContainText('Conteúdo')
  await page.getByRole('button', { name: 'Adicionar coluna' }).click()
  await expect(page.getByRole('textbox', { name: 'Coluna 3' })).toBeFocused()
  await page.keyboard.type('Terceira')
  await expect(page.getByRole('textbox', { name: 'Coluna 3' })).toContainText('Terceira')
  await page.getByRole('button', { name: 'Desfazer colunas' }).click()
  await expect(page.locator('.editor-pane-primary')).toContainText('Conteúdo')
  await expect(page.locator('.editor-pane-primary')).toContainText('Terceira')
  await expect(page.locator('.cm-columns')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('textbox', { name: 'Coluna 3' })).toContainText('Terceira')
})

test('dragging selected text between columns moves it in one undoable step', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const source =
    '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->'
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await expect(first).toContainText('Primeira')
  // The column buttons show while the pointer is over the columns.
  await page.locator('.cm-columns').hover()
  await page.getByRole('button', { name: 'Adicionar coluna' }).click()
  const third = page.getByRole('textbox', { name: 'Coluna 3' })
  await expect(third).toBeFocused()
  const points = await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const firstView = EditorView.findFromDOM(document.querySelector('[aria-label="Coluna 1"]'))
    const secondView = EditorView.findFromDOM(document.querySelector('[aria-label="Coluna 3"]'))
    firstView.dispatch({ selection: { anchor: 0, head: firstView.state.doc.length } })
    firstView.focus()
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const from = firstView.coordsAtPos(2)
    const to = secondView.coordsAtPos(secondView.state.doc.length)
    return {
      from: { x: from.left, y: (from.top + from.bottom) / 2 },
      to: { x: to.left, y: (to.top + to.bottom) / 2 },
    }
  })
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Primeira')
  await page.mouse.move(points.from.x, points.from.y)
  await page.mouse.down()
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 })
  await page.mouse.up()
  await expect(first).not.toContainText('Primeira')
  await expect(third).toContainText('Primeira')
  await expect(second).toHaveText('Segunda')
  await expect(third).toBeFocused()
  await page.keyboard.press('Control+z')
  await expect(first).toContainText('Primeira')
  await expect(third).not.toContainText('Primeira')
})

test('selected text can be moved from the note into a column', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\nMover daqui\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await expect(second).toContainText('Segunda')
  const points = await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const parent = EditorView.findFromDOM(document.querySelector('.visual-editor > .cm-editor'))
    const target = document.querySelector('.cm-columns').columnContext.views[1]
    const start = parent.state.doc.toString().indexOf('Mover daqui')
    parent.dispatch({ selection: { anchor: start, head: start + 'Mover daqui'.length } })
    parent.focus()
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const from = parent.coordsAtPos(start + 3)
    const to = target.coordsAtPos(target.state.doc.length)
    return {
      from: { x: from.left, y: (from.top + from.bottom) / 2 },
      to: { x: to.left, y: (to.top + to.bottom) / 2 },
    }
  })
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('Mover daqui')
  await page.mouse.move(points.from.x, points.from.y)
  await page.mouse.down()
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 })
  await page.mouse.up()
  await expect(second).toContainText('Mover daqui')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.editor-pane-primary')).toContainText('Mover daqui')
  await expect(second).toHaveText('Segunda')
})

test('selected text can be moved within one column and restored', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira coisa\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  await expect(first).toContainText('Primeira coisa')
  const points = await page.evaluate(async () => {
    const view = document.querySelector('.cm-columns').columnContext.views[0]
    view.dispatch({ selection: { anchor: 0, head: 8 } })
    view.focus()
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const from = view.coordsAtPos(2),
      to = view.coordsAtPos(view.state.doc.length)
    return {
      from: { x: from.left, y: (from.top + from.bottom) / 2 },
      to: { x: to.left, y: (to.top + to.bottom) / 2 },
    }
  })
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Primeira')
  await page.mouse.move(points.from.x, points.from.y)
  await page.mouse.down()
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 })
  await page.mouse.up()
  await expect(first).toHaveText(' coisaPrimeira')
  await page.keyboard.press('Control+z')
  await expect(first).toHaveText('Primeira coisa')
})

test('keyboard cut and paste can move text between columns', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await first.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+x')
  await second.focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+v')
  await expect(second).toContainText('SegundaPrimeira')
  await expect(first).not.toContainText('Primeira')
})

test('pasting an image into a column keeps it in that column', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await second.focus()
  await page.keyboard.press('Control+End')
  await second.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    const data = new DataTransfer()
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
      ),
      (char) => char.charCodeAt(0),
    )
    data.items.add(new File([bytes], 'foto.png', { type: 'image/png' }))
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  // The column shows the image itself; its Markdown stays in that column.
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toHaveText('Primeira')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    /<!-- sloth:column -->\n\nSegunda[^<]*!\[foto\.png\][^<]*<!-- \/sloth:columns -->/,
  )
})

test('select all inside a column does not replace the rest of the note', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\nAntes\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->\n\nDepois',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  await first.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Nova')
  await expect(first).toHaveText('Nova')
  await expect(page.getByRole('textbox', { name: 'Coluna 2' })).toHaveText('Segunda')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/Antes[\s\S]*Nova[\s\S]*Segunda[\s\S]*Depois/)
})

test('reading renders formatting and can toggle a task in its own column', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\n**Negrito**\n\n- [ ] Revisar\n\n<!-- sloth:column -->\n\nOutra coluna\n\n<!-- /sloth:columns -->',
    )
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const first = page.locator('.cm-column-preview').first()
  await expect(first.locator('strong')).toHaveText('Negrito')
  await first.getByRole('checkbox').check({ force: true })
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/- \[x\] Revisar/)
})

test('find and replace reveal matches inside columns without changing other content', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Nota\n\nAntes\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nMaçãs\n\n<!-- sloth:column -->\n\nBananas maduras\n\n<!-- /sloth:columns -->\n\nDepois',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Coluna 2' }).focus()
  await page.keyboard.press('Control+h')
  await page.getByRole('textbox', { name: 'Texto a buscar', exact: true }).fill('Bananas')
  await expect(
    page.getByRole('textbox', { name: 'Coluna 2' }).locator('.search-match-current'),
  ).toHaveText('Bananas')
  await page.getByRole('textbox', { name: 'Substituir por…', exact: true }).fill('Peras')
  await page.getByRole('button', { name: 'Substituir', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Coluna 2' })).toContainText('Peras maduras')
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toHaveText('Maçãs')
})

const fillNote = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
const noteSource = async (page) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const value = await page.locator('textarea').inputValue()
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  return value
}
// Drags the handle of the block under `line` to the point `to`.
const dragBlock = async (page, line, to, beforeDrop) => {
  await line.hover()
  const handle = page.locator('.cm-block-handle:visible').first()
  const box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await beforeDrop?.()
  await page.mouse.up()
}
const layout = (columns) =>
  `<!-- sloth:columns -->\n\n${columns.map((text) => `<!-- sloth:column -->\n\n${text}`).join('\n\n')}\n\n<!-- /sloth:columns -->`

test('a block dragged beside another makes columns, and back out ends them', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')
  await fillNote(page, '# Nota\n\nPrimeiro\n\n## Segundo\n\nFim')
  const first = await page.locator('.cm-line', { hasText: 'Primeiro' }).boundingBox()
  const content = await page.locator('.cm-content').first().boundingBox()
  await dragBlock(page, page.locator('.cm-line', { hasText: 'Segundo' }), {
    x: content.x + content.width - 16,
    y: first.y + first.height / 2,
  })
  expect(await noteSource(page)).toBe(`# Nota\n\n${layout(['Primeiro', '## Segundo'])}\n\nFim`)
  // The column shows the heading formatted, as in the note.
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await expect(second.locator('.cm-md-h2')).toHaveText('Segundo')
  // Dragged below the note's last block, the heading leaves its column, and one column left
  // turns back into an ordinary block.
  const end = await page.locator('.cm-line', { hasText: 'Fim' }).boundingBox()
  await dragBlock(page, second.locator('.cm-line').first(), {
    x: end.x + end.width / 2,
    y: end.y + end.height + 12,
  })
  await expect(page.locator('.cm-columns')).toHaveCount(0)
  // One undo brings the columns back.
  await page.keyboard.press('Control+z')
  await expect(page.locator('.cm-columns')).toHaveCount(1)
  await page.keyboard.press('Control+Shift+z')
  expect(await noteSource(page)).toBe('# Nota\n\nPrimeiro\n\nFim\n\n## Segundo')
})

for (const side of ['esquerda', 'direita']) {
  test(`soltar na metade ${side} cria uma coluna a partir da alça de um bloco de código`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 844 })
    await page.goto('/')
    const fence = '```'
    const target = `${fence}\nprimeiro()\n${fence}`
    const moved = `${fence}\nsegundo()\n${fence}`
    const source = `# Nota\n\n${target}\n\n${moved}\n\nFim`
    await fillNote(page, source)
    const capture = side === 'direita' && process.env.CAPTURE_BLOCK_FIX
    const library = page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' })
    if (capture) {
      await page.setViewportSize({ width: 390, height: 844 })
      await library.click()
      await page.screenshot({ path: '/tmp/sloth-colunas-antes-390.png' })
      await page.setViewportSize({ width: 1280, height: 844 })
      await library.click()
    }
    const first = await page.locator('.cm-md-code', { hasText: 'primeiro()' }).boundingBox()
    await dragBlock(
      page,
      page.locator('.cm-md-code', { hasText: 'segundo()' }),
      {
        x: first.x + first.width * (side === 'esquerda' ? 0.4 : 0.6),
        y: first.y + first.height / 2,
      },
      async () => {
        if (capture)
          await page.screenshot({
            path: `/tmp/sloth-colunas-${capture}-arrasto.png`,
          })
        await expect(page.locator('.cm-section-drop.is-side')).toBeVisible()
      },
    )
    if (capture) await page.screenshot({ path: `/tmp/sloth-colunas-${capture}-1280.png` })
    const left = page.getByRole('textbox', { name: 'Coluna 1' })
    const right = page.getByRole('textbox', { name: 'Coluna 2' })
    await expect(left).toContainText(side === 'esquerda' ? 'segundo()' : 'primeiro()')
    await expect(right).toContainText(side === 'esquerda' ? 'primeiro()' : 'segundo()')
    expect((await right.boundingBox()).x).toBeGreaterThan((await left.boundingBox()).x)
    await page.setViewportSize({ width: 390, height: 844 })
    expect((await right.boundingBox()).y).toBeGreaterThan((await left.boundingBox()).y)
    if (capture) {
      await library.click()
      await page.screenshot({ path: '/tmp/sloth-colunas-depois-390.png' })
      await page.locator('.cm-content').first().focus()
    }
    await page.setViewportSize({ width: 1280, height: 844 })
    await page.keyboard.press('Control+z')
    expect(await noteSource(page)).toBe(source)
  })
}

test('the arrow keys go in and out of columns, and Backspace removes an empty one', async ({
  page,
}) => {
  await page.goto('/')
  await fillNote(page, `# Nota\n\nAntes\n\n${layout(['Esquerda', 'Direita', ''])}\n\nDepois`)
  await page.locator('.cm-line', { hasText: 'Antes' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toBeFocused()
  await page.keyboard.type(' 1')
  await page.getByRole('textbox', { name: 'Coluna 3' }).click()
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('textbox', { name: 'Coluna 3' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Coluna 2' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('Logo ')
  expect(await noteSource(page)).toBe(
    `# Nota\n\nAntes\n\n${layout(['Esquerda 1', 'Direita'])}\n\nLogo Depois`,
  )
})

test('Enter in a column starts a new paragraph and continues lists', async ({ page }) => {
  await page.goto('/')
  await fillNote(page, `# Nota\n\n${layout(['- um', 'Texto'])}`)
  const first = page.getByRole('textbox', { name: 'Coluna 1' })
  await first.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('dois')
  const second = page.getByRole('textbox', { name: 'Coluna 2' })
  await second.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Mais')
  expect(await noteSource(page)).toBe(`# Nota\n\n${layout(['- um\n- dois', 'Texto\n\nMais'])}`)
})

test('code blocks in side-by-side columns keep their copy buttons inside their own column', async ({
  page,
}) => {
  await page.goto('/')
  await fillNote(
    page,
    `# Nota\n\n${layout(['```\nbloco esquerda\n```', '```\nbloco direita\n```'])}`,
  )
  const columns = page.locator('.cm-column-editor')
  await expect(columns).toHaveCount(2)
  const leftCopy = columns.nth(0).locator('.code-copy-layer .copy-code:not(.code-editor-wrap):not(.code-editor-fold)')
  const rightCopy = columns.nth(1).locator('.code-copy-layer .copy-code:not(.code-editor-wrap):not(.code-editor-fold)')
  await expect(leftCopy).toHaveCount(1)
  await expect(rightCopy).toHaveCount(1)
  await expect(leftCopy).toBeVisible()
  await expect(rightCopy).toBeVisible()
  // Parent editor must not render duplicate copy buttons for code blocks inside columns.
  await expect(
    page.locator('.visual-editor > .cm-editor > .code-copy-layer .copy-code:not(.code-editor-wrap):not(.code-editor-fold)'),
  ).toHaveCount(0)

  const leftColBox = await columns.nth(0).boundingBox()
  const rightColBox = await columns.nth(1).boundingBox()
  const leftBtnBox = await leftCopy.boundingBox()
  const rightBtnBox = await rightCopy.boundingBox()
  expect(leftBtnBox.x).toBeGreaterThanOrEqual(leftColBox.x)
  expect(leftBtnBox.x + leftBtnBox.width).toBeLessThanOrEqual(leftColBox.x + leftColBox.width + 2)
  expect(rightBtnBox.x).toBeGreaterThanOrEqual(rightColBox.x)
  expect(rightBtnBox.x + rightBtnBox.width).toBeLessThanOrEqual(rightColBox.x + rightColBox.width + 2)
})
