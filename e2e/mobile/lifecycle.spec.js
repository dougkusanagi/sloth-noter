import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

// A3: lifecycle, IME and storage recovery, exercised with the Android mobile shell profile.
const notes = [
  {
    id: 'shopping',
    name: 'Compras.md',
    body: '# Compras\n\nFrutas para o café da manhã\n\n- [ ] Comprar maçãs',
    revision: 0,
  },
  { id: 'ime', name: 'IME.md', body: '# IME\n\n**hello** world\n\nEnd', revision: 0 },
  { id: 'list', name: 'Lista.md', body: '# Lista\n\n- [ ] Comprar maçãs', revision: 0 },
  { id: 'code', name: 'Código.md', body: '# Código\n\n```\n\n```\n\nFim', revision: 0 },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, notes, document }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ ...document, notes, openIds: ['shopping'], activeId: 'shopping' }),
        )
    },
    { key: STORAGE_KEY, notes, document: newDocument() },
  )
  await page.goto('/?platform=mobile')
  await expect(page.getByRole('searchbox')).toBeVisible()
})

async function editNote(page, id) {
  await page.locator(`[data-note-id="${id}"]`).tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await page.locator('.cm-content').focus()
}

test('save failure offers a backup download without entering the text again', async ({ page }) => {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    window.__allowSave = false
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sloth-note:v3' && !window.__allowSave)
        throw new DOMException('Full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await editNote(page, 'shopping')
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' guardado')
  const alert = page.locator('.mobile-error')
  await expect(alert).toContainText('Não foi possível salvar')

  const downloadPromise = page.waitForEvent('download')
  await alert.getByRole('button', { name: 'Baixar backup', exact: true }).tap()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('sloth-note-backup.json')
  const backup = await download.path()
  const { readFile } = await import('node:fs/promises')
  expect(await readFile(backup, 'utf8')).toContain('guardado')

  await page.evaluate(() => {
    window.__allowSave = true
  })
  await page.getByRole('button', { name: 'Tentar de novo', exact: true }).tap()
  await expect(alert).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.markdown')).toContainText('guardado')
})

test('corrupt storage can be downloaded before an explicit replacement', async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await page.reload()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Não foi possível ler suas notas')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar dados originais', exact: true }).tap()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('sloth-note-damaged.json')
  const { readFile } = await import('node:fs/promises')
  expect(await readFile(await download.path(), 'utf8')).toBe('{broken')

  await page.getByRole('button', { name: 'Substituir pelos dados atuais', exact: true }).tap()
  await expect(alert).toContainText('substitui os dados que não puderam ser lidos')
  await page.getByRole('button', { name: 'Substituir', exact: true }).tap()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('searchbox')).toBeVisible()
  await expect(page.locator('.mobile-note-open')).toHaveCount(1)
})

test('the keyboard reduces the shell once, not twice', async ({ page }) => {
  await page.evaluate(() => window.__insets({ top: 32, bottom: 24, ime: 300, keyboard: 'open' }))
  const shell = page.locator('[data-platform="mobile"]')
  await expect(shell).toHaveCSS('padding-bottom', '300px')
  const geometry = await page.evaluate(() => {
    const element = document.querySelector('[data-platform="mobile"]')
    return {
      clientHeight: element.clientHeight,
      viewportHeight: window.innerHeight,
      contentHeight:
        element.clientHeight -
        parseFloat(getComputedStyle(element).paddingTop) -
        parseFloat(getComputedStyle(element).paddingBottom),
    }
  })
  expect(geometry.clientHeight).toBe(geometry.viewportHeight)
  expect(geometry.contentHeight).toBe(geometry.viewportHeight - 32 - 300)
})

test('IME composition keeps the editor and the surrounding Markdown', async ({ page }) => {
  await editNote(page, 'ime')
  await page.keyboard.press('ControlOrMeta+End')
  await page.evaluate(() => {
    window.__mobileEditor = document.querySelector('.cm-content')
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'ção', selectionStart: 3, selectionEnd: 3 })
  await cdp.send('Input.insertText', { text: 'ção' })
  await expect(page.locator('.cm-content')).toContainText('Endção')
  expect(
    await page.evaluate(
      () =>
        window.__mobileEditor === document.querySelector('.cm-content') &&
        window.__mobileEditor.isConnected,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await expect(page.locator('.markdown')).toContainText('Endção')
})

test('pairs and smart paste work in the mobile editor', async ({ page }) => {
  await editNote(page, 'shopping')
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('ControlOrMeta+Shift+ArrowLeft')
  await page.keyboard.type('(')
  await expect(page.locator('.cm-content')).toContainText('(manhã)')

  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await editNote(page, 'code')
  await page.keyboard.press('ControlOrMeta+Home')
  for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowDown')
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', '```php\necho 1;\n```')
    document
      .querySelector('.cm-content')
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
  })
  const code = await page.locator('.cm-content').innerText()
  expect(code).toContain('```php')
  expect(code).toContain('echo 1;')
  expect(code.match(/```/g)).toHaveLength(2)
})

test('Enter continues the list in the mobile editor', async ({ page }) => {
  await editNote(page, 'list')
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Pronto', exact: true }).tap()
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)).notes.find((note) => note.id === 'list').body,
        STORAGE_KEY,
      ),
    )
    .toMatch(/- \[ \][^\n]*\n- \[ \]/)
})
