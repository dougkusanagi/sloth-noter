import { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus, FileText, Hash, Search, Zap } from 'lucide-react'
import { markdownTree } from '../markdown-model.js'
import { compareNoteSearch, noteSearchResult } from '../note-search.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

const headingText = (node) =>
  node.type === 'html' ? '' : (node.value ?? (node.children ?? []).map(headingText).join(''))

function noteHeadings(note) {
  return markdownTree(note.body)
    .children.filter((node) => node.type === 'heading')
    .map((node) => ({
      noteId: note.id,
      noteName: displayName(note.name),
      text: headingText(node).trim(),
      depth: node.depth,
      line: node.position?.start?.line ?? 1,
    }))
    .filter((entry) => entry.text)
}

/**
 * Mobile "Buscar e comandos" sheet (requisitos 5.9):
 * - No prefix: notes by name and text, with snippet, match count, and open at 1st match.
 * - `>`: available commands on the current screen, using desktop i18n labels.
 * - `#`: headings in the open note, or across all notes when no note is open.
 * - No results: offers creating a note with the typed name.
 */
export function CommandSheet({
  initialPrefix = '',
  notes,
  active,
  commands,
  onOpenNote,
  onCreateNote,
  onRunCommand,
  onJumpHeading,
}) {
  const [query, setQuery] = useState(initialPrefix)
  const input = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const element = input.current
      if (!element) return
      element.focus()
      const end = element.value.length
      element.setSelectionRange?.(end, end)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const trimmed = query.trimStart()
  const mode = trimmed.startsWith('>') ? 'commands' : trimmed.startsWith('#') ? 'headings' : 'notes'
  const needle = mode === 'notes' ? query.trim() : trimmed.slice(1).trim()
  const normalizedNeedle = normalize(needle)

  const noteResults = useMemo(() => {
    if (mode !== 'notes') return []
    if (!needle) return notes.map((note) => ({ note, result: { matches: [], snippet: null } }))
    return notes
      .map((note, index) => ({ note, index, result: noteSearchResult(note, needle) }))
      .filter(({ result }) => result.matches.length || result.titleMatches.length)
      .sort((a, b) => compareNoteSearch(a, b, needle) || a.index - b.index)
  }, [mode, needle, notes])

  const commandResults = useMemo(() => {
    if (mode !== 'commands') return []
    return commands.filter(
      (item) => !normalizedNeedle || normalize(item.label).includes(normalizedNeedle),
    )
  }, [mode, commands, normalizedNeedle])

  const headingResults = useMemo(() => {
    if (mode !== 'headings') return []
    const list = active ? noteHeadings(active) : notes.flatMap(noteHeadings)
    return list.filter(
      (item) =>
        !normalizedNeedle ||
        normalize(item.text).includes(normalizedNeedle) ||
        (!active && normalize(item.noteName).includes(normalizedNeedle)),
    )
  }, [mode, active, notes, normalizedNeedle])

  return (
    <div className="mobile-command-sheet">
      <label className="mobile-command-input">
        {mode === 'commands' ? (
          <Zap size={18} aria-hidden="true" />
        ) : mode === 'headings' ? (
          <Hash size={18} aria-hidden="true" />
        ) : (
          <Search size={18} aria-hidden="true" />
        )}
        <input
          ref={input}
          type="search"
          value={query}
          aria-label={t('mobile.commandsTitle')}
          placeholder={t('mobile.commandsPlaceholder')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="mobile-command-list">
        {mode === 'notes' &&
          noteResults.map(({ note, result }) => (
            <button
              key={note.id}
              type="button"
              className="mobile-command-item"
              onClick={() => onOpenNote(note.id, result.matches.length ? needle : '')}
            >
              <FileText size={18} aria-hidden="true" />
              <span className="mobile-command-body">
                <span className="mobile-command-title">
                  {displayName(note.name)}
                  {result.matches.length > 0 && (
                    <span className="mobile-match-count">
                      {t(
                        result.matches.length === 1
                          ? 'mobile.matchCount.one'
                          : 'mobile.matchCount.other',
                        { count: result.matches.length },
                      )}
                    </span>
                  )}
                </span>
                {result.snippet && (
                  <span className="mobile-note-snippet">
                    {result.snippet.before}
                    <mark>{result.snippet.hit}</mark>
                    {result.snippet.after}
                  </span>
                )}
              </span>
            </button>
          ))}

        {mode === 'notes' && needle && noteResults.length === 0 && (
          <button
            type="button"
            className="mobile-command-item"
            onClick={() => onCreateNote(needle)}
          >
            <FilePlus size={18} aria-hidden="true" />
            <span className="mobile-command-title">
              {t('mobile.createNamedNote', { name: needle })}
            </span>
          </button>
        )}

        {mode === 'commands' &&
          commandResults.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mobile-command-item"
              onClick={() => onRunCommand(item)}
            >
              {item.icon}
              <span className="mobile-command-title">{item.label}</span>
            </button>
          ))}

        {mode === 'commands' && commandResults.length === 0 && (
          <p className="mobile-command-empty">{t('mobile.commandsEmpty')}</p>
        )}

        {mode === 'headings' &&
          headingResults.map((item, index) => (
            <button
              key={`${item.noteId}-${item.line}-${index}`}
              type="button"
              className="mobile-command-item"
              onClick={() => onJumpHeading(item)}
            >
              <Hash size={18} aria-hidden="true" />
              <span className="mobile-command-body">
                <span className="mobile-command-title">{item.text}</span>
                {!active && <span className="mobile-command-sub">{item.noteName}</span>}
              </span>
            </button>
          ))}

        {mode === 'headings' && headingResults.length === 0 && (
          <p className="mobile-command-empty">{t('mobile.commandsEmpty')}</p>
        )}
      </div>
    </div>
  )
}
