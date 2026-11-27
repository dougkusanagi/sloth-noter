import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Undo2 } from 'lucide-react'
import { blockIconMarkup } from '../editor/block-icons.js'
import { t } from '../i18n.js'
import { moveBlockTo, reorderItems } from './reorder-blocks.js'
import { triggerHaptic } from './haptics.js'

const EDGE = 56

const kindLabel = (kind) => {
  const key = `block.${kind}`
  const label = t(key)
  return label === key ? t('block.p') : label
}

/**
 * Reorder mode for touch screens: each block of the note is a card. Drag a card by its
 * handle, or use the arrow buttons; every move is saved at once and can be undone here.
 */
export function BlockReorder({ body, disabled, onChange, scroller }) {
  const items = reorderItems(body)
  const [drag, setDrag] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [history, setHistory] = useState([])
  const list = useRef(null)
  const state = useRef(null)
  const focusNext = useRef(null)

  useEffect(() => {
    const pending = focusNext.current
    if (!pending) return
    focusNext.current = null
    const row = list.current?.children[pending.index]
    const target =
      row?.querySelector(`[data-move="${pending.direction}"]:not(:disabled)`) ??
      row?.querySelector('[data-move]:not(:disabled)')
    target?.focus()
    row?.scrollIntoView({ block: 'nearest' })
  })

  function move(from, to, direction) {
    const next = moveBlockTo(body, from, to)
    if (next === null) return
    setHistory((previous) => [...previous.slice(-49), body])
    onChange(next)
    triggerHaptic('heading')
    setAnnounce(t('mobile.reorderMoved', { position: to + 1, total: items.length }))
    if (direction) focusNext.current = { index: to, direction }
  }

  function undo() {
    const previous = history.at(-1)
    if (previous === undefined) return
    setHistory((stack) => stack.slice(0, -1))
    onChange(previous)
    setAnnounce(t('mobile.reorderUndone'))
  }

  function start(event, index) {
    if (disabled || event.button > 0) return
    event.preventDefault()
    const rows = [...list.current.children].map((row) => row.getBoundingClientRect())
    const container = scroller?.current
    state.current = {
      from: index,
      over: index,
      y: event.clientY,
      scroll: container?.scrollTop ?? 0,
      rows,
      height: rows[index].height + 8,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic pointer */
    }
    triggerHaptic('heading')
    setDrag({ from: index, over: index, dy: 0, height: state.current.height })
  }

  function update(event) {
    const current = state.current
    if (!current) return
    const container = scroller?.current
    if (container) {
      const box = container.getBoundingClientRect()
      if (event.clientY < box.top + EDGE) container.scrollTop -= 10
      else if (event.clientY > box.bottom - EDGE) container.scrollTop += 10
    }
    const dy = event.clientY - current.y + ((container?.scrollTop ?? 0) - current.scroll)
    const origin = current.rows[current.from]
    const center = origin.top + origin.height / 2 + dy
    let over = current.from
    current.rows.forEach((row, index) => {
      const middle = row.top + row.height / 2
      if (index > current.from && center > middle) over = index
      if (index < current.from && center < middle && over >= current.from) over = index
    })
    if (over !== current.over) triggerHaptic('heading')
    current.over = over
    setDrag({ from: current.from, over, dy, height: current.height })
  }

  function finish(event, cancelled) {
    const current = state.current
    state.current = null
    setDrag(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    if (!cancelled && current && current.over !== current.from) move(current.from, current.over)
  }

  const shift = (index) => {
    if (!drag || index === drag.from) return 0
    if (drag.from < index && index <= drag.over) return -drag.height
    if (drag.over <= index && index < drag.from) return drag.height
    return 0
  }

  if (!items.length) return <p className="mobile-empty">{t('mobile.reorderEmpty')}</p>
  return (
    <div className="mobile-reorder">
      <div className="mobile-reorder-bar">
        <p className="settings-note">{t('mobile.reorderHint')}</p>
        <button
          type="button"
          className="mobile-reorder-undo"
          disabled={disabled || !history.length}
          onClick={undo}
        >
          <Undo2 size={18} aria-hidden="true" />
          {t('mobile.undo')}
        </button>
      </div>
      <ol className="mobile-reorder-list" ref={list} data-dragging={drag ? '' : undefined}>
        {items.map((item, index) => (
          <li
            key={`${index}:${item.first}`}
            className="mobile-reorder-item"
            data-kind={item.kind}
            data-lifted={drag?.from === index || undefined}
            style={{
              transform:
                drag?.from === index
                  ? `translateY(${drag.dy}px)`
                  : shift(index)
                    ? `translateY(${shift(index)}px)`
                    : undefined,
            }}
          >
            <span
              className="mobile-reorder-grip"
              role="presentation"
              onPointerDown={(event) => start(event, index)}
              onPointerMove={update}
              onPointerUp={(event) => finish(event, false)}
              onPointerCancel={(event) => finish(event, true)}
            >
              <GripVertical size={20} aria-hidden="true" />
            </span>
            <span
              className="mobile-reorder-icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: blockIconMarkup[item.kind] ?? blockIconMarkup.other,
              }}
            />
            <span className="mobile-reorder-text" data-done={item.done || undefined}>
              <span className="mobile-reorder-label">{item.label || kindLabel(item.kind)}</span>
              {item.lines > 1 && (
                <span className="mobile-reorder-meta">
                  {t('mobile.reorderLines', { count: item.lines })}
                </span>
              )}
            </span>
            <button
              type="button"
              className="mobile-icon"
              data-move="up"
              disabled={disabled || index === 0}
              aria-label={`${t('mobile.moveUp')}: ${item.label || kindLabel(item.kind)}`}
              onClick={() => move(index, index - 1, 'up')}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mobile-icon"
              data-move="down"
              disabled={disabled || index === items.length - 1}
              aria-label={`${t('mobile.moveDown')}: ${item.label || kindLabel(item.kind)}`}
              onClick={() => move(index, index + 1, 'down')}
            >
              <ArrowDown size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}
