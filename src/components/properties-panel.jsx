import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { readProperties, renameProperty, writeProperty } from '../frontmatter.js'
import { propertyReferences } from '../variables.js'
import { currentLanguage, t } from '../i18n.js'

const TYPES = ['text', 'number', 'boolean', 'date', 'list']
const ISO = /^\d{4}-\d{2}-\d{2}$/
const today = () => {
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

/** A value in another type, or `null` when it cannot be converted without guessing. */
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
  if (type === 'boolean') {
    if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase()))
      return { value: value.toLowerCase() === 'true' }
    return null
  }
  return null
}

function Row({ entry, body, readOnly, onApply }) {
  const id = useId()
  const [name, setName] = useState(entry.key)
  const [problem, setProblem] = useState('')
  const [pending, setPending] = useState(null)
  const [draft, setDraft] = useState(null)
  const [item, setItem] = useState('')
  const { key, type, value } = entry
  const editable = type !== 'unsupported'
  const references = (target) => propertyReferences(body, target)

  function commitName(confirmed = false) {
    const next = name.trim()
    if (next === key) return setPending(null)
    if (!next) return setProblem(t('properties.nameEmpty'))
    const result = renameProperty(body, key, next)
    if (result === null) return setProblem(t('properties.nameExists'))
    const count = references(key)
    if (count && !confirmed) {
      setPending({ kind: 'rename', count })
      return undefined
    }
    setPending(null)
    setProblem('')
    onApply(result)
    return undefined
  }
  function setValue(next) {
    const result = writeProperty(body, key, next)
    if (result !== null) {
      setProblem('')
      onApply(result)
    }
  }
  function changeType(target) {
    const converted = convert(entry, target)
    if (!converted) return setProblem(t('properties.cannotConvert'))
    setValue(converted.value)
    return undefined
  }
  const shown =
    draft ??
    (type === 'number'
      ? String(value).replace('.', currentLanguage() === 'en' ? '.' : ',')
      : (value ?? ''))
  return (
    <li className="property-row" data-type={type}>
      <div className="property-head">
        <input
          className="property-name"
          aria-label={t('properties.nameOf', { name: key })}
          value={name}
          readOnly={readOnly}
          onChange={(event) => {
            setName(event.target.value)
            setProblem('')
            setPending(null)
          }}
          onBlur={() => !readOnly && name.trim() !== key && commitName()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitName()
            if (event.key === 'Escape') {
              setName(key)
              setPending(null)
              setProblem('')
            }
          }}
        />
        {!readOnly && editable && (
          <select
            className="property-type"
            aria-label={t('properties.type', { name: key })}
            value={TYPES.includes(type) ? type : 'text'}
            onChange={(event) => changeType(event.target.value)}
          >
            {TYPES.map((option) => (
              <option key={option} value={option}>
                {t(`properties.type.${option}`)}
              </option>
            ))}
          </select>
        )}
        {!readOnly && (
          <button
            type="button"
            className="property-icon"
            aria-label={t('properties.remove', { name: key })}
            title={t('properties.remove', { name: key })}
            onClick={() => {
              const count = references(key)
              if (count) setPending({ kind: 'remove', count })
              else setValue(undefined)
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {!editable ? (
        <p className="property-note">{t('properties.unsupported')}</p>
      ) : type === 'boolean' ? (
        <input
          type="checkbox"
          className="property-check"
          aria-label={t('properties.valueOf', { name: key })}
          checked={Boolean(value)}
          disabled={readOnly}
          onChange={(event) => setValue(event.target.checked)}
        />
      ) : type === 'list' ? (
        <div className="property-list">
          <ul aria-label={t('properties.valueOf', { name: key })}>
            {value.map((part, index) => (
              <li key={`${part}-${index}`} className="property-chip">
                <span>{String(part)}</span>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={t('properties.itemRemove', { item: String(part) })}
                    onClick={() => setValue(value.filter((_, at) => at !== index))}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <input
              className="property-input"
              aria-label={t('properties.itemAdd', { name: key })}
              value={item}
              onChange={(event) => setItem(event.target.value)}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ',') && item.trim()) {
                  event.preventDefault()
                  setValue([...value, item.trim()])
                  setItem('')
                }
              }}
            />
          )}
        </div>
      ) : (
        <input
          id={id}
          className="property-input"
          type={type === 'date' ? 'date' : 'text'}
          inputMode={type === 'number' ? 'decimal' : undefined}
          aria-label={t('properties.valueOf', { name: key })}
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
              return setValue(text)
            }
            return setValue(text)
          }}
          onBlur={() => setDraft(null)}
        />
      )}
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
          <button
            type="button"
            onClick={() => {
              setPending(null)
              setName(key)
            }}
          >
            {t('properties.cancel')}
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * The note's YAML properties as a form. `body` is the whole note; every edit calls `onApply` with
 * the new text, so the file keeps comments, order and the other properties.
 */
export function PropertiesPanel({ body, readOnly = false, onApply }) {
  const read = useMemo(() => readProperties(body), [body])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('text')
  const [problem, setProblem] = useState('')
  if (!read.hasBlock) return null
  if (!read.ok)
    return (
      <p className="property-problem" role="alert">
        {t('properties.invalid', {
          line: read.error.line,
          reason: t(`properties.error.${read.error.code}`),
        })}
      </p>
    )
  function create() {
    const key = name.trim()
    if (!key) return setProblem(t('properties.nameEmpty'))
    if (read.entries.some((entry) => entry.key === key))
      return setProblem(t('properties.nameExists'))
    const result = writeProperty(body, key, defaultValue(type))
    if (result === null) return undefined
    onApply(result)
    setAdding(false)
    setName('')
    setType('text')
    setProblem('')
    return undefined
  }
  return (
    <div className="properties-body">
      {read.entries.length === 0 && !adding && (
        <p className="property-note">{t('properties.empty')}</p>
      )}
      <ul className="property-rows">
        {read.entries.map((entry) => (
          <Row
            key={`${entry.key}:${entry.type}`}
            entry={entry}
            body={body}
            readOnly={readOnly}
            onApply={onApply}
          />
        ))}
      </ul>
      {!readOnly &&
        (adding ? (
          <form
            className="property-new"
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
          >
            <input
              autoFocus
              className="property-input"
              aria-label={t('properties.name')}
              placeholder={t('properties.name')}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setProblem('')
              }}
              onKeyDown={(event) => event.key === 'Escape' && setAdding(false)}
            />
            <select
              className="property-type"
              aria-label={t('properties.newType')}
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {t(`properties.type.${option}`)}
                </option>
              ))}
            </select>
            <button type="submit">{t('properties.create')}</button>
            <button type="button" onClick={() => setAdding(false)}>
              {t('properties.cancel')}
            </button>
            {problem && (
              <p className="property-problem" role="alert">
                {problem}
              </p>
            )}
          </form>
        ) : (
          <button type="button" className="property-add" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden="true" />
            {t('properties.add')}
          </button>
        ))}
    </div>
  )
}

export const propertyCount = (body) => {
  const read = readProperties(body)
  return read.ok ? read.entries.length : 0
}

/** Room needed beside the text for the side panel: its width plus a gap on each side. */
const SIDE_ROOM = 280

/**
 * Places the properties where there is room: in the free margin to the right of the text on a wide
 * window, or as a collapsible section above the note otherwise. Nothing shows without a YAML block.
 */
export function PropertiesDock({ body, textWidth, readOnly, onApply }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  const read = useMemo(() => readProperties(body), [body])
  const side = typeof textWidth === 'number' && (width - textWidth) / 2 >= SIDE_ROOM
  return (
    <div ref={ref} className="properties-dock" data-side={side ? '' : undefined}>
      {read.hasBlock &&
        (side ? (
          <aside className="properties-side" aria-label={t('properties.title')}>
            <h2>{t('properties.title')}</h2>
            <PropertiesPanel body={body} readOnly={readOnly} onApply={onApply} />
          </aside>
        ) : (
          <details className="properties-inline">
            <summary>
              {t('properties.toggleInline', { count: read.ok ? read.entries.length : 0 })}
            </summary>
            <PropertiesPanel body={body} readOnly={readOnly} onApply={onApply} />
          </details>
        ))}
    </div>
  )
}
