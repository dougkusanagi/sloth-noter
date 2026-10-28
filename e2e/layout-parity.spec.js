import { expect, test } from '@playwright/test'

// Padrão and Leitura must lay a note out identically, so switching modes moves nothing.
// Only the Código mode (raw text) is allowed to differ.
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII='
const image = `![alt](data:image/png;base64,${png})`

const DOCS = {
  'headings, paragraphs, lists, tasks, quotes, table, rule, code and image': {
    body: [
      '# TITULO',
      '',
      'Paragrafo PARA um com texto.',
      '',
      'Paragrafo PARB dois.',
      'Linha seguinte LINB.',
      '',
      '## HDOIS',
      '',
      'texto TXTA',
      '',
      '### HTRES',
      'texto colado TXTB',
      '',
      '#### HQUATRO',
      '',
      '##### HCINCO',
      '',
      '###### HSEIS',
      '',
      'texto TXTC',
      '',
      '- BULA um',
      '- BULB dois',
      '    - BULNEST filho',
      '        - BULNEST2 neto',
      '',
      '1. ORDA um',
      '2. ORDB dois',
      '    1. ORDNEST',
      '',
      '- [x] TASKA feita',
      '- [ ] TASKB aberta',
      '    - [ ] TASKNEST',
      '',
      '> QUOTEA citação',
      '>',
      '> > QUOTEB aninhada',
      '',
      '| TA | TB |',
      '| -- | -- |',
      '| TC | TD |',
      '',
      '---',
      '',
      '```js',
      'const CODEA = 1',
      'const CODEB = 2',
      '```',
      '',
      image,
      '',
      'Final FIM',
    ],
    anchors: [
      'TITULO',
      'PARA',
      'PARB',
      'LINB',
      'HDOIS',
      'TXTA',
      'HTRES',
      'TXTB',
      'HQUATRO',
      'HCINCO',
      'HSEIS',
      'TXTC',
      'BULA',
      'BULB',
      'BULNEST',
      'BULNEST2',
      'ORDA',
      'ORDB',
      'ORDNEST',
      'TASKA',
      'TASKB',
      'TASKNEST',
      'QUOTEA',
      'QUOTEB',
      'TA',
      'TC',
      'CODEA',
      'CODEB',
      'FIM',
    ],
  },
  'blank-line runs, loose lists, setext, tight blocks, continuations and sections': {
    body: [
      '# TDOIS',
      '',
      'Paragrafo P1',
      '',
      '',
      'duas em branco P2',
      '- LISTA1 colada',
      '- LISTA2',
      '',
      '- LOOSEA',
      '',
      '- LOOSEB',
      '',
      'Setext SETX',
      '-----------',
      '',
      '> QA',
      '> QB colado',
      '',
      'texto TXT1',
      '```js',
      'codigo COD1',
      '```',
      'TXT2',
      '',
      image,
      'IMGNEXT',
      '',
      '1. OA',
      '   - ONEST filho',
      '2. OB',
      '',
      '- [ ] TA1',
      '  texto continuacao TCONT',
      '- [ ] TA2',
      '',
      '## HFIM',
      '',
      '### HSUB',
      'texto SUBTXT',
      '',
      '## HOUTRA',
      '',
      'Ultimo ULT',
    ],
    anchors: [
      'TDOIS',
      'P1',
      'P2',
      'LISTA1',
      'LISTA2',
      'LOOSEA',
      'LOOSEB',
      'SETX',
      'QA',
      'QB',
      'TXT1',
      'COD1',
      'TXT2',
      'IMGNEXT',
      'OA',
      'ONEST',
      'OB',
      'TA1',
      'TCONT',
      'TA2',
      'HFIM',
      'HSUB',
      'SUBTXT',
      'HOUTRA',
      'ULT',
    ],
  },
}

const BIG = 'https://example.com/big.svg'
for (const width of [1280, 390]) {
  test(`long code wraps with identical height in both modes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 3600 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const body = [
      '# Blocos',
      '',
      '```text',
      'INICIO ' + 'Uma mensagem longa com palavras e espaços. '.repeat(8),
      'https://example.com/' + 'segmento'.repeat(40),
      '',
      'FIMCODIGO',
      '```',
      '',
      'DEPOIS',
    ].join('\n')
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await expect(page.locator('.cm-md-code').first()).toBeVisible()
    const anchors = ['INICIO', 'FIMCODIGO', 'DEPOIS']
    const live = await positions(page, '.cm-content', anchors)
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(page.locator('.visual-editor.read-only')).toBeVisible()
    const read = await positions(page, '.cm-content', anchors)
    for (const anchor of anchors) {
      expect(Math.abs(read[anchor][0] - live[anchor][0]), `${anchor} vertical`).toBeLessThan(0.5)
      expect(Math.abs(read[anchor][1] - live[anchor][1]), `${anchor} horizontal`).toBeLessThan(0.5)
    }
    expect(
      await page
        .locator('.cm-scroller')
        .evaluate((scroller) => scroller.scrollWidth <= scroller.clientWidth),
    ).toBe(true)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const returned = await positions(page, '.cm-content', anchors)
    expect(returned).toEqual(live)
  })
}
DOCS['a large image between paragraphs'] = {
  body: [
    '# TTRES',
    '',
    'antes ANTES',
    '',
    `![grande](${BIG})`,
    '',
    'depois DEPOIS',
    '',
    'fim FIMT',
  ],
  anchors: ['TTRES', 'ANTES', 'DEPOIS', 'FIMT'],
}

async function positions(page, selector, anchors) {
  return page.evaluate(
    ([selector, anchors]) => {
      const nodes = []
      const walker = document.createTreeWalker(
        document.querySelector(selector),
        NodeFilter.SHOW_TEXT,
      )
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node)
      const found = {}
      for (const anchor of anchors)
        for (const node of nodes) {
          const match = new RegExp(`(^|[^A-Za-z0-9])${anchor}([^A-Za-z0-9]|$)`).exec(
            node.textContent,
          )
          if (!match) continue
          const at = match.index + match[1].length
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + anchor.length)
          const box = range.getBoundingClientRect()
          found[anchor] = [box.top, box.left]
          break
        }
      return found
    },
    [selector, anchors],
  )
}

for (const [name, { body, anchors }] of Object.entries(DOCS)) {
  test(`Padrão and Leitura lay out identically: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 3600 })
    await page.route(BIG, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#888"/></svg>',
      }),
    )
    await page.goto('/')
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.getByRole('textbox', { name: 'Editor Markdown em texto puro' }).fill(body.join('\n'))
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await expect(page.locator('.cm-image-preview')).toHaveJSProperty('complete', true)
    await page.waitForTimeout(300)
    const live = await positions(page, '.cm-content', anchors)
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(page.locator('.visual-editor.read-only')).toBeVisible()
    await expect(page.locator('.cm-image-preview')).toHaveJSProperty('complete', true)
    await page.waitForTimeout(300)
    const read = await positions(page, '.cm-content', anchors)
    for (const anchor of anchors) {
      expect(live[anchor], `${anchor} in Padrão`).toBeTruthy()
      expect(read[anchor], `${anchor} in Leitura`).toBeTruthy()
      expect(Math.abs(read[anchor][0] - live[anchor][0]), `${anchor} vertical`).toBeLessThan(0.5)
      expect(Math.abs(read[anchor][1] - live[anchor][1]), `${anchor} horizontal`).toBeLessThan(0.5)
    }
  })
}

test('Padrão and Leitura lay out the help page identically, heading by heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 5200 })
  await page.route(/sloth-hero\.png$/, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1200"><rect width="2000" height="1200" fill="#000"/></svg>',
    }),
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-image-preview')).toHaveJSProperty('complete', true)
  await page.waitForTimeout(300)
  const tops = (selector) =>
    page
      .locator(selector)
      .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().top))
  const live = await tops('.cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6')
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.visual-editor.read-only')).toBeVisible()
  await expect(page.locator('.cm-image-preview').first()).toHaveJSProperty('complete', true)
  await page.waitForTimeout(300)
  const read = await tops('.cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6')
  expect(read).toHaveLength(live.length)
  expect(live.length).toBeGreaterThan(15)
  live.forEach((top, index) =>
    expect(Math.abs(read[index] - top), `heading ${index}`).toBeLessThan(0.5),
  )
})
