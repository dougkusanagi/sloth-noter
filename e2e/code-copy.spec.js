import { expect, test } from '@playwright/test'

for (const mode of ['Padrão', 'Leitura']) {
  test(`copy badge stays visible while scrolling a long block in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const code = Array.from({ length: 150 }, (_, index) => `const linha${index} = ${index}`).join(
      '\n',
    )
    await page
      .locator('textarea')
      .fill(`# Longo\n\n\`\`\`js\n${code}\n\`\`\`\n\n${'Depois do bloco\n\n'.repeat(80)}`)
    await page.evaluate(() => {
      window.copiedBlocks = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => window.copiedBlocks.push(text) },
      })
    })
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await page.evaluate(() => window.scrollTo(0, 1400))
    const button = page.getByRole('button', { name: 'Copiar javascript', exact: true })
    await expect(button).toBeVisible()
    await expect
      .poll(() =>
        button.evaluate((element) => {
          const header = document.querySelector('.app-header').getBoundingClientRect()
          return Math.round(element.getBoundingClientRect().top - header.bottom)
        }),
      )
      .toBe(12)
    await button.click()
    await expect.poll(() => page.evaluate(() => window.copiedBlocks)).toEqual([code])
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(button).not.toBeInViewport()
  })
  test(`code badges label languages and copy only their block in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const blocks = [
      ['', 'sem linguagem', 'Copiar'],
      ['txt', 'texto simples', 'Copiar'],
      ['md', '# Título\n\n**conteúdo**', 'markdown'],
      ['markdown', 'outro markdown', 'markdown'],
      ['js', 'const value = 1\n\tconsole.log(value)', 'javascript'],
      ['javascript', 'let other = 2', 'javascript'],
      ['py', 'print("olá")', 'python'],
    ]
    const body =
      '# Blocos\n\n' + blocks.map(([lang, code]) => `\`\`\`${lang}\n${code}\n\`\`\``).join('\n\n')
    await page.locator('textarea').fill(body)
    await page.evaluate(() => {
      window.copiedBlocks = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => window.copiedBlocks.push(text) },
      })
    })
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    for (let index = 0; index < blocks.length; index++) {
      const button = page.locator('.copy-code').nth(index)
      for (let step = 0; step < 12 && !(await button.isVisible()); step++) {
        await page.evaluate(() => window.scrollBy(0, 150))
      }
      await button.scrollIntoViewIfNeeded()
      await expect(button).toHaveText(blocks[index][2])
      await expect(button.locator('svg')).toHaveCount(1)
      await button.click()
      await expect
        .poll(() => page.evaluate(() => window.copiedBlocks))
        .toEqual(blocks.slice(0, index + 1).map(([, code]) => code))
    }
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(body)
  })
}
