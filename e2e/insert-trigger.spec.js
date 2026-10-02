import { expect, test } from '@playwright/test'

async function openNote(page, body = '# Inserção\n\nPrimeiro parágrafo\n\nÚltimo parágrafo\n\n') {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(body)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
}

const trigger = (page) => page.getByRole('button', { name: 'Inserir bloco', exact: true })

test('the insert button follows only the typing cursor, including mouse movement in margins', async ({
  page,
}) => {
  await openNote(page)
  const blank = page.locator('.cm-line').nth(1)
  await blank.hover()
  await expect(trigger(page)).toBeHidden()
  await page.keyboard.press('ArrowDown')
  await expect(trigger(page)).toBeVisible()
  const original = await trigger(page).boundingBox()
  await page.locator('.cm-line').nth(3).hover()
  expect((await trigger(page).boundingBox()).y).toBeCloseTo(original.y, 2)
  await page.mouse.move(1250, original.y + 120)
  expect((await trigger(page).boundingBox()).y).toBeCloseTo(original.y, 2)
  await page.keyboard.press('ArrowDown')
  await expect(trigger(page)).toBeHidden()
  await blank.hover()
  await expect(trigger(page)).toBeHidden()
})

test('the insert button hides on selection, typing and blur, and inserts at the active blank line', async ({
  page,
}) => {
  await openNote(page)
  await page.keyboard.press('ArrowDown')
  await expect(trigger(page)).toBeVisible()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(trigger(page)).toBeHidden()
  await page.keyboard.press('ArrowLeft')
  await expect(trigger(page)).toBeVisible()
  await page.keyboard.type('Texto')
  await expect(trigger(page)).toBeHidden()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  for (let index = 0; index < 5; index++) await page.keyboard.press('Backspace')
  await expect(trigger(page)).toBeVisible()
  await page.getByRole('textbox', { name: 'Buscar na biblioteca…' }).click()
  await page.locator('.cm-line').nth(3).hover()
  await expect(trigger(page)).toBeHidden()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await trigger(page).click()
  await page.getByRole('menuitem', { name: 'Título 2', exact: true }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/^# Inserção\n## .*\nPrimeiro parágrafo/)
})

test('the fixed insert button tracks document scrolling', async ({ page }) => {
  await openNote(page, '# Rolagem\n\n' + 'Parágrafo\n\n'.repeat(30))
  await page.keyboard.press('Control+End')
  await expect(trigger(page)).toBeVisible()
  const original = await trigger(page).boundingBox()
  await page.evaluate(() => window.scrollBy(0, -10))
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.insert-trigger')?.getBoundingClientRect().top ?? null,
      ),
    )
    .not.toBe(original.y)
  await page.evaluate(() => window.scrollBy(0, -120))
  await expect(trigger(page)).toBeHidden()
})
