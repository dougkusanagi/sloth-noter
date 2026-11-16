import { useRef, useState } from 'react'
import { Ellipsis, Plus, Undo2 } from 'lucide-react'
import {
  BOARD_COLUMNS,
  addBoardTask,
  columnOf,
  moveCardToLane,
  parseBoard,
  setCardStatus,
} from '../task-board.js'
import { openTaskMenu } from '../editor/task-menu.js'
import { plain } from './tasks-library.jsx'
import { t } from '../i18n.js'

const CARD_TYPE = 'application/x-sloth-card'

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
  const [over, setOver] = useState(null)
  const bodyRef = useRef(body)
  bodyRef.current = body
  const { lanes } = parseBoard(body)
  const total = lanes.reduce((sum, lane) => sum + lane.cards.length, 0)
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
  function moveCard(mark, column, laneTitle) {
    const parsed = parseBoard(bodyRef.current).lanes
    const lane = parsed.find((entry) => entry.cards.some((item) => item.mark === mark))
    const card = lane?.cards.find((item) => item.mark === mark)
    if (!card) return
    let next = bodyRef.current
    if (columnOf(card.status) !== column) next = setCardStatus(next, mark, column)
    if (grouped && lane.title !== laneTitle) next = moveCardToLane(next, mark, laneTitle)
    apply(next)
  }
  function openMenu(card, x, y, opener) {
    openTaskMenu({
      x,
      y,
      current: card.status,
      restoreFocus: () => opener?.focus(),
      onSelect: (status) => apply(setCardStatus(bodyRef.current, card.mark, status)),
      extra: lanes
        .filter((lane) => lane.heading >= 0 || lane.title)
        .map((lane) => ({
          label: t('board.moveTo', { lane: lane.title || t('board.noSection') }),
          onSelect: () => apply(moveCardToLane(bodyRef.current, card.mark, lane.title)),
        })),
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
      aria-label={t('board.label')}
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
      {compact && total > 0 && (
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
      {total === 0 ? (
        <div className="empty-state board-empty">
          <p>{t('board.empty')}</p>
          <p className="muted">{t('board.emptyHint')}</p>
          {adding ? (
            form(null, 'todo')
          ) : (
            <button
              type="button"
              className="board-add-first"
              onClick={() => setAdding({ laneTitle: null, column: 'todo' })}
            >
              <Plus size={14} aria-hidden="true" />
              {t('board.add')}
            </button>
          )}
        </div>
      ) : (
        shown.map((lane, laneIndex) => (
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
                    data-over={over === cell || undefined}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(CARD_TYPE)) return
                      event.preventDefault()
                      setOver(cell)
                    }}
                    onDragLeave={() => setOver((current) => (current === cell ? null : current))}
                    onDrop={(event) => {
                      const mark = Number(event.dataTransfer.getData(CARD_TYPE))
                      setOver(null)
                      if (!Number.isSafeInteger(mark)) return
                      event.preventDefault()
                      moveCard(mark, column, lane.title)
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
                      {cards.map((card) => {
                        const label = plain(card.text) || '—'
                        const closed = card.children.filter(
                          (child) => child.status === 'done' || child.status === 'canceled',
                        ).length
                        return (
                          <li
                            key={card.mark}
                            className="board-card"
                            data-status={card.status}
                            draggable={!compact && !readOnly}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(CARD_TYPE, String(card.mark))
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                          >
                            <span className="board-card-text">{label}</span>
                            {card.children.length > 0 && (
                              <span
                                className="board-card-sub"
                                title={card.children.map((child) => plain(child.text)).join('\n')}
                              >
                                {t('board.subtasks', { done: closed, total: card.children.length })}
                              </span>
                            )}
                            <button
                              type="button"
                              className="board-card-menu"
                              aria-label={t('board.cardActions', { text: label })}
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
                          </li>
                        )
                      })}
                    </ul>
                    {!cards.length && !adding && <p className="board-none">{t('board.noCards')}</p>}
                    {form(grouped ? lane.title : (lanes.at(-1)?.title ?? ''), column)}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
