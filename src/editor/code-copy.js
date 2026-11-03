import { Facet, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { markdownTree, walk } from '../markdown-model.js'
import { codeLanguageName } from '../syntax-highlight.js'
import { t } from '../i18n.js'
import { foldField } from './folding.js'

export const codeCopyHandler = Facet.define()
const toggleWrap = StateEffect.define({ map: (pos, changes) => changes.mapPos(pos) })
export const codeWrap = StateField.define({
  create: () => [],
  update(value, transaction) {
    let next = transaction.docChanged ? value.map((pos) => transaction.changes.mapPos(pos)) : value
    for (const effect of transaction.effects)
      if (effect.is(toggleWrap)) {
        next = next.includes(effect.value)
          ? next.filter((pos) => pos !== effect.value)
          : [...next, effect.value]
      }
    return next
  },
  provide: (field) =>
    EditorView.decorations.compute([field, 'doc'], (state) => {
      const ranges = []
      const selected = state.field(field)
      walk(markdownTree(state.doc.toString()), (node) => {
        if (
          node.type !== 'code' ||
          !selected.includes(state.doc.line(node.position.start.line).from)
        )
          return
        for (let number = node.position.start.line; number <= node.position.end.line; number++)
          ranges.push(
            Decoration.line({
              class: `cm-code-no-wrap${number === node.position.end.line ? ' cm-code-scrollbar' : ''}`,
            }).range(state.doc.line(number).from),
          )
      })
      return Decoration.set(ranges, true)
    }),
})

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
      this.schedule = () => {
        if (this.inlineButton) this.inlineButton.hidden = true
        view.requestMeasure({
          key: this,
          read: () => this.measure(),
          write: (positions) => this.position(positions),
        })
      }
      window.addEventListener('scroll', this.schedule, true)
      window.addEventListener('resize', this.schedule)
      this.inlineButton = new CodeCopyWidget('', '').toDOM(view)
      this.inlineButton.className = 'copy-inline-code cm-copy-inline-code'
      this.inlineButton.hidden = true
      this.layer.append(this.inlineButton)
      this.hover = (event) => {
        if (this.inlineButton.contains(event.target)) return
        const token = event.target.closest?.('.cm-md-inline-code')
        if (!token) {
          this.inlineButton.hidden = true
          return
        }
        const pos = view.posAtDOM(token)
        const node = this.inlineNodes.find(
          (node) => pos >= node.position.start.offset && pos < node.position.end.offset,
        )
        if (!node) return
        const button = new CodeCopyWidget(node.value, '').toDOM(view)
        button.className = 'copy-inline-code cm-copy-inline-code'
        this.inlineButton.replaceWith(button)
        this.inlineButton = button
        const rect = token.getBoundingClientRect()
        button.style.top = `${rect.top}px`
        button.style.left = `${Math.min(rect.right - 2, window.innerWidth - 28)}px`
      }
      this.leave = () => {
        this.inlineButton.hidden = true
      }
      view.dom.addEventListener('mouseover', this.hover)
      view.dom.addEventListener('mouseleave', this.leave)
      this.build()
      this.schedule()
    }
    build() {
      this.blocks = []
      this.layer.replaceChildren(this.inlineButton)
      this.inlineButton.hidden = true
      this.inlineNodes = []
      const doc = this.view.state.doc
      walk(markdownTree(doc.toString()), (node) => {
        if (node.type === 'inlineCode') this.inlineNodes.push(node)
        if (node.type !== 'code') return
        const first = doc.line(node.position.start.line)
        if (!/^\s{0,3}(`{3,}|~{3,})/.test(first.text)) return
        const button = new CodeCopyWidget(node.value, node.lang ?? '').toDOM(this.view)
        button.hidden = true
        const wrap = document.createElement('button')
        wrap.type = 'button'
        wrap.className = 'copy-code code-editor-wrap'
        wrap.setAttribute('aria-label', t('code.wrap'))
        wrap.title = t('code.wrap')
        wrap.setAttribute(
          'aria-pressed',
          String(!this.view.state.field(codeWrap).includes(first.from)),
        )
        wrap.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4"/><path d="m16 16-2 2 2 2M3 18h5"/></svg>'
        wrap.hidden = true
        wrap.addEventListener('mousedown', (event) => event.preventDefault())
        wrap.addEventListener('click', () =>
          this.view.dispatch({ effects: toggleWrap.of(first.from) }),
        )
        const scrollbar = document.createElement('div')
        scrollbar.className = 'code-block-scroll'
        scrollbar.setAttribute('role', 'region')
        scrollbar.setAttribute('aria-label', t('code.scroll'))
        scrollbar.tabIndex = 0
        const track = document.createElement('div')
        scrollbar.append(track)
        const block = {
          from: first.from,
          to: node.position.end.offset,
          button,
          wrap,
          scrollbar,
          track,
        }
        scrollbar.addEventListener('scroll', () => {
          for (const row of this.rows(block)) row.scrollLeft = scrollbar.scrollLeft
        })
        this.layer.append(button, wrap, scrollbar)
        this.blocks.push(block)
      })
    }
    rows(block) {
      const doc = this.view.state.doc
      const rows = []
      for (
        let number = doc.lineAt(block.from).number;
        number <= doc.lineAt(block.to).number;
        number++
      ) {
        const line = doc.line(number)
        const node = this.view.domAtPos(Math.min(line.to, line.from + 1)).node
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
        const row = element?.closest('.cm-line')
        if (row) rows.push(row)
      }
      return rows
    }
    measure() {
      const view = this.view
      const scroller = view.scrollDOM.getBoundingClientRect()
      const content = view.contentDOM.getBoundingClientRect()
      const headerBottom =
        document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0
      const top = Math.max(0, scroller.top, headerBottom) + 12
      const footerTop = document.querySelector('.document-info')?.getBoundingClientRect().top
      const bottom = Math.min(window.innerHeight, scroller.bottom, footerTop ?? Infinity)
      const folds = view.state.field(foldField, false)
      return this.blocks.map((block) => {
        const { from, to, button, wrap, scrollbar, track } = block
        let folded = false
        folds?.between(from, from, (a, b) => {
          if (a <= from && b > from) folded = true
        })
        const start = view.documentTop + view.lineBlockAt(from).top
        const end = view.documentTop + view.lineBlockAt(to).bottom
        const noWrap = view.state.field(codeWrap).includes(from)
        return {
          top: Math.min(Math.max(start + 12, top), end - 38),
          right: window.innerWidth - Math.min(content.right, scroller.right) + 10,
          visible: !folded && end > top + 26 && start + 38 < bottom,
          button,
          wrap,
          scrollbar,
          track,
          scrollWidth: noWrap ? Math.max(0, ...this.rows(block).map((row) => row.scrollWidth)) : 0,
          width: Math.min(content.right, scroller.right) - Math.max(content.left, scroller.left),
          left: Math.max(content.left, scroller.left),
          scrollTop: Math.min(end - 12, bottom - 12),
          scrollVisible: !folded && noWrap && end > top && start < bottom,
        }
      })
    }
    position(positions) {
      for (const {
        button,
        wrap,
        scrollbar,
        track,
        top,
        right,
        visible,
        scrollWidth,
        width,
        left,
        scrollTop,
        scrollVisible,
      } of positions) {
        button.hidden = !visible
        button.style.top = `${top}px`
        button.style.right = `${right}px`
        wrap.hidden = !visible
        wrap.style.top = `${top}px`
        wrap.style.right = `${right + button.offsetWidth + 8}px`
        scrollbar.hidden = !scrollVisible || scrollWidth <= width
        scrollbar.style.left = `${left}px`
        scrollbar.style.top = `${scrollTop}px`
        scrollbar.style.width = `${width}px`
        track.style.width = `${scrollWidth}px`
      }
    }
    update(update) {
      const wrapChanged = update.startState.field(codeWrap) !== update.state.field(codeWrap)
      if (update.docChanged || wrapChanged) this.build()
      const foldsChanged =
        update.startState.field(foldField, false) !== update.state.field(foldField, false)
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        foldsChanged ||
        wrapChanged
      )
        this.schedule()
    }
    destroy() {
      window.removeEventListener('scroll', this.schedule, true)
      window.removeEventListener('resize', this.schedule)
      this.view.dom.removeEventListener('mouseover', this.hover)
      this.view.dom.removeEventListener('mouseleave', this.leave)
      this.layer.remove()
    }
  },
)
