import { useEffect, useRef, useState } from 'react'
import { createHistory } from '../history.js'
import { createWriteQueue } from '../write-queue.js'
import { ensureDocumentTitles } from '../title.js'
import { syncLinkedTasks } from '../tasks.js'

// The notes document: its current value, the save queue and the edit history.
export function useNotesStore({ persistence, loaded, mode, onHistoryWarning }) {
  const current = useRef(loaded.document)
  const [data, setData] = useState(loaded.document)
  const [error, setError] = useState(loaded.error)
  const [blocked, setBlocked] = useState(loaded.blocked)
  const [saving, setSaving] = useState(false)
  const [noteHistory] = useState(
    () => persistence.history ?? createHistory(persistence.invoke, onHistoryWarning),
  )
  const writer = useRef(null)
  if (!writer.current)
    writer.current = createWriteQueue(
      (document) => persistence.save(document),
      setError,
      setSaving,
      { debounceMs: persistence.kind === 'vault' ? 1200 : 0 },
    )
  useEffect(() => {
    noteHistory.onWarning = onHistoryWarning
  }, [noteHistory, onHistoryWarning])
  useEffect(() => {
    noteHistory.observe(loaded.document, loaded.document)
    const timer = setInterval(() => void noteHistory.flushIfDue(), 1000)
    const flush = () => void noteHistory.flush()
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [noteHistory, loaded.document])

  function commit(next, historyOrigin = mode === 'source' ? 'codigo' : 'sistema') {
    if (next.notes !== current.current.notes) {
      next = ensureDocumentTitles(next)
      next = { ...next, notes: syncLinkedTasks(next.notes) }
      const previous = new Map(current.current.notes.map((note) => [note.id, note]))
      next = {
        ...next,
        notes: next.notes.map((note) => {
          const before = previous.get(note.id)
          return before && (before.body !== note.body || before.name !== note.name)
            ? { ...note, modifiedAt: Date.now() }
            : note
        }),
      }
    }
    noteHistory.observe(current.current, next, historyOrigin)
    current.current = next
    setData(next)
    if (!blocked) writer.current.write(next)
  }

  return {
    data,
    setData,
    current,
    commit,
    noteHistory,
    writer,
    error,
    setError,
    saving,
    blocked,
    setBlocked,
  }
}
