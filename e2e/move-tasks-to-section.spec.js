import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const body = '# Plano\n\n## Fazer\n\n- [ ] Um\n- [ ] Dois\n- [ ] Três\n\n## Feito\n\n- [x] Zero\n'
const taskNote = `---\ntipo: tarefas\n---\n${body}`

async function open(page, text) {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    {
      key: STORAGE_KEY,
      doc: {
        ...newDocument(),
        notes: [{ id: 'a', name: 'Plano.md', body: text, revision: 0 }],
        openIds: ['a'],
        activeId: 'a',
      },
    },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
}

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).notes[0].body, STORAGE_KEY)

test('Ctrl+Shift+M leva as tarefas selecionadas para outra seção', async ({ page }) => {
  await open(page, body)
  await page.locator('.cm-line', { hasText: /^Um$/ }).click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Control+Shift+M')
  const menu = page.getByRole('menu', { name: 'Mover tarefas para a seção' })
  await expect(menu.getByRole('menuitem')).toHaveText(['Mover para Fazer', 'Mover para Feito'])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  // In a common note the boxes stay as they are.
  await expect.poll(() => saved(page)).toContain('## Feito\n\n- [x] Zero\n- [ ] Um\n- [ ] Dois\n')
  expect(await saved(page)).toContain('## Fazer\n\n- [ ] Três\n')
})

test('numa nota de tarefas a seção Feito também fecha a tarefa', async ({ page }) => {
  await open(page, taskNote)
  await page.locator('.cm-line', { hasText: /^Três$/ }).click()
  await page.keyboard.press('Control+Shift+M')
  await page.getByRole('menuitem', { name: 'Mover para Feito' }).click()
  await expect.poll(() => saved(page)).toMatch(/## Feito\n\n- \[x\] Zero\n- \[x\] Três/)
})

test('a nota de tarefas mostra o resumo abaixo do título', async ({ page }) => {
  await open(page, taskNote.replace('tipo: tarefas', 'tipo: tarefas\ncriada: 2026-11-02'))
  const summary = page.getByRole('note', { name: 'Resumo da nota de tarefas' })
  await expect(summary).toContainText('Criada em 2 de nov. de 2026')
  await expect(summary).toContainText('3 Fazer')
  await expect(summary).toContainText('1 Feito')
  await page.locator('.cm-line', { hasText: /^Três$/ }).click()
  await page.keyboard.press('Control+Shift+M')
  await page.getByRole('menuitem', { name: 'Mover para Feito' }).click()
  await expect(summary).toContainText('2 Fazer')
  await expect(summary).toContainText('2 Feito')
  await page.screenshot({
    path: test.info().outputPath('summary.png'),
    clip: { x: 0, y: 0, width: 1280, height: 400 },
  })
})
