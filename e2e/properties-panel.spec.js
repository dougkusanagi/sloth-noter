import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body =
  '---\nresponsavel: Ana\nnota: 7.5\nativo: true\nprazo: 2026-12-01\ntags:\n  - a\n# comentário\n---\n# Meu projeto\n\nDono: {{user.responsavel}}\n'

async function open(page, text = body, width = 1440) {
  await page.setViewportSize({ width, height: 700 })
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
    { key: STORAGE_KEY, document: newDocument(), text },
  )
  await page.goto('/')
  if (width >= 1000) await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
}

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).notes[0].body, STORAGE_KEY)

test('the panel sits in the right margin on a wide window and edits the file', async ({ page }) => {
  await open(page)
  const panel = page.getByRole('complementary', { name: 'Propriedades' })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  const title = await page.locator('.cm-md-h1').boundingBox()
  expect(box.x).toBeGreaterThan(title.x + title.width)
  expect(box.x + box.width).toBeLessThanOrEqual(1440)

  await panel.getByRole('textbox', { name: 'Valor de responsavel' }).fill('Bia')
  await expect(page.locator('.cm-variable').first()).toHaveText('Bia')
  await panel.getByRole('textbox', { name: 'Valor de nota' }).fill('9,25')
  await panel.getByRole('checkbox', { name: 'Valor de ativo' }).uncheck()
  await panel.getByRole('textbox', { name: 'Adicionar item a tags' }).fill('novo')
  await panel.getByRole('textbox', { name: 'Adicionar item a tags' }).press('Enter')
  await expect
    .poll(() => saved(page))
    .toMatch(
      /^---\nresponsavel: Bia\nnota: 9.25\nativo: false\nprazo: 2026-12-01\ntags:\n {2}- a\n {2}- novo\n\n?# comentário\n---\n# Meu projeto/,
    )
})

test('an invalid number is reported and the file keeps the last good value', async ({ page }) => {
  await open(page)
  const panel = page.getByRole('complementary', { name: 'Propriedades' })
  await panel.getByRole('textbox', { name: 'Valor de nota' }).fill('abc')
  await expect(panel.getByRole('alert')).toContainText('Escreva um número')
  expect(await saved(page)).toContain('nota: 7.5')
})

test('renaming or removing a property in use warns before touching the variables', async ({
  page,
}) => {
  await open(page)
  const panel = page.getByRole('complementary', { name: 'Propriedades' })
  const name = panel.getByRole('textbox', { name: 'Nome da propriedade responsavel' })
  await name.fill('dono')
  await name.press('Enter')
  await expect(panel.getByRole('alert')).toContainText('1 variável do texto usa "responsavel"')
  await panel.getByRole('button', { name: 'Renomear assim mesmo' }).click()
  await expect.poll(() => saved(page)).toContain('dono: Ana')
  expect(await saved(page)).toContain('Dono: {{user.responsavel}}')

  await panel.getByRole('button', { name: 'Remover prazo' }).click()
  await expect.poll(() => saved(page)).not.toContain('prazo')
  expect(await saved(page)).toContain('# comentário')
})

test('a new property can be added, with a name check', async ({ page }) => {
  await open(page)
  const panel = page.getByRole('complementary', { name: 'Propriedades' })
  await panel.getByRole('button', { name: 'Adicionar propriedade' }).click()
  await panel.getByRole('textbox', { name: 'Nome da propriedade', exact: true }).fill('nota')
  await panel.getByRole('button', { name: 'Criar' }).click()
  await expect(panel.getByRole('alert')).toContainText('Já existe uma propriedade')
  await panel.getByRole('textbox', { name: 'Nome da propriedade', exact: true }).fill('projeto')
  await panel.getByRole('combobox', { name: 'Tipo da nova propriedade' }).selectOption('number')
  await panel.getByRole('button', { name: 'Criar' }).click()
  await expect.poll(() => saved(page)).toContain('projeto: 0')
})

test('the raw lines are hidden and the cursor cannot enter them', async ({ page }) => {
  await open(page)
  await expect(page.locator('.cm-md-frontmatter-hidden').first()).toHaveCSS('height', '0px')
  await page.locator('.cm-md-h1').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('X')
  await expect.poll(() => saved(page)).toContain('# XMeu projeto')
  expect((await saved(page)).startsWith('---\nresponsavel: Ana\n')).toBe(true)
})

test('on a narrow window the properties are a section above the note', async ({ page }) => {
  await open(page, body, 700)
  await expect(page.getByRole('complementary', { name: 'Propriedades' })).toHaveCount(0)
  const section = page.locator('.properties-inline')
  await section.locator('summary').click()
  await expect(section.getByRole('textbox', { name: 'Valor de responsavel' })).toBeVisible()
})

test('invalid YAML shows the error and keeps the lines as text', async ({ page }) => {
  await open(page, '---\na: [1\n---\n# Meu projeto\n\nTexto\n')
  await expect(page.locator('.properties-side .property-problem')).toContainText('linha 2')
  await expect(page.locator('.cm-md-frontmatter-hidden')).toHaveCount(0)
  await expect(page.locator('.cm-md-frontmatter').first()).toHaveCSS(
    'font-family',
    /mono|Mono|monospace/,
  )
})
