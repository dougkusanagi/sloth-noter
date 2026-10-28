import { test, expect } from '@playwright/test'

const body = `# Comparação

## Localização

| Modelo | Alvos existentes | Cliques falsos | p50 | VRAM total |
| --- | ---: | ---: | ---: | ---: |
| *LFM3-VL-2B* (p2d, raciocínio limitado a 512 tokens) | *105/105* | *0* | 0,9 s | 3,4 GB |
| MAI-UI-2B (localizador do P1) | 84/105 | 0 | 0,17 s | 4,5 GB |

## Planner

| Modelo | Sem raciocínio | Com raciocínio (1 repetição, só indicação) |
| --- | ---: | ---: |
| Qwen3-4B-2507 (referência) | *50/55* | — |
| LFM3-1.7B | 11/55 | 7/11, cerca de 40 s por episódio |
`
for (const width of [390, 1280]) {
  test(`formatted table cells stay intact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const rows = page.locator('.cm-md-table-row:not(.cm-md-table-divider)')
    await expect(rows).toHaveCount(6)
    const first = rows.nth(1).locator(':scope > .cm-md-table-cell')
    await expect(first).toHaveCount(5)
    await expect(first.nth(0)).toContainText('LFM3-VL-2B')
    await expect(first.nth(1)).toHaveText('105/105')
    const boxes = await first.evaluateAll((cells) =>
      cells.map((cell) => {
        const r = cell.getBoundingClientRect()
        return { y: r.y, bottom: r.bottom }
      }),
    )
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1)
    expect(new Set(boxes.map((b) => Math.round(b.bottom))).size).toBe(1)
    await expect(page.locator('.tab.active')).toHaveText('Comparação')
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/table-${width}.png`, fullPage: true })
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(
      page.locator('.markdown table').first().locator('tbody tr').first().locator('td'),
    ).toHaveCount(5)
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(body)
  })
}
