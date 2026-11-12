import { applyDocumentColors } from '../document-colors.js'
import { openExternalLink } from '../external-links.js'
import { WidgetType } from '@codemirror/view'
import { markdownTree, walk, wikiParts } from '../markdown-model.js'
import { safeHref } from '../markdown.jsx'
import { resolveImage } from '../images.js'
import { t } from '../i18n.js'

function cellBlockSource(source) {
  const breaks = []
  walk(markdownTree(source), (node) => {
    if (node.type === 'html' && /^<br\s*\/?\s*>$/i.test(node.value)) breaks.push(node.position)
  })
  const originalOffset = (offset) => {
    let removed = 0
    for (const position of breaks) {
      const start = position.start.offset - removed
      if (offset <= start) break
      removed += position.end.offset - position.start.offset - 1
    }
    return offset + removed
  }
  for (const position of [...breaks].reverse())
    source = source.slice(0, position.start.offset) + '\n' + source.slice(position.end.offset)
  return { source, originalOffset }
}

// Plain text with [[wiki links]] as links to other notes.
function wikiText(value) {
  if (!value.includes('[[')) return document.createTextNode(value)
  const fragment = document.createDocumentFragment()
  let last = 0
  for (const match of value.matchAll(/\[\[([^[\]]+)\]\]/g)) {
    fragment.append(value.slice(last, match.index))
    const link = document.createElement('span')
    const { label } = wikiParts(match[1])
    link.className = 'cm-md-inline-link cm-md-wiki'
    link.dataset.wiki = match[1]
    link.title = t('wiki.open', { name: label })
    link.textContent = label
    fragment.append(link)
    last = match.index + match[0].length
  }
  fragment.append(value.slice(last))
  return fragment
}

// Renders a cell's Markdown: inline formatting, lists, tasks, quotes, images
// and links. Task checkboxes change the note; links open with Ctrl or Cmd, so
// a plain click only selects the cell.
export function renderCellContent(view, source, from, readOnly) {
  const block = cellBlockSource(source)
  const render = (node) => {
    if (node.type === 'text') return wikiText(node.value)
    const tags = {
      root: 'div',
      paragraph: 'p',
      strong: 'strong',
      emphasis: 'em',
      delete: 'del',
      inlineCode: 'code',
      blockquote: 'blockquote',
      code: 'pre',
      break: 'br',
      listItem: 'li',
    }
    let tag = tags[node.type] || 'span'
    if (node.type === 'heading') tag = `h${node.depth}`
    if (node.type === 'list') tag = node.ordered ? 'ol' : 'ul'
    if (node.type === 'link') tag = 'a'
    if (node.type === 'image') tag = 'img'
    const dom = document.createElement(tag)
    if (node.data?.hProperties?.style) dom.style.cssText = node.data.hProperties.style
    if (node.type === 'list' && node.ordered && node.start != null) dom.start = node.start
    if (node.type === 'link') {
      const href = safeHref(node.url)
      if (href) {
        dom.href = href
        dom.dataset.href = href
        dom.className = 'cm-md-inline-link'
        dom.title = readOnly ? href : t('table.linkHint')
        dom.addEventListener('click', (event) => {
          event.preventDefault()
          if (readOnly || event.ctrlKey || event.metaKey) openExternalLink(href).catch(() => {})
        })
      }
    }
    if (node.type === 'image') {
      dom.alt = node.alt || ''
      resolveImage(node.url)
        .then((url) => {
          if (url) {
            dom.src = url
            view.requestMeasure()
          }
        })
        .catch(() => {})
    }
    if (node.type === 'listItem' && node.checked != null) {
      dom.className = `cm-table-task-item${node.checked ? ' is-done' : ''}`
      const start = block.originalOffset(node.position.start.offset)
      const match = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/.exec(source.slice(start))
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.className = 'task-checkbox cm-table-task'
      input.checked = node.checked
      input.disabled = readOnly || !match
      const caption = (item) => item.value ?? (item.children ?? []).map(caption).join('')
      input.setAttribute('aria-label', caption(node) || t('table.task'))
      input.addEventListener('change', () => {
        if (view.state.readOnly || !match) return
        const at = from + start + match[0].lastIndexOf('[') + 1
        view.dispatch({
          changes: { from: at, to: at + 1, insert: input.checked ? 'x' : ' ' },
          userEvent: 'tarefa',
        })
      })
      dom.append(input)
    }
    if (node.value) dom.append(document.createTextNode(node.value))
    for (const child of node.children || []) dom.append(render(child))
    return dom
  }
  return render(applyDocumentColors(structuredClone(markdownTree(block.source))))
}

const setAttributes = (dom, attributes) => {
  for (const name of [...dom.getAttributeNames()])
    if (!(name in attributes) && name !== 'contenteditable') dom.removeAttribute(name)
  for (const [key, value] of Object.entries(attributes)) dom.setAttribute(key, value)
}

// One table cell, drawn as a single grid item. Selection changes only update
// its attributes, so a checkbox or a double click keeps the same element.
export class SheetCell extends WidgetType {
  constructor({ source, from, attributes, readOnly, result = null }) {
    super()
    Object.assign(this, { source, from, attributes, readOnly, result })
  }
  sameContent(other) {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.readOnly === other.readOnly &&
      this.result === other.result
    )
  }
  eq(other) {
    return (
      this.sameContent(other) &&
      JSON.stringify(this.attributes) === JSON.stringify(other.attributes)
    )
  }
  fill(view, cell) {
    cell.replaceChildren()
    if (this.result != null) {
      const value = document.createElement('span')
      value.className = 'cm-table-formula-value'
      value.textContent = this.result
      cell.append(value)
    } else if (this.source)
      cell.append(renderCellContent(view, this.source, this.from, this.readOnly))
  }
  toDOM(view) {
    const cell = document.createElement('span')
    setAttributes(cell, this.attributes)
    cell.contentEditable = 'false'
    this.fill(view, cell)
    cell.sheetWidget = this
    return cell
  }
  updateDOM(dom, view) {
    const previous = dom.sheetWidget
    setAttributes(dom, this.attributes)
    if (!previous || !this.sameContent(previous)) this.fill(view, dom)
    dom.sheetWidget = this
    return true
  }
  ignoreEvent() {
    return false
  }
}
