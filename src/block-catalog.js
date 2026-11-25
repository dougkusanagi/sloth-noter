import { calloutActions } from './callout.js'

/**
 * Canonical block action labels shared by desktop (`VisualEditor`) and mobile (`EditingSheet`).
 */
export const BLOCK_LABELS = {
  h2: 'block.h2',
  h3: 'block.h3',
  h4: 'block.h4',
  list: 'block.list',
  numbered: 'block.numbered',
  task: 'block.task',
  table: 'block.table',
  code: 'block.code',
  quote: 'block.quote',
  callout: 'block.callout',
  image: 'block.image',
  link: 'format.link',
  wiki: 'mobile.noteLink',
  divider: 'mobile.divider',
  date: 'mobile.today',
  columns: 'block.columns',
  accordion: 'block.accordion',
  template: 'block.template',
  variable: 'block.variable',
}

export const CALLOUT_VARIANTS = calloutActions.map(([action, label]) => ({
  action,
  label,
  callout: action.slice('callout-'.length),
}))

export const MOBILE_INSERT_BLOCKS = [
  ['h2', BLOCK_LABELS.h2, '## Título'],
  ['h3', BLOCK_LABELS.h3, '### Título'],
  ['h4', BLOCK_LABELS.h4, '#### Título'],
  ['list', BLOCK_LABELS.list, '• Item'],
  ['numbered', BLOCK_LABELS.numbered, '1. Item'],
  ['task', BLOCK_LABELS.task, '☐ Tarefa'],
  ['table', BLOCK_LABELS.table, '| A | B |'],
  ['code', BLOCK_LABELS.code, '``` código'],
  ['quote', BLOCK_LABELS.quote, '> Citação'],
  ...CALLOUT_VARIANTS.map(({ action, label, callout }) => [
    action,
    label,
    `> [!${callout.toUpperCase()}]`,
  ]),
  ['image', BLOCK_LABELS.image, '▧'],
  ['link', BLOCK_LABELS.link, '[texto](url)'],
  ['wiki', BLOCK_LABELS.wiki, '[[Nota]]'],
  ['divider', BLOCK_LABELS.divider, '───'],
  ['date', BLOCK_LABELS.date, 'dd/mm/aaaa'],
  ['columns', BLOCK_LABELS.columns, 'A  |  B'],
  ['accordion', BLOCK_LABELS.accordion, '▸'],
  ['template', BLOCK_LABELS.template, '▤'],
]
