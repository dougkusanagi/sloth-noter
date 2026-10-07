import { Facet } from '@codemirror/state'
import { ViewPlugin, WidgetType } from '@codemirror/view'
import { markdownTree, walk } from '../markdown-model.js'
import { codeLanguageName } from '../syntax-highlight.js'
import { t } from '../i18n.js'

export const codeCopyHandler = Facet.define()

export class CodeCopyWidget extends WidgetType {
  constructor(source, language) {
    super()
    this.source = source
    this.language = language
  }
  eq(other) {
    return this.source === other.source && this.language === other.language
  }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-code'
    const language = codeLanguageName(this.language)
    button.setAttribute('aria-label', `${t('code.copy')}${language ? ` ${language}` : ''}`)
    button.title = button.getAttribute('aria-label')
    button.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    const label = document.createElement('span')
    label.textContent = language || t('code.copy')
    button.append(label)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      view.state.facet(codeCopyHandler)[0]?.(this.source)
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

export const stickyCodeCopy = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.layer = document.createElement('div')
      this.layer.className = 'code-copy-layer'
      this.layer.contentEditable = 'false'
      view.dom.append(this.layer)
      this.schedule = () =>
        view.requestMeasure({
          key: this,
          read: () => this.measure(),
          write: (positions) => this.position(positions),
        })
      window.addEventListener('scroll', this.schedule, true)
      window.addEventListener('resize', this.schedule)
      this.build()
      this.schedule()
    }
    build() {
      this.blocks = []
      this.layer.replaceChildren()
      const doc = this.view.state.doc
      walk(markdownTree(doc.toString()), (node) => {
        if (node.type !== 'code') return
        const first = doc.line(node.position.start.line)
        if (!/^\s{0,3}(`{3,}|~{3,})/.test(first.text)) return
        const button = new CodeCopyWidget(node.value, node.lang ?? '').toDOM(this.view)
        button.hidden = true
        this.layer.append(button)
        this.blocks.push({ from: first.from, to: node.position.end.offset, button })
      })
    }
    measure() {
      const view = this.view
      const scroller = view.scrollDOM.getBoundingClientRect()
      const content = view.contentDOM.getBoundingClientRect()
      const headerBottom =
        document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0
      const top = Math.max(0, scroller.top, headerBottom) + 12
      const bottom = Math.min(window.innerHeight, scroller.bottom)
      return this.blocks.map(({ from, to, button }) => {
        const start = view.documentTop + view.lineBlockAt(from).top
        const end = view.documentTop + view.lineBlockAt(to).bottom
        return {
          top: Math.min(Math.max(start + 12, top), end - 38),
          right: window.innerWidth - Math.min(content.right, scroller.right) + 10,
          visible: end > top + 26 && start < bottom - 12,
          button,
        }
      })
    }
    position(positions) {
      for (const { button, top, right, visible } of positions) {
        button.hidden = !visible
        button.style.top = `${top}px`
        button.style.right = `${right}px`
      }
    }
    update(update) {
      if (update.docChanged) this.build()
      if (update.docChanged || update.viewportChanged || update.geometryChanged) this.schedule()
    }
    destroy() {
      window.removeEventListener('scroll', this.schedule, true)
      window.removeEventListener('resize', this.schedule)
      this.layer.remove()
    }
  },
)
