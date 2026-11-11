import { markdownTree } from '../markdown-model.js'
import { selectionInCode } from '../format-selection.js'
import { tableCells } from '../markdown-table.js'

/**
 * Which contextual group the formatting bar shows for the editor state.
 * Code blocks and tables win over the line-based groups; a selection wins over
 * heading/list because the clipboard group is what the user is reaching for.
 */
export function formattingContext(state) {
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.head)
  const text = state.doc.toString()
  // Line 1 is the note title; its `# ` marker belongs to the title, not to formatting.
  if (line.number === 1) return selection.empty ? 'text' : 'selection'
  if (selectionInCode(markdownTree(text), selection.from, selection.to)) return 'code'
  if (tableCells(line.text)) return 'table'
  if (!selection.empty) return 'selection'
  if (/^#{1,6}\s/.test(line.text)) return 'heading'
  if (/^\s*([-*+]|\d+[.)])\s/.test(line.text)) return 'list'
  return 'text'
}

/**
 * Edit that turns the cursor line into a task or flips its box:
 * `- text` gains `[ ]`, `- [x]` becomes `- [ ]` and the other way around.
 */
export function taskLineEdit(doc, head) {
  const line = doc.lineAt(head)
  const task = line.text.match(/^(\s*[-*+]\s+)\[([ xX-])\]/)
  if (task) {
    const mark = line.from + line.text.indexOf('[') + 1
    const checked = /[xX]/.test(task[2])
    // The cursor stays on the box, so the list group remains on the bar.
    return {
      from: mark,
      to: mark + 1,
      insert: checked ? ' ' : 'x',
      selectionFrom: mark,
      selectionTo: mark,
    }
  }
  const list = line.text.match(/^(\s*[-*+]\s+)/)
  if (!list) return null
  const at = line.from + list[1].length
  return { from: at, to: at, insert: '[ ] ', selectionFrom: at + 4, selectionTo: at + 4 }
}
