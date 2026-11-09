import { expect, test } from '@playwright/test'

for (const mode of ['Padrão', 'Código', 'Leitura']) {
  test(`clicking between long tabs restores scroll in ${mode}`, async ({ page }) => {
    await page.addInitScript(() => {
      const notes = ['Alpha', 'Beta'].map((name) => ({
        id: name,
        name: `${name}.md`,
        revision: 0,
        body:
          `# ${name}\n\n` +
          Array.from(
            { length: 120 },
            (_, index) =>
              `## Seção ${index}\n\nTexto da seção com conteúdo para ler.\n\n- [ ] Uma tarefa\n\n`,
          ).join(''),
      }))
      notes.push({ id: 'Short', name: 'Short.md', body: '# Short\n\nNota curta.', revision: 0 })
      localStorage.setItem(
        'sloth-note:v3',
        JSON.stringify({
          version: 3,
          notes,
          trash: [],
          openIds: ['Alpha', 'Beta', 'Short'],
          activeId: 'Alpha',
          preferences: { tabsVisible: true, language: 'pt-BR', theme: 'dark', fontSize: 16 },
        }),
      )
    })
    await page.goto('/')
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    const position = () =>
      page.evaluate(() => {
        const heading = [...document.querySelectorAll('.cm-line')].find(
          (element) =>
            element.textContent.startsWith('Seção ') && element.getBoundingClientRect().top >= 44,
        )
        return {
          window: window.scrollY,
          editor: document.querySelector('.cm-scroller, textarea')?.scrollTop ?? 0,
          heading: heading?.textContent,
          headingTop: heading?.getBoundingClientRect().top,
        }
      })
    async function restored(saved) {
      if (mode !== 'Código') {
        // Virtualized blocks can have different estimated heights after mounting.
        // Verify the same section within one text line; measuring virtualized blocks
        // after remounting can shift their estimated height.
        await expect.poll(async () => (await position()).heading).toBe(saved.heading)
        await expect
          .poll(async () => Math.abs((await position()).headingTop - saved.headingTop))
          .toBeLessThan(24)
      } else {
        await expect
          .poll(async () => Math.abs((await position()).window - saved.window))
          .toBeLessThan(2)
        await expect
          .poll(async () => Math.abs((await position()).editor - saved.editor))
          .toBeLessThan(2)
      }
    }
    // A real wheel scroll targets whichever surface is scrollable in this layout.
    await page.mouse.move(900, 400)
    await page.mouse.wheel(0, 1600)
    await expect
      .poll(async () => Math.max((await position()).window, (await position()).editor))
      .toBeGreaterThan(1000)
    const alpha = await position()
    await page.locator('.tab').filter({ hasText: 'Beta' }).click()
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await page.mouse.move(900, 400)
    await page.mouse.wheel(0, 800)
    await expect
      .poll(async () => Math.max((await position()).window, (await position()).editor))
      .toBeGreaterThan(500)
    const beta = await position()
    await page.locator('.tab').filter({ hasText: 'Alpha' }).click()
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await restored(alpha)
    await page.locator('.tab').filter({ hasText: 'Beta' }).click()
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await restored(beta)
    await page.locator('.tab').filter({ hasText: 'Short' }).click()
    await page.locator('.tab').filter({ hasText: 'Beta' }).click()
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await restored(beta)
    await page.keyboard.press('Control+1')
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await restored(alpha)
  })
}
