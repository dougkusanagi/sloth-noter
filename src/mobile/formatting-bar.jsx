import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bold,
  CaseSensitive,
  ClipboardPaste,
  Code,
  Copy,
  IndentDecrease,
  IndentIncrease,
  Italic,
  KeyboardOff,
  Link as LinkIcon,
  List,
  ListChecks,
  Scissors,
  Strikethrough,
  Undo2,
  Plus,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  WrapText,
} from 'lucide-react'
import { EditorSelection } from '@codemirror/state'
import { undo } from '@codemirror/commands'
import { shortcutEdit } from '../editor-shortcuts.js'
import { blockEdit } from '../insert-block.js'
import { activeFormats } from '../format-selection.js'
import { indentList, moveList } from '../editor/keys.js'
import { clipboardAction } from '../clipboard-actions.js'
import { formattingContext, taskLineEdit } from './formatting-context.js'
import { codeAt, alignTableColumn } from './editing-actions.js'
import { toggleWrap, codeCopyHandler } from '../editor/code-copy.js'
import {
  tableContextAt,
  moveTable,
  insertTableRowAt,
  insertTableColumnAt,
  removeTableRowAt,
  removeTableColumnAt,
} from '../editor/table.js'
import { t } from '../i18n.js'

/* eslint-disable react/jsx-key -- static tuples, rendered with explicit keys below */
const styleButtons = [
  ['bold', 'format.bold', <Bold size={20} aria-hidden="true" />],
  ['italic', 'format.italic', <Italic size={20} aria-hidden="true" />],
  ['strike', 'format.strike', <Strikethrough size={20} aria-hidden="true" />],
  ['code', 'format.code', <Code size={20} aria-hidden="true" />],
  ['link', 'format.link', <LinkIcon size={20} aria-hidden="true" />],
]
/* eslint-enable react/jsx-key */

function Button({ label, pressed, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={t(label)}
      aria-pressed={pressed}
      title={t(label)}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * The mobile formatting bar (requisitos 5.6): a fixed strip above the keyboard
 * with an Inserir slot, the contextual group of the cursor and always-visible
 * Undo and hide-keyboard. The floating selection toolbar stays hidden here.
 */
export function FormattingBar({ view, onHideKeyboard, onInsert }) {
  const [tick, setTick] = useState(0)
  const [more, setMore] = useState(false)
  const [styles, setStyles] = useState(false)
  const context = view ? formattingContext(view.state) : null
  useEffect(() => {
    setStyles(false)
    setMore(false)
  }, [context])
  useEffect(() => {
    if (!view) return
    const sync = () => setTick((n) => n + 1)
    document.addEventListener('selectionchange', sync)
    return () => document.removeEventListener('selectionchange', sync)
  }, [view, view?.state])

  if (!view) return null
  const selection = view.state.selection.main
  const active = activeFormats(view.state.doc.toString(), selection.from, selection.to)
  const composing = view.composing || view.compositionStarted

  function dispatch(edit, userEvent) {
    if (!edit) return
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: EditorSelection.single(edit.selectionFrom, edit.selectionTo),
      userEvent,
      scrollIntoView: true,
    })
    view.focus()
  }

  function applyStyle(action) {
    if (composing) return
    const selection = view.state.selection.main
    // shortcutEdit owns the `*` run rule, empty pairs and link insertion for both editors.
    const edit = shortcutEdit(view.state.doc.toString(), selection.from, selection.to, action)
    dispatch(edit, 'formatacao')
  }

  function applyBlock(action) {
    if (composing) return
    const selection = view.state.selection.main
    const edit = blockEdit(view.state.doc.toString(), selection.from, selection.to, action)
    dispatch(edit, 'bloco')
  }

  function applyTask() {
    if (composing) return
    const edit = taskLineEdit(view.state.doc, selection.head)
    if (edit) dispatch(edit, 'tarefa')
    else applyBlock('task')
  }

  function runList(action) {
    if (composing) return
    if (action === 'task') return applyTask()
    if (action === 'outdent') return void indentList(view, true)
    if (action === 'indent') return void indentList(view)
    if (action === 'up') return void moveList(view, -1)
    if (action === 'down') return void moveList(view, 1)
  }

  function runUndo() {
    if (composing) return
    undo(view)
  }

  const group = []
  if (styles) {
    // Aa toggles back to the base group; pressed while the style buttons are showing.
    group.push(
      <Button key="styles" label="mobile.styles" pressed onClick={() => setStyles(false)}>
        <CaseSensitive size={20} aria-hidden="true" />
      </Button>,
    )
    for (const [action, label, icon] of styleButtons)
      group.push(
        <Button
          key={action}
          label={label}
          pressed={!selection.empty && active.includes(action)}
          onClick={() => applyStyle(action)}
        >
          {icon}
        </Button>,
      )
  } else if (context === 'selection') {
    group.push(
      <Button key="styles" label="mobile.styles" onClick={() => setStyles(true)}>
        <CaseSensitive size={20} aria-hidden="true" />
      </Button>,
      <Button key="copy" label="editor.copy" onClick={() => clipboardAction(view, 'copy')}>
        <Copy size={20} aria-hidden="true" />
      </Button>,
      <Button key="cut" label="editor.cut" onClick={() => clipboardAction(view, 'cut')}>
        <Scissors size={20} aria-hidden="true" />
      </Button>,
      <Button key="paste" label="editor.paste" onClick={() => clipboardAction(view, 'paste')}>
        <ClipboardPaste size={20} aria-hidden="true" />
      </Button>,
    )
  } else if (context === 'heading') {
    for (const [action, label, text] of [
      ['h1', 'block.h1', 'H₁'],
      ['h2', 'block.h2', 'H₂'],
      ['h3', 'block.h3', 'H₃'],
      ['h4', 'block.h4', 'H₄'],
      ['p', 'block.p', '¶'],
    ])
      group.push(
        <Button key={action} label={label} onClick={() => applyBlock(action)}>
          {text}
        </Button>,
      )
  } else if (context === 'list') {
    group.push(
      <Button key="outdent" label="mobile.outdent" onClick={() => runList('outdent')}>
        <IndentDecrease size={20} aria-hidden="true" />
      </Button>,
      <Button key="indent" label="mobile.indent" onClick={() => runList('indent')}>
        <IndentIncrease size={20} aria-hidden="true" />
      </Button>,
      <Button key="up" label="mobile.moveUp" onClick={() => runList('up')}>
        <ArrowUp size={20} aria-hidden="true" />
      </Button>,
      <Button key="down" label="mobile.moveDown" onClick={() => runList('down')}>
        <ArrowDown size={20} aria-hidden="true" />
      </Button>,
      <Button key="task" label="mobile.taskToggle" onClick={() => runList('task')}>
        <ListChecks size={20} aria-hidden="true" />
      </Button>,
    )
  } else if (context === 'text') {
    group.push(
      <Button key="styles" label="mobile.styles" onClick={() => setStyles(true)}>
        <CaseSensitive size={20} aria-hidden="true" />
      </Button>,
      <Button key="list" label="format.list" onClick={() => applyBlock('list')}>
        <List size={20} aria-hidden="true" />
      </Button>,
      <Button key="task" label="block.task" onClick={() => runList('task')}>
        <ListChecks size={20} aria-hidden="true" />
      </Button>,
      <Button key="link" label="format.link" onClick={() => applyStyle('link')}>
        <LinkIcon size={20} aria-hidden="true" />
      </Button>,
    )
  }
  if (context === 'table') {
    const run = (action) => {
      if (composing) return
      const c = tableContextAt(view)
      if (!c) return
      if (action === 'previous' || action === 'next')
        moveTable(view, action === 'previous' ? 'shift-tab' : 'tab')
      if (action === 'row') insertTableRowAt(view, c.table.first, c.row, c.column)
      if (action === 'column') insertTableColumnAt(view, c.table.first, c.row, c.column)
      if (action === 'removeRow') removeTableRowAt(view, c.table.first, c.row)
      if (action === 'removeColumn') removeTableColumnAt(view, c.table.first, c.column)
      if (['left', 'center', 'right'].includes(action)) alignTableColumn(view, action)
      view.focus()
    }
    for (const [action, label] of more
      ? [
          ['removeRow', 'mobile.removeRow'],
          ['removeColumn', 'mobile.removeColumn'],
          ['left', 'mobile.alignLeft'],
          ['center', 'mobile.alignCenter'],
          ['right', 'mobile.alignRight'],
        ]
      : [
          ['previous', 'mobile.previousCell'],
          ['next', 'mobile.nextCell'],
          ['row', 'mobile.addRow'],
          ['column', 'mobile.addColumn'],
        ])
      group.push(
        <Button key={action} label={label} onClick={() => run(action)}>
          {action === 'previous' ? (
            <ArrowLeft size={20} />
          ) : action === 'next' ? (
            <ArrowRight size={20} />
          ) : (
            t(label)
          )}
        </Button>,
      )
    group.push(
      <Button key="more" label="mobile.tableMore" pressed={more} onClick={() => setMore(!more)}>
        <MoreHorizontal size={20} />
      </Button>,
    )
  }
  if (context === 'code') {
    const node = codeAt(view.state)
    group.push(
      <Button
        key="tab"
        label="mobile.codeTab"
        onClick={() => {
          if (!composing) {
            view.dispatch(view.state.replaceSelection('  '))
            view.focus()
          }
        }}
      >
        Tab
      </Button>,
      <Button
        key="language"
        label="mobile.language"
        onClick={() => {
          if (composing || !node) return
          const line = view.state.doc.line(node.position.start.line)
          const prefix = line.text.match(/^\s*(?:`{3,}|~{3,})/)?.[0]
          if (prefix) {
            view.dispatch({
              selection: { anchor: line.from + prefix.length, head: line.to },
              scrollIntoView: true,
            })
            view.focus()
          }
        }}
      >
        <Code size={20} />
      </Button>,
      <Button
        key="copyCode"
        label="mobile.copyBlock"
        onClick={() => {
          if (composing || !node) return
          view.state.facet(codeCopyHandler)[0]?.(node.value)
        }}
      >
        <Copy size={20} />
      </Button>,
      <Button
        key="wrap"
        label="code.wrap"
        onClick={() => {
          if (!composing && node)
            view.dispatch({
              effects: toggleWrap.of(view.state.doc.line(node.position.start.line).from),
            })
        }}
      >
        <WrapText size={20} />
      </Button>,
    )
  }

  return (
    <div
      className="mobile-format-bar"
      role="toolbar"
      aria-label={t('mobile.formatBar')}
      data-tick={tick}
    >
      <Button
        label="mobile.insert"
        onClick={() => {
          if (!composing) onInsert()
        }}
      >
        <Plus size={20} aria-hidden="true" />
      </Button>
      <div className="mobile-format-group">{group}</div>
      <span className="mobile-format-spacer" aria-hidden="true" />
      <Button label="mobile.undo" onClick={runUndo}>
        <Undo2 size={20} aria-hidden="true" />
      </Button>
      <Button label="mobile.hideKeyboard" onClick={onHideKeyboard}>
        <KeyboardOff size={20} aria-hidden="true" />
      </Button>
    </div>
  )
}
