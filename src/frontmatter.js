import { Document, isMap, isScalar, isSeq, parseDocument, visit } from 'yaml'

/** Largest YAML block read; anything bigger is kept as text and never parsed. */
export const FRONTMATTER_LIMIT = 64 * 1024

const OPEN = /^---[ \t]*\r?\n/
const CLOSE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/**
 * End offset of the YAML block at the very start of a note (the line after the closing `---`),
 * or 0 when the note has none. A block needs an opening `---` on line 1 and a closing `---` (or
 * `...`) on a line of its own; the title always comes after it.
 */
export function frontmatterEnd(text) {
  const open = OPEN.exec(text)
  if (!open) return 0
  let at = open[0].length
  while (at <= text.length) {
    const rest = text.slice(at)
    const close = CLOSE.exec(rest)
    if (close) return at + close[0].length
    const next = text.indexOf('\n', at)
    if (next < 0) return 0
    at = next + 1
  }
  return 0
}

/** `{ raw, yaml, body }`: the block with its fences, the YAML between them and the rest. */
export function splitFrontmatter(text) {
  const end = frontmatterEnd(text)
  if (!end) return { raw: '', yaml: null, body: text }
  const raw = text.slice(0, end)
  const lines = raw.replace(/\r?\n$/, '').split(/\r?\n/)
  return { raw, yaml: lines.slice(1, -1).join('\n'), body: text.slice(end) }
}

/** Offset where the note's own text (title first) begins. */
export const titleStart = (text) => frontmatterEnd(text)

/** Offset of the end of the title line. */
export function titleEnd(text) {
  const start = frontmatterEnd(text)
  const at = text.indexOf('\n', start)
  return at < 0 ? text.length : at
}

function typeOf(value) {
  if (value === null || value === undefined) return 'empty'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'date' : 'text'
  if (
    Array.isArray(value) &&
    value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
  )
    return 'list'
  return 'unsupported'
}

const options = { prettyErrors: false, maxAliasCount: 0, uniqueKeys: true, version: '1.2' }

/**
 * Reads the note's properties. Returns `{ ok, entries, error }`: each entry is
 * `{ key, type, value }` with type `text`, `number`, `boolean`, `date`, `list`, `empty` or
 * `unsupported`. Duplicate keys, aliases, a top level that is not a map, invalid YAML and blocks
 * over the size limit give `ok: false` with `error.line` and `error.code`; the text is never
 * changed.
 */
export function readProperties(text) {
  const { yaml } = splitFrontmatter(text)
  if (yaml === null) return { ok: true, entries: [], hasBlock: false }
  if (yaml.length > FRONTMATTER_LIMIT)
    return { ok: false, hasBlock: true, entries: [], error: { code: 'tooLarge', line: 2 } }
  const document = parseDocument(yaml, options)
  if (document.errors.length) {
    const [problem] = document.errors
    const duplicate = problem.code === 'DUPLICATE_KEY'
    return {
      ok: false,
      hasBlock: true,
      entries: [],
      error: {
        code: duplicate ? 'duplicateKey' : 'invalid',
        line: (problem.linePos?.[0]?.line ?? 1) + 1,
      },
    }
  }
  let alias = false
  visit(document, { Alias: () => ((alias = true), visit.BREAK) })
  if (alias) return { ok: false, hasBlock: true, entries: [], error: { code: 'alias', line: 2 } }
  if (document.contents === null) return { ok: true, entries: [], hasBlock: true }
  if (!isMap(document.contents))
    return { ok: false, hasBlock: true, entries: [], error: { code: 'notMap', line: 2 } }
  const entries = []
  for (const pair of document.contents.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : null
    if (key === null) {
      entries.push({ key: String(pair.key), type: 'unsupported', value: undefined })
      continue
    }
    const value = isScalar(pair.value)
      ? pair.value.value
      : isSeq(pair.value)
        ? pair.value.toJSON()
        : undefined
    entries.push({ key, type: isMap(pair.value) ? 'unsupported' : typeOf(value), value })
  }
  return { ok: true, hasBlock: true, entries }
}

/** The value of one property for variables: only `text`, `number`, `boolean`, `date` and `list`. */
export function propertyMap(text) {
  const result = readProperties(text)
  const map = new Map()
  if (!result.ok) return map
  for (const entry of result.entries)
    if (!['unsupported', 'empty'].includes(entry.type)) map.set(entry.key, entry)
  return map
}

/**
 * Text of the note with one property set (added at the end, or replaced in place) or removed
 * (`value === undefined`). Comments, key order and the formatting of the other properties are kept.
 * Returns `null` when the block cannot be edited safely (invalid YAML and the like).
 */
export function writeProperty(text, key, value) {
  const { raw, yaml, body } = splitFrontmatter(text)
  const read = readProperties(text)
  if (!read.ok) return null
  if (yaml === null) {
    if (value === undefined) return text
    const created = new Document({ [key]: value })
    return `---\n${created.toString().trimEnd()}\n---\n${text}`
  }
  const document = parseDocument(yaml, options)
  if (document.contents === null) document.contents = document.createNode({})
  if (value === undefined) document.delete(key)
  else document.set(key, value)
  if (value === undefined && !document.contents?.items?.length) return body
  const out = document.toString().trimEnd()
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const block = out ? `---${newline}${out}${newline}---${newline}` : `---${newline}---${newline}`
  return block + body
}

/** Removes the entire leading YAML frontmatter block, returning only the Markdown body. */
export function removeFrontmatter(text) {
  return splitFrontmatter(text).body
}

/** Line number (1-based) of the title in a CodeMirror document: 1, or the line after the YAML block. */
export function titleLineNumber(doc) {
  if (!/^---[ \t]*$/.test(doc.line(1).text)) return 1
  for (let number = 2; number <= doc.lines; number++) {
    if (/^(?:---|\.\.\.)[ \t]*$/.test(doc.line(number).text))
      return Math.min(number + 1, Math.max(doc.lines, number + 1))
  }
  return 1
}

/** How many leading lines (fences included) belong to the YAML block of a note split into lines. */
export function frontmatterLineCount(lines) {
  if (!/^---[ \t]*\r?$/.test(lines[0] ?? '')) return 0
  for (let index = 1; index < lines.length; index++)
    if (/^(?:---|\.\.\.)[ \t]*\r?$/.test(lines[index])) return index + 1
  return 0
}

/** The text with the YAML block blanked out, keeping every offset and line number. */
export function maskFrontmatter(text) {
  const end = frontmatterEnd(text)
  return end ? text.slice(0, end).replace(/[^\n]/g, ' ') + text.slice(end) : text
}

/**
 * The text with a property renamed in place (its value, comments and position are kept).
 * Returns `null` when the block cannot be edited, the property does not exist or the new name is
 * empty or already used.
 */
export function renameProperty(text, from, to) {
  const name = to.trim()
  if (!name || name === from) return null
  const { raw, yaml, body } = splitFrontmatter(text)
  const read = readProperties(text)
  if (!read.ok || yaml === null) return null
  if (read.entries.some((entry) => entry.key === name)) return null
  const document = parseDocument(yaml, options)
  const pair = document.contents?.items.find(
    (item) => isScalar(item.key) && String(item.key.value) === from,
  )
  if (!pair) return null
  pair.key.value = name
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  return `---${newline}${document.toString().trimEnd()}${newline}---${newline}${body}`
}
