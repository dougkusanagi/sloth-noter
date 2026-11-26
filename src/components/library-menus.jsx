import { useEffect, useRef, useState } from 'react'
import { shortcutKeys } from '../shortcut-registry.js'
import {
  ArrowDownAZ,
  ArrowUpDown,
  Check,
  Clock,
  FilePlus,
  FileText,
  FolderPlus,
  ListFilter,
  X,
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

/** Two icon buttons side by side: a new note and a new folder. */
export function NewMenu({ onNote, onFolder }) {
  return (
    <div className="split-button">
      <ShortcutButton
        className="button sidebar-add split-main"
        label={t('menu.newNote')}
        keys={shortcutKeys('newNote')}
        onClick={onNote}
      >
        <FilePlus size={15} aria-hidden="true" />
      </ShortcutButton>
      <ShortcutButton
        className="button sidebar-add split-toggle"
        label={t('library.newFolder')}
        onClick={onFolder}
      >
        <FolderPlus size={15} aria-hidden="true" />
      </ShortcutButton>
    </div>
  )
}

const SORTS = [
  ['recent', Clock, 'library.sortRecent'],
  ['alphabetical', ArrowDownAZ, 'library.sortAlphabetical'],
]

/** Icon-only trigger; the menu lists the sort orders, each with its own icon. */
export function SortMenu({ value, onChange, openFirst = true, onOpenFirstChange }) {
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
        {value === 'alphabetical' ? (
          <ArrowDownAZ size={15} aria-hidden="true" />
        ) : (
          <ArrowUpDown size={15} aria-hidden="true" />
        )}
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
          <button
            role="menuitemcheckbox"
            aria-checked={openFirst}
            onClick={() => {
              setOpen(false)
              onOpenFirstChange(!openFirst)
            }}
          >
            <FileText size={15} aria-hidden="true" />
            {t('library.openFirst')}
            {openFirst && <Check className="menu-check" size={14} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  )
}

export const DEFAULT_TASK_FILTERS = { status: 'all', due: 'all', sortByDue: false, showDone: false }

const TASK_STATUS = [
  ['all', 'tasks.statusAll'],
  ['doing', 'task.status.doing'],
  ['waiting', 'task.status.waiting'],
]
const TASK_DUE = [
  ['all', 'tasks.dueAll'],
  ['overdue', 'tasks.dueOverdue'],
  ['today', 'tasks.dueToday'],
  ['upcoming', 'tasks.dueUpcoming'],
  ['any', 'tasks.dueAny'],
]

/** The filters that differ from the defaults, each with its label and the change that clears it. */
export function activeTaskFilters(filters) {
  const active = []
  if (filters.status !== 'all')
    active.push({
      key: 'status',
      label: t(TASK_STATUS.find(([value]) => value === filters.status)?.[1] ?? 'tasks.statusAll'),
      reset: { status: 'all' },
    })
  if (filters.due !== 'all')
    active.push({
      key: 'due',
      label: t(TASK_DUE.find(([value]) => value === filters.due)?.[1] ?? 'tasks.dueAll'),
      reset: { due: 'all' },
    })
  if (filters.sortByDue)
    active.push({ key: 'sort', label: t('tasks.sortByDue'), reset: { sortByDue: false } })
  if (filters.showDone)
    active.push({ key: 'done', label: t('tasks.showDone'), reset: { showDone: false } })
  return active
}

/**
 * Icon-only trigger beside the tasks search, like the notes sort menu. The menu stays open
 * while filters change, so several can be set at once.
 */
export function TaskFilterMenu({ filters, onChange }) {
  const { open, setOpen, wrap, onKeyDown } = useMenu()
  const active = activeTaskFilters(filters)
  const radio = (key, value, label) => (
    <button
      key={`${key}-${value}`}
      role="menuitemradio"
      aria-checked={filters[key] === value}
      onClick={() => onChange({ [key]: value })}
    >
      {t(label)}
      {filters[key] === value && <Check className="menu-check" size={14} aria-hidden="true" />}
    </button>
  )
  const check = (key, label) => (
    <button
      role="menuitemcheckbox"
      aria-checked={filters[key]}
      onClick={() => onChange({ [key]: !filters[key] })}
    >
      {t(label)}
      {filters[key] && <Check className="menu-check" size={14} aria-hidden="true" />}
    </button>
  )
  return (
    <div className="split-button" ref={wrap} onKeyDown={onKeyDown}>
      <ShortcutButton
        className="button sidebar-add sidebar-filter"
        label={t('tasks.filters')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={active.length ? '' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilter size={15} aria-hidden="true" />
      </ShortcutButton>
      {open && (
        <div className="library-menu task-filter-menu" role="menu" aria-label={t('tasks.filters')}>
          <div role="group" aria-labelledby="task-filter-status">
            <p className="library-menu-label" id="task-filter-status">
              {t('tasks.status')}
            </p>
            {TASK_STATUS.map(([value, label]) => radio('status', value, label))}
          </div>
          <div className="library-menu-separator" role="separator" />
          <div role="group" aria-labelledby="task-filter-due">
            <p className="library-menu-label" id="task-filter-due">
              {t('tasks.due')}
            </p>
            {TASK_DUE.map(([value, label]) => radio('due', value, label))}
          </div>
          <div className="library-menu-separator" role="separator" />
          {check('sortByDue', 'tasks.sortByDue')}
          {check('showDone', 'tasks.showDone')}
          {active.length > 0 && (
            <>
              <div className="library-menu-separator" role="separator" />
              <button role="menuitem" onClick={() => onChange(DEFAULT_TASK_FILTERS)}>
                <X size={15} aria-hidden="true" />
                {t('tasks.clearFilters')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The active task filters as removable chips, so a filtered list never looks incomplete. */
export function TaskFilterChips({ filters, onChange }) {
  const active = activeTaskFilters(filters)
  if (!active.length) return null
  return (
    <ul className="task-filter-chips" aria-label={t('tasks.filters')}>
      {active.map((filter) => (
        <li key={filter.key}>
          <button
            type="button"
            className="task-filter-chip"
            aria-label={t('tasks.removeFilter', { name: filter.label })}
            onClick={() => onChange(filter.reset)}
          >
            {filter.label}
            <X size={12} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
