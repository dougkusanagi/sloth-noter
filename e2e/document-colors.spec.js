import { test, expect } from '@playwright/test'
const fill = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
})
test('block palette colors headings and restores default after reopening', async ({ page }) => {
  await fill(page, '# Nota\n\n## Título colorido\n\n- Item de lista\n\nTexto')
  await page.locator('.cm-line', { hasText: 'Título colorido' }).hover()
  await page.locator('.cm-block-handle').click()
  await page.getByRole('menuitem', { name: 'Cores', exact: true }).click()
  await page
    .locator('.editor-popup-submenu')
    .getByRole('group', { name: 'Cor de fundo', exact: true })
    .getByRole('button', { name: 'Verde', exact: true })
    .click()
  await expect(page.locator('.cm-colored-block', { hasText: 'Título colorido' })).toBeVisible()
  await expect(page.locator('.cm-content')).not.toContainText('sloth:block')
  await page.locator('.cm-line', { hasText: 'Título colorido' }).hover()
  await page.locator('.cm-block-handle').click()
  await page.getByRole('menuitem', { name: 'Cores', exact: true }).click()
  await page.getByRole('button', { name: 'Restaurar padrão', exact: true }).click()
  await expect(page.locator('.cm-colored-block')).toHaveCount(0)
})
test('selection palette changes text and removes formatting', async ({ page }) => {
  await fill(page, '# Nota\n\nTexto para colorir')
  await page.locator('.cm-line', { hasText: 'Texto para colorir' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await page.locator('.document-color-menu summary').click()
  await page
    .getByRole('group', { name: 'Cor do texto', exact: true })
    .getByRole('button', { name: 'Vermelho', exact: true })
    .click()
  await expect(page.locator('.cm-content span[style*="color: rgb(231, 101, 101)"]')).toContainText(
    'Texto para colorir',
  )
  await page.getByRole('button', { name: 'Restaurar padrão', exact: true }).click()
  await expect(page.locator('.cm-content')).not.toContainText('<span')
})
test('table colors are available without right click', async ({ page }) => {
  await fill(page, '# Nota\n\n| Nome | Estado |\n| --- | --- |\n| Item | Pronto |')
  await page.locator('.cm-md-table-cell', { hasText: 'Item' }).click()
  await page.getByRole('button', { name: 'Ações da tabela', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Cores', exact: true }).click()
  await page
    .locator('.editor-popup-submenu')
    .getByRole('group', { name: 'Cor de fundo', exact: true })
    .getByRole('button', { name: 'Azul', exact: true })
    .click()
  await expect(page.locator('.cm-table-bg-blue', { hasText: 'Item' })).toBeVisible()
})

for (const width of [390, 768, 2200]) {
  test(`color palette and width presets fit and persist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fill(
      page,
      '# Demonstração\n\nTexto com cores\n\n## Organização\n\n- Planejar a semana\n- Revisar as notas',
    )
    await page.locator('.cm-line', { hasText: 'Texto com cores' }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    await page.locator('.document-color-menu summary').click()
    const panel = page.locator('.document-color-panel')
    await panel
      .getByRole('group', { name: 'Cor de fundo', exact: true })
      .getByRole('button', { name: 'Amarelo', exact: true })
      .click()
    const bounds = await panel.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    if (process.env.CAPTURE_UI) {
      await page.screenshot({ path: `/tmp/sloth-document-colors-${width}.png` })
      if (width === 2200) await panel.screenshot({ path: 'public/changelog/cores-documento.png' })
    }
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Aparência', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Toda a largura', exact: true }).click()
    await expect(
      page.getByRole('menuitemradio', { name: 'Toda a largura', exact: true }),
    ).toHaveAttribute('aria-checked', 'true')
    if (process.env.CAPTURE_UI) {
      await page.screenshot({ path: `/tmp/sloth-document-width-${width}.png` })
      if (width === 2200)
        await page
          .locator('.display-menu')
          .screenshot({ path: 'public/changelog/largura-documento.png' })
    }
    await page.keyboard.press('Escape')
    const padding = await page
      .locator('.cm-content')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
    if (width === 2200) expect(padding).toBeLessThan(100)
    await page.reload()
    await expect(page.locator('.cm-content')).toContainText('Texto com cores')
    await expect(page.locator('.cm-content span[style*="background-color"]')).toContainText(
      'Texto com cores',
    )
    await page.getByRole('button', { name: 'Aparência', exact: true }).click()
    await expect(
      page.getByRole('menuitemradio', { name: 'Toda a largura', exact: true }),
    ).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('menuitemradio', { name: 'Padrão', exact: true }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Padrão', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
}

test('block color survives conversion and undo while preserving Markdown', async ({ page }) => {
  await fill(page, '# Nota\n\nTexto do bloco\n\nOutro')
  await page.locator('.cm-line', { hasText: 'Texto do bloco' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await page.locator('.document-color-menu summary').click()
  await page.getByRole('button', { name: 'Bloco inteiro', exact: true }).click()
  await page
    .getByRole('group', { name: 'Cor de fundo', exact: true })
    .getByRole('button', { name: 'Roxo', exact: true })
    .click()
  await expect(page.locator('.cm-colored-block', { hasText: 'Texto do bloco' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.cm-line', { hasText: 'Texto do bloco' }).hover()
  await page.locator('.cm-block-handle').click()
  await page.getByRole('menuitemradio', { name: 'Título 2', exact: true }).click()
  await expect(page.locator('.cm-md-h2.cm-colored-block')).toContainText('Texto do bloco')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.cm-md-paragraph.cm-colored-block')).toContainText('Texto do bloco')
})

// The note is virtualized: an image far down exists only after scrolling to it.
async function scrollUntilFound(page, locator) {
  for (let step = 0; step < 80 && !(await locator.count()); step++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
  }
  await expect(locator).toHaveCount(1)
}

for (const width of [390, 1280])
  test(`Novidades includes the color palette offline at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const entry = page.locator('.visual-editor.read-only')
    await entry.locator('[data-wiki^="Em desenvolvimento|"]').click()
    await expect(entry).toContainText('Cores para blocos')
    const image = entry.getByRole('img', {
      name: 'Paleta com cores do texto, cores de fundo e restauração do padrão',
      exact: true,
    })
    await scrollUntilFound(page, image)
    await image.scrollIntoViewIfNeeded()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
    const widthsImage = entry.getByRole('img', {
      name: 'Menu Aparência com as predefinições Padrão, Ampla e Toda a largura',
      exact: true,
    })
    await scrollUntilFound(page, widthsImage)
    await widthsImage.scrollIntoViewIfNeeded()
    await expect.poll(() => widthsImage.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)

    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-document-colors-news-${width}.png` })
  })
