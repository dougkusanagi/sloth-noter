import { colorPalettePanel } from './color-palette.js'
import { colorBlock } from './document-colors.js'
import { blockColorMetadata } from '../document-colors.js'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { t } from '../i18n.js'
import { documentBlocks, moveBlockChanges } from '../block-move.js'
import { headingSections } from '../sections.js'
import { foldRange, isFolded, refoldAfterMove } from './folding.js'
import { blockIconMarkup, gripMarkup } from './block-icons.js'
import { openPopupMenu } from './popup-menu.js'
import {
  HEADING_LEVELS,
  TURN_INTO_MENU,
  addBlockBelow,
  calloutTypeOf,
  copyBlock,
  deleteBlock,
  isMenuEntryCurrent,
  menuKind,
  setCalloutType,
  turnBlockInto,
} from './block-actions.js'
import { calloutTypes } from '../callout.js'
import { listIndentChanges } from '../list-indent.js'
import { isBareKeys, parseKeys, shortcutKeys } from '../shortcut-registry.js'
import { addColumn, dropBeside, moveAcross, unwrapColumns } from '../column-drop.js'
import { documentChanges } from '../search-scope.js'
import { embeddedDocument, hostOf } from './embedded.js'

const KEY_LABELS = { Shift: '⇧', Delete: 'Del' }

/** The app's shortcut tooltip (see ShortcutHint), for a handle drawn outside React. */
function showTooltip(anchor, label, keys) {
  document.dispatchEvent(new Event('sloth:shortcut-tooltip'))
  const tooltip = document.createElement('span')
  tooltip.className = 'shortcut-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.id = 'cm-block-handle-tooltip'
  const text = document.createElement('span')
  text.textContent = label
  tooltip.append(text)
  if (keys) {
    const { key, alt, shift } = parseKeys(keys)
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
    const parts = [
      ...(isBareKeys(keys) ? [] : [mod]),
      ...(alt ? ['Alt'] : []),
      ...(shift ? ['Shift'] : []),
      key,
    ]
    const group = document.createElement('span')
    group.className = 'menu-shortcut'
    for (const part of parts) {
      const kbd = document.createElement('kbd')
      kbd.textContent = KEY_LABELS[part] ?? part
      group.append(kbd)
    }
    tooltip.append(group)
  }
  document.body.append(tooltip)
  const rect = anchor.getBoundingClientRect()
  const { width, height } = tooltip.getBoundingClientRect()
  tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`
  tooltip.style.top = `${Math.max(8, rect.top >= height + 8 ? rect.top - height - 8 : rect.bottom + 8)}px`
  anchor.setAttribute('aria-describedby', tooltip.id)
  const remove = () => {
    tooltip.remove()
    anchor.removeAttribute('aria-describedby')
    document.removeEventListener('sloth:shortcut-tooltip', remove)
  }
  document.addEventListener('sloth:shortcut-tooltip', remove)
  return remove
}

const blocksByDoc = new WeakMap()
/** The blocks of an editor's text; in a column, a heading on the first line is a block too. */
function blocksOf(state) {
  const doc = state.doc
  let blocks = blocksByDoc.get(doc)
  if (!blocks) {
    blocks = documentBlocks(doc.toString(), { title: !state.facet(embeddedDocument) })
    blocksByDoc.set(doc, blocks)
  }
  return blocks
}

/** The note's editor or column editor under a point, when it belongs to the same note. */
function viewAt(parent, x, y) {
  const element = document.elementFromPoint(x, y)
  const cell = element?.closest?.('.cm-column-editor')
  if (cell) {
    const view = EditorView.findFromDOM(cell.querySelector('.cm-editor') ?? cell)
    return view && hostOf(view).parent === parent ? view : null
  }
  return element && parent.dom.contains(element) ? parent : null
}

/** A block's lines as offsets in the note's text. */
function noteRange(view, block) {
  const { offset } = hostOf(view)
  const doc = view.state.doc
  return { from: offset + doc.line(block.first).from, to: offset + doc.line(block.last).to }
}

const TEXT_KINDS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'list',
  'numbered',
  'task',
  'quote',
  'callout',
  'code',
])

// A colored dot for each alert type, drawn with the alert's own color.
const calloutDot = (type) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true" data-callout="${type}"><circle cx="10" cy="10" r="5" fill="var(--callout-color)" /></svg>`

/** A heading's folded section moves with it; an open heading moves alone. */
function dragRange(state, block) {
  if (!block.kind.startsWith('h')) return block
  const section = headingSections(state.doc.toString()).find((item) => item.line === block.first)
  const range = section && foldRange(state, section)
  if (!range || !isFolded(state, range.from)) return block
  return { ...block, last: state.doc.lineAt(range.to).number, folded: true }
}

function blockMenu(view, block, anchor, onClose) {
  const label = t(`block.${block.kind}`, {}, undefined)
  const isList = block.kind === 'list' || block.kind === 'numbered' || block.kind === 'task'
  openPopupMenu({
    view,
    anchor,
    label: t('block.actions'),
    className: 'block-handle-menu',
    onClose,
    build: (menu, { item, iconButton, grid, separator, close, submenu }) => {
      // The options every text block has: the block type first, then what is particular to this
      // block (heading level, alert type), then colors, indentation and the clipboard.
      if (TEXT_KINDS.has(block.kind)) {
        menu.append(
          grid(
            t('block.turnInto'),
            TURN_INTO_MENU.map((entry) =>
              iconButton(
                blockIconMarkup[menuKind(entry, block.kind)],
                t(`block.${entry}`),
                () => turnBlockInto(view, block, menuKind(entry, block.kind)),
                { current: isMenuEntryCurrent(entry, block.kind) },
              ),
            ),
            { caption: true },
          ),
        )
        if (/^h[1-6]$/.test(block.kind))
          menu.append(
            grid(
              t('block.headingLevel'),
              HEADING_LEVELS.map((level) =>
                iconButton(
                  blockIconMarkup[level],
                  t(`block.${level}`),
                  () => turnBlockInto(view, block, level),
                  { current: level === block.kind },
                ),
              ),
              { caption: true },
            ),
          )
        if (block.kind === 'callout') {
          const current = calloutTypeOf(view.state.doc, block)
          menu.append(
            grid(
              t('callout.type'),
              calloutTypes.map((type) =>
                iconButton(
                  calloutDot(type),
                  t(`callout.${type}`),
                  () => setCalloutType(view, block, type),
                  { current: type === current },
                ),
              ),
              { caption: true },
            ),
          )
        }
        menu.append(separator())
      }
      if (block.kind === 'columns') {
        // A columns layout: add a column, or turn the columns back into blocks one under another.
        const doc = view.state.doc
        const from = doc.line(block.first).from
        const edit = (next) => {
          if (next == null) return
          view.dispatch({
            changes: documentChanges(doc.toString(), next),
            userEvent: 'bloco',
            scrollIntoView: true,
          })
          view.focus()
        }
        menu.append(
          item(blockIconMarkup.add, t('columns.add'), () => edit(addColumn(doc.toString(), from))),
          item(blockIconMarkup.unwrap, t('columns.remove'), () =>
            edit(unwrapColumns(doc.toString(), from)),
          ),
          separator(),
        )
      } else
        menu.append(
          submenu(blockIconMarkup.palette, t('colors.title'), (panel) =>
            panel.append(
              colorPalettePanel({
                value: blockColorMetadata(view.state.doc.line(block.first).text) || {},
                onChange: (property, color) => {
                  close()
                  colorBlock(view, block, property, color)
                },
                onReset: () => {
                  close()
                  colorBlock(view, block, 'reset')
                },
              }),
            ),
          ),
          separator(),
        )
      if (isList) {
        const indent = (outdent) => () => {
          const doc = view.state.doc
          const from = doc.line(
            blockColorMetadata(doc.line(block.first).text) ? block.first + 2 : block.first,
          ).from
          const changes = listIndentChanges(doc.toString(), from, from, outdent)
          if (changes?.length) view.dispatch({ changes, userEvent: 'formatacao' })
          view.focus()
        }
        menu.append(
          item(blockIconMarkup.indent, t('block.indent'), indent(false)),
          item(blockIconMarkup.outdent, t('block.outdent'), indent(true)),
          separator(),
        )
      }
      menu.append(
        item(blockIconMarkup.cut, t('block.cut'), () => {
          copyBlock(view, block)
          deleteBlock(view, block)
        }),
        item(blockIconMarkup.copy, t('block.copy'), () => copyBlock(view, block)),
        item(blockIconMarkup.trash, t('block.delete'), () => deleteBlock(view, block)),
        separator(),
        item(blockIconMarkup.add, t('block.addBelow'), () => addBlockBelow(view, block.last)),
      )
      menu.dataset.kind = label
    },
  })
}

// One handle for the block under the pointer: the block type and a grip. A
// click opens the block menu; dragging moves the block (a folded heading
// takes its whole section along).
export const blockHandle = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.block = null
      this.menuOpen = false
      this.hideTimer = 0
      this.handle = document.createElement('button')
      this.handle.type = 'button'
      this.handle.className = 'cm-block-handle'
      this.handle.hidden = true
      this.handle.setAttribute('aria-haspopup', 'menu')
      this.handle.setAttribute('aria-expanded', 'false')
      view.dom.append(this.handle)
      this.move = (event) => this.track(event)
      this.leave = () => this.scheduleHide()
      this.keydown = () => !this.menuOpen && this.hide()
      this.down = (event) => this.press(event)
      this.handle.addEventListener('pointerdown', this.down)
      this.handle.addEventListener('mousedown', (event) => event.preventDefault())
      this.handle.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && this.block) {
          event.preventDefault()
          this.openMenu()
        }
      })
      const tip = () => {
        this.untip?.()
        if (!this.block || this.menuOpen || this.dragging) return
        this.untip = showTooltip(
          this.handle,
          t('block.handle', { block: t(`block.${this.block.kind}`) }),
          shortcutKeys('blockMenu'),
        )
      }
      const untip = () => {
        this.untip?.()
        this.untip = null
      }
      this.handle.addEventListener('mouseenter', tip)
      this.handle.addEventListener('focus', tip)
      this.handle.addEventListener('mouseleave', untip)
      this.handle.addEventListener('blur', untip)
      this.handle.addEventListener('pointerdown', untip)
      view.dom.addEventListener('mousemove', this.move)
      view.dom.addEventListener('mouseleave', this.leave)
      view.contentDOM.addEventListener('keydown', this.keydown)
    }
    update(update) {
      if (update.docChanged || update.geometryChanged || update.viewportChanged)
        if (!this.menuOpen) this.hide()
    }
    blockAt(clientY) {
      const { view } = this
      const content = view.contentDOM.getBoundingClientRect()
      if (clientY < content.top || clientY > content.bottom) return null
      const pos = view.posAtCoords({ x: content.left + 4, y: clientY }, false)
      const line = view.state.doc.lineAt(pos).number
      return blocksOf(view.state).find((block) => line >= block.first && line <= block.last) ?? null
    }
    track(event) {
      if (this.dragging || this.menuOpen || this.view.state.readOnly) return
      if (this.handle.contains(event.target)) return clearTimeout(this.hideTimer)
      // Tables have their own handle. Hovering inside a column still shows the parent
      // columns block handle on the outer left gutter.
      if (event.target.closest?.('.cm-md-table-row')) return this.hide()
      const lineElement = event.target.closest?.('.cm-line')
      const number =
        lineElement && this.view.contentDOM.contains(lineElement)
          ? this.view.state.doc.lineAt(this.view.posAtDOM(lineElement, 0)).number
          : null
      const block =
        number == null
          ? this.blockAt(event.clientY)
          : blocksOf(this.view.state).find((item) => number >= item.first && number <= item.last)
      if (!block || block.kind === 'table') return this.scheduleHide()
      clearTimeout(this.hideTimer)
      if (
        this.block?.first === block.first &&
        this.block.last === block.last &&
        !this.handle.hidden
      )
        return
      this.show(block)
    }
    show(block) {
      const { view } = this
      const line = view.state.doc.line(
        block.anchor ??
          (blockColorMetadata(view.state.doc.line(block.first).text)
            ? block.first + 2
            : block.first),
      )
      const coords = view.coordsAtPos(line.from, 1)
      if (!coords) return this.hide()
      const host = view.dom.getBoundingClientRect()
      const content = view.contentDOM.getBoundingClientRect()
      const style = getComputedStyle(view.dom)
      const offset = Number.parseFloat(style.getPropertyValue('--block-handle-offset'))
      const width = Number.parseFloat(style.getPropertyValue('--block-handle-width'))
      const height = Number.parseFloat(style.getPropertyValue('--block-handle-height'))
      const left = content.left - host.left - offset - width
      // In a column, the handle sits in the space beside the column.
      if (left < 0 && !view.state.facet(embeddedDocument)) return this.hide()
      const lineHeight = coords.bottom - coords.top
      this.block = block
      this.handle.innerHTML = `<span class="cm-block-handle-type">${blockIconMarkup[block.kind] ?? blockIconMarkup.other}</span>${gripMarkup}`
      const label = t('block.handle', { block: t(`block.${block.kind}`) })
      this.handle.setAttribute('aria-label', label)
      this.handle.removeAttribute('title')
      this.handle.dataset.kind = block.kind
      const topOffset =
        block.kind === 'columns' || lineHeight > height * 2 ? 0 : (lineHeight - height) / 2
      this.handle.style.left = `${left}px`
      this.handle.style.top = `${coords.top - host.top + topOffset}px`
      this.handle.hidden = false
      this.revealFold(line.from)
    }
    // A heading's fold arrow shows while the pointer is anywhere on its row,
    // also in the margins outside the text.
    revealFold(pos) {
      this.foldToggle?.classList.remove('is-line-hover')
      this.foldToggle = null
      if (pos == null) return
      const { node } = this.view.domAtPos(pos)
      const toggle = (node.nodeType === 1 ? node : node.parentElement)
        ?.closest('.cm-line')
        ?.querySelector('.cm-fold-toggle')
      if (!toggle) return
      toggle.classList.add('is-line-hover')
      this.foldToggle = toggle
    }
    scheduleHide() {
      if (this.menuOpen || this.dragging) return
      clearTimeout(this.hideTimer)
      this.hideTimer = setTimeout(() => this.hide(), 250)
    }
    hide() {
      clearTimeout(this.hideTimer)
      this.untip?.()
      this.untip = null
      this.handle.hidden = true
      this.block = null
      this.revealFold(null)
    }
    /** Opens the actions of the block holding the cursor (keyboard shortcut). */
    openMenuAtCursor() {
      const { view } = this
      if (view.state.readOnly) return false
      const line = view.state.doc.lineAt(view.state.selection.main.head).number
      const block = blocksOf(view.state).find((item) => line >= item.first && line <= item.last)
      if (!block || block.kind === 'table') return false
      this.show(block)
      if (this.handle.hidden) return false
      this.openMenu()
      return true
    }
    openMenu() {
      const block = this.block
      if (!block) return
      this.untip?.()
      this.untip = null
      this.menuOpen = true
      this.handle.classList.add('is-active')
      blockMenu(this.view, block, this.handle, () => {
        this.menuOpen = false
        this.handle.classList.remove('is-active')
        this.hide()
      })
    }
    press(event) {
      if (event.button !== 0 || !this.block) return
      event.preventDefault()
      const { view } = this
      const block = dragRange(view.state, this.block)
      const startX = event.clientX
      const startY = event.clientY
      const pointer = event.pointerId
      this.handle.setPointerCapture(pointer)
      let lifted = false
      let target = null
      const drop = document.querySelector('.cm-section-drop') ?? document.createElement('div')
      if (!drop.isConnected) {
        drop.className = 'cm-section-drop'
        document.body.append(drop)
      }
      const finish = () => {
        this.dragging = false
        drop.style.display = 'none'
        document.body.classList.remove('cm-section-dragging')
        this.handle.removeEventListener('pointermove', onMove)
        this.handle.removeEventListener('pointerup', onUp)
        this.handle.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey, true)
      }
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointer) return
        if (!lifted) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return
          lifted = true
          this.dragging = true
          document.body.classList.add('cm-section-dragging')
        }
        target = this.dropTarget(moveEvent.clientX, moveEvent.clientY, block, drop)
        const scroller = hostOf(view).parent.scrollDOM.getBoundingClientRect()
        if (moveEvent.clientY < Math.max(scroller.top, 0) + 40) window.scrollBy(0, -8)
        else if (moveEvent.clientY > Math.min(scroller.bottom, innerHeight) - 40)
          window.scrollBy(0, 8)
      }
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointer) return
        finish()
        if (!lifted) return this.openMenu()
        if (target == null) return this.hide()
        this.hide()
        if (target.kind !== 'move' || target.view !== view) return this.dropAcross(block, target)
        const result = moveBlockChanges(
          view.state.doc.toString(),
          block.first,
          block.last,
          target.before,
        )
        if (!result) return
        const changes = view.state.changes(result.changes)
        const anchor = changes.mapPos(result.insertAt, -1) + result.lead
        view.dispatch({ changes, selection: { anchor }, scrollIntoView: true, userEvent: 'secao' })
        if (block.folded) refoldAfterMove(view, anchor)
        view.focus()
      }
      const onCancel = () => {
        finish()
        this.hide()
      }
      const onKey = (keyEvent) => {
        if (keyEvent.key !== 'Escape') return
        keyEvent.preventDefault()
        keyEvent.stopPropagation()
        onCancel()
      }
      this.handle.addEventListener('pointermove', onMove)
      this.handle.addEventListener('pointerup', onUp)
      this.handle.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey, true)
    }
    /**
     * Where the dragged block would go for the pointer, and shows the drop line there:
     * `{ kind: 'move', view, before }` puts it above the line `before` of that editor (the note's
     * or a column's); `{ kind: 'side', view, block, side }` puts it beside a block, in columns.
     */
    dropTarget(clientX, clientY, dragged, drop) {
      const { parent } = hostOf(this.view)
      const view = viewAt(parent, clientX, clientY) ?? this.view
      const same = view === this.view
      const doc = view.state.doc
      const blocks = blocksOf(view.state).filter(
        (block) => !same || block.last < dragged.first || block.first > dragged.last,
      )
      const box = (block) => ({
        top: view.coordsAtPos(doc.line(block.anchor ?? block.first).from, 1)?.top ?? 0,
        bottom: view.coordsAtPos(doc.line(block.last).to, -1)?.bottom ?? 0,
      })
      const content = view.contentDOM.getBoundingClientRect()
      const show = (left, top, width, height, side) => {
        drop.style.display = 'block'
        drop.classList.toggle('is-side', side)
        drop.style.left = `${Math.round(left)}px`
        drop.style.top = `${Math.round(top)}px`
        drop.style.width = `${Math.round(width)}px`
        drop.style.height = side ? `${Math.round(height)}px` : ''
      }
      const cell = view === parent ? null : view.dom.closest('.cm-column-editor')
      const area = cell?.getBoundingClientRect() ?? content
      // Leave the center for vertical moves and the middle of an existing column for insertion.
      const edge = cell ? Math.min(28, area.width * 0.15) : Math.max(0, area.width / 2 - 2)
      const side =
        dragged.kind === 'columns'
          ? null
          : clientX > area.right - edge
            ? 'right'
            : clientX >= area.left && clientX < area.left + edge
              ? 'left'
              : null
      if (side) {
        const hovered = cell
          ? null
          : blocks.find((block) => {
              const { top, bottom } = box(block)
              return clientY >= top - 4 && clientY <= bottom + 4
            })
        if (cell || hovered) {
          const { top, bottom } = hovered ? box(hovered) : area
          show(side === 'right' ? area.right + 4 : area.left - 6, top, 2, bottom - top, true)
          return { kind: 'side', view, block: hovered, side }
        }
      }
      if (!blocks.length && same) {
        drop.style.display = 'none'
        return null
      }
      let before = doc.lines + 1
      let y = blocks.length ? box(blocks.at(-1)).bottom + 4 : content.top
      for (const block of blocks) {
        const { top, bottom } = box(block)
        if (clientY < (top + bottom) / 2) {
          before = block.first
          y = top - 6
          break
        }
      }
      // Next to itself, nothing moves.
      if (same && moveBlockChanges(doc.toString(), dragged.first, dragged.last, before) === null) {
        drop.style.display = 'none'
        return null
      }
      show(content.left, y - 1, content.width, 0, false)
      return { kind: 'move', view, before }
    }
    /** Drops the block in another editor of the note (a column or the note), or beside a block. */
    dropAcross(block, target) {
      const { parent } = hostOf(this.view)
      const text = parent.state.doc.toString()
      const source = noteRange(this.view, block)
      let next = null
      if (target.kind === 'move') {
        const { offset } = hostOf(target.view)
        const doc = target.view.state.doc
        const at = offset + (target.before <= doc.lines ? doc.line(target.before).from : doc.length)
        next = moveAcross(text, source, at)
      } else {
        const host = hostOf(target.view).host
        if (host) {
          // Beside a column: a new column next to it.
          const group = host.context.block
          const index = host.index + (target.side === 'right' ? 1 : 0)
          next = dropBeside(text, source, group, target.side, index)
        } else next = dropBeside(text, source, noteRange(parent, target.block), target.side)
      }
      if (next == null) return
      parent.dispatch({
        changes: documentChanges(text, next),
        userEvent: 'secao',
        scrollIntoView: true,
      })
      parent.focus()
    }
    destroy() {
      clearTimeout(this.hideTimer)
      this.untip?.()
      this.handle.remove()
      this.view.dom.removeEventListener('mousemove', this.move)
      this.view.dom.removeEventListener('mouseleave', this.leave)
      this.view.contentDOM.removeEventListener('keydown', this.keydown)
    }
  },
)

/** Opens the block actions menu for the block holding the cursor. */
export function openBlockMenu(view) {
  return view.plugin(blockHandle)?.openMenuAtCursor() ?? false
}
