import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { t } from '../i18n.js'

// Finds text in the rendered reading view. Ranges are selected one at a time, so the
// match is highlighted by the system without opening the keyboard or changing the note.
function collectRanges(root, query) {
  const needle = query.toLocaleLowerCase()
  const ranges = []
  if (!root || !needle) return ranges
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.toLocaleLowerCase()
    if (text.length !== node.nodeValue.length) continue
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      ranges.push(range)
    }
  }
  return ranges
}

export function ReadingFind({ container, version, onClose }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)
  const ranges = useRef([])
  const input = useRef(null)

  useEffect(() => {
    // The closing sheet returns focus to its trigger; focus the field after that.
    const timer = setTimeout(() => input.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    ranges.current = collectRanges(container.current, query)
    setCount(ranges.current.length)
    setIndex(0)
  }, [container, query, version])
  useEffect(() => {
    const range = ranges.current[index]
    const selection = window.getSelection()
    selection?.removeAllRanges()
    if (!range) return
    selection?.addRange(range)
    range.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }, [index, count, query])
  useEffect(() => () => window.getSelection()?.removeAllRanges(), [])

  const step = (delta) => count && setIndex((index + delta + count) % count)
  return (
    <div className="mobile-find" role="search">
      <input
        ref={input}
        type="search"
        value={query}
        aria-label={t('find.label')}
        placeholder={t('find.label')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            step(event.shiftKey ? -1 : 1)
          }
        }}
      />
      <output aria-live="polite">
        {query ? (count ? `${index + 1}/${count}` : t('find.none')) : ''}
      </output>
      <button
        className="mobile-icon"
        aria-label={t('mobile.findPrevious')}
        onClick={() => step(-1)}
      >
        <ChevronUp size={20} />
      </button>
      <button className="mobile-icon" aria-label={t('mobile.findNext')} onClick={() => step(1)}>
        <ChevronDown size={20} />
      </button>
      <button className="mobile-icon" aria-label={t('dialog.close')} onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  )
}
