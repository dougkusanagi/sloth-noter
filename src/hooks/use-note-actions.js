import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { t } from '../i18n.js'
import { ensureTitle } from '../title.js'
import { renameWikiReferences } from '../markdown-model.js'
import {
  headingFileName,
  isDiscardableEmptyNote,
  moveToTrash,
  purgeFromTrash,
  restoreFromTrash,
  uniqueName,
} from '../notes.js'
import { isExternalNote } from '../external-notes.js'
import { toggleTask } from '../tasks.js'

// Note actions shared by the screens: open, create, close, rename, trash and jump to tasks.
export function useNoteActions({
  data,
  current,
  commit,
  noteHistory,
  mode,
  setMode,
  palette,
  closePalette,
  active,
  ask,
  editorRef,
  visualRef,
  setSidebarSection,
}) {
  const [previewId, setPreviewId] = useState(null)
  const closedTabs = useRef([])

  function focusEditor() {
    if (mode === 'source') editorRef.current?.focus({ preventScroll: true })
    else visualRef.current?.focus()
  }
  function openNote(id) {
    const old = current.current
    commit({
      ...old,
      openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id],
      activeId: id,
      preferences: window.matchMedia('(max-width: 600px)').matches
        ? { ...old.preferences, sidebarVisible: false }
        : old.preferences,
    })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(focusEditor, 0)
  }

  /**
   * Opens a note from the library in a preview tab: the next note opened this way takes
   * its place, so browsing does not pile up tabs. Editing or double-clicking keeps it.
   */
  function previewNote(id) {
    const old = current.current
    if (old.openIds.includes(id)) return openNote(id)
    const replace =
      previewId && old.openIds.includes(previewId) && !old.pinnedIds?.includes(previewId)
    commit({
      ...old,
      openIds: replace
        ? old.openIds.map((item) => (item === previewId ? id : item))
        : [...old.openIds, id],
      activeId: id,
      preferences: window.matchMedia('(max-width: 600px)').matches
        ? { ...old.preferences, sidebarVisible: false }
        : old.preferences,
    })
    setPreviewId(id)
    if (mode === 'reading') setMode('visual')
  }
  function keepNote(id) {
    if (id === previewId) setPreviewId(null)
    if (!current.current.openIds.includes(id)) openNote(id)
  }

  function createNote(name = 'new note.md', body = '') {
    const blank = !body
    body = ensureTitle(body, name.replace(/\.md$/i, ''))
    const old = current.current
    const note = {
      id: crypto.randomUUID(),
      name: uniqueName(old.notes, headingFileName(body) ?? name),
      body,
      revision: 0,
    }
    commit({
      ...old,
      notes: [...old.notes, note],
      openIds: [...old.openIds, note.id],
      activeId: note.id,
    })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(() => {
      focusEditor()
      if (blank) {
        const end = note.body.split('\n')[0].length
        if (mode === 'source') editorRef.current?.setSelectionRange(2, end)
        else visualRef.current?.dispatch({ selection: { anchor: 2, head: end } })
      }
    }, 0)
  }

  function closeTab(id) {
    const old = current.current
    if (!old.openIds.includes(id) || old.pinnedIds?.includes(id)) return
    if (id === previewId) setPreviewId(null)
    const note = old.notes.find((item) => item.id === id)
    const openIds = old.openIds.filter((item) => item !== id)
    const notes =
      note && isDiscardableEmptyNote(note) ? old.notes.filter((item) => item.id !== id) : old.notes
    if (note)
      closedTabs.current.push({
        id,
        index: old.openIds.indexOf(id),
        discarded: notes.includes(note) ? null : note,
      })
    commit({
      ...old,
      notes,
      openIds,
      activeId: old.activeId === id ? (openIds.at(-1) ?? null) : old.activeId,
    })
  }
  function reopenTab() {
    while (closedTabs.current.length) {
      const entry = closedTabs.current.pop()
      const old = current.current
      if (old.openIds.includes(entry.id) || old.trash.some(({ note }) => note.id === entry.id))
        continue
      const note = old.notes.find((note) => note.id === entry.id) ?? entry.discarded
      if (!note) continue
      const openIds = [...old.openIds]
      openIds.splice(Math.max(old.pinnedIds?.length ?? 0, entry.index), 0, note.id)
      commit({
        ...old,
        notes: old.notes.some((item) => item.id === note.id)
          ? old.notes
          : [...old.notes, { ...note, name: uniqueName(old.notes, note.name) }],
        openIds,
        activeId: note.id,
      })
      setTimeout(focusEditor, 0)
      return
    }
  }
  function selectAdjacentTab(direction) {
    const { openIds, activeId } = current.current
    if (!openIds.length) return
    const index = openIds.indexOf(activeId)
    openNote(openIds[(index + direction + openIds.length) % openIds.length])
  }

  async function renameNote(id = active?.id) {
    const note = data.notes.find((item) => item.id === id)
    if (!note) return
    if (isExternalNote(note)) {
      toast.info(t('external.noRename'))
      return
    }
    const proposed = (
      await ask({ kind: 'prompt', label: t('dialog.renameLabel'), initial: note.name })
    )?.trim()
    if (!proposed || proposed === note.name) return
    const name = proposed.toLowerCase().endsWith('.md') ? proposed : `${proposed}.md`
    if (
      current.current.notes.some(
        (item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      await ask({ kind: 'confirm', single: true, message: t('error.nameExists') })
      return
    }
    const body = note.body.replace(/^# [ \t]*(.+?)[ \t]*$/m, `# ${name.slice(0, -3)}`)
    commit({
      ...current.current,
      trash: current.current.trash.map((entry) => {
        const body = renameWikiReferences(entry.note.body, note.name, name)
        return body === entry.note.body
          ? entry
          : { ...entry, note: { ...entry.note, body, revision: entry.note.revision + 1 } }
      }),
      notes: current.current.notes.map((item) =>
        (() => {
          const nextBody = renameWikiReferences(item.id === id ? body : item.body, note.name, name)
          return item.id === id || nextBody !== item.body
            ? {
                ...item,
                name: item.id === id ? name : item.name,
                body: nextBody,
                revision: item.revision + 1,
              }
            : item
        })(),
      ),
    })
  }
  async function deleteNote(id = active?.id) {
    const note = data.notes.find((item) => item.id === id)
    if (!note) return
    const confirmed = await ask({
      kind: 'confirm',
      message: t('dialog.moveToTrash', { name: note.name }),
      confirmLabel: t('dialog.moveToTrashConfirm'),
    })
    if (!confirmed) return
    commit(moveToTrash(current.current, id, Date.now()))
  }
  function restoreNote(id) {
    commit(restoreFromTrash(current.current, id))
    if (mode === 'reading') setMode('visual')
    setSidebarSection('notes')
  }
  async function purgeNote(id) {
    const note = data.trash.find((entry) => entry.note.id === id)?.note
    if (!note) return
    const confirmed = await ask({
      kind: 'confirm',
      message: t('dialog.purge', { name: note.name }),
      confirmLabel: t('dialog.purgeConfirm'),
    })
    if (confirmed) commit(purgeFromTrash(current.current, id))
  }
  async function emptyTrash() {
    const count = current.current.trash.length
    if (!count) return
    const confirmed = await ask({
      kind: 'confirm',
      message: t('trash.emptyConfirm', { count }),
      confirmLabel: t('trash.emptyAll'),
    })
    if (!confirmed) return
    commit(
      current.current.trash.reduce(
        (document, entry) => purgeFromTrash(document, entry.note.id),
        current.current,
      ),
    )
  }

  function toggleNoteTask(noteId, mark) {
    const note = current.current.notes.find((item) => item.id === noteId)
    if (!note) return
    const view = visualRef.current
    if (mode === 'visual' && current.current.activeId === noteId && view) {
      view.dispatch({
        changes: { from: mark, to: mark + 1, insert: note.body[mark] === ' ' ? 'x' : ' ' },
        userEvent: 'tarefa',
      })
      return
    }
    noteHistory.record(note, note.body, toggleTask(note.body, mark), 'tarefa')
    commit({
      ...current.current,
      notes: current.current.notes.map((item) =>
        item.id === noteId
          ? { ...item, body: toggleTask(item.body, mark), revision: item.revision + 1 }
          : item,
      ),
    })
  }
  function jumpToTask(noteId, offset) {
    openNote(noteId)
    if (offset === null) return
    setTimeout(() => {
      if (mode === 'source' && editorRef.current) {
        editorRef.current.focus()
        editorRef.current.setSelectionRange(offset, offset)
      } else if (visualRef.current) {
        visualRef.current.dispatch({
          selection: { anchor: offset },
          scrollIntoView: true,
        })
        visualRef.current.focus()
      }
    }, 0)
  }

  return {
    previewId,
    setPreviewId,
    focusEditor,
    openNote,
    previewNote,
    keepNote,
    createNote,
    closeTab,
    reopenTab,
    selectAdjacentTab,
    renameNote,
    deleteNote,
    restoreNote,
    purgeNote,
    emptyTrash,
    toggleNoteTask,
    jumpToTask,
  }
}
