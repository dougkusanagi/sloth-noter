import { colorPalettePanel } from './color-palette.js'
import { colorBlock } from './document-colors.js'
import { blockColorMetadata } from '../document-colors.js'
import { ViewPlugin } from '@codemirror/view'
import { t } from '../i18n.js'
import { documentBlocks, moveBlockChanges } from '../block-move.js'
import { headingSections } from '../sections.js'
import { foldRange, isFolded, refoldAfterMove } from './folding.js'
import { blockIconMarkup, gripMarkup } from './block-icons.js'
import { openPopupMenu } from './popup-menu.js'
import { TURN_INTO, addBlockBelow, copyBlock, deleteBlock, turnBlockInto } from './block-actions.js'
import { listIndentChanges } from '../list-indent.js'

const blocksByDoc = new WeakMap()
function blocksOf(doc) {
  let blocks = blocksByDoc.get(doc)
  if (!blocks) {
    blocks = documentBlocks(doc.toString())
    blocksByDoc.set(doc, blocks)
  }
  return blocks
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
  'code',
])
const HANDLE_WIDTH = 44

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
      )
      if (TEXT_KINDS.has(block.kind))
        menu.append(
          grid(
            t('block.turnInto'),
            TURN_INTO.map((kind) =>
              iconButton(
                blockIconMarkup[kind],
                t(`block.${kind}`),
                () => turnBlockInto(view, block, kind),
                {
                  current: kind === block.kind,
                },
              ),
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
      return (
        blocksOf(view.state.doc).find((block) => line >= block.first && line <= block.last) ?? null
      )
    }
    track(event) {
      if (this.dragging || this.menuOpen || this.view.state.readOnly) return
      if (this.handle.contains(event.target)) return clearTimeout(this.hideTimer)
      // Tables have their own handle, and widgets such as columns handle their own content.
      if (event.target.closest?.('.cm-md-table-row, .cm-columns, .cm-column-editor'))
        return this.hide()
      const lineElement = event.target.closest?.('.cm-line')
      const number =
        lineElement && this.view.contentDOM.contains(lineElement)
          ? this.view.state.doc.lineAt(this.view.posAtDOM(lineElement, 0)).number
          : null
      const block =
        number == null
          ? this.blockAt(event.clientY)
          : blocksOf(this.view.state.doc).find(
              (item) => number >= item.first && number <= item.last,
            )
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
        blockColorMetadata(view.state.doc.line(block.first).text) ? block.first + 2 : block.first,
      )
      const coords = view.coordsAtPos(line.from, 1)
      if (!coords) return this.hide()
      const host = view.dom.getBoundingClientRect()
      const content = view.contentDOM.getBoundingClientRect()
      const folded = block.kind.startsWith('h') && block.kind !== 'h1'
      // Headings keep room for their fold arrow between the handle and the text.
      const right = content.left - host.left - (folded ? 34 : 8)
      const left = right - HANDLE_WIDTH
      if (left < 0) return this.hide()
      const lineHeight = coords.bottom - coords.top
      this.block = block
      this.handle.innerHTML = `<span class="cm-block-handle-type">${blockIconMarkup[block.kind] ?? blockIconMarkup.other}</span>${gripMarkup}`
      const label = t('block.handle', { block: t(`block.${block.kind}`) })
      this.handle.setAttribute('aria-label', label)
      this.handle.title = label
      this.handle.dataset.kind = block.kind
      this.handle.style.left = `${left}px`
      this.handle.style.top = `${coords.top - host.top + (lineHeight - 26) / 2}px`
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
        ?.querySelector('.cm-fold-toggle:not(.cm-level-badge)')
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
      this.handle.hidden = true
      this.block = null
      this.revealFold(null)
    }
    openMenu() {
      const block = this.block
      if (!block) return
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
      const startY = event.clientY
      const pointer = event.pointerId
      this.handle.setPointerCapture(pointer)
      let lifted = false
      let before = null
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
          if (Math.abs(moveEvent.clientY - startY) < 4) return
          lifted = true
          this.dragging = true
          document.body.classList.add('cm-section-dragging')
        }
        before = this.dropTarget(moveEvent.clientY, block, drop)
        const scroller = view.scrollDOM.getBoundingClientRect()
        if (moveEvent.clientY < Math.max(scroller.top, 0) + 40) window.scrollBy(0, -8)
        else if (moveEvent.clientY > Math.min(scroller.bottom, innerHeight) - 40)
          window.scrollBy(0, 8)
      }
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointer) return
        finish()
        if (!lifted) return this.openMenu()
        if (before == null) return this.hide()
        const result = moveBlockChanges(view.state.doc.toString(), block.first, block.last, before)
        this.hide()
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
    /** Where the dragged block would go for the pointer, and shows the drop line there. */
    dropTarget(clientY, dragged, drop) {
      const { view } = this
      const doc = view.state.doc
      const blocks = blocksOf(doc).filter(
        (block) => block.last < dragged.first || block.first > dragged.last,
      )
      if (!blocks.length) return null
      const box = (block) => ({
        top: view.coordsAtPos(doc.line(block.first).from, 1)?.top ?? 0,
        bottom: view.coordsAtPos(doc.line(block.last).to, -1)?.bottom ?? 0,
      })
      let before = doc.lines + 1
      let y = box(blocks.at(-1)).bottom + 4
      for (const block of blocks) {
        const { top, bottom } = box(block)
        if (clientY < (top + bottom) / 2) {
          before = block.first
          y = top - 6
          break
        }
      }
      // Next to itself, nothing moves.
      const unchanged =
        moveBlockChanges(doc.toString(), dragged.first, dragged.last, before) === null
      const content = view.contentDOM.getBoundingClientRect()
      drop.style.display = unchanged ? 'none' : 'block'
      drop.style.left = `${content.left}px`
      drop.style.width = `${content.width}px`
      drop.style.top = `${Math.round(y) - 1}px`
      return unchanged ? null : before
    }
    destroy() {
      clearTimeout(this.hideTimer)
      this.handle.remove()
      this.view.dom.removeEventListener('mousemove', this.move)
      this.view.dom.removeEventListener('mouseleave', this.leave)
      this.view.contentDOM.removeEventListener('keydown', this.keydown)
    }
  },
)
