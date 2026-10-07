import { expect, test } from '@playwright/test'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
  'base64',
)
async function source(page, body) {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(body)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('visual tables hide trailing delimiters without adding grid rows and remain editable', async ({
  page,
}) => {
  const body =
    '# Tabela\n\n| Recurso | Como usar |\n| --- | --- |\n| Barra de texto | Selecione **palavras** |  \n| Inserir bloco | Clique em + numa linha vazia |'
  await source(page, body)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const rows = page.locator('.cm-md-table-row:not(.cm-md-table-divider)')
  await expect(rows).toHaveCount(3)
  const layout = await rows.evaluateAll((rows) =>
    rows.map((row) => ({
      rawText: [...row.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('')
        .trim(),
      height: row.getBoundingClientRect().height,
      cellHeight: row.querySelector('.cm-md-table-cell').getBoundingClientRect().height,
    })),
  )
  for (const row of layout) {
    expect(row.rawText).toBe('')
    expect(row.height).toBeCloseTo(row.cellHeight, 1)
  }
  await rows.nth(2).locator('.cm-md-table-cell-first').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    body.replace('Clique em + numa linha vazia', '!'),
  )
})

test('closed notes remain in the searchable library and visibility persists', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Fechar aba: Welcome.md', exact: true })
    .click({ force: true })
  await expect(page.locator('.tabs')).toBeHidden()
  await page.getByRole('button', { name: 'Welcome', exact: true }).click()
  await expect(page.locator('.tab')).toContainText('Welcome.md')
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
  await page.reload()
  await expect(page.locator('.notes-sidebar')).toBeHidden()
})

test('CommonMark and GFM render with interactive round tasks', async ({ page }) => {
  await source(
    page,
    '# Markdown completo\n\n- [ ] Pendente\n- [x] Concluída\n  - Item aninhado\n\n~~Riscado~~ e **forte** e *ênfase* e `inline`\n\n---\n\n##### Cinco\n###### Seis\n\n> Citação\n\n| Nome | Valor |\n| :--- | ---: |\n| teste | 42 |\n\n[referência][site]\n\n[site]: https://example.com\n\nNota[^1]\n\n[^1]: Rodapé\n\n```js\nconst answer = 42\n```',
  )
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.markdown input[type=checkbox]')).toHaveCount(2)
  await expect(page.locator('.markdown del')).toHaveText('Riscado')
  await expect(page.locator('.markdown h5')).toHaveText('Cinco')
  await expect(page.locator('.markdown h6')).toHaveText('Seis')
  await expect(page.locator('.markdown table')).toContainText('42')
  await expect(page.locator('.markdown hr')).toBeVisible()
  await expect(page.locator('.markdown ul ul')).toContainText('Item aninhado')
  await expect(page.locator('.markdown a[href="https://example.com"]')).toHaveText('referência')
  await expect(page.locator('.markdown [data-footnotes]')).toContainText('Rodapé')
  await page.getByRole('checkbox', { name: 'Marcar como concluída' }).check()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/- \[x\] Pendente/)
})

test('live editor tasks update Markdown and imported images survive a reload', async ({ page }) => {
  await source(page, '# Imagens e tarefas\n\n- [ ] Fazer\n\nFim')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-task-checkbox')).toBeVisible()
  await page.locator('.cm-task-checkbox').check()
  await page.getByRole('button', { name: 'Imagens', exact: true }).click()
  await page
    .locator('input[type=file][accept^="image/png"]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.image-item img')).toBeVisible()
  await page.reload()
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.markdown img')).toBeVisible()
  await expect(page.locator('.markdown img')).toHaveJSProperty('naturalWidth', 1)
  await expect(page.locator('.markdown input[type=checkbox]')).toBeChecked()
})

test('external images render and unsafe links do not execute', async ({ page }) => {
  await page.route('https://example.com/photo.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  )
  await source(
    page,
    '# Externas\n\n![Foto externa](https://example.com/photo.png)\n\n[Perigo](javascript:alert%281%29)',
  )
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.getByRole('img', { name: 'Foto externa' })).toHaveJSProperty('naturalWidth', 1)
  await expect(page.locator('.markdown a')).not.toHaveAttribute('href', /^javascript:/)
})

test('long tab names are truncated, disclosed on hover, and can be closed', async ({ page }) => {
  const title =
    'Uma nota com um título muito longo para caber inteiramente na barra de abas do aplicativo'
  await source(page, `# ${title}\n\nTexto`)
  const tab = page.locator('.tab')
  await expect(tab).toHaveAttribute('title', `${title}.md`)
  expect(await tab.locator('span').evaluate((span) => span.scrollWidth > span.clientWidth)).toBe(
    true,
  )
  const close = page.locator('.tab-close')
  await expect(close).toHaveCSS('opacity', '0')
  await tab.hover()
  await expect(close).toHaveCSS('opacity', '1')
  await close.click()
  await expect(page.locator('.tabs')).toBeHidden()
  await expect(page.locator('.note-item .note-title')).toHaveText(title)
})

test('dropping an image inserts and renders it in the note', async ({ page }) => {
  await source(page, '# Arrastar imagem')
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], 'arrastada.png', { type: 'image/png' }))
      return transfer
    },
    [...png],
  )
  await page.locator('.editor-shell').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.locator('textarea')).toHaveValue(/!\[arrastada.png\]\(data:image\/png;base64,/)
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.getByRole('img', { name: 'arrastada.png' })).toHaveJSProperty('naturalWidth', 1)
})

test('a narrow viewport starts with the library hidden and note selection closes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('.notes-sidebar')).toBeHidden()
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
  await expect(page.locator('.notes-sidebar')).toBeVisible()
  await page.getByRole('button', { name: 'Welcome', exact: true }).click()
  await expect(page.locator('.notes-sidebar')).toBeHidden()
})

test('dropping Markdown files imports them as notes, even over the sidebar', async ({ page }) => {
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File(['# Solta A\n\ntexto'], 'a.md', { type: 'text/markdown' }))
    data.items.add(new File(['sem titulo'], 'b.txt', { type: 'text/plain' }))
    return data
  })
  await page.locator('.notes-sidebar').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.locator('.notes-sidebar')).toContainText('Solta A')
  await expect(page.locator('.notes-sidebar')).toContainText('b')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('dropping a long first paragraph preserves the text with a bounded filename', async ({
  page,
}) => {
  const paragraph = 'Seja bem-vindo ao macOS! A transição será tranquila. 🦥 '.repeat(12)
  const contents = `${paragraph}\n\nConteúdo completo da nota.`
  const transfer = await page.evaluateHandle((contents) => {
    const data = new DataTransfer()
    data.items.add(new File([contents], 'macos.md', { type: 'text/markdown' }))
    return data
  }, contents)
  await page.locator('.editor-shell').dispatchEvent('drop', { dataTransfer: transfer })
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(`# ${contents}`)
  const imported = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('sloth-note:v3'))
    return state.notes.find((note) => note.id === state.activeId)
  })
  expect(new TextEncoder().encode(`.${imported.name}.sloth-tmp`).length).toBeLessThanOrEqual(255)
  await page.reload()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(`# ${contents}`)
})
