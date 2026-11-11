import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

// A4.1: the formatting bar follows the cursor context above the keyboard.
const notes = [
  {
    id: 'doc',
    name: 'Doc.md',
    body: '# Doc\n\nTexto comum\n\n- Item\n  - Aninhado\n\nRascunho',
    revision: 0,
  },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, notes, document }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ ...document, notes, openIds: ['doc'], activeId: 'doc' }),
        )
    },
    { key: STORAGE_KEY, notes, document: newDocument() },
  )
  await page.goto('/?platform=mobile')
  await expect(page.getByRole('searchbox')).toBeVisible()
})

async function editNote(page, id = 'doc') {
  await page.locator(`[data-note-id="${id}"]`).tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
}

function openKeyboard(page) {
  return page.evaluate(() => window.__insets({ top: 32, bottom: 24, ime: 300, keyboard: 'open' }))
}

const bar = (page) => page.getByRole('toolbar', { name: 'Formatação do texto' })

// Android CodeMirror resolves Enter asynchronously; wait for the new line before typing.
async function pressEnter(page) {
  const lines = page.locator('.cm-line')
  const before = await lines.count()
  await page.keyboard.press('Enter')
  await expect(lines).toHaveCount(before + 1)
}

// The bar actions are async (clipboard) and the visual editor hides Markdown markers,
// so content assertions read the saved Markdown body instead of the rendered text.
const savedBody = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).notes[0].body, STORAGE_KEY)

test('the bar appears over the keyboard and follows the cursor context', async ({ page }) => {
  await editNote(page)
  await page.keyboard.press('ControlOrMeta+End')
  await expect(bar(page)).toBeHidden() // no IME open, no bar

  await openKeyboard(page)
  await expect(bar(page)).toBeVisible()
  // cursor at the end of a common text line: the fixed actions are always there
  await expect(bar(page).getByRole('button', { name: 'Desfazer' })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Esconder teclado' })).toBeVisible()

  await page.locator('.cm-line', { hasText: 'Texto comum' }).click()
  await expect(bar(page).getByRole('button', { name: 'Estilos' })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Lista', exact: true })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Tarefa', exact: true })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Link', exact: true })).toBeVisible()
})

test('Lista converts the current line and the list group manages the task', async ({ page }) => {
  await editNote(page)
  await openKeyboard(page)
  await page.locator('.cm-line', { hasText: 'Texto comum' }).click()
  await bar(page).getByRole('button', { name: 'Lista', exact: true }).tap()
  await expect(page.locator('.cm-content')).toContainText('- Texto comum')

  // now on a list item: the task toggle, and the cursor stays in the list group
  await expect(bar(page).getByRole('button', { name: 'Desrecuar' })).toBeVisible()
  await bar(page).getByRole('button', { name: 'Alternar tarefa' }).tap()
  await expect(page.locator('.cm-content')).toContainText('- [ ] Texto comum')
  await bar(page).getByRole('button', { name: 'Alternar tarefa' }).tap()
  await expect(page.locator('.cm-content')).toContainText('- [x] Texto comum')
})

test('Desrecuar removes one nesting level from a nested item', async ({ page }) => {
  await editNote(page)
  await openKeyboard(page)
  await page.locator('.cm-line', { hasText: 'Aninhado' }).click()
  await expect.poll(() => savedBody(page)).toContain('  - Aninhado')
  await bar(page).getByRole('button', { name: 'Desrecuar' }).tap()
  await expect.poll(() => savedBody(page)).toContain('\n- Aninhado')
})

test('a selection shows the clipboard group and Estilos wraps the text', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await editNote(page)
  await openKeyboard(page)
  await page.keyboard.press('ControlOrMeta+End')
  await pressEnter(page)
  await page.keyboard.type('alvo')
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft') // select the word

  await expect(bar(page).getByRole('button', { name: 'Copiar' })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Recortar' })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Colar' })).toBeVisible()

  await bar(page).getByRole('button', { name: 'Estilos' }).tap()
  await bar(page).getByRole('button', { name: 'Negrito' }).tap()
  await expect(page.locator('.cm-content')).toContainText('**alvo**')

  // Aa goes back to the clipboard group; the selection is the text between the markers
  await bar(page).getByRole('button', { name: 'Estilos' }).tap()
  await bar(page).getByRole('button', { name: 'Recortar' }).tap()
  // the cut writes the clipboard first; wait for the deletion before moving on
  await expect.poll(() => savedBody(page)).toContain('****')

  // paste replaces a new selection, like on the desktop toolbar
  await page.keyboard.press('ControlOrMeta+End')
  await pressEnter(page)
  await page.keyboard.type('fim')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
  await expect(bar(page).getByRole('button', { name: 'Colar' })).toBeVisible()
  await bar(page).getByRole('button', { name: 'Colar' }).tap()
  await expect.poll(() => savedBody(page)).toContain('\nalvo')
})

test('Estilos with an empty cursor inserts an empty pair', async ({ page }) => {
  await editNote(page)
  await openKeyboard(page)
  await page.locator('.cm-line', { hasText: 'Texto comum' }).click()
  await bar(page).getByRole('button', { name: 'Estilos' }).tap()
  await bar(page).getByRole('button', { name: 'Código em linha' }).tap()
  await expect(page.locator('.cm-content')).toContainText('``')
})

test('the heading group converts and clears the line', async ({ page }) => {
  await editNote(page)
  await openKeyboard(page)
  await page.keyboard.press('ControlOrMeta+End')
  await pressEnter(page)
  await page.keyboard.type('Seção nova')
  await page.keyboard.press('Home')
  await expect(bar(page).getByRole('button', { name: 'Título 2', exact: true })).toBeHidden()

  await page.keyboard.type('## ')
  await expect(bar(page).getByRole('button', { name: 'Título 3', exact: true })).toBeVisible()
  await bar(page).getByRole('button', { name: 'Título 3', exact: true }).tap()
  await expect.poll(() => savedBody(page)).toContain('### Seção nova')
  await bar(page).getByRole('button', { name: 'Parágrafo' }).tap()
  await expect.poll(() => savedBody(page)).toContain('Rascunho\nSeção nova')
})

test('Desfazer reverts the last bar action and hiding the keyboard removes the bar', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SlothShare = {
      finishActivity: () => {},
      requestInsets: () => {},
      hideKeyboard: () => window.__insets({ top: 32, bottom: 24, ime: 0, keyboard: 'closed' }),
    }
  })
  await page.reload()
  await editNote(page)
  await openKeyboard(page)
  await page.locator('.cm-line', { hasText: 'Texto comum' }).click()
  await bar(page).getByRole('button', { name: 'Lista', exact: true }).tap()
  await expect(page.locator('.cm-content')).toContainText('- Texto comum')
  await bar(page).getByRole('button', { name: 'Desfazer' }).tap()
  await expect(page.locator('.cm-content')).not.toContainText('- Texto comum')

  await bar(page).getByRole('button', { name: 'Esconder teclado' }).tap()
  await expect(bar(page)).toBeHidden()
})
