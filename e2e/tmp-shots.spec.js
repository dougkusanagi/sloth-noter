import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const todo = `# À Fazer

## Sistema de Estoque

- [x] Adicionar forma de corrigir sacos adicionados errados
- [x] Melhorar card de sacos, está mal organizado
- [ ] Adicionar botão para remover produtos
- [ ] Adicionar filtro de produtos sem estoque
    - [ ] Adicionar tipo de conta com acesso de apenas editar fotos
    - [ ] Remover página de registrar conta

### Ideias

- [ ] Na versão desktop usar filtros com cards horizontais

## Sistema Financeiro

- [x] Criar telas base (Dashboard, entradas, saídas)
- [ ] Garantir exatidão das informações`

for (const theme of ['dark', 'light']) {
  test(`shots ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: theme })
    const document = newDocument()
    document.notes[0].body = todo
    document.notes[0].name = 'À Fazer.md'
    for (const [i, name] of ['Ideias', 'Contas', 'SSH VPS'].entries())
      document.notes.push({
        id: `n${i}`,
        name: `${name}.md`,
        body: `# ${name}\n\nTexto de ${name}\n\n- [ ] Tarefa de ${name}`,
        revision: 0,
      })
    document.openIds = [document.notes[0].id, 'n0']
    await page.addInitScript(
      ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
      { key: STORAGE_KEY, document },
    )
    await page.goto('/')
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `/tmp/shots/${theme}-main.png` })
    await page.getByRole('button', { name: /^Tarefas/ }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/shots/${theme}-tasks.png` })
    await page.getByRole('button', { name: 'Aparência do texto' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/shots/${theme}-display.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/shots/${theme}-menu.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/shots/${theme}-reading.png` })
  })
}
