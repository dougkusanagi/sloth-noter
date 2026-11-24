import { blockColorMetadata } from '../document-colors.js'
import { EditorSelection } from '@codemirror/state'
import { codeCopyHandler } from './code-copy.js'
import { calloutTemplate, calloutTypes } from '../callout.js'
import { embeddedDocument } from './embedded.js'

export const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5']

/**
 * The block types the menus offer, in order. The headings share one entry ('heading'), with the
 * level picked beside it; the alert has one entry too, and its type is chosen in the block menu.
 */
export const TURN_INTO_MENU = [
  'p',
  'heading',
  'list',
  'numbered',
  'task',
  'quote',
  'callout',
  'code',
]

/** Every kind a block can be turned into (and from). */
export const TURN_INTO = [
  'p',
  ...HEADING_LEVELS,
  'list',
  'numbered',
  'task',
  'quote',
  'callout',
  'code',
]

/** The kind a menu entry stands for: the heading entry keeps the current level, else level 2. */
export function menuKind(entry, current) {
  if (entry !== 'heading') return entry
  return HEADING_LEVELS.includes(current) ? current : 'h2'
}

export const isMenuEntryCurrent = (entry, current) =>
  entry === 'heading' ? /^h[1-6]$/.test(current ?? '') : entry === current

const PREFIX = {
  p: '',
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
  quote: '> ',
  list: '- ',
  numbered: '1. ',
  task: '- [ ] ',
}
const MARKER = /^(?:#{1,6}\s+|[-*+]\s+\[[ xX-]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/

// Asks the editor to open its block menu (the one "/" opens) on the cursor line.
export const OPEN_INSERT_EVENT = 'sloth-open-insert'

function blockRange(doc, block) {
  return { from: doc.line(block.first).from, to: doc.line(block.last).to }
}

/** The block's own text, without list, heading or quote markers (and without code fences). */
function blockContent(doc, block) {
  const lines = []
  for (let number = block.first; number <= block.last; number++) lines.push(doc.line(number).text)
  if (block.kind === 'code')
    return lines.slice(1, /^\s*(`{3,}|~{3,})/.test(lines.at(-1)) ? -1 : undefined)
  const content = lines.map((line) => line.trimStart().replace(MARKER, ''))
  // An alert's first line holds its type; a title written after it stays as text.
  if (block.kind === 'callout') {
    const title = content[0].replace(/^\[![A-Za-z]+\]\s*/, '')
    return title ? [title, ...content.slice(1)] : content.slice(1)
  }
  return content
}

/** The edit that turns a block into another kind, or null when it already is one. */
export function turnIntoChange(doc, block, target) {
  if (block.kind === target) return null
  const metadata = blockColorMetadata(doc.line(block.first).text)
  const contentBlock = metadata ? { ...block, first: block.first + 2 } : block
  const content = blockContent(doc, contentBlock)
  const indent =
    block.kind === 'code' ? '' : (doc.line(contentBlock.first).text.match(/^\s*/)?.[0] ?? '')
  let insert
  if (target === 'code') insert = ['```', ...content, '```'].join('\n')
  else if (target === 'quote') insert = content.map((line) => PREFIX.quote + line).join('\n')
  else if (target === 'callout') insert = calloutTemplate('note', content.join('\n'))
  // Headings and list items take one line, so the lines of a paragraph join.
  else if (target === 'p') insert = content.join('\n')
  else insert = indent + PREFIX[target] + content.map((line) => line.trim()).join(' ')
  if (metadata) insert = doc.line(block.first).text + '\n\n' + insert
  return { ...blockRange(doc, block), insert }
}

/** Turns every given block into `target` in one step (undo restores them all). */
export function turnBlocksInto(view, blocks, target) {
  const doc = view.state.doc
  const changes = blocks.map((block) => turnIntoChange(doc, block, target)).filter(Boolean)
  if (!changes.length) return false
  const set = view.state.changes(changes)
  const last = changes.at(-1)
  const end = set.mapPos(last.to, 1) - (target === 'code' ? 4 : 0)
  view.dispatch({
    changes: set,
    selection: EditorSelection.single(end),
    userEvent: 'bloco',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

export function turnBlockInto(view, block, target) {
  return turnBlocksInto(view, [block], target)
}

/** The line of an alert that holds its type, after the block's color line when there is one. */
function calloutLine(doc, block) {
  return doc.line(blockColorMetadata(doc.line(block.first).text) ? block.first + 2 : block.first)
}

/** The current type of an alert block (`note`, `tip`…), or null. */
export function calloutTypeOf(doc, block) {
  if (block.kind !== 'callout') return null
  return /\[!([A-Za-z]+)\]/.exec(calloutLine(doc, block).text)?.[1].toLowerCase() ?? null
}

/** The edit that changes an alert's type, or null when it already has it. */
export function calloutTypeChange(doc, block, type) {
  if (block.kind !== 'callout' || !calloutTypes.includes(type)) return null
  const line = calloutLine(doc, block)
  const match = /\[!([A-Za-z]+)\]/.exec(line.text)
  if (!match || match[1].toLowerCase() === type) return null
  const from = line.from + match.index + 2
  return { from, to: from + match[1].length, insert: type.toUpperCase() }
}

export function setCalloutType(view, block, type) {
  const change = calloutTypeChange(view.state.doc, block, type)
  if (change) view.dispatch({ changes: change, userEvent: 'bloco' })
  view.focus()
  return Boolean(change)
}

export function blockText(doc, block) {
  const { from, to } = blockRange(doc, block)
  return doc.sliceString(from, to)
}

export function copyBlock(view, block) {
  view.state.facet(codeCopyHandler)[0]?.(blockText(view.state.doc, block))
}

/** Removes the block and one blank line next to it, so no gap is left behind. */
export function deleteBlock(view, block) {
  const doc = view.state.doc
  let { from, to } = blockRange(doc, block)
  const blankAfter = block.last < doc.lines && !doc.line(block.last + 1).text.trim()
  const blankBefore = block.first > 1 && !doc.line(block.first - 1).text.trim()
  if (blankAfter && (blankBefore || block.first === 1)) to = doc.line(block.last + 1).to
  if (to < doc.length) to += 1
  else if (block.first > 1) from = doc.line(block.first - 1).to
  view.dispatch({
    changes: { from, to },
    selection: EditorSelection.single(Math.min(from, doc.length - (to - from))),
    userEvent: 'delete',
    scrollIntoView: true,
  })
  view.focus()
}

/** Opens an empty line under the block, then the block menu on it. */
export function addBlockBelow(view, lastLine) {
  const doc = view.state.doc
  const end = doc.line(lastLine).to
  const lineBreak = view.state.lineBreak
  // Reuses a blank line that is already there, or makes one.
  const next = lastLine < doc.lines ? doc.line(lastLine + 1) : null
  const nextNext = lastLine + 1 < doc.lines ? doc.line(lastLine + 2) : null
  let insert = lineBreak.repeat(2)
  if (next && !next.text.trim() && nextNext && !nextNext.text.trim()) insert = ''
  const head = insert ? end + insert.length : nextNext.from
  view.dispatch({
    changes: insert
      ? { from: end, insert: insert + (next && next.text.trim() ? lineBreak : '') }
      : [],
    selection: EditorSelection.single(head),
    userEvent: 'input',
    scrollIntoView: true,
  })
  view.focus()
  // The block menu belongs to the note's editor; in a column the new line is only made ready.
  if (!view.state.facet(embeddedDocument))
    requestAnimationFrame(() => view.dom.dispatchEvent(new CustomEvent(OPEN_INSERT_EVENT)))
}
