// Modal dialogs of the workspace. State lives in the parent; these only render and handle keys.

function trapTab(event, focusable) {
  if (event.key !== 'Tab') return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const buttonsOf = (dialog, selector = 'button') => [...dialog.querySelectorAll(selector)]

export function PaletteDialog({
  inputRef,
  query,
  choices,
  selected,
  onQuery,
  onSelect,
  onOpen,
  onClose,
}) {
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <section
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Find note"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => trapTab(event, [inputRef.current, ...buttonsOf(event.currentTarget)])}
      >
        <input
          ref={inputRef}
          aria-label="Search notes"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              onSelect((index) => Math.min(choices.length - 1, index + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onSelect((index) => Math.max(0, index - 1))
            }
            if (event.key === 'Enter' && choices[selected]) onOpen(choices[selected].id)
          }}
          placeholder="Find a note…"
        />
        <div className="results">
          {choices.length ? (
            choices.map((note, index) => (
              <button
                key={note.id}
                className={index === selected ? 'selected' : ''}
                aria-current={index === selected ? 'true' : undefined}
                onClick={() => onOpen(note.id)}
              >
                {note.name}
              </button>
            ))
          ) : (
            <p>No notes found</p>
          )}
        </div>
        <button className="dialog-close" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  )
}

export function ConflictDialog({ firstRef, name, onResolve, onClose }) {
  return (
    <div className="palette-backdrop">
      <section
        className="palette conflict"
        role="dialog"
        aria-modal="true"
        aria-label="Import conflict"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          trapTab(event, buttonsOf(event.currentTarget))
        }}
      >
        <p>
          A note named <strong>{name}</strong> already exists.
        </p>
        <button ref={firstRef} onClick={() => onResolve(false)}>
          Keep both
        </button>
        <button onClick={() => onResolve(true)}>Replace existing note</button>
        <button onClick={onClose}>Cancel</button>
      </section>
    </div>
  )
}

export function TrashDialog({ firstRef, trash, onRestore, onPurge, onClose }) {
  return (
    <div className="palette-backdrop">
      <section
        className="palette trash-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Trash"
        onKeyDown={(event) => trapTab(event, buttonsOf(event.currentTarget))}
      >
        <h2>Trash</h2>
        {trash.length ? (
          <div className="trash-list">
            {trash.map((entry) => (
              <div className="trash-item" key={entry.note.id}>
                <span>{entry.note.name}</span>
                <button onClick={() => onRestore(entry.note.id)}>Restore</button>
                <button onClick={() => onPurge(entry.note.id)}>Delete forever</button>
              </div>
            ))}
          </div>
        ) : (
          <p>Trash is empty.</p>
        )}
        <button ref={firstRef} onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  )
}

export function FindDialog({ inputRef, query, matchCount, onQuery, onStep, onClose }) {
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <section
        className="palette find-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Find in note"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            onStep(event.shiftKey ? -1 : 1)
          }
          trapTab(event, [
            inputRef.current,
            ...buttonsOf(event.currentTarget, 'button:not(:disabled)'),
          ])
        }}
      >
        <input
          ref={inputRef}
          aria-label="Text to find"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Find in this note…"
        />
        <p role="status">
          {query ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : 'Type text to search'}
        </p>
        <button disabled={!matchCount} onClick={() => onStep(-1)}>
          Previous
        </button>
        <button disabled={!matchCount} onClick={() => onStep(1)}>
          Next
        </button>
        <button className="dialog-close" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  )
}
