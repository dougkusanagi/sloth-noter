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
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'texto sub' })).toHaveCount(0)
  await runCommand(page, 'Expandir todas')
  await expect(page.locator('.cm-line', { hasText: 'texto dois' })).toBeVisible()
})

test('the fold commands are hidden in the Código editor', async ({ page }) => {
  await page.keyboard.press('Control+Shift+p')
  const commands = page.getByRole('dialog', { name: 'Paleta de comandos' })
  await commands.getByRole('combobox').fill('Recolher todas')
  await expect(commands.getByRole('option')).toHaveCount(0)
})

test('Leitura collapses a section with its subsections and shares it with Padrão', async ({
  page,
}) => {
  await mode(page, 'Leitura')
  const read = page.locator('.visual-editor.read-only')
  await expect(read.getByRole('button', { name: /(Recolher|Expandir) seção/ })).toHaveCount(3)
  const heading = read.locator('.cm-line', { hasText: 'Seção um' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await expect(read.locator('.cm-line', { hasText: 'texto um' })).toHaveCount(0)
  await expect(read.locator('.cm-line', { hasText: 'Sub um' })).toHaveCount(0)
  await expect(read.locator('.cm-line', { hasText: 'texto dois' })).toBeVisible()
  await mode(page, 'Padrão')
  await expect(page.locator('.cm-line', { hasText: 'texto um' })).toHaveCount(0)
  await mode(page, 'Leitura')
  await heading.getByRole('button', { name: 'Expandir seção' }).click()
  await expect(read.locator('.cm-line', { hasText: 'texto um' })).toBeVisible()
})

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('Leitura task checkboxes inside a section keep working', async ({ page }) => {
  await box(page).fill('# T\n\n## A\n\n- [ ] item')
  await mode(page, 'Leitura')
  await page.getByRole('checkbox', { name: 'Marcar como concluída' }).check()
  await mode(page, 'Código')
  await expect(box(page)).toHaveValue(`# T\n\n## A\n\n- [x] item ✅ ${localToday()}`)
})

for (const width of [390, 1280]) {
  test(`Leitura uses the same section arrow as Padrão at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const heading = page.locator('.cm-md-h2', { hasText: 'Seção um' })
    const button = heading.getByRole('button', { name: 'Recolher seção' })
    const geometry = async () => {
      await heading.hover()
      return button.evaluate((element) => {
        const arrow = element.getBoundingClientRect()
        const row = element.closest('.cm-line').getBoundingClientRect()
        return {
          width: arrow.width,
          height: arrow.height,
          offset: row.left - arrow.right,
          top: arrow.top - row.top,
        }
      })
    }
    await page
      .getByRole('radio', { name: 'Padrão', exact: true })
      .evaluate((radio) => radio.click())
    const editing = await geometry()
    await page
      .getByRole('radio', { name: 'Leitura', exact: true })
      .evaluate((radio) => radio.click())
    const reading = await geometry()
    if (process.env.CAPTURE_FOLD)
      await page.screenshot({ path: `/tmp/sloth-fold-${process.env.CAPTURE_FOLD}-${width}.png` })
    expect(reading).toEqual(editing)
    await expect(button.locator('svg')).toHaveCSS('width', '14px')
    expect(await button.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
      'none',
    )
    await expect(
      page.locator('.cm-md-h2', { hasText: 'Vazia' }).locator('.cm-fold-toggle'),
    ).toHaveCount(0)
    await expect(page.locator('.cm-md-h1 button.cm-fold-toggle')).toHaveCount(0)
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(heading.getByRole('button', { name: 'Expandir seção' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
}

test('headings keep the same spacing with or without an empty line between them', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill('# À Fazer\nPlanejamento\n## Um\n\n## Dois\n## Três\n## Quatro\n\n## Cinco\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const tops = await page
    .locator('.cm-md-h2')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top))
  const steps = tops.slice(1).map((top, index) => top - tops[index])
  for (const step of steps) expect(Math.abs(step - steps[0])).toBeLessThan(1)
})

test('a rule right under a heading stays with the heading and its content', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill('# Site\n\n## Versão mobile\n---\n\n- [x] Remover a modelo\n- [ ] Usar a logo\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const box = (locator) => locator.evaluate((element) => element.getBoundingClientRect())
  const heading = await box(page.locator('.cm-md-h2'))
  const rule = await box(page.locator('.cm-md-rule'))
  const task = await box(page.locator('.cm-line', { hasText: 'Remover a modelo' }))
  expect(Math.abs(rule.top - heading.bottom)).toBeLessThan(1)
  expect(Math.abs(task.top - rule.bottom)).toBeLessThan(1)
})
