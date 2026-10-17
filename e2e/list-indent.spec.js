import { expect, test } from '@playwright/test'

const LIST = '# Lista\n\n- a\n- b\n- c\n\nFim'
const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(LIST)
})

async function select(page, from, to = from) {
  await box(page).evaluate(
    (field, [start, end]) => {
      field.focus()
      field.setSelectionRange(start, end)
    },
    [from, to],
  )
}

test('Tab and Shift+Tab nest and unnest list items in the Código editor', async ({ page }) => {
  await select(page, LIST.indexOf('- b') + 3)
  await page.keyboard.press('Tab')
  await expect(box(page)).toHaveValue(LIST.replace('- b', '    - b'))
  await expect(box(page)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(box(page)).toHaveValue(LIST)
})

test('Tab on the first item or a plain paragraph changes nothing', async ({ page }) => {
  await select(page, LIST.indexOf('- a') + 3)
  await page.keyboard.press('Tab')
  await expect(box(page)).toHaveValue(LIST)
  await expect(box(page)).toBeFocused()
  await select(page, LIST.length)
  await page.keyboard.press('Tab')
  await expect(box(page)).toHaveValue(LIST)
})

test('a selection indents every item it covers in the Código editor', async ({ page }) => {
  await select(page, LIST.indexOf('- b'), LIST.indexOf('- c') + 3)
  await page.keyboard.press('Tab')
  await expect(box(page)).toHaveValue('# Lista\n\n- a\n    - b\n    - c\n\nFim')
  await page.keyboard.press('Shift+Tab')
  await expect(box(page)).toHaveValue(LIST)
})

test('Tab and Shift+Tab nest and unnest list items in the Padrão editor', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: /^b$/ }).click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(LIST.replace('- b', '    - b'))
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: /^b$/ }).click()
  await page.keyboard.press('Shift+Tab')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(LIST)
})

test('nested items are drawn indented in Padrão, ordered ones too', async ({ page }) => {
  await box(page).fill('# Lista\n\n- a\n    - b\n\n1. um\n    1. dois')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  const left = (locator) => locator.evaluate((element) => element.getBoundingClientRect().left)
  const bullets = page.locator('.cm-md-bullet')
  expect(await left(bullets.nth(1))).toBeGreaterThan(await left(bullets.nth(0)))
  const ordered = page.locator('.cm-md-ordered')
  await expect(ordered).toHaveCount(2)
  expect(await left(ordered.nth(1))).toBeGreaterThan(await left(ordered.nth(0)))
})

test('Shift+Tab on list items that are already at the margin does nothing', async ({ page }) => {
  await select(page, LIST.indexOf('- b') + 3)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('X')
  await expect(box(page)).toHaveValue(LIST.replace('- b', '- bX'))
  await select(page, LIST.indexOf('- a'), LIST.indexOf('- c') + 3)
  await page.keyboard.press('Shift+Tab')
  await expect(box(page)).toHaveValue(LIST.replace('- b', '- bX'))
})

test('Shift+Tab outside a list still returns to the title', async ({ page }) => {
  await select(page, LIST.length)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('X')
  await expect(box(page)).toHaveValue(LIST.replace('# Lista', '# ListaX'))
})

test('Shift+Tab on a list item at the margin does nothing in Padrão too', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: /^b$/ }).click()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('X')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(LIST.replace('- b', '- bX'))
})

test('Shift+Tab removes quote indentation around the first two list items', async ({ page }) => {
  const source = '# Fluxo\n\n> - 1. Comprar\n> - 2. Finalizar\n\n- Nome'
  await box(page).fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: '1. Comprar' }).click()
  await page.keyboard.press('Shift+Tab')
  await page.locator('.cm-line', { hasText: '2. Finalizar' }).click()
  await page.keyboard.press('Shift+Tab')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(source.replaceAll('> ', ''))
})

for (const mode of ['Código', 'Padrão']) {
  test(`Ctrl+Shift+arrows moves list subtrees in ${mode}`, async ({ page }) => {
    const source = '# Lista\n\n- a\n    - filho\n- b\n- c'
    await box(page).fill(source)
    if (mode === 'Padrão') {
      await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
      await page.locator('.cm-line', { hasText: /^b$/ }).click()
    } else await select(page, source.indexOf('- b') + 3)
    await page.keyboard.press('Control+Shift+ArrowUp')
    await page.keyboard.type('X')
    if (mode === 'Padrão')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(box(page)).toHaveValue('# Lista\n\n- bX\n- a\n    - filho\n- c')
    if (mode === 'Padrão') {
      await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
      await page.locator('.cm-line', { hasText: /^bX$/ }).click()
    } else await select(page, '# Lista\n\n- bX'.length)
    await page.keyboard.press('Control+Shift+ArrowDown')
    if (mode === 'Padrão')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(box(page)).toHaveValue(source.replace('- b', '- bX'))
  })
}

test('typing before checked tasks does not replay check animations or stale their positions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const source = '# Lista\n\nTexto\n\n- [x] Feito\n- [ ] Pendente'
  await box(page).fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: /^Texto$/ }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' digitado')
  const checked = page.locator('.cm-task-checkbox').first()
  expect(
    await checked.evaluate((input) => ({
      animation: getComputedStyle(input).animationName,
      mark: getComputedStyle(input, '::after').animationName,
    })),
  ).toEqual({ animation: 'none', mark: 'none' })
  await checked.uncheck()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(
    source.replace('Texto', 'Texto digitado').replace('[x]', '[ ]'),
  )
})
