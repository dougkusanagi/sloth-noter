import { WidgetType } from '@codemirror/view'
import { headingSections } from '../sections.js'
import { moveSectionTo } from '../section-move.js'
import { foldRange, isFolded, refoldAfterMove } from './folding.js'
import { t } from '../i18n.js'

const grip =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<circle cx="5.5" cy="3.5" r="1.4"/><circle cx="10.5" cy="3.5" r="1.4"/>' +
  '<circle cx="5.5" cy="8" r="1.4"/><circle cx="10.5" cy="8" r="1.4"/>' +
  '<circle cx="5.5" cy="12.5" r="1.4"/><circle cx="10.5" cy="12.5" r="1.4"/></svg>'

let dropLine = null
let dragging = null

export class SectionGripWidget extends WidgetType {
  constructor(line, level) {
    super()
    this.line = line
    this.level = level
  }
  eq(other) {
    return other.line === this.line && other.level === this.level
  }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-drag-handle'
    button.dataset.level = String(this.level)
    button.setAttribute('aria-label', t('section.drag'))
    button.title = t('section.drag')
    button.innerHTML = grip
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('pointerdown', (event) => {
      if (event.button >= 0 && event.button !== 0) return
      startDrag(view, this.line, event)
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

/** Insertion slot (among the other siblings) for a pointer's document line. */
function slotForLine(doc, others, pointerLine) {
  let slot = 0
  while (slot < others.length) {
    const other = others[slot]
    if (pointerLine <= other.line) return slot
    if (pointerLine <= other.end) return slot + 1
    slot++
  }
  return slot
}

/** Vertical position, in view coordinates, where the drop line belongs. */
function boundaryY(doc, view, others, slot) {
  if (slot === 0) return view.coordsAtPos(doc.line(others[0].line).from).top
  if (slot === others.length)
    return view.coordsAtPos(doc.line(others[others.length - 1].end).to).bottom
  const after = view.coordsAtPos(doc.line(others[slot - 1].end).to).bottom
  const before = view.coordsAtPos(doc.line(others[slot].line).from).top
  return (after + before) / 2
}

function startDrag(view, line, event) {
  if (dragging || !view.dom) return
  const doc = view.state.doc
  const self = headingSections(doc.toString()).find((heading) => heading.line === line)
  if (!self || self.level < 1) return
  const siblings = headingSections(doc.toString()).filter((heading) => heading.level === self.level)
  if (siblings.length < 2) return
  const index = siblings.findIndex((heading) => heading.line === self.line)
  dragging = true
  const others = siblings.filter((heading) => heading.line !== self.line)

  event.preventDefault()
  const button = event.currentTarget
  button.setPointerCapture(event.pointerId)
  const startY = event.clientY
  let lifted = false
  let slot = -1

  if (!dropLine) {
    dropLine = document.createElement('div')
    dropLine.className = 'cm-section-drop'
    document.body.appendChild(dropLine)
  }
  const { node } = view.domAtPos(Math.min(doc.line(self.line).from + 1, doc.length))
  const lineEl = node instanceof Element ? node : node.parentElement
  const draggedLine = lineEl?.closest('.cm-line')

  const showIndicator = (y) => {
    dropLine.style.display = 'block'
    const contentBox = view.contentDOM.getBoundingClientRect()
    dropLine.style.left = `${contentBox.left}px`
    dropLine.style.width = `${contentBox.width}px`
    dropLine.style.top = `${Math.round(y) - 1}px`
  }

  const cleanup = () => {
    if (draggedLine?.isConnected) draggedLine.classList.remove('cm-dragging-line')
    dropLine.style.display = 'none'
    document.body.classList.remove('cm-section-dragging')
    button.removeEventListener('pointermove', onMove)
    button.removeEventListener('pointerup', onUp)
    button.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKeyDown)
    dragging = null
  }

  const commit = () => {
    cleanup()
    if (!lifted) return
    const absolute = slot
    if (absolute === index) return
    const text = view.state.doc.toString()
    const anchorLine = doc.line(self.line).number
    const section = headingSections(text).find((heading) => heading.line === anchorLine)
    const range = section && foldRange(view.state, section)
    const folded = range && isFolded(view.state, range.from)
    const moved = moveSectionTo(text, self.line, absolute)
    if (moved?.changes.length) {
      view.dispatch({
        changes: moved.changes,
        selection: { anchor: moved.anchor },
        scrollIntoView: true,
        userEvent: 'secao',
      })
      if (folded) refoldAfterMove(view, moved.anchor)
    }
  }

  const onMove = (moveEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return
    if (!lifted) {
      if (Math.abs(moveEvent.clientY - startY) < 4) return
      lifted = true
      document.body.classList.add('cm-section-dragging')
      draggedLine?.classList.add('cm-dragging-line')
    }
    // The pointer decides by which document line it hovers over. The position
    // comes from the real DOM (posAtDOM), because CodeMirror's cached measures
    // can lag font loading and skew posAtCoords here.
    const contentLeft = view.contentDOM.getBoundingClientRect().left + 2
    const under = document
      .elementsFromPoint(contentLeft, moveEvent.clientY)
      .find((element) => element.closest?.('.cm-line'))
    const lineEl = under?.closest('.cm-line')
    let pos = null
    if (lineEl && view.dom.contains(lineEl)) {
      try {
        pos = view.posAtDOM(lineEl, 0)
      } catch {
        pos = null
      }
    }
    slot =
      pos === null
        ? moveEvent.clientY > view.scrollDOM.getBoundingClientRect().bottom
          ? others.length
          : index
        : slotForLine(doc, others, doc.lineAt(Math.min(pos, doc.length)).number)
    // Keep dragging into view when the pointer nears the scroller edges.
    const scroller = view.scrollDOM.getBoundingClientRect()
    if (moveEvent.clientY < scroller.top + 40) view.scrollDOM.scrollTop -= 6
    else if (moveEvent.clientY > scroller.bottom - 40) view.scrollDOM.scrollTop += 6
    if (slot === index) dropLine.style.display = 'none'
    else showIndicator(boundaryY(doc, view, others, slot))
  }

  const onKeyDown = (keyEvent) => {
    if (keyEvent.key !== 'Escape') return
    keyEvent.preventDefault()
    cancel()
  }

  const cancel = () => {
    cleanup()
  }

  const onUp = (upEvent) => {
    if (upEvent.pointerId !== event.pointerId) return
    commit()
  }

  button.addEventListener('pointermove', onMove)
  button.addEventListener('pointerup', onUp)
  button.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKeyDown)
}
