import { expect, test } from '@playwright/test'

const BODY = `# Largura\n\n${'palavra '.repeat(200)}`

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(BODY)
})

const width = (page, selector) =>
  page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element)
    return Math.round(
      element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    )
  })

async function setWidth(page, value) {
  await page.keyboard.press('Control+,')
  const settings = page.getByRole('dialog', { name: 'Configurações' })
  await settings.getByRole('button', { name: 'Editor' }).click()
  await settings.getByLabel('Largura do texto').fill(String(value))
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
}

test('the text column is 760px by default and the same in every mode', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect.poll(() => width(page, '.cm-scroller')).toBe(760)
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(760)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect.poll(() => width(page, 'textarea')).toBe(760)
})

test('Settings widens and narrows the column in all modes, remembers it, and can reset it', async ({
  page,
}) => {
  await setWidth(page, 1100)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect.poll(() => width(page, '.cm-scroller')).toBe(1100)
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(1100)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect.poll(() => width(page, 'textarea')).toBe(1100)
  await page.reload()
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(1100)
  await setWidth(page, 600)
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(600)
  await page.keyboard.press('Control+,')
  const settings = page.getByRole('dialog', { name: 'Configurações' })
  await settings.getByRole('button', { name: 'Editor' }).click()
  await settings.getByRole('button', { name: 'Restaurar' }).last().click()
  await expect(settings.getByLabel('Largura do texto')).toHaveValue('760')
  await page.keyboard.press('Escape')
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(760)
})

test('the palette makes the column wider or narrower by one step', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const run = async (query) => {
    await page.keyboard.press('Control+Shift+p')
    const commands = page.getByRole('dialog', { name: 'Paleta de comandos' })
    await commands.getByRole('combobox').fill(query)
    await expect(commands.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(commands).toBeHidden()
  }
  await run('mais larga')
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(800)
  await run('mais estreita')
  await run('mais estreita')
  await expect.poll(() => width(page, '.visual-editor.read-only .cm-scroller')).toBe(720)
})

test('a narrow window still keeps its margins whatever the width setting', async ({ page }) => {
  await setWidth(page, 1400)
  await page.setViewportSize({ width: 700, height: 900 })
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const box = await page.locator('.visual-editor.read-only .cm-scroller').evaluate((element) => {
    const style = getComputedStyle(element)
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) }
  })
  expect(box.left).toBeGreaterThanOrEqual(16)
  expect(box.right).toBeGreaterThanOrEqual(16)
})
