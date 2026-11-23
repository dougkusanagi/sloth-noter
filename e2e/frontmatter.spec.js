import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body =
  '---\nresponsavel: Ana\nprazo: 2026-12-01\n# comentário do YAML\ntags:\n  - a\n---\n# Meu projeto\n\nPrimeiro parágrafo.\n\n## Seção\n\n- [ ] Tarefa\n'

async function open(page, mode = 'Padrão') {
  await page.addInitScript(
    ({ key, document, body }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          ...document,
          notes: [{ id: 'fm', name: 'Meu projeto.md', body, revision: 0 }],
          openIds: ['fm'],
          activeId: 'fm',
        }),
      ),
    { key: STORAGE_KEY, document: newDocument(), body },
  )
  await page.goto('/')
  await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
}

test('the YAML block stays untouched and the title after it names the note', async ({ page }) => {
  await open(page)
  await page.locator('.cm-line', { hasText: 'Primeiro parágrafo' }).click()
  await expect(page.locator('.cm-md-frontmatter')).toHaveCount(7)
  await expect(page.locator('.cm-md-h1')).toHaveText('Meu projeto')
  await expect(page.locator('.cm-md-h1')).toHaveCount(1)
  await expect(page.locator('.tab.active')).toContainText('Meu projeto')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(body)
})

test('typing in the title or the body keeps the YAML block as it was', async ({ page }) => {
  await open(page)
  await page.locator('.cm-line', { hasText: 'Primeiro parágrafo' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Mais texto.')
  await page.locator('.cm-md-h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' novo')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text = await page.locator('textarea').inputValue()
  expect(
    text.startsWith(
      '---\nresponsavel: Ana\nprazo: 2026-12-01\n# comentário do YAML\ntags:\n  - a\n---\n# Meu projeto novo\n',
    ),
  ).toBe(true)
  expect(text).toContain('Primeiro parágrafo. Mais texto.')
})

test('the section list and statistics ignore the YAML block', async ({ page }) => {
  await open(page)
  await expect(page.locator('.cm-md-h2')).toHaveCount(1)
  await expect(page.locator('.document-statistics')).toContainText('10 palavras')
})

const withVariables =
  '---\nresponsavel: Ana\nprazo: 2026-12-01\n---\n# Plano\n\nResponsável: {{user.responsavel}}\n\nAtualizado {{updated}} e tarefas {{tasks}}.\n\nSem valor: {{user.nada}} e {{inexistente}}.\n\nNo código: `{{today}}`\n\n- [x] Feita\n- [ ] Aberta\n'

for (const mode of ['Padrão', 'Leitura']) {
  test(`${mode} shows variable values and keeps the markers in the file`, async ({ page }) => {
    await page.addInitScript(
      ({ key, document, body }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            ...document,
            notes: [{ id: 'v', name: 'Plano.md', body, revision: 0, modifiedAt: Date.now() }],
            openIds: ['v'],
            activeId: 'v',
          }),
        ),
      { key: STORAGE_KEY, document: newDocument(), body: withVariables },
    )
    await page.goto('/')
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    if (mode === 'Padrão') await page.locator('.cm-line', { hasText: 'Plano' }).first().click()
    const chips = page.locator('.cm-variable:not(.cm-variable-error)')
    await expect(chips).toHaveText(['Ana', /^hoje, \d\d:\d\d$/, '1 de 2'])
    const errors = page.locator('.cm-variable-error')
    await expect(errors).toHaveText(['{{user.nada}}', '{{inexistente}}'])
    await expect(errors.first()).toHaveAttribute(
      'title',
      'A propriedade "nada" não existe nesta nota.',
    )
    await expect(page.locator('.cm-line', { hasText: 'No código' })).toContainText('{{today}}')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(withVariables)
  })
}

test('Inserir propriedades (YAML) adds a block with an example the title stays below', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Control+Shift+P')
  await page
    .getByRole('dialog', { name: 'Paleta de comandos' })
    .getByRole('combobox')
    .fill('Inserir propriedades')
  await page.keyboard.press('Enter')
  await expect(page.locator('.cm-md-frontmatter')).toHaveCount(3)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const text = await page.locator('textarea').inputValue()
  expect(text.startsWith('---\npropriedade: valor\n---\n# Rascunho')).toBe(true)
})
