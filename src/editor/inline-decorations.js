import { Decoration, WidgetType } from '@codemirror/view'
import { inlineSyntax } from '../live-markdown.js'
import { safeHref } from '../markdown.jsx'
import { resolveImage } from '../images.js'
import { openImageLightbox } from '../image-lightbox.js'
import { t } from '../i18n.js'

class InlineImageWidget extends WidgetType {
  constructor(src, alt = '', title = '') {
    super()
    this.src = src
    this.alt = alt
    this.title = title
  }
  eq(other) {
    return this.src === other.src && this.alt === other.alt && this.title === other.title
  }
  toDOM() {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-inline-image-thumb'
    const label = this.title || this.alt || t('images.zoom')
    button.title = label
    button.setAttribute('aria-label', `${t('images.zoom')}: ${label}`)

    let resolvedSrc = null
    const img = document.createElement('img')
    img.className = 'cm-inline-image-thumb-img'
    img.alt = this.alt

    const showFallback = () => {
      img.remove()
      const badge = document.createElement('span')
      badge.className = 'cm-inline-image-thumb-fallback'
      badge.textContent = this.alt || t('images.unavailable')
      button.append(badge)
    }

    img.addEventListener('error', showFallback, { once: true })
    button.append(img)

    resolveImage(this.src).then(
      (url) => {
        if (url) {
          resolvedSrc = url
          img.src = url
        } else {
          showFallback()
        }
      },
      showFallback,
    )

    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (resolvedSrc) openImageLightbox({ src: resolvedSrc, alt: this.alt, title: this.title })
    })

    return button
  }
  ignoreEvent(event) {
    return (
      event.type === 'mousedown' ||
      event.type === 'click' ||
      event.type === 'pointerdown' ||
      event.type === 'touchstart'
    )
  }
}

export function addInlineRangeDecorations(
  ranges,
  line,
  from,
  to,
  editing,
  linksOnly = false,
  selection = null,
) {
  for (const token of inlineSyntax(line.text.slice(from, to), line.definitions ?? '')) {
    const start = line.from + from + token.start,
      end = line.from + from + token.end
    const contentStart = line.from + from + token.contentStart,
      contentEnd = line.from + from + token.contentEnd
    if (token.kind === 'image') {
      const standalone = start === line.from && end === line.to
      if (standalone) {
        if (editing) {
          ranges.push(Decoration.mark({ class: 'cm-md-link-source' }).range(start, end))
        }
        continue
      }
      const cursorInside =
        editing &&
        selection &&
        ((selection.empty && selection.from > start && selection.from < end) ||
          (!selection.empty && selection.from < end && selection.to > start))
      if (cursorInside) {
        ranges.push(Decoration.mark({ class: 'cm-md-link-source' }).range(start, end))
      } else {
        ranges.push(
          Decoration.replace({
            widget: new InlineImageWidget(token.src, token.alt, token.title),
          }).range(start, end),
        )
      }
      continue
    }
    const editingToken = editing && (!linksOnly || token.kind === 'wiki' || token.kind === 'link')
    if (!editingToken) {
      if (start < contentStart) ranges.push(Decoration.replace({}).range(start, contentStart))
      if (contentEnd < end) ranges.push(Decoration.replace({}).range(contentEnd, end))
    }
    if (contentEnd <= contentStart) continue
    if (editingToken && (token.kind === 'wiki' || token.kind === 'link')) {
      ranges.push(Decoration.mark({ class: 'cm-md-link-source' }).range(contentStart, contentEnd))
    } else if (token.kind === 'wiki') {
      ranges.push(
        Decoration.mark({
          class: 'cm-md-inline-link cm-md-wiki',
          attributes: { 'data-wiki': token.target, title: t('wiki.open', { name: token.label }) },
        }).range(contentStart, contentEnd),
      )
    } else if (token.kind === 'link') {
      const href = safeHref(token.href ?? '')
      ranges.push(
        Decoration.mark({
          class: 'cm-md-inline-link',
          attributes: { title: 'Ctrl + clique · Abrir link ↗', 'data-href': href ?? '' },
        }).range(contentStart, contentEnd),
      )
    } else
      ranges.push(
        Decoration.mark({ class: `cm-md-inline-${token.kind}` }).range(contentStart, contentEnd),
      )
  }
}

export function addInlineDecorations(ranges, line, shape, editing, selection = null) {
  addInlineRangeDecorations(ranges, line, shape.prefix, line.text.length, editing, false, selection)
}
