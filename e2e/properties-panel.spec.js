import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body =
  '---\nresponsavel: Ana\nnota: 7.5\nativo: true\nprazo: 2026-12-01\ntags:\n  - a\n# comentário\n---\n# Meu projeto\n\nDono: {{user.responsavel}}\n'

async function open(page, text = body, width = 1280) {
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

const panel = (page) => page.getByRole('region', { name: 'Propriedades' })

for (const width of [1280, 390]) {
  test(`properties sit above the note, aligned with the text, and edit the file at ${width}px`, async ({
    page,
  }) => {
    await open(page, body, width)
    const section = panel(page)
    await expect(section).toBeVisible()
    const box = await section.boundingBox()
    const title = await page.locator('.cm-md-h1').boundingBox()
    expect(box.y + box.height).toBeLessThanOrEqual(title.y)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: test.info().outputPath(`properties-${width}.png`) })

    await section.getByRole('textbox', { name: 'Valor de responsavel' }).fill('Bia')
    await expect(page.locator('.cm-variable').first()).toHaveText('Bia')
    await section.getByRole('textbox', { name: 'Valor de nota' }).fill('9,25')
    await section.getByRole('checkbox', { name: 'Valor de ativo' }).uncheck()
    await section.getByRole('textbox', { name: 'Adicionar item a tags' }).fill('novo')
    await section.getByRole('textbox', { name: 'Adicionar item a tags' }).press('Enter')
    await expect
      .poll(() => saved(page))
      .toMatch(
        /^---\nresponsavel: Bia\nnota: 9.25\nativo: false\nprazo: 2026-12-01\ntags:\n {2}- a\n {2}- novo\n\n?# comentário\n---\n# Meu projeto/,
      )
  })
}

test('the heading collapses the rows', async ({ page }) => {
  await open(page)
  const heading = panel(page).getByRole('button', { name: 'Propriedades' })
  await heading.click()
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await expect(panel(page).getByRole('textbox', { name: 'Valor de responsavel' })).toHaveCount(0)
  await heading.click()
  await expect(panel(page).getByRole('textbox', { name: 'Valor de responsavel' })).toBeVisible()
})

test('an invalid number is reported and the file keeps the last good value', async ({ page }) => {
  await open(page)
  await panel(page).getByRole('textbox', { name: 'Valor de nota' }).fill('abc')
  await expect(panel(page).getByRole('alert')).toContainText('Escreva um número')
  expect(await saved(page)).toContain('nota: 7.5')
})

test('the type menu changes the type and removes a property, warning about variables', async ({
  page,
}) => {
  await open(page)
  const section = panel(page)
  await section.getByRole('button', { name: 'Tipo de nota' }).click()
  await section.getByRole('menuitemradio', { name: 'Texto' }).click()
  await expect.poll(() => saved(page)).toMatch(/nota: "?7.5"?/)
  await expect(section.getByRole('button', { name: 'Tipo de nota' })).toBeFocused()

  await section.getByRole('button', { name: 'Tipo de responsavel' }).click()
  await page.keyboard.press('Escape')
  await expect(section.getByRole('menu')).toHaveCount(0)

  await section.getByRole('button', { name: 'Tipo de responsavel' }).click()
  await section.getByRole('menuitem', { name: 'Remover responsavel' }).click()
  await expect(section.getByRole('alert')).toContainText('1 variável do texto usa "responsavel"')
  await section.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect.poll(() => saved(page)).not.toContain('responsavel: Ana')
  expect(await saved(page)).toContain('# comentário')
})

test('renaming a property in use warns before touching the variables', async ({ page }) => {
  await open(page)
  const section = panel(page)
  const name = section.getByRole('textbox', { name: 'Nome da propriedade responsavel' })
  await name.fill('dono')
  await name.press('Enter')
  await expect(section.getByRole('alert')).toContainText('1 variável do texto usa "responsavel"')
  await section.getByRole('button', { name: 'Renomear assim mesmo' }).click()
  await expect.poll(() => saved(page)).toContain('dono: Ana')
  expect(await saved(page)).toContain('Dono: {{user.responsavel}}')
})

test('a new property is a named row, with a name check', async ({ page }) => {
  await open(page)
  const section = panel(page)
  await section.getByRole('button', { name: 'Adicionar propriedade' }).click()
  const name = section.getByRole('textbox', { name: 'Nome da propriedade', exact: true })
  await name.fill('nota')
  await name.press('Enter')
  await expect(section.getByRole('alert')).toContainText('Já existe uma propriedade')
  await name.fill('projeto')
  await name.press('Enter')
  await expect.poll(() => saved(page)).toMatch(/projeto: ("")?\n/)
  await expect(section.getByRole('textbox', { name: 'Valor de projeto' })).toBeVisible()
})

test('reading mode shows the values without editing controls', async ({ page }) => {
  await open(page)
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const section = panel(page)
  await expect(section.getByRole('button', { name: 'Adicionar propriedade' })).toHaveCount(0)
  await expect(section.getByRole('button', { name: 'Tipo de nota' })).toHaveCount(0)
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

test('invalid YAML shows the error and keeps the lines as text', async ({ page }) => {
  await open(page, '---\na: [1\n---\n# Meu projeto\n\nTexto\n')
  await expect(panel(page).locator('.property-problem')).toContainText('linha 2')
  await expect(page.locator('.cm-md-frontmatter-hidden')).toHaveCount(0)
  await expect(page.locator('.cm-md-frontmatter').first()).toHaveCSS(
    'font-family',
    /mono|Mono|monospace/,
  )
})
