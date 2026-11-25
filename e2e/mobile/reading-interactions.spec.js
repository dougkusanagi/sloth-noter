import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  notes: [
    {
      id: 'home',
      name: 'Inicio.md',
      body: [
        '# Início',
        '',
        'Ir para [[Destino#Seção Alvo]].',
        '',
        'Criar [[Nova Ideia]].',
        '',
        'Link externo: [Sloth](https://example.com).',
        '',
        '## Checklist',
        '',
        '- [x] Feito',
        '- [ ] Pendente',
      ].join('\n'),
      revision: 0,
    },
    {
      id: 'dest',
      name: 'Destino.md',
      body: [
        '# Destino',
        '',
        'Parágrafo inicial.',
        '',
        '## Seção Alvo',
        '',
        'Conteúdo do destino.',
      ].join('\n'),
      revision: 0,
    },
  ],
  openIds: ['home'],
  activeId: 'home',
}

test.use({ viewport: { width: 320, height: 568 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    { key: STORAGE_KEY, doc: fixture },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="home"]').tap()
})

test('Reading mode handles [[Note#Heading]], missing note creation, external links, and section progress at 320 dp without opening keyboard', async ({
  page,
}) => {
  // Section progress badge and external link render cleanly at 320 dp.
  await expect(page.getByRole('img', { name: '1 de 2 tarefas concluídas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sloth' })).toHaveAttribute(
    'href',
    'https://example.com',
  )

  // [[Destino#Seção Alvo]] navigates in reading mode (no CodeMirror editor / keyboard).
  await page.getByRole('link', { name: 'Destino#Seção Alvo' }).tap()
  await expect(page.getByRole('heading', { name: 'Seção Alvo' })).toBeVisible()
  await expect(page.locator('.cm-content')).toHaveCount(0)

  // Back returns to Inicio preserving reading context.
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(
    page.getByRole('article').getByRole('heading', { name: 'Início', exact: true }),
  ).toBeVisible()

  // Missing wiki link offers creating the note via toast action.
  await page.getByRole('link', { name: 'Nova Ideia' }).tap()
  await page.getByRole('button', { name: 'Criar nota', exact: true }).click()
  await expect(page.locator('.cm-content')).toContainText('Nova Ideia')
})
