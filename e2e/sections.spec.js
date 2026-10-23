import { expect, test } from '@playwright/test'

const BODY = [
  '# Notas',
  '',
  'Introdução',
  '',
  '## Seção um',
  '',
  'texto um',
  '',
  '### Sub um',
  '',
  'texto sub',
  '',
  '## Seção dois',
  '',
  'texto dois',
  '',
  '## Vazia',
].join('\n')
const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(BODY)
})

async function mode(page, name) {
  await page.getByRole('radio', { name, exact: true }).check({ force: true })
}

async function runCommand(page, query) {
  await page.keyboard.press('Control+Shift+p')
  const commands = page.getByRole('dialog', { name: 'Paleta de comandos' })
  await commands.getByRole('combobox').fill(query)
  await expect(commands.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(commands).toBeHidden()
}

test('Leitura wraps each H2–H6 and its content in a nested section', async ({ page }) => {
  await mode(page, 'Leitura')
  const read = page.locator('.markdown')
  await expect(read.locator('.md-section')).toHaveCount(4)
  await expect(read.locator('.md-section .md-section')).toHaveCount(1)
  await expect(read.locator('.md-section .md-section')).toContainText('texto sub')
})

test('Padrão collapses a section and expands it from the heading without a hidden-line counter', async ({
  page,
}) => {
  await mode(page, 'Padrão')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  // Only H2–H6 sections with content get a toggle: not the title, not the empty one.
  await expect(page.locator('button.cm-fold-toggle')).toHaveCount(3)
  const heading = page.locator('.cm-line', { hasText: 'Seção um' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await expect(page.locator('.cm-line', { hasText: 'texto um' })).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'texto sub' })).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toBeVisible()
  await expect(page.locator('.cm-folded-pill')).toHaveCount(0)
  await expect(
    heading.getByRole('button', { name: 'Expandir seção', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false')
  // Folding is a view state: the Markdown is intact.
  await mode(page, 'Código')
  await expect(box(page)).toHaveValue(BODY)
  await mode(page, 'Padrão')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-folded-pill')).toHaveCount(0)
  await page.locator('.cm-line', { hasText: 'Seção um' }).hover()
  await page.getByRole('button', { name: 'Recolher seção' }).first().click()
  await page
    .locator('.cm-line', { hasText: 'Seção um' })
    .getByRole('button', { name: 'Expandir seção' })
    .click()
  await expect(page.locator('.cm-line', { hasText: 'texto um' })).toBeVisible()
  await expect(page.locator('.cm-folded-pill')).toHaveCount(0)
})

test('a nested fold stays closed when its parent is expanded', async ({ page }) => {
  await mode(page, 'Padrão')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.locator('.cm-line', { hasText: 'Sub um' }).hover()
  await page
    .locator('.cm-line', { hasText: 'Sub um' })
    .getByRole('button', { name: 'Recolher seção' })
    .click()
  await expect(page.locator('.cm-line', { hasText: 'texto sub' })).toHaveCount(0)
  await page.locator('.cm-line', { hasText: 'Seção um' }).hover()
  await page
    .locator('.cm-line', { hasText: 'Seção um' })
    .getByRole('button', { name: 'Recolher seção' })
    .click()
  await page
    .locator('.cm-line', { hasText: 'Seção um' })
    .getByRole('button', { name: 'Expandir seção' })
    .click()
  await expect(page.locator('.cm-line', { hasText: 'texto um' })).toBeVisible()
  await expect(page.locator('.cm-line', { hasText: 'texto sub' })).toHaveCount(0)
  await expect(
    page.locator('.cm-line', { hasText: 'Sub um' }).locator('.cm-fold-toggle').first(),
  ).toHaveAttribute('aria-expanded', 'false')
})

test('moving the cursor into a collapsed section reveals it', async ({ page }) => {
  await mode(page, 'Padrão')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.locator('.cm-line', { hasText: 'Seção dois' }).hover()
  await page
    .locator('.cm-line', { hasText: 'Seção dois' })
    .getByRole('button', { name: 'Recolher seção' })
    .click()
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toHaveCount(0)
  await page.keyboard.press('Control+a')
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toBeVisible()
})

test('the palette collapses and expands every section in Padrão and in Leitura', async ({
  page,
}) => {
  await mode(page, 'Padrão')
  await runCommand(page, 'Recolher todas')
  await expect(page.locator('.cm-fold-toggle.folded')).toHaveCount(2)
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toHaveCount(0)
  await runCommand(page, 'Expandir todas')
  await expect(page.locator('.cm-folded-pill')).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toBeVisible()
  await mode(page, 'Leitura')
  await runCommand(page, 'Recolher todas')
  await expect(page.locator('.markdown').getByText('texto dois')).toBeHidden()
  await expect(page.locator('.markdown').getByText('texto sub')).toBeHidden()
  await runCommand(page, 'Expandir todas')
  await expect(page.locator('.markdown').getByText('texto dois')).toBeVisible()
})

test('the fold commands are hidden in the Código editor', async ({ page }) => {
  await page.keyboard.press('Control+Shift+p')
  const commands = page.getByRole('dialog', { name: 'Paleta de comandos' })
  await commands.getByRole('combobox').fill('Recolher todas')
  await expect(commands.getByRole('option')).toHaveCount(0)
})

test('Leitura collapses a section with its subsections and remembers it per note', async ({
  page,
}) => {
  await mode(page, 'Leitura')
  const read = page.locator('.markdown')
  await expect(read.getByRole('button', { name: /(Recolher|Expandir) seção/ })).toHaveCount(3)
  const toggle = read.getByRole('heading', { name: 'Seção um' }).getByRole('button')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await read.getByRole('heading', { name: 'Seção um' }).hover()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(read.getByText('texto um')).toBeHidden()
  await expect(read.getByText('texto sub')).toBeHidden()
  await expect(read.getByRole('heading', { name: 'Sub um' })).toBeHidden()
  await expect(read.getByText('texto dois')).toBeVisible()
  await mode(page, 'Padrão')
  await mode(page, 'Leitura')
  await expect(read.getByText('texto um')).toBeHidden()
  await toggle.click()
  await expect(read.getByText('texto um')).toBeVisible()
})

test('Leitura task checkboxes inside a section keep working', async ({ page }) => {
  await box(page).fill('# T\n\n## A\n\n- [ ] item')
  await mode(page, 'Leitura')
  await page.getByRole('checkbox', { name: 'Marcar como concluída' }).check()
  await mode(page, 'Código')
  await expect(box(page)).toHaveValue('# T\n\n## A\n\n- [x] item')
})

test('headings show their level as a pill without changing the heading text', async ({ page }) => {
  await mode(page, 'Leitura')
  await expect(page.locator('.markdown h3 .fold-toggle')).toHaveAttribute('data-level', '3')
  await expect(page.locator('.markdown h3')).toHaveText('Sub um')
  const pill = await page
    .locator('.markdown h3 .fold-toggle')
    .evaluate((el) => getComputedStyle(el, '::before').content)
  expect(pill).toBe('"H3"')
  await expect(page.locator('.markdown h1 .fold-toggle')).toHaveCount(0)
})
