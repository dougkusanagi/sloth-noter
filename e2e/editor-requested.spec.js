import { test, expect } from '@playwright/test'

test('new note placeholders, slash search and multi-selection', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+t')
  const editor = page.locator('.cm-content')
  await expect(editor.locator('.cm-empty-title')).toHaveAttribute(
    'data-placeholder',
    'Sem título',
  )
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
