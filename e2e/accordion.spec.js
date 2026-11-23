import { expect, test } from '@playwright/test'
import { accordionTemplate } from '../src/accordion.js'

for (const width of [390, 1280]) {
  test(`accordion folds only its own content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    const body =
      '# Projeto\nNotas da equipe\n\nAntes\n\n' +
      accordionTemplate('Resumo semanal', 'Itens da revisão\n\n- [ ] Rever nomes') +
      '\n\nDepois'
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const toggle = page.getByRole('button', { name: 'Recolher bloco', exact: true })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Expandir bloco', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(page.locator('.cm-content')).not.toContainText('Itens da revisão')
    await expect(page.locator('.cm-content')).toContainText('Depois')
    await page.screenshot({ path: `/tmp/sloth-bloco-recolhido-${width}.png` })
    await page.getByRole('button', { name: 'Expandir bloco', exact: true }).click()
    await expect(page.locator('.cm-content')).toContainText('Itens da revisão')
    await page.screenshot({ path: `/tmp/sloth-bloco-aberto-${width}.png` })
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(body)
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const news = page.locator('.visual-editor.read-only')
    await news.locator('[data-wiki^="Sloth Note 0.33.0"]').click()
    await expect(news).toContainText('Escolha Bloco recolhível')
    const image = news.getByRole('img', {
      name: 'Bloco Resumo semanal aberto, com um parágrafo e uma tarefa',
    })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
  })
}

test('the slash menu inserts a block and selects its title', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Projeto\nNotas da equipe\n\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('/')
  await page.getByPlaceholder('Buscar blocos').fill('recolhível')
  await page.getByRole('button', { name: 'Bloco recolhível' }).click()
  await page.keyboard.type('Planejamento')
  await expect(page.locator('.cm-md-accordion-title')).toHaveText('Planejamento')
})
