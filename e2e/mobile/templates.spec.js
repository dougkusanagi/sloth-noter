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

test('a new mobile note offers the templates and fills the note with the chosen one', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Nova nota a partir de modelo…' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Nova nota', exact: true }).tap()
  const starters = page.getByRole('group', { name: 'Modelos para começar a nota' })
  await expect(starters.getByRole('button')).toHaveCount(3)
  await expect(starters.locator('button svg')).toHaveCount(3)
  const box = await starters.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  await page.screenshot({ path: test.info().outputPath('starters.png') })
  await starters.getByRole('button', { name: /Reunião/ }).tap()
  await expect(starters).toBeHidden()
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
    .toContain('## Prioridades')
  const doc = (await bodies(page)).find((body) => body.startsWith('# Doc'))
  expect(doc.match(/^# /gm)).toHaveLength(1)
})

test('template starters stay inside the scrollable area and never overlap the formatting bar when the keyboard is open', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Nova nota', exact: true }).tap()
  await openKeyboard(page)
  const starters = page.getByRole('group', { name: 'Modelos para começar a nota' })
  const formatBar = bar(page)
  const saveFooter = page.locator('.mobile-save')
  const content = page.locator('.mobile-content')

  await expect(starters).toBeVisible()
  await expect(formatBar).toBeVisible()
  await expect(saveFooter).toBeVisible()

  const position = await starters.evaluate((el) => getComputedStyle(el).position)
  expect(position).toBe('static')

  const [contentBox, barBox, footerBox] = await Promise.all([
    content.boundingBox(),
    formatBar.boundingBox(),
    saveFooter.boundingBox(),
  ])
  expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(barBox.y + 1)
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(footerBox.y + 1)

  // Verify the formatting bar sits on top (not overlapped by template starters).
  const hitAtBar = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return Boolean(el?.closest('.mobile-format-bar'))
    },
    { x: barBox.x + barBox.width / 2, y: barBox.y + barBox.height / 2 },
  )
  expect(hitAtBar).toBe(true)

  // Scrolling inside .mobile-content reaches the last starter button cleanly.
  const lastStarter = starters.getByRole('button', { name: /Diário/ })
  await lastStarter.scrollIntoViewIfNeeded()
  await expect(lastStarter).toBeVisible()
})
