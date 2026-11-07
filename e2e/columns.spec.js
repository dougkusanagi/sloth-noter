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
  await page.getByRole('button', { name: 'Remover colunas' }).click()
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
  await expect(second).toContainText('![foto.png]')
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toHaveText('Primeira')
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

test('a collapsible block inside a column remains intact and works in reading', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text =
    '# Nota\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\n<details>\n<summary>Detalhes</summary>\n\nConteúdo guardado\n\n</details>\n\n<!-- sloth:column -->\n\nOutra coluna\n\n<!-- /sloth:columns -->'
  await page.locator('textarea').fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toContainText(
    '<summary>Detalhes</summary>',
  )
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const details = page.locator('.cm-column-preview details')
  await expect(details.locator('summary')).toHaveText('Detalhes')
  await expect(details.getByText('Conteúdo guardado')).toBeVisible()
  await details.locator('summary').click()
  await expect(details.getByText('Conteúdo guardado')).toBeHidden()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(text)
})

test('columns inside a collapsible block remain intact after folding', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text =
    '# Nota\n\n<details>\n<summary>Detalhes</summary>\n\n<!-- sloth:columns -->\n\n<!-- sloth:column -->\n\nPrimeira\n\n<!-- sloth:column -->\n\nSegunda\n\n<!-- /sloth:columns -->\n\n</details>'
  await page.locator('textarea').fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toHaveText('Primeira')
  await page.getByRole('button', { name: 'Recolher bloco' }).click()
  await expect(page.getByRole('textbox', { name: 'Coluna 1' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Expandir bloco' }).click()
  await expect(page.getByRole('textbox', { name: 'Coluna 2' })).toHaveText('Segunda')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(text)
})
