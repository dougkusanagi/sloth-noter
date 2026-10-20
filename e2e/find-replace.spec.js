import { expect, test } from '@playwright/test'

async function note(page, body, mode = 'Padrão') {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(body)
  if (mode !== 'Código')
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
}

for (const mode of ['Padrão', 'Código']) {
  test(`live highlights, accent search, toggles and replace in ${mode}`, async ({ page }) => {
    await note(page, '# Busca\n\nInventário inventario inventarios\n\ninventário', mode)
    await page.keyboard.press('Control+f')
    const input = page.getByRole('textbox', { name: 'Texto a buscar', exact: true })
    await input.fill('inventario')
    await expect(page.locator('.find-count')).toHaveText('1 / 4')
    const matches = page.locator(
      mode === 'Padrão' ? '.cm-content .search-match' : '.source-search-mirror mark',
    )
    await expect(matches).toHaveCount(4)
    await page.getByRole('button', { name: 'Palavra inteira', exact: false }).click()
    await expect(page.locator('.find-count')).toHaveText('1 / 3')
    await page.getByRole('button', { name: 'Diferenciar maiúsculas', exact: false }).click()
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
    await page.keyboard.press('Control+h')
    const replacement = page.getByRole('textbox', { name: 'Substituir por…', exact: true })
    await replacement.fill('estoque')
    await page.getByRole('button', { name: 'Substituir', exact: true }).click()
    await expect(page.locator('.find-count')).toHaveText('1 / 1')
    await page.getByRole('button', { name: 'Substituir tudo', exact: true }).click()
    await expect(page.locator('.find-count')).toHaveText('Nenhum resultado')
    await page.keyboard.press('Escape')
    if (mode !== 'Código')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(
      '# Busca\n\nInventário estoque inventarios\n\nestoque',
    )
  })
}

test('regex captures, invalid expressions, undo and current match navigation', async ({ page }) => {
  await note(page, '# Regex\n\nitem-10 item-20')
  await page.keyboard.press('Control+h')
  await page.getByRole('button', { name: 'Expressão regular', exact: false }).click()
  const input = page.getByRole('textbox', { name: 'Texto a buscar', exact: true })
  await input.fill('[')
  await expect(page.getByRole('alert')).toContainText('Expressão regular inválida')
  await input.fill('item-(\\d+)')
  await expect(page.locator('.find-count')).toHaveText('1 / 2')
  await input.press('Enter')
  await expect(page.locator('.find-count')).toHaveText('2 / 2')
  await input.press('Shift+Enter')
  await expect(page.locator('.find-count')).toHaveText('1 / 2')
  await page.getByRole('textbox', { name: 'Substituir por…', exact: true }).fill('produto-$1')
  await page.getByRole('button', { name: 'Substituir tudo', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.cm-content').press('Control+z')
  await expect(page.locator('.cm-content')).toContainText('item-10 item-20')
})

for (const mode of ['Padrão', 'Código'])
  test(`finding a distant result reveals it below the fixed header and find panel in ${mode}`, async ({
    page,
  }) => {
    await note(
      page,
      '# Longa\n\n' + 'Parágrafo com conteúdo.\n\n'.repeat(150) + 'inventário\n\nFim',
      mode,
    )
    await page.keyboard.press('Control+f')
    await page.getByRole('textbox', { name: 'Texto a buscar', exact: true }).fill('inventario')
    const selector =
      mode === 'Padrão'
        ? '.cm-content .search-match-current'
        : '.source-search-mirror .search-match-current'
    await expect(page.locator(selector)).toBeInViewport()
    await expect
      .poll(() =>
        page.locator(selector).evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return (
            rect.top > document.querySelector('.find-dialog').getBoundingClientRect().bottom &&
            rect.bottom < innerHeight - 40
          )
        }),
      )
      .toBe(true)
  })

for (const mode of ['Padrão', 'Leitura']) {
  test(`hover inline copy preserves source in ${mode}`, async ({ page }) => {
    await note(page, '# Inline\n\nUse `const café = 1` aqui.', mode)
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.inlineCopied = text
          },
        },
      }),
    )
    await page.locator(mode === 'Padrão' ? '.cm-md-inline-code' : '.inline-code-wrap code').hover()
    const button = page.locator('.copy-inline-code:visible')
    await expect(button).toBeVisible()
    await button.click()
    await expect.poll(() => page.evaluate(() => window.inlineCopied)).toBe('const café = 1')
    if (mode === 'Padrão') {
      await page.locator('.app-header').hover()
      await expect(page.locator('.cm-copy-inline-code')).not.toBeVisible()
    }
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Inline\n\nUse `const café = 1` aqui.')
  })
}

test('replace stays inside the captured selection and supports undo in source mode', async ({
  page,
}) => {
  await note(page, '# Seleção\n\nitem item\n\nitem', 'Código')
  await page.locator('textarea').evaluate((el) => {
    el.focus()
    el.setSelectionRange(11, 20)
  })
  await page.keyboard.press('Control+h')
  await page.getByRole('textbox', { name: 'Texto a buscar', exact: true }).fill('item')
  await page.getByRole('button', { name: 'Buscar na seleção', exact: true }).click()
  await expect(page.locator('.find-count')).toHaveText('1 / 2')
  await page.getByRole('textbox', { name: 'Substituir por…', exact: true }).fill('produto')
  await page.getByRole('button', { name: 'Substituir tudo', exact: true }).click()
  await expect(page.locator('textarea')).toHaveValue('# Seleção\n\nproduto produto\n\nitem')
  await page.keyboard.press('Escape')
  await page.locator('textarea').press('Control+z')
  await expect(page.locator('textarea')).toHaveValue('# Seleção\n\nitem item\n\nitem')
})

test('navigation unfolds the section containing the match', async ({ page }) => {
  await note(page, '# Dobras\n\n## Estoque\n\ninventário\n\n## Outra\n\nFim')
  await page.getByRole('button', { name: 'Recolher seção', exact: true }).first().click()
  await expect(page.locator('.cm-content')).not.toContainText('inventário')
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Texto a buscar', exact: true }).fill('inventario')
  await expect(page.locator('.search-match-current')).toBeInViewport()
  await expect(page.locator('.cm-content')).toContainText('inventário')
})

test('editing while find is open updates highlights without moving the caret', async ({ page }) => {
  await note(page, '# Editar\n\nitem\n\nOutro texto')
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Texto a buscar', exact: true }).fill('item')
  const content = page.locator('.cm-content')
  await content.click()
  await content.press('Control+End')
  await content.press('End')
  await page.keyboard.type(' novo item')
  await expect(content).toContainText('Outro texto novo item')
  await expect(page.locator('.find-count')).toHaveText('1 / 2')
})

for (const mode of ['Padrão', 'Código']) {
  test(`Ctrl+F searches the selected text in ${mode}, including with find already open`, async ({
    page,
  }) => {
    await note(page, '# Selecionar\n\ninventário estoque inventário estoque', mode)
    const editor = page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea')
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('Control+Shift+ArrowLeft')
    await page.keyboard.press('Control+f')
    const input = page.getByRole('textbox', { name: 'Texto a buscar', exact: true })
    await expect(input).toHaveValue('estoque')
    await expect(input).toBeFocused()
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
    await expect(input).toHaveJSProperty('selectionStart', 0)
    await expect(input).toHaveJSProperty('selectionEnd', 7)
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('Control+ArrowLeft')
    await editor.press('ArrowLeft')
    await editor.press('Control+Shift+ArrowLeft')
    await page.keyboard.press('Control+f')
    await expect(input).toHaveValue('inventário')
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
  })
}

for (const mode of ['Padrão', 'Código']) {
  test(`Ctrl+H focuses replacement from selected text and the search field in ${mode}`, async ({
    page,
  }) => {
    await note(page, '# Substituir\n\nitem estoque item estoque', mode)
    const editor = page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea')
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('Control+Shift+ArrowLeft')
    await page.keyboard.press('Control+h')
    const search = page.getByRole('textbox', { name: 'Texto a buscar', exact: true })
    const replacement = page.getByRole('textbox', { name: 'Substituir por…', exact: true })
    await expect(search).toHaveValue('estoque')
    await expect(replacement).toBeFocused()
    await replacement.fill('produto')
    await search.focus()
    await page.keyboard.press('Control+h')
    await expect(search).toHaveValue('estoque')
    await expect(replacement).toBeFocused()
    await expect(replacement).toHaveJSProperty('selectionStart', 0)
    await expect(replacement).toHaveJSProperty('selectionEnd', 7)
    await page.keyboard.type('novo')
    await expect(replacement).toHaveValue('novo')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+f')
    await expect(search).toBeFocused()
    await page.keyboard.press('Control+h')
    await expect(replacement).toBeFocused()
    await expect(replacement).toHaveValue('novo')
  })
}

for (const mode of ['Padrão', 'Código']) {
  test(`selection scope can be captured after opening find and survives replacements and undo in ${mode}`, async ({
    page,
  }) => {
    await note(page, '# Escopo\n\nitem fora\n\nitem item\n\nitem fora', mode)
    const editor = page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea')
    await page.keyboard.press('Control+f')
    const search = page.getByRole('textbox', { name: 'Texto a buscar', exact: true })
    await search.fill('item')
    const toggle = page.getByRole('button', { name: 'Buscar na seleção', exact: true })
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('ArrowUp')
    await editor.press('ArrowUp')
    await editor.press('Home')
    await editor.press('Shift+End')
    await expect(toggle).toBeEnabled()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
    const scope = page.locator(
      mode === 'Padrão' ? '.cm-content .search-scope' : '.source-search-mirror .search-scope',
    )
    await expect(scope).toHaveText('item item')
    await editor.focus()
    await editor.press('Control+Home')
    await editor.press('End')
    await page.keyboard.type(' prefix')
    await expect(scope).toHaveText('item item')
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
    await editor.press('Control+z')
    await expect(scope).toHaveText('item item')
    await search.focus()
    await page.keyboard.press('Control+h')
    await page.getByRole('textbox', { name: 'Substituir por…', exact: true }).fill('produto')
    await page.getByRole('button', { name: 'Substituir tudo', exact: true }).click()
    await expect(page.locator('.find-count')).toHaveText('Nenhum resultado')
    await expect(scope).toHaveText('produto produto')
    await editor.focus()
    await editor.press('Control+z')
    await expect(scope).toHaveText('item item')
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
    await toggle.click()
    await expect(page.locator('.find-count')).toHaveText('1 / 4')
    await toggle.click()
    await expect(page.locator('.find-count')).toHaveText('1 / 2')
  })
}
