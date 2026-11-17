import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

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
  await expect(page.getByRole('button', { name: 'Buscar nas notas', exact: true })).toBeVisible()
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

const bodies = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).notes.map((note) => note.body),
    STORAGE_KEY,
  )

test('a new note is created from a template in the mobile sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Nova nota a partir de modelo…', exact: true }).tap()
  const sheet = page.getByRole('dialog', { name: 'Modelos de nota' })
  await expect(sheet.getByRole('button')).toHaveCount(7)
  await page.screenshot({ path: test.info().outputPath('templates-sheet.png') })
  await sheet.getByRole('button', { name: /Reunião/ }).tap()
  await expect(sheet).toBeHidden()
  await expect
    .poll(async () =>
      (await bodies(page)).some((body) => /^# Reunião \d{4}-\d{2}-\d{2}/.test(body)),
    )
    .toBe(true)
})

test('Inserir adds a template to the open note without a second title', async ({ page }) => {
  await editNote(page)
  await page.keyboard.press('ControlOrMeta+End')
  await openKeyboard(page)
  await bar(page).getByRole('button', { name: 'Inserir', exact: true }).tap()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /Modelo/ }).tap()
  await sheet.getByRole('button', { name: /Diário/ }).tap()
  await expect(sheet).toBeHidden()
  await expect
    .poll(async () => (await bodies(page)).find((body) => body.startsWith('# Doc')))
    .toContain('## Três prioridades')
  const doc = (await bodies(page)).find((body) => body.startsWith('# Doc'))
  expect(doc.match(/^# /gm)).toHaveLength(1)
})
