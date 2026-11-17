import { expect, test } from '@playwright/test'

const palette = (page) => page.getByRole('dialog', { name: 'Paleta de comandos' })

async function newNote(page) {
  await page.keyboard.press('Control+t')
  const starters = page.getByRole('group', { name: 'Modelos para começar a nota' })
  await expect(starters).toBeVisible()
  return starters
}

for (const width of [1280, 390]) {
  test(`an empty new note offers every template with an icon at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    const starters = await newNote(page)
    await expect(starters.getByRole('button')).toHaveCount(3)
    await expect(starters.locator('button svg')).toHaveCount(3)
    const box = await starters.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: test.info().outputPath(`starters-${width}.png`) })
    await starters.getByRole('button', { name: /Reunião/ }).click()
    await expect(starters).toBeHidden()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const text = await page.locator('textarea').inputValue()
    expect(text).toMatch(/^# Reunião \d{4}-\d{2}-\d{2}\n/)
    expect(text).not.toContain('{{')
    expect(text).toContain('## Participantes\n- \n')
  })
}

test('a titled note keeps its title when a template starts it', async ({ page }) => {
  await page.goto('/')
  const starters = await newNote(page)
  await page.keyboard.type('Minha reunião')
  await starters.getByRole('button', { name: /Diário/ }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text = await page.locator('textarea').inputValue()
  expect(text.startsWith('# Minha reunião\n')).toBe(true)
  expect(text).toContain('## Prioridades')
  expect(text.match(/^# /gm)).toHaveLength(1)
})

test('the templates disappear once the note has content', async ({ page }) => {
  await page.goto('/')
  const starters = await newNote(page)
  await page.keyboard.type('Título')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Uma descrição')
  await expect(starters).toBeHidden()
})

test('there is no New note from template command', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+Shift+P')
  await palette(page).getByRole('combobox').fill('Nova nota a partir de modelo')
  await expect(palette(page).getByRole('option')).toHaveCount(0)
})

test('the insert menu adds a template to the current note without a second title', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Nota\n\nTexto\n\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
  await page
    .locator('.block-menu')
    .getByRole('button', { name: /Modelo/ })
    .click()
  const picker = page.getByRole('dialog', { name: 'Modelos de nota' })
  await picker.getByRole('option', { name: /Diário/ }).click()
  await picker.getByRole('button', { name: 'Inserir este modelo na nota' }).click()
  await expect(picker).toBeHidden()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text = await page.locator('textarea').inputValue()
  expect(text).toContain('## Prioridades')
  expect(text.match(/^# /gm)).toHaveLength(1)
  expect(text.startsWith('# Nota\n\nTexto\n\n')).toBe(true)
})

test('the insert menu adds a variable from the note properties', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('---\nresponsavel: Ana\n---\n# Nota\n\nTexto\n\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
  await page
    .locator('.block-menu')
    .getByRole('button', { name: /Variável/ })
    .click()
  const picker = page.getByRole('dialog', { name: 'Inserir variável' })
  await picker.getByRole('searchbox').or(picker.getByRole('textbox')).fill('respons')
  await picker.getByRole('option', { name: /responsavel/ }).click()
  await expect(picker).toBeHidden()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  expect(await page.locator('textarea').inputValue()).toContain('{{user.responsavel}}')
})

test('a note marked as a template appears first among the starters and can be unmarked', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Receita\n\n## Passos\n\n- [ ] Misturar\n')
  await page.keyboard.press('Control+Shift+P')
  await palette(page).getByRole('combobox').fill('Usar esta nota como modelo')
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('A nota agora aparece entre os modelos de uma nota nova.'),
  ).toBeVisible()
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const starters = await newNote(page)
  await expect(starters.getByRole('button')).toHaveCount(4)
  await expect(starters.getByRole('button').first()).toContainText('Receita')
  await starters.getByRole('button').first().click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/^# Receita\n\n## Passos/)
  await page.keyboard.press('Control+Shift+P')
  await palette(page).getByRole('combobox').fill('Remover esta nota dos modelos')
  await expect(palette(page).getByRole('option')).toHaveCount(0)
})

test('the board template opens the note in Board mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const starters = await newNote(page)
  await starters.getByRole('button', { name: /^Quadro/ }).click()
  await expect(page.getByRole('radio', { name: 'Quadro', exact: true })).toBeChecked()
  await expect(page.getByText('Planejamento').first()).toBeVisible()
  await page.screenshot({
    path: '/tmp/claude-1000/-home-servidor-dev-sloth-noter/deb3e673-78de-4db9-b83c-5aa600c6c1aa/scratchpad/board.png',
  })
})
