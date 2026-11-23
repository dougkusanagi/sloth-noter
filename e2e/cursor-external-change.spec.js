import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body = '---\nresponsavel: Ana\n---\n# Meu projeto\n\nPrimeira linha\n\nSegunda linha\n'

// The cursor of the note editor, read from CodeMirror's state.
const cursor = (page) =>
  page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content.cmTile.root.view
    return { head: view.state.selection.main.head, doc: view.state.doc.toString() }
  })

// Changes from outside the editor (properties, sync, files changed on disk) used to
// replace the whole text, which threw the cursor back to the start of the note.
test('o cursor fica no lugar quando o texto muda fora do editor', async ({ page }) => {
  await page.addInitScript(
    ({ key, document, text }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          ...document,
          notes: [{ id: 'p', name: 'Meu projeto.md', body: text, revision: 0 }],
          openIds: ['p'],
          activeId: 'p',
        }),
      ),
    { key: STORAGE_KEY, document: newDocument(), text: body },
  )
  await page.goto('/')
  await page.locator('.cm-line', { hasText: 'Segunda linha' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' mais')
  const before = await cursor(page)
  expect(before.doc.slice(0, before.head)).toMatch(/Segunda linha mais$/)

  await page
    .getByRole('region', { name: 'Propriedades' })
    .getByRole('textbox', { name: 'Valor de responsavel' })
    .fill('Beatriz')
  await expect.poll(async () => (await cursor(page)).doc).toContain('responsavel: Beatriz')
  const after = await cursor(page)
  expect(after.doc.slice(0, after.head)).toMatch(/Segunda linha mais$/)
})
