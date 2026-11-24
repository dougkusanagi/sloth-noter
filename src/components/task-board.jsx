import { Fragment, useRef, useState } from 'react'
import { Archive, Columns3, Ellipsis, ListChecks, Plus, Undo2 } from 'lucide-react'
import { addBoardTask, setCardStatus, setCardText } from '../task-board.js'
import { boardColumns, isTaskNote, makeTaskNote, moveCardToColumn } from '../task-note.js'
import { archiveClosedTasks } from '../task-archive.js'
import { openTaskMenu } from '../editor/task-menu.js'
import { plain } from './tasks-library.jsx'
import { TaskDateBadge } from './task-date-badge.jsx'
import { taskDate } from '../task-dates.js'
import { currentLanguage, t } from '../i18n.js'

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
 * A task note as a board (ADR 0033): each H2 section is a column, and moving a card moves its
 * lines to that section. A column with a known name (Fazer, Fazendo, Esperando, Feito) also sets
 * the status. Every change rewrites the note text through `onChange`; `Desfazer` restores it.
 */
export function TaskBoard({ body, onChange, compact = false, readOnly = false }) {
  // On narrow screens (compact) one column shows at a time, picked by tabs; no dragging.
  const [tab, setTab] = useState(0)
  const [history, setHistory] = useState([])
  const [adding, setAdding] = useState(null)
  // While dragging: the card being moved (hidden in place) and where it would land.
  const [drag, setDrag] = useState(null)
  const [drop, setDrop] = useState(null)
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const dragging = useRef(false)
  const bodyRef = useRef(body)
  bodyRef.current = body
  const taskNote = isTaskNote(body)
  const columns = taskNote ? boardColumns(body) : []
  const current = Math.min(tab, Math.max(0, columns.length - 1))
  const visible = compact ? columns.slice(current, current + 1) : columns

  function apply(next) {
    if (next === bodyRef.current) return
    setHistory((previous) => [...previous.slice(-49), bodyRef.current])
    setNotice('')
    onChange(next)
  }
  function undo() {
    const previous = history.at(-1)
    if (previous === undefined) return
    setHistory(history.slice(0, -1))
    setNotice('')
    onChange(previous)
  }
  function convert() {
    const next = makeTaskNote(bodyRef.current, { language: currentLanguage() })
    if (next === null) setNotice(t('board.convertFailed'))
    else apply(next)
  }
  function archive() {
    const { body: next, count } = archiveClosedTasks(bodyRef.current, t('tasks.archiveTitle'))
    if (!count) return setNotice(t('tasks.archiveNone'))
    apply(next)
    setNotice(t('tasks.archived', { count }))
  }
  function moveCard(mark, column, before) {
    apply(moveCardToColumn(bodyRef.current, mark, column, before))
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
  function openMenu(card, column, x, y, opener) {
    openTaskMenu({
      x,
      y,
      current: card.status,
      restoreFocus: () => opener?.focus(),
      onSelect: (status) => apply(setCardStatus(bodyRef.current, card.mark, status)),
      extra: [
        ...(readOnly ? [] : [{ label: t('board.edit'), onSelect: () => setEditing(card.mark) }]),
        ...columns
          .filter((item) => item.title !== column.title)
          .map((item) => ({
            label: t('board.moveTo', { lane: item.title || t('board.noSection') }),
            onSelect: () => moveCard(card.mark, item.title, null),
          })),
      ],
    })
  }
  function submit(event) {
    event.preventDefault()
    const text = new FormData(event.currentTarget).get('task')
    const column = columns.find((item) => item.title === adding)
    apply(addBoardTask(bodyRef.current, adding, column?.status ?? 'todo', String(text)))
    setAdding(null)
  }
  const form = (title) =>
    adding === title ? (
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

  if (!taskNote)
    return (
      <section className="task-board" aria-label={t('board.label')}>
        <div className="board-convert">
          <Columns3 size={22} aria-hidden="true" />
          <p>{t('board.taskNoteOnly')}</p>
          {!readOnly && (
            <button type="button" className="board-undo" onClick={convert}>
              {t('board.convert')}
            </button>
          )}
          {notice && (
            <p className="board-notice" role="status">
              {notice}
            </p>
          )}
          {history.length > 0 && (
            <button type="button" className="board-undo" onClick={undo}>
              <Undo2 size={14} aria-hidden="true" />
              {t('board.undo')}
            </button>
          )}
        </div>
      </section>
    )

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
        {!readOnly && (
          <button type="button" className="board-undo" onClick={archive}>
            <Archive size={14} aria-hidden="true" />
            {t('board.archive')}
          </button>
        )}
        <button type="button" className="board-undo" disabled={!history.length} onClick={undo}>
          <Undo2 size={14} aria-hidden="true" />
          {t('board.undo')}
        </button>
      </div>
      {notice && (
        <p className="board-notice" role="status">
          {notice}
        </p>
      )}
      {compact && (
        <div className="board-tabs" role="tablist" aria-label={t('board.columns')}>
          {columns.map((column, index) => (
            <button
              key={`${index}:${column.title}`}
              type="button"
              role="tab"
              aria-selected={current === index}
              data-column={column.status ?? undefined}
              onClick={() => setTab(index)}
            >
              {column.title || t('board.noSection')}
              <span className="count">{column.cards.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="board-columns">
        {visible.map((column) => {
          const cards = column.cards
          const cell = column.title
          const name = column.title || t('board.noSection')
          return (
            <div
              className="board-column"
              key={`${column.heading}:${column.title}`}
              data-column={column.status ?? undefined}
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
                moveCard(mark, column.title, before)
              }}
            >
              <header className="board-column-header">
                <span className="board-column-title">{name}</span>
                <span className="count">{cards.length}</span>
                {!readOnly && (
                  <button
                    type="button"
                    className="board-add"
                    aria-label={t('board.addIn', { column: name })}
                    title={t('board.add')}
                    onClick={() => setAdding(column.title)}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                )}
              </header>
              <ul className="board-cards">
                {cards.map((card, index) => {
                  const label = plain(taskDate(card.text)?.text ?? card.text)
                  const closed = card.children.filter(
                    (child) => child.status === 'done' || child.status === 'canceled',
                  ).length
                  const dragged = drag?.mark === card.mark
                  // The next card that is not the one being dragged.
                  const following = cards.slice(index + 1).find((item) => item.mark !== drag?.mark)
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
                            <TaskDateBadge text={card.text} />
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
                              openMenu(card, column, box.left, box.bottom, event.currentTarget)
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              openMenu(
                                card,
                                column,
                                event.clientX,
                                event.clientY,
                                event.currentTarget,
                              )
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
              {!cards.length && adding !== column.title && drop?.cell !== cell && (
                <p className="board-none">{t('board.noCards')}</p>
              )}
              {form(column.title)}
            </div>
          )
        })}
      </div>
    </section>
  )
}
