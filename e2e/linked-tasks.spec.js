import { expect, test } from '@playwright/test'

const parent = '# Projetos\n\n## Sistemas\n\n- [ ] [[Filho|Sistema]]\n- [-] Em andamento\n\nFim'
const child = '# Filho\n\n- [x] Primeiro\n- [ ] Segundo\n\nFim'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ parent, child }) => {
      localStorage.setItem(
        'sloth-note:v3',
        JSON.stringify({
          version: 3,
          notes: [
            { id: 'parent', name: 'Projetos.md', body: parent, revision: 0 },
            { id: 'child', name: 'Filho.md', body: child, revision: 0 },
          ],
          trash: [],
          openIds: ['parent', 'child'],
          activeId: 'parent',
          preferences: { tabsVisible: true, language: 'pt-BR', theme: 'dark', fontSize: 16 },
        }),
      )
    },
    { parent, child },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const name of ['Padrão', 'Leitura']) {
  test(`${name} renders linked counters, automatic completion and partial tasks`, async ({
    page,
  }) => {
    await mode(page, name)
    if (name === 'Padrão') {
      await page.locator('.cm-content').click()
      await page.keyboard.press('Control+End')
    }
    const root = page.locator('.visual-editor')
    const boxes = root.locator('.task-checkbox:not(.section-checkbox)')
    await expect(boxes).toHaveCount(2)
    if (name === 'Leitura') {
      await expect(root).toHaveClass(/read-only/)
      await expect(root).not.toContainText('[-]')
    }
    await expect(boxes.nth(0)).toHaveJSProperty('indeterminate', true)
    await expect(boxes.nth(0)).toBeDisabled()
    await expect(root.locator('.section-progress-count[data-count="1/2"]')).toHaveCount(1)
    await expect(boxes.nth(1)).toHaveJSProperty('indeterminate', true)
    await expect(boxes.nth(1)).not.toHaveCSS('background-image', 'none')
    await boxes.nth(1).check()
    await mode(page, 'Código')
    await expect(page.locator('textarea')).toHaveValue(/- \[x\] Em andamento/)
    await page.getByRole('button', { name: 'Filho.md', exact: true }).click()
    await page.locator('textarea').fill(child.replace('- [ ] Segundo', '- [x] Segundo'))
    await page.getByRole('button', { name: 'Projetos.md', exact: true }).click()
    await expect(page.locator('textarea')).toHaveValue(/- \[x\] \[\[Filho/)
    await mode(page, name)
    await expect(root.locator('.section-progress-count[data-count="2/2"]')).toHaveCount(2)
    await expect(root.locator('.task-checkbox:not(.section-checkbox)').first()).toBeChecked()
    await mode(page, 'Código')
    await page.getByRole('button', { name: 'Filho.md', exact: true }).click()
    await page.locator('textarea').fill(child)
    await page.getByRole('button', { name: 'Projetos.md', exact: true }).click()
    await expect(page.locator('textarea')).toHaveValue(/- \[-\] \[\[Filho/)
    await mode(page, name)
    await expect(root.locator('.task-checkbox:not(.section-checkbox)').first()).toHaveJSProperty(
      'indeterminate',
      true,
    )
    await page.screenshot({ path: test.info().outputPath('desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
    await page.screenshot({ path: test.info().outputPath('mobile.png') })
  })
}
