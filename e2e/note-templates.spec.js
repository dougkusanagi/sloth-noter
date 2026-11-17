import { expect, test } from '@playwright/test'

const palette = (page) => page.getByRole('dialog', { name: 'Paleta de comandos' })

async function openPicker(page) {
  await page.keyboard.press('Control+Shift+P')
  await palette(page).getByRole('combobox').fill('Nova nota a partir de modelo')
  await page.keyboard.press('Enter')
  const picker = page.getByRole('dialog', { name: 'Modelos de nota' })
  await expect(picker).toBeVisible()
  return picker
}

for (const width of [1280, 390]) {
  test(`a note is created from a template with its variables filled at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    const picker = await openPicker(page)
    await expect(picker.getByRole('option')).toHaveCount(5)
    await picker.getByRole('textbox', { name: 'Buscar modelo' }).fill('reuni')
    await expect(picker.getByRole('option')).toHaveCount(1)
    await expect(picker.getByLabel('Prévia do modelo')).toContainText('Pauta')
    await page.screenshot({ path: test.info().outputPath(`picker-${width}.png`) })
    await picker.getByRole('button', { name: 'Criar nota com este modelo' }).click()
    await expect(picker).toBeHidden()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const text = await page.locator('textarea').inputValue()
    expect(text).toMatch(/^# Reunião \d{4}-\d{2}-\d{2}\n/)
    expect(text).not.toContain('{{')
    expect(text).toContain('Participantes: \n')
  })
}

test('the task template selects the title and offers all five statuses', async ({ page }) => {
  await page.goto('/')
  const picker = await openPicker(page)
  await picker.getByRole('option', { name: /Tarefas e projeto/ }).click()
  await picker.getByRole('button', { name: 'Criar nota com este modelo' }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text = await page.locator('textarea').inputValue()
  expect(text).toContain('- [/] Tarefa em andamento')
  expect(text).toContain('<summary>Como usar este modelo</summary>')
  await expect(page.locator('.tab.active')).toContainText('Nova nota')
})

test('Escape closes the template picker without creating a note', async ({ page }) => {
  await page.goto('/')
  const before = await page.locator('.tab').count()
  const picker = await openPicker(page)
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(page.locator('.tab')).toHaveCount(before)
})
