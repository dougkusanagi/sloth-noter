import { expect, test } from '@playwright/test'

const height = async (locator) => (await locator.boundingBox()).height
const lines = (page) =>
  page.locator('.cm-content .cm-line').evaluateAll((elements) =>
    elements.map((element) => ({
      blank: element.classList.contains('cm-md-blank'),
      top: Math.round(element.getBoundingClientRect().top),
      height: Math.round(element.getBoundingClientRect().height),
    })),
  )

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Título\n\nabc\n\n```\ncódigo\n```\n\nfim\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
})

// Regression: every line made by Enter (without Shift) is a paragraph with the usual gap.
test('Enter depois de parágrafo ou bloco de código cria parágrafo com espaço padrão', async ({
  page,
}) => {
  const abc = page.locator('.cm-md-paragraph', { hasText: 'abc' })
  const paragraphHeight = await height(abc)
  const separator = await height(page.locator('.cm-md-fence-end + .cm-md-blank'))

  await abc.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const afterText = page.locator('.cm-md-blank + .cm-md-blank.cm-md-editing')
  await expect(afterText).toBeVisible()
  expect(await height(afterText)).toBeCloseTo(paragraphHeight, 0)
  await page.keyboard.type('def')
  const def = page.locator('.cm-md-paragraph', { hasText: 'def' })
  const [abcBox, defBox] = [await abc.boundingBox(), await def.boundingBox()]
  expect(defBox.y - (abcBox.y + abcBox.height)).toBeCloseTo(separator, 0)

  await page.locator('.cm-md-fence-end').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const afterCode = page.locator('.cm-md-fence-end + .cm-md-blank + .cm-md-blank.cm-md-editing')
  await expect(afterCode).toBeVisible()
  expect(await height(afterCode)).toBeCloseTo(paragraphHeight, 0)
})

test('mover o cursor por linhas vazias não muda o layout', async ({ page }) => {
  const before = await lines(page)
  await page.locator('.cm-md-fence-end + .cm-md-blank').click()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(await lines(page)).toEqual(before)
})
