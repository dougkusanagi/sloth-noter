import { ViewPlugin } from '@codemirror/view'

let resizeId = 0

export function tableResize({ tableAt, setTableFlags }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        view.dom.dataset.resizeTables = String(++resizeId)
        this.sheet = document.createElement('style')
        document.head.append(this.sheet)
        this.hit = (event) => {
          const cell = event.target.closest?.('.cm-md-table-cell')
          const row = cell?.closest('.cm-md-table-row')
          if (!row || view.state.readOnly) return null
          const cells = [...row.querySelectorAll(':scope > .cm-md-table-cell')]
          const box = cell.getBoundingClientRect()
          const column = Number(cell.dataset.column)
          const index =
            Math.abs(event.clientX - box.right) <= 5
              ? column
              : column > 0 && Math.abs(event.clientX - box.left) <= 5
                ? column - 1
                : -1
          if (index < 0 || index >= cells.length - 1) return null
          const table = tableAt(
            view.state.doc,
            view.state.doc.lineAt(Number(row.dataset.table)).number,
          )
          if (!table) return null
          const scope = `[data-resize-tables="${view.dom.dataset.resizeTables}"] [data-table="${row.dataset.table}"]`
          return {
            table,
            row,
            scope,
            widths: cells.map((item) => item.getBoundingClientRect().width),
            index,
          }
        }
        this.show = (hit, widths) => {
          if (!hit) {
            this.sheet.textContent = ''
            return
          }
          const tracks = widths || hit.widths
          const boundary =
            (tracks.slice(0, hit.index + 1).reduce((sum, size) => sum + size, 0) /
              tracks.reduce((sum, size) => sum + size, 0)) *
            100
          this.sheet.textContent = `${hit.scope}::after { content:""; position:absolute; top:0; bottom:0; left:${boundary}%; width:2px; transform:translateX(-50%); background:var(--accent); pointer-events:none; z-index:4; } ${hit.scope}.cm-md-table-head::after { top:-14px; } ${widths == null ? '' : `${hit.scope}, ${hit.scope} .cm-md-table-column-controls { grid-template-columns:${widths.map((size) => `minmax(0, ${size}fr)`).join(' ')} !important; transition:none !important; }`}`
        }
        this.leave = () => {
          if (this.cancel) return
          this.show(null)
          view.contentDOM.style.cursor = ''
        }
        this.move = (event) => {
          if (this.cancel) return
          const hit = this.hit(event)
          this.show(hit)
          view.contentDOM.style.cursor = hit ? 'col-resize' : ''
        }
        this.down = (event) => {
          if (event.button !== 0) return
          const hit = this.hit(event)
          if (!hit) return
          event.preventDefault()
          event.stopImmediatePropagation()
          const doc = view.state.doc
          const widths = hit.widths.slice()
          const pair = widths[hit.index] + widths[hit.index + 1]
          const minimum = Math.min(48, pair / 3)
          let moved = false
          const move = (next) => {
            if (next.pointerId !== event.pointerId) return
            const delta = next.clientX - event.clientX
            if (!moved && Math.abs(delta) < 2) return
            moved = true
            widths[hit.index] = Math.max(
              minimum,
              Math.min(pair - minimum, hit.widths[hit.index] + delta),
            )
            widths[hit.index + 1] = pair - widths[hit.index]
            this.show(hit, widths)
            view.requestMeasure()
          }
          const finish = (commit) => {
            window.removeEventListener('pointermove', move, true)
            window.removeEventListener('pointerup', up, true)
            window.removeEventListener('pointercancel', cancel, true)
            window.removeEventListener('keydown', keydown, true)
            this.cancel = null
            this.leave()
            if (commit && moved && view.state.doc === doc)
              setTableFlags(view, hit.table.first, {
                widths: widths.map((size) => Math.max(1, Math.round(size))),
                heights: [],
              })
            view.requestMeasure()
          }
          const up = (next) => {
            if (next.pointerId === event.pointerId) finish(true)
          }
          const cancel = () => finish(false)
          const keydown = (next) => {
            if (next.key === 'Escape') {
              next.preventDefault()
              cancel()
            }
          }
          this.cancel = cancel
          this.show(hit)
          window.addEventListener('pointermove', move, true)
          window.addEventListener('pointerup', up, true)
          window.addEventListener('pointercancel', cancel, true)
          window.addEventListener('keydown', keydown, true)
        }
        view.dom.addEventListener('pointerleave', this.leave)
        view.scrollDOM.addEventListener('scroll', this.leave)
        view.dom.addEventListener('pointermove', this.move)
        view.dom.addEventListener('pointerdown', this.down, true)
      }
      destroy() {
        this.cancel?.()
        this.sheet.remove()
        this.view.contentDOM.style.cursor = ''
        this.view.dom.removeEventListener('pointerleave', this.leave)
        this.view.scrollDOM.removeEventListener('scroll', this.leave)
        this.view.dom.removeEventListener('pointermove', this.move)
        this.view.dom.removeEventListener('pointerdown', this.down, true)
      }
    },
  )
}
