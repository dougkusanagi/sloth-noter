import { Fragment, useRef, useState } from 'react'
import { Ellipsis, ListChecks, Plus, Undo2 } from 'lucide-react'
import {
  BOARD_COLUMNS,
  addBoardTask,
  columnOf,
  dropCard,
  moveCardToLane,
  parseBoard,
  setCardStatus,
  setCardText,
} from '../task-board.js'
import { openTaskMenu } from '../editor/task-menu.js'
import { plain } from './tasks-library.jsx'
import { t } from '../i18n.js'

const CARD_TYPE = 'application/x-sloth-card'

/** Where a dragged card would land: a gap of the card's height. */
function Slot({ height }) {
  return <li className="board-drop-slot" aria-hidden="true" style={{ height: height ?? 40 }} />
}

/** Inline editor for a card's text: Enter saves, Shift+Enter is not a new line, Escape cancels. */
function CardEditor({ text, onSave, onCancel }) {
  const [value, setValue] = useState(text)
  const cancelled = useRef(false)
  return (
    <textarea
      className="board-card-input"
      autoFocus
      rows={Math.min(6, Math.max(1, Math.ceil(value.length / 32)))}
      aria-label={t('board.editLabel')}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value.replace(/\n/g, ' '))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          cancelled.current = true
          onCancel()
        }
      }}
      onBlur={() => !cancelled.current && onSave(value)}
    />
  )
}

/**
 * A note's tasks as a board (ADR 0006): columns are statuses, lanes are the H2 sections.
 * Every change rewrites the note text through `onChange`; `Desfazer` restores the previous text.
 */
export function TaskBoard({
  body,
  grouped,
  onGroupedChange,
  onChange,
  compact = false,
  readOnly = false,
}) {
  // On narrow screens (compact) one column shows at a time, picked by tabs; no dragging.
  const [tab, setTab] = useState('todo')
  const [history, setHistory] = useState([])
  const [adding, setAdding] = useState(null)
  // While dragging: the card being moved (hidden in place) and where it would land.
  const [drag, setDrag] = useState(null)
  const [drop, setDrop] = useState(null)
  const [editing, setEditing] = useState(null)
  const dragging = useRef(false)
  const bodyRef = useRef(body)
  bodyRef.current = body
  const { lanes } = parseBoard(body)
  const visibleColumns = compact ? [tab] : BOARD_COLUMNS
  const columnCount = (column) =>
    lanes.reduce(
      (sum, lane) => sum + lane.cards.filter((card) => columnOf(card.status) === column).length,
      0,
    )
  const shown = grouped
    ? lanes
    : [{ title: '', heading: -1, cards: lanes.flatMap((lane) => lane.cards) }]

  function apply(next) {
    if (next === bodyRef.current) return
    setHistory((previous) => [...previous.slice(-49), bodyRef.current])
    onChange(next)
  }
  function undo() {
    const previous = history.at(-1)
    if (previous === undefined) return
    setHistory(history.slice(0, -1))
    onChange(previous)
  }
  function moveCard(mark, column, laneTitle, before) {
    apply(
      dropCard(bodyRef.current, mark, {
        status: column,
        laneTitle: grouped ? laneTitle : undefined,
        before,
      }),
    )
  }
  function endDrag() {
    dragging.current = false
    setDrag(null)
    setDrop(null)
  }
  function saveText(card, text) {
    setEditing(null)
    if (text.trim() && text.trim() !== card.text.trim())
      apply(setCardText(bodyRef.current, card.mark, text))
  }
  function openMenu(card, x, y, opener) {
    openTaskMenu({
      x,
      y,
      current: card.status,
      restoreFocus: () => opener?.focus(),
      onSelect: (status) => apply(setCardStatus(bodyRef.current, card.mark, status)),
      extra: [
        ...(readOnly ? [] : [{ label: t('board.edit'), onSelect: () => setEditing(card.mark) }]),
        ...lanes
          .filter((lane) => lane.heading >= 0 || lane.title)
          .map((lane) => ({
            label: t('board.moveTo', { lane: lane.title || t('board.noSection') }),
            onSelect: () => apply(moveCardToLane(bodyRef.current, card.mark, lane.title)),
          })),
      ],
    })
  }
  function submit(event) {
    event.preventDefault()
    const text = new FormData(event.currentTarget).get('task')
    const lane = adding.laneTitle ?? lanes.at(-1)?.title ?? ''
    apply(addBoardTask(bodyRef.current, lane, adding.column, String(text)))
    setAdding(null)
  }
  const form = (laneTitle, column) =>
    adding && adding.column === column && adding.laneTitle === laneTitle ? (
      <form className="board-add-form" onSubmit={submit}>
        <input
          name="task"
          autoFocus
          aria-label={t('board.newTask')}
          placeholder={t('board.newTask')}
          onKeyDown={(event) => event.key === 'Escape' && setAdding(null)}
        />
        <button type="submit">{t('board.save')}</button>
        <button type="button" onClick={() => setAdding(null)}>
          {t('board.cancel')}
        </button>
      </form>
    ) : null

  return (
    <section
      className="task-board"
      data-compact={compact || undefined}
      data-dragging={drag ? '' : undefined}
      aria-label={t('board.label')}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDrop(null)
      }}
    >
      <div className="board-toolbar">
        <label className="tasks-filter">
          <input
            type="checkbox"
            className="switch small"
            checked={grouped}
            onChange={(event) => onGroupedChange(event.target.checked)}
          />
          {t('board.group')}
        </label>
        <button type="button" className="board-undo" disabled={!history.length} onClick={undo}>
          <Undo2 size={14} aria-hidden="true" />
          {t('board.undo')}
        </button>
      </div>
      {compact && (
        <div className="board-tabs" role="tablist" aria-label={t('board.columns')}>
          {BOARD_COLUMNS.map((column) => (
            <button
              key={column}
              type="button"
              role="tab"
              aria-selected={tab === column}
              data-column={column}
              onClick={() => setTab(column)}
            >
              {t(`task.status.${column}`)}
              <span className="count">{columnCount(column)}</span>
            </button>
          ))}
        </div>
      )}
      {shown.map((lane, laneIndex) => (
        <div className="board-lane" key={`${laneIndex}:${lane.title}`}>
          {grouped && (
            <h3 className="board-lane-title">
              {lane.title || t('board.noSection')}
              <span className="count">{lane.cards.length}</span>
            </h3>
          )}
          <div className="board-columns">
            {visibleColumns.map((column) => {
              const cards = lane.cards.filter((card) => columnOf(card.status) === column)
              const cell = `${laneIndex}:${column}`
              return (
                <div
                  className="board-column"
                  key={column}
                  data-column={column}
                  data-over={drop?.cell === cell || undefined}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes(CARD_TYPE)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    // Over the column but not over a card: the card goes to the end.
                    if (!event.target.closest('.board-card, .board-drop-slot'))
                      setDrop((current) =>
                        current?.cell === cell && current.before === null
                          ? current
                          : { cell, before: null },
                      )
                  }}
                  onDrop={(event) => {
                    const mark = Number(event.dataTransfer.getData(CARD_TYPE))
                    const before = drop?.cell === cell ? drop.before : null
                    endDrag()
                    if (!Number.isSafeInteger(mark)) return
                    event.preventDefault()
                    moveCard(mark, column, lane.title, before)
                  }}
                >
                  <header className="board-column-header">
                    <span>{t(`task.status.${column}`)}</span>
                    <span className="count">{cards.length}</span>
                    <button
                      type="button"
                      className="board-add"
                      aria-label={t('board.addIn', { column: t(`task.status.${column}`) })}
                      title={t('board.add')}
                      onClick={() =>
                        setAdding({
                          laneTitle: grouped ? lane.title : (lanes.at(-1)?.title ?? ''),
                          column,
                        })
                      }
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </header>
                  <ul className="board-cards">
                    {cards.map((card, index) => {
                      const label = plain(card.text)
                      const closed = card.children.filter(
                        (child) => child.status === 'done' || child.status === 'canceled',
                      ).length
                      const dragged = drag?.mark === card.mark
                      // The next card that is not the one being dragged.
                      const following = cards
                        .slice(index + 1)
                        .find((item) => item.mark !== drag?.mark)
                      return (
                        <Fragment key={card.mark}>
                          {drop?.cell === cell && drop.before === card.mark && (
                            <Slot height={drag?.height} />
                          )}
                          <li
                            className="board-card"
                            data-status={card.status}
                            data-dragged={dragged || undefined}
                            draggable={!compact && !readOnly && editing !== card.mark}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(CARD_TYPE, String(card.mark))
                              event.dataTransfer.effectAllowed = 'move'
                              const height = event.currentTarget.offsetHeight
                              // Hide the card only after the browser took its drag image.
                              dragging.current = true
                              requestAnimationFrame(
                                () => dragging.current && setDrag({ mark: card.mark, height }),
                              )
                            }}
                            onDragEnd={endDrag}
                            onDragOver={(event) => {
                              if (!event.dataTransfer.types.includes(CARD_TYPE) || dragged) return
                              event.preventDefault()
                              const box = event.currentTarget.getBoundingClientRect()
                              const before =
                                event.clientY < box.top + box.height / 2
                                  ? card.mark
                                  : (following?.mark ?? null)
                              setDrop((current) =>
                                current?.cell === cell && current.before === before
                                  ? current
                                  : { cell, before },
                              )
                            }}
                          >
                            {editing === card.mark ? (
                              <CardEditor
                                text={card.text}
                                onSave={(text) => saveText(card, text)}
                                onCancel={() => setEditing(null)}
                              />
                            ) : (
                              <button
                                type="button"
                                className="board-card-text"
                                data-empty={!label || undefined}
                                disabled={readOnly}
                                aria-label={t('board.editCard', {
                                  text: label || t('board.untitled'),
                                })}
                                onClick={() => setEditing(card.mark)}
                              >
                                {label || t('board.untitled')}
                              </button>
                            )}
                            {card.children.length > 0 && (
                              <span
                                className="board-card-sub"
                                data-complete={closed === card.children.length || undefined}
                                title={card.children.map((child) => plain(child.text)).join('\n')}
                              >
                                <ListChecks size={13} aria-hidden="true" />
                                {t('board.subtasks', {
                                  done: closed,
                                  total: card.children.length,
                                })}
                              </span>
                            )}
                            {editing !== card.mark && (
                              <button
                                type="button"
                                className="board-card-menu"
                                aria-label={t('board.cardActions', {
                                  text: label || t('board.untitled'),
                                })}
                                aria-haspopup="menu"
                                onClick={(event) => {
                                  const box = event.currentTarget.getBoundingClientRect()
                                  openMenu(card, box.left, box.bottom, event.currentTarget)
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault()
                                  openMenu(card, event.clientX, event.clientY, event.currentTarget)
                                }}
                              >
                                <Ellipsis size={16} aria-hidden="true" />
                              </button>
                            )}
                          </li>
                        </Fragment>
                      )
                    })}
                    {drop?.cell === cell && drop.before === null && <Slot height={drag?.height} />}
                  </ul>
                  {!cards.length && !adding && drop?.cell !== cell && (
                    <p className="board-none">{t('board.noCards')}</p>
                  )}
                  {form(grouped ? lane.title : (lanes.at(-1)?.title ?? ''), column)}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
