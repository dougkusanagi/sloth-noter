import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  CheckSquare,
  ChevronRight,
  Hash,
  List,
  Plus,
  Text,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { readProperties, renameProperty, writeProperty } from '../frontmatter.js'
import { propertyReferences } from '../variables.js'
import { currentLanguage, t } from '../i18n.js'

const TYPES = ['text', 'number', 'boolean', 'date', 'list']
const ICONS = { text: Text, number: Hash, boolean: CheckSquare, date: Calendar, list: List }
const ISO = /^\d{4}-\d{2}-\d{2}$/

function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
const defaultValue = (type) =>
  ({ text: '', number: 0, boolean: false, date: today(), list: [] })[type]

/** Number typed by the person: accepts a comma as the decimal mark. */
function parseNumber(text) {
  const value = text.trim().replace(',', '.')
  return value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
}

/** The value in another type, or `null` when it cannot be converted without guessing. */
function convert(entry, type) {
  const { value } = entry
  if (type === entry.type) return { value }
  const empty = entry.type === 'empty' || value === '' || (Array.isArray(value) && !value.length)
  if (empty) return { value: defaultValue(type) }
  if (type === 'text') return { value: Array.isArray(value) ? value.join(', ') : String(value) }
  if (type === 'list') return { value: Array.isArray(value) ? value : [String(value)] }
  if (type === 'number') {
    const number = typeof value === 'string' ? parseNumber(value) : null
    return number === null ? null : { value: number }
  }
  if (type === 'date') return typeof value === 'string' && ISO.test(value) ? { value } : null
  if (type === 'boolean' && typeof value === 'string' && /^(true|false)$/i.test(value))
    return { value: value.toLowerCase() === 'true' }
  return null
}

/** The type button: shows the type icon and opens a small menu to change it or remove the row. */
function TypeMenu({ entry, readOnly, onType, onRemove }) {
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const menu = useRef(null)
  const Icon = ICONS[entry.type] ?? (entry.type === 'unsupported' ? TriangleAlert : Text)
  useEffect(() => {
    if (!open) return undefined
    menu.current?.querySelector('button')?.focus()
    const away = (event) => {
      if (!menu.current?.contains(event.target) && !button.current?.contains(event.target))
        setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const label = t('properties.type', { name: entry.key })
  if (readOnly || entry.type === 'unsupported')
    return (
      <span className="property-type-icon" title={label}>
        <Icon size={15} aria-hidden="true" />
      </span>
    )
  return (
    <span className="property-type-wrap">
      <button
        ref={button}
        type="button"
        className="property-type-icon"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          className="property-menu"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const items = [...menu.current.querySelectorAll('button')]
              const at = items.indexOf(document.activeElement)
              const step = event.key === 'ArrowDown' ? 1 : -1
              items[(at + step + items.length) % items.length]?.focus()
            }
          }}
        >
          {TYPES.map((type) => {
            const TypeIcon = ICONS[type]
            return (
              <button
                key={type}
                type="button"
                role="menuitemradio"
                aria-checked={entry.type === type}
                onClick={() => {
                  close()
                  onType(type)
                }}
              >
                <TypeIcon size={14} aria-hidden="true" />
                {t(`properties.type.${type}`)}
              </button>
            )
          })}
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close()
              onRemove()
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('properties.remove', { name: entry.key })}
          </button>
        </div>
      )}
    </span>
  )
}

function Value({ entry, readOnly, setValue, setProblem }) {
  const { key, type, value } = entry
  const [draft, setDraft] = useState(null)
  const [item, setItem] = useState('')
  const label = t('properties.valueOf', { name: key })
  if (type === 'unsupported')
    return <span className="property-note">{t('properties.unsupported')}</span>
  if (type === 'boolean')
    return (
      <input
        type="checkbox"
        className="property-check"
        aria-label={label}
        checked={Boolean(value)}
        disabled={readOnly}
        onChange={(event) => setValue(event.target.checked)}
      />
    )
  if (type === 'list')
    return (
      <div className="property-list">
        <ul aria-label={label}>
          {value.map((part, index) => (
            <li key={`${part}-${index}`} className="property-chip">
              <span>{String(part)}</span>
              <button
                type="button"
                disabled={readOnly}
                aria-label={t('properties.itemRemove', { item: String(part) })}
                onClick={() => setValue(value.filter((_, at) => at !== index))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <input
          disabled={readOnly}
          className="property-value"
          aria-label={t('properties.itemAdd', { name: key })}
          placeholder={value.length ? '' : t('properties.emptyValue')}
          value={item}
          onChange={(event) => setItem(event.target.value)}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ',') && item.trim()) {
              event.preventDefault()
              setValue([...value, item.trim()])
              setItem('')
            } else if (event.key === 'Backspace' && !item && value.length)
              setValue(value.slice(0, -1))
          }}
        />
      </div>
    )
  const shown =
    draft ??
    (type === 'number'
      ? String(value).replace('.', currentLanguage() === 'en' ? '.' : ',')
      : (value ?? ''))
  return (
    <input
      className="property-value"
      type={type === 'date' ? 'date' : 'text'}
      inputMode={type === 'number' ? 'decimal' : undefined}
      aria-label={label}
      placeholder={t('properties.emptyValue')}
      value={shown}
      readOnly={readOnly}
      onChange={(event) => {
        const text = event.target.value
        if (type === 'number') {
          setDraft(text)
          const number = parseNumber(text)
          if (number === null) return setProblem(t('properties.invalidNumber'))
          setProblem('')
          return setValue(number)
        }
        if (type === 'date') {
          if (!ISO.test(text)) return setProblem(t('properties.invalidDate'))
          setProblem('')
        }
        return setValue(text)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

function Row({ entry, body, readOnly, onApply }) {
  const { key } = entry
  const [name, setName] = useState(key)
  const [problem, setProblem] = useState('')
  const [pending, setPending] = useState(null)
  const references = (target) => propertyReferences(body, target)

  function commitName(confirmed = false) {
    const next = name.trim()
    if (next === key) return setPending(null)
    if (!next) return setProblem(t('properties.nameEmpty'))
    const result = renameProperty(body, key, next)
    if (result === null) return setProblem(t('properties.nameExists'))
    const count = references(key)
    if (count && !confirmed) return setPending({ kind: 'rename', count })
    setPending(null)
    setProblem('')
    return onApply(result)
  }
  function setValue(next) {
    const result = writeProperty(body, key, next)
    if (result === null) return
    setProblem('')
    onApply(result)
  }
  function remove() {
    const count = references(key)
    if (count) setPending({ kind: 'remove', count })
    else setValue(undefined)
  }
  function changeType(target) {
    const converted = convert(entry, target)
    if (!converted) return setProblem(t('properties.cannotConvert'))
    return setValue(converted.value)
  }
  const reset = () => {
    setName(key)
    setPending(null)
    setProblem('')
  }
  return (
    <li className="property-row" data-type={entry.type}>
      <TypeMenu entry={entry} readOnly={readOnly} onType={changeType} onRemove={remove} />
      <input
        className="property-key"
        aria-label={t('properties.nameOf', { name: key })}
        value={name}
        readOnly={readOnly}
        title={name}
        onChange={(event) => {
          setName(event.target.value)
          setProblem('')
          setPending(null)
        }}
        onBlur={() => !readOnly && name.trim() !== key && !pending && commitName()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !readOnly) commitName()
          if (event.key === 'Escape') reset()
        }}
      />
      <div className="property-cell">
        <Value entry={entry} readOnly={readOnly} setValue={setValue} setProblem={setProblem} />
      </div>
      {problem && (
        <p className="property-problem" role="alert">
          {problem}
        </p>
      )}
      {pending && (
        <div className="property-warning" role="alert">
          <p>
            {t(`properties.${pending.kind}Warn`, {
              count: pending.count,
              name: key,
              to: name.trim(),
            })}
          </p>
          <button
            type="button"
            onClick={() =>
              pending.kind === 'remove' ? (setPending(null), setValue(undefined)) : commitName(true)
            }
          >
            {pending.kind === 'remove'
              ? t('properties.confirmRemove')
              : t('properties.confirmRename')}
          </button>
          <button type="button" onClick={reset}>
            {t('properties.cancel')}
          </button>
        </div>
      )}
    </li>
  )
}

/** The row that names a new property; it starts as text and the type can change afterwards. */
function NewRow({ names, onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState('')
  function create() {
    const key = name.trim()
    if (!key) return onCancel()
    if (names.includes(key)) return setProblem(t('properties.nameExists'))
    return onCreate(key)
  }
  return (
    <li className="property-row">
      <span className="property-type-icon">
        <Text size={15} aria-hidden="true" />
      </span>
      <input
        autoFocus
        className="property-key"
        aria-label={t('properties.name')}
        placeholder={t('properties.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          setProblem('')
        }}
        onBlur={create}
        onKeyDown={(event) => {
          if (event.key === 'Enter') create()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <div className="property-cell" />
      {problem && (
        <p className="property-problem" role="alert">
          {problem}
        </p>
      )}
    </li>
  )
}

export const propertyCount = (body) => {
  const read = readProperties(body)
  return read.ok ? read.entries.length : 0
}

/** The note's collapsible YAML properties, aligned with the document. */
export function PropertiesDock({ body, readOnly, onApply }) {
  const read = useMemo(() => readProperties(body), [body])
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  if (!read.hasBlock) return null
  return (
    <section className="properties" aria-label={t('properties.title')}>
      <div className="properties-toolbar">
        <button
          type="button"
          className="properties-heading"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
            if (open) setAdding(false)
          }}
        >
          <ChevronRight size={14} aria-hidden="true" />
          {t('properties.title')}
        </button>
        {open && read.ok && !readOnly && !adding && (
          <button
            type="button"
            className="property-add"
            aria-label={t('properties.add')}
            title={t('properties.add')}
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden="true" />
            <span>{t('properties.add')}</span>
          </button>
        )}
      </div>
      {open &&
        (read.ok ? (
          <ul className="property-rows">
            {read.entries.map((entry) => (
              <Row
                key={entry.key}
                entry={entry}
                body={body}
                readOnly={readOnly}
                onApply={onApply}
              />
            ))}
            {adding && !readOnly && (
              <NewRow
                names={read.entries.map((entry) => entry.key)}
                onCancel={() => setAdding(false)}
                onCreate={(key) => {
                  setAdding(false)
                  const result = writeProperty(body, key, '')
                  if (result !== null) onApply(result)
                }}
              />
            )}
          </ul>
        ) : (
          <p className="property-problem" role="alert">
            {t('properties.invalid', {
              line: read.error.line,
              reason: t(`properties.error.${read.error.code}`),
            })}
          </p>
        ))}
    </section>
  )
}
