import { expect, test } from '@playwright/test'

const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
const fill = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
const source = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(text)
}
const openMenu = async (page, text) => {
  await page.locator('.cm-line', { hasText: text }).hover()
  await page.locator('.cm-block-handle').click()
  const menu = page.getByRole('menu', { name: 'Ações do bloco' })
  await expect(menu).toBeVisible()
  return menu
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
})

test('the block menu turns a paragraph into a heading', async ({ page }) => {
  await fill(page, '# Nota\n\nUm parágrafo\n\nOutro')
  const menu = await openMenu(page, 'Um parágrafo')
  await menu.getByRole('menuitemradio', { name: 'Título 2' }).click()
  await source(page, '# Nota\n\n## Um parágrafo\n\nOutro')
})

test('the block menu deletes a block and copies another', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await fill(page, '# Nota\n\nUm\n\nDois\n\nTrês')
  await (await openMenu(page, 'Dois')).getByRole('menuitem', { name: 'Excluir' }).click()
  await (await openMenu(page, 'Três')).getByRole('menuitem', { name: 'Copiar' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Três')
  await source(page, '# Nota\n\nUm\n\nTrês')
})

test('adding below opens the block menu on a new line', async ({ page }) => {
  await fill(page, '# Nota\n\nUm\n\nDois')
  await (await openMenu(page, 'Um')).getByRole('menuitem', { name: 'Adicionar abaixo' }).click()
  await expect(page.locator('.block-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.type('Novo')
  await source(page, '# Nota\n\nUm\n\nNovo\n\nDois')
})

test('a list item can be indented from its menu', async ({ page }) => {
  await fill(page, '# Nota\n\n- um\n- dois')
  await (await openMenu(page, 'dois')).getByRole('menuitem', { name: 'Aumentar recuo' }).click()
  await source(page, '# Nota\n\n- um\n    - dois')
})

test('the selection toolbar turns blocks and strikes text', async ({ page }) => {
  await fill(page, '# Nota\n\nTexto riscado aqui')
  const line = page.locator('.cm-line', { hasText: 'Texto riscado' })
  await line.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  const toolbar = page.getByRole('toolbar', { name: 'Formatação do texto selecionado' })
  await toolbar.getByRole('button', { name: 'Tachado', exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await toolbar.getByRole('button', { name: /Transformar bloco/ }).click()
  await toolbar.getByRole('menuitemradio', { name: 'Citação' }).click()
  await source(page, '# Nota\n\n> ~~Texto riscado aqui~~')
})

test('document outline navigates and collapses nested headings', async ({ page }) => {
  await fill(page, '# Nota\n\n## Seção\n\nTexto\n\n### Detalhes\n\nMais texto')
  await page.getByRole('button', { name: 'Expandir sumário', exact: true }).click()
  const outline = page.getByRole('navigation', { name: 'Sumário do documento' })
  await expect(outline.getByRole('button', { name: 'Detalhes', exact: true })).toBeVisible()
  await outline.getByRole('button', { name: 'Recolher subtítulos de Seção', exact: true }).click()
  await expect(outline.getByRole('button', { name: 'Detalhes', exact: true })).toHaveCount(0)
  await outline.getByRole('button', { name: 'Seção', exact: true }).click()
  await expect(page.locator('.cm-focused')).toBeVisible()
})

test('empty lines offer an insert button and fold arrows reveal on direct hover', async ({
  page,
}) => {
  await fill(page, '# Nota\n\n## Seção\n\nTexto\n\n')
  const arrow = page.locator('.cm-fold-toggle:not(.cm-level-badge)').first()
  await arrow.hover()
  await expect(arrow).toHaveCSS('opacity', '1')
  await page.locator('.cm-line').last().click()
  await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
  await expect(page.locator('.block-menu')).toBeVisible()
})

test('heading fold arrows align with block handles after heading spacing', async ({ page }) => {
  await fill(page, '# Nota\n\n## Títulos\n\nTexto\n\n### Subtítulo\n\nTexto')
  for (const title of ['Títulos', 'Subtítulo']) {
    const heading = page.locator('.cm-line', { hasText: title })
    await heading.hover()
    await expect
      .poll(async () => {
        const arrow = await heading.locator('.cm-fold-toggle').boundingBox()
        const handle = await page.locator('.cm-block-handle').boundingBox()
        if (!arrow || !handle) return Infinity
        return Math.abs(arrow.y + arrow.height / 2 - handle.y - handle.height / 2)
      })
      .toBeLessThan(2)
  }
  await page.screenshot({ path: '/tmp/sloth-heading-controls-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  await page.screenshot({ path: '/tmp/sloth-heading-controls-mobile.png' })
})

for (const width of [768, 1280]) {
  test(
    'dragging a compact rule below tasks preserves empty lines at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await fill(page, '# Nota\n\n## H2\n---\n- [x] Teste 1\n- [ ] Teste 2\n')
      await page.locator('.cm-md-rule').hover()
      const handle = page.locator('.cm-block-handle')
      await expect(handle).toBeVisible()
      const box = await handle.boundingBox()
      const last = await page.locator('.cm-line').last().boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(last.x + 20, last.y + last.height / 2, { steps: 10 })
      await page.mouse.up()
      await page.locator('.cm-md-h2').click()
      if (process.env.CAPTURE_UI)
        await page.screenshot({ path: '/tmp/sloth-rule-' + width + '.png' })
      await source(page, '# Nota\n\n## H2\n- [x] Teste 1\n- [ ] Teste 2\n---\n')
    },
  )
}
