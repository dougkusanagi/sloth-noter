import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const TODO = `# À Fazer

## Estoque

- [x] Corrigir sacos
- [ ] Remover produtos
    - [ ] Subtarefa

## Financeiro

- [ ] Garantir exatidão`

test.beforeEach(async ({ page }) => {
  const document = newDocument()
  document.notes[0].body = TODO
  document.notes[0].name = 'À Fazer.md'
  for (const name of ['Ideias', 'Contas', 'Agenda'])
    document.notes.push({
      id: name,
      name: `${name}.md`,
      body: `# ${name}\n\nTexto de ${name}`,
      revision: 0,
    })
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('library clicks reuse one preview tab until the note is kept', async ({ page }) => {
  const sidebar = page.getByRole('complementary', { name: 'Biblioteca' })
  const tabs = page.locator('.tab-wrap')
  await expect(tabs).toHaveCount(1)
  await sidebar.getByRole('button', { name: 'Ideias', exact: true }).click()
  await expect(tabs).toHaveCount(2)
  await expect(page.locator('.tab-wrap.preview')).toContainText('Ideias')
  await sidebar.getByRole('button', { name: 'Contas', exact: true }).click()
  await expect(tabs).toHaveCount(2)
  await expect(page.locator('.tab-wrap.preview')).toContainText('Contas')
  // Editing keeps the preview open.
  await page.locator('.cm-content').press('Control+End')
  await page.keyboard.type(' editado')
  await expect(page.locator('.tab-wrap.preview')).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(tabs).toHaveCount(3)
  // Double-clicking keeps it too.
  await sidebar.getByRole('button', { name: 'Agenda', exact: true }).dblclick()
  await expect(page.locator('.tab-wrap.preview')).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Ideias', exact: true }).click()
  await expect(tabs).toHaveCount(4)
})

test('sections show task progress in the editor and in Leitura', async ({ page }) => {
  const badges = page.locator('.cm-content .section-progress')
  await expect(badges).toHaveCount(2)
  await expect(badges.first()).toHaveAttribute('aria-label', '1 de 3 tarefas concluídas')
  await expect(page.locator('.cm-md-h2').first()).toHaveText('Estoque')
  await page.locator('.cm-task-checkbox').nth(1).check()
  await expect(badges.first()).toHaveAttribute('aria-label', '2 de 3 tarefas concluídas')
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.markdown h2 .section-progress').last()).toHaveAttribute(
    'aria-label',
    '0 de 1 tarefas concluídas',
  )
})

test('the tasks view lists open tasks across notes, toggles and jumps to them', async ({
  page,
}) => {
  const sidebar = page.getByRole('complementary', { name: 'Biblioteca' })
  await sidebar.getByRole('button', { name: /^Tarefas/ }).click()
  const tasks = sidebar.getByRole('region', { name: 'Tarefas', exact: true })
  await expect(tasks.locator('.task-row')).toHaveCount(3)
  await tasks.getByRole('checkbox', { name: 'Garantir exatidão', exact: true }).click()
  await expect(tasks.locator('.task-row')).toHaveCount(2)
  await expect(page.locator('.cm-task-checkbox').last()).toBeChecked()
  await tasks.getByText('Mostrar concluídas').click()
  await expect(tasks.locator('.task-row')).toHaveCount(4)
  await sidebar.getByRole('textbox').fill('sub')
  await expect(tasks.locator('.task-row')).toHaveCount(1)
  const accordion = tasks.locator('.task-group-title').first()
  await accordion.click()
  await expect(accordion).toHaveAttribute('aria-expanded', 'false')
  await expect(tasks.locator('.task-row').first()).toBeHidden()
  await accordion.click()
  await expect(accordion).toHaveAttribute('aria-expanded', 'true')
  await expect(tasks.locator('.task-row').first()).toBeVisible()
  await expect(tasks.getByRole('button', { name: /^Abrir nota:/ })).toBeVisible()
  await tasks.getByRole('button', { name: 'Abrir tarefa na nota: Subtarefa', exact: true }).click()
  await expect(page.locator('.cm-content')).toBeFocused()
  expect(
    await page.evaluate(() => {
      const selection = getSelection()
      return selection.anchorNode.textContent
    }),
  ).toContain('Subtarefa')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
})

test('the trash lives in the library footer and can be emptied at once', async ({ page }) => {
  const sidebar = page.getByRole('complementary', { name: 'Biblioteca' })
  for (const name of ['Ideias', 'Contas']) {
    await sidebar.getByRole('button', { name, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
  }
  await sidebar.getByRole('button', { name: /^Lixeira/ }).click()
  const trash = sidebar.getByRole('region', { name: 'Lixeira', exact: true })
  await expect(trash.getByRole('article')).toHaveCount(2)
  await expect(trash.getByRole('article').first()).toContainText('Excluída')
  await trash.getByRole('article', { name: 'Ideias' }).hover()
  await trash
    .getByRole('article', { name: 'Ideias' })
    .getByRole('button', { name: 'Restaurar' })
    .click()
  await expect(sidebar.getByRole('button', { name: 'Ideias', exact: true })).toBeVisible()
  await sidebar.getByRole('button', { name: /^Lixeira/ }).click()
  await sidebar.getByRole('button', { name: 'Esvaziar', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Esvaziar', exact: true }).click()
  await expect(trash).toContainText('A lixeira está vazia.')
  await sidebar.getByRole('button', { name: 'Voltar para a biblioteca' }).click()
  await expect(sidebar.getByRole('button', { name: /^Notas/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the main menu holds actions only and the status bar switches modes', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  const menu = page.locator('.main-menu')
  await expect(menu.getByRole('menuitemradio')).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: /^Padrão/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const status = page.locator('.document-info')
  await status.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toBeVisible()
  await expect(status).not.toContainText('links inversos')
})
