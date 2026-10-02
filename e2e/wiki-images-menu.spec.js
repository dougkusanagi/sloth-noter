import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
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
test('wiki aliases open existing notes and missing targets can be created', async ({ page }) => {
  await source(page, '# Origem\n\n[[Destino|Abrir destino]] e `[[Código]]` e \\[[Literal]]')
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.wiki-link')).toHaveCount(1)
  await page.getByRole('link', { name: 'Abrir destino' }).click()
  await page.getByRole('button', { name: 'Criar nota', exact: true }).click()
  await expect(page.locator('.tab.active')).toHaveText('Destino.md')
  await page.getByRole('button', { name: 'Origem', exact: true }).click()
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.wiki-link')).not.toHaveClass(/missing/)
  await page.getByRole('link', { name: 'Abrir destino' }).click()
  await expect(page.locator('.tab.active')).toHaveText('Destino.md')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('live wiki links open notes and task Enter continues unchecked', async ({ page }) => {
  await page.keyboard.press('Control+t')
  await source(page, '# Origem\n\n[[Welcome|Bem-vindo]]\n\n- [x] Concluído')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/- \[x\] Concluído\n- \[ \] $/)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('[data-wiki]').click()
  await expect(page.locator('.tab.active')).toHaveText('Welcome.md')
})
test('image insertion respects the cursor and undo retains an unused manageable asset', async ({
  page,
}) => {
  await source(page, '# Imagem\n\nAntes\n\nDepois')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page
    .locator('input[type=file][accept^="image/png"]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
  await page.keyboard.press('Control+z')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# Imagem\n\nAntes\n\nDepois')
  await page.keyboard.press('Control+Shift+i')
  await page.locator('.image-item').click()
  await expect(page.getByRole('button', { name: 'Excluir imagem', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Renomear imagem', exact: true }).click()
  await page.getByRole('textbox', { name: 'Renomear imagem' }).fill('Minha foto.png')
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('.image-details h3')).toHaveText('Minha foto.png')
  await page.getByRole('button', { name: 'Excluir imagem', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir imagem', exact: true })
    .click()
  await expect(page.locator('.image-item')).toHaveCount(0)
})
test('used images are protected and the library and shortcut dialog are accessible', async ({
  page,
}) => {
  await page
    .locator('input[type=file][accept^="image/png"]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
  await page.keyboard.press('Control+Shift+i')
  await page.locator('.image-item').click()
  await expect(page.getByRole('button', { name: 'Excluir imagem', exact: true })).toBeDisabled()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Todas as imagens' }).click()
  await page.keyboard.press('Control+Shift+?')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
})
test('main menu search filters actions and shortcuts switch editor modes', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('textbox', { name: 'Buscar ação…' }).fill('backup')
  await expect(page.getByRole('menuitem')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Alt+2')
  await expect(page.locator('textarea')).toBeVisible()
  await page.keyboard.press('Control+Alt+3')
  await expect(page.locator('.markdown')).toBeVisible()
})

test('source image insertion can be undone and renamed notes preserve incoming wiki links', async ({
  page,
}) => {
  await source(page, '# Welcome\n\nTexto')
  const textarea = page.locator('textarea')
  await textarea.focus()
  await page.keyboard.press('Control+End')
  await page
    .locator('input[type=file][accept^="image/png"]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
  await expect(textarea).toHaveValue(/!\[foto.png\]/)
  await page.keyboard.press('Control+z')
  await expect(textarea).toHaveValue('# Welcome\n\nTexto')
  await page.keyboard.press('Control+t')
  await source(page, '# Referências\n\n[[Welcome|Boas-vindas]]')
  await page.getByRole('button', { name: 'Welcome', exact: true }).click()
  await page.keyboard.press('Control+Shift+r')
  await page.getByRole('textbox', { name: 'Nome da nota' }).fill('Renomeada.md')
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByRole('button', { name: 'Referências', exact: true }).click()
  await expect(textarea).toHaveValue(/\[\[Renomeada\|Boas-vindas\]\]/)
})

test('live renderer shares reference images, reference links, strikethrough, setext headings and tilde fences', async ({
  page,
}) => {
  await source(
    page,
    `# Recursos\n\nTítulo alternativo\n------------------\n\n~~Riscado~~ e [site][link]\n\n![Referência][foto]\n\n[foto]: data:image/png;base64,${png.toString('base64')}\n[link]: https://example.com\n\n~~~js\nconst answer = 42\n~~~\n\nFim`,
  )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-md-inline-strike')).toHaveText('Riscado')
  await expect(page.locator('[data-href="https://example.com"]')).toHaveText('site')
  await expect(page.locator('.cm-image-preview')).toHaveJSProperty('naturalWidth', 1)
  await expect(page.locator('.cm-md-h2')).toContainText('Título alternativo')
  await expect(page.locator('.cm-md-code')).toContainText('const answer = 42')
})

test('first line is an automatic H1 and its marker survives deletion in both editors', async ({
  page,
}) => {
  await source(page, 'Meu título\n\nCorpo')
  await expect(page.locator('textarea')).toHaveValue('# Meu título\n\nCorpo')
  await page.locator('textarea').evaluate((field) => {
    field.focus()
    field.setSelectionRange(0, 2)
  })
  await page.keyboard.press('Backspace')
  await expect(page.locator('textarea')).toHaveValue('# Meu título\n\nCorpo')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Backspace')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# Meu título\n\nCorpo')
})

test('dropping onto the live editor saves and inserts the image without losing the title', async ({
  page,
}) => {
  await source(page, 'Título\n\nCorpo')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }))
      return transfer
    },
    [...png],
  )
  await page.locator('.cm-content').dispatchEvent('drop', { dataTransfer: transfer })
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    /^# Título\n!\[drop.png\]\(data:image\/png;base64,.*\n+Corpo$/,
  )
  await page.reload()
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.getByRole('img', { name: 'drop.png' })).toHaveJSProperty('naturalWidth', 1)
})

test('title marker cannot be selected and clearing the title keeps the last valid name', async ({
  page,
}) => {
  await source(page, '# Título válido\n\nCorpo')
  const field = page.locator('textarea')
  await field.evaluate((field) => {
    field.focus()
    field.setSelectionRange(0, field.value.length)
  })
  await expect.poll(() => field.evaluate((field) => field.selectionStart)).toBe(2)
  await field.fill('# \n\nCorpo')
  await expect(field).toHaveValue('# \n\nCorpo')
  await expect(page.locator('.tab.active')).toHaveText('Título válido.md')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await expect
    .poll(() => page.evaluate(() => window.getSelection().toString().startsWith('#')))
    .toBe(false)
})
async function openImagePanel(page) {
  await source(page, '# Imagens\n\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Imagem', exact: true }).click()
}
test('the insert menu adds images from a URL', async ({ page }) => {
  await openImagePanel(page)
  await page.getByRole('textbox', { name: 'URL da imagem' }).fill('https://example.com/foto.png')
  await page.getByRole('button', { name: 'Inserir URL', exact: true }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    /!\[Imagem\]\(https:\/\/example.com\/foto.png\)/,
  )
})
test('the insert menu accepts uploads and drops into its image field', async ({ page }) => {
  await openImagePanel(page)
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], 'campo.png', { type: 'image/png' }))
      return transfer
    },
    [...png],
  )
  await page.locator('.image-upload-zone').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.locator('.image-insert')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/!\[campo.png\]\(data:image\/png;base64,/)
})

test('image upload chooser inserts the selected file and the panel is accessible', async ({
  page,
}) => {
  await openImagePanel(page)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page
    .locator('.image-insert input[type=file]')
    .setInputFiles({ name: 'upload.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.image-insert')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/!\[upload.png\]\(data:image\/png;base64,/)
})

test('an empty title permits editing the body and keeps a stable filename until a new title is entered', async ({
  page,
}) => {
  await source(page, '# Original\n\nCorpo')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' editado')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# \n\nCorpo editado')
  await expect(page.locator('.tab.active')).toHaveText('Original.md')
  await page.reload()
  await expect(page.locator('.tab.active')).toHaveText('Original.md')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# \n\nCorpo editado')
  await page.locator('textarea').fill('# Novo título\n\nCorpo editado')
  await expect(page.locator('.tab.active')).toHaveText('Novo título.md')
})

test('native window drops route into the upload field instead of inserting a path', async ({
  page,
}) => {
  await openImagePanel(page)
  await page.evaluate(
    async (bytes) => {
      const { routeNativeImageDrop } = await import('/src/native-image-drop.js')
      const zone = document.querySelector('.image-upload-zone').getBoundingClientRect()
      const file = new File([new Uint8Array(bytes)], '#101 Calça Jeans Básica.png', {
        type: 'image/png',
      })
      routeNativeImageDrop(
        [file],
        { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 },
        () => {
          throw new Error('Must use the image field')
        },
      )
    },
    [...png],
  )
  await expect(page.locator('.image-insert')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(
    /!\[#101 Calça Jeans Básica.png\]\(data:image\/png;base64,/,
  )
})
