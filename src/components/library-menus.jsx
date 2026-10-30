import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  FilePlus,
  FolderPlus,
  Plus,
} from 'lucide-react'
import { t } from '../i18n.js'
import { ShortcutButton } from './shortcut-button.jsx'

/** A small popover menu: closes on outside click or Escape, arrows move between items. */
function useMenu() {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() =>
      wrap.current?.querySelector('[role^="menuitem"]')?.focus(),
    )
    const onPointer = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      wrap.current?.querySelector('[aria-haspopup]')?.focus()
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...wrap.current.querySelectorAll('[role^="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    if (index < 0) return
    event.preventDefault()
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
  }
  return { open, setOpen, wrap, onKeyDown }
}

/** "+" creates a note; the chevron opens a menu with "New note" and "New folder". */
export function NewMenu({ onNote, onFolder }) {
  const { open, setOpen, wrap, onKeyDown } = useMenu()
  return (
    <div className="split-button" ref={wrap} onKeyDown={onKeyDown}>
      <ShortcutButton
        className="button sidebar-add split-main"
        label={t('menu.newNote')}
        keys="T"
        onClick={onNote}
      >
        <Plus size={15} aria-hidden="true" />
      </ShortcutButton>
      <ShortcutButton
        className="button sidebar-add split-toggle"
        label={t('library.newMore')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={13} aria-hidden="true" />
      </ShortcutButton>
      {open && (
        <div className="library-menu" role="menu" aria-label={t('library.newMore')}>
          {[
            [FilePlus, t('menu.newNote'), onNote],
            [FolderPlus, t('library.newFolder'), onFolder],
          ].map(([Icon, label, action]) => (
            <button
              key={label}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                action()
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SORTS = [
  ['recent', Clock, 'library.sortRecent'],
  ['alphabetical', ArrowDownAZ, 'library.sortAlphabetical'],
]

/** Icon-only trigger; the menu lists the sort orders, each with its own icon. */
export function SortMenu({ value, onChange }) {
  const { open, setOpen, wrap, onKeyDown } = useMenu()
  return (
    <div className="split-button" ref={wrap} onKeyDown={onKeyDown}>
      <ShortcutButton
        className="button sidebar-add"
        label={t('library.sort')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ArrowUpDown size={15} aria-hidden="true" />
      </ShortcutButton>
      {open && (
        <div className="library-menu" role="menu" aria-label={t('library.sort')}>
          {SORTS.map(([sort, Icon, label]) => (
            <button
              key={sort}
              role="menuitemradio"
              aria-checked={value === sort}
              onClick={() => {
                setOpen(false)
                onChange(sort)
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {t(label)}
              {value === sort && <Check className="menu-check" size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
