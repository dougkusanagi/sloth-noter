import { DEFAULT_LANGUAGE, isLanguage } from './i18n.js'

/** Editor text size in px. 16 keeps a page dense, closer to a plain-text editor. */
export const FONT_SIZE = { min: 12, max: 24, default: 16 }

export const STORAGE_KEY = 'sloth-note:v3'
export const V2_KEY = 'sloth-note:v2'
export const LEGACY_KEY = 'sloth-note:v1'

export function newDocument() {
  return {
    version: 3,
    notes: [
      {
        id: 'welcome',
        name: 'Welcome.md',
        body: [
          '# Welcome',
          '',
          'Suas alterações são salvas automaticamente; use Export .md para guardar uma cópia.',
          '',
          '## Texto e links',
          '',
          'Você pode escrever em **negrito**, *itálico* e `código em linha`. Visite [Markdown Guide](https://www.markdownguide.org/) para conhecer mais.',
          '',
          '> Uma citação destaca uma ideia importante sem interromper o fluxo.',
          '',
          '## Listas',
          '',
          '- Organize ideias em tópicos',
          '- Use #tags para encontrar assuntos',
          '- Experimente selecionar texto e clicar na barra',
          '',
          '1. Escreva uma nota',
          '2. Formate o texto',
          '3. Exporte quando quiser',
          '',
          '## Tabela',
          '',
          '| Recurso | Como usar |',
          '| --- | --- |',
          '| Barra de texto | Selecione palavras |',
          '| Inserir bloco | Clique em + numa linha vazia |',
          '',
          '## Bloco de código',
          '',
          '```js',
          'const nota = "Sua próxima ideia começa aqui"',
          '```',
        ].join('\n'),
        revision: 0,
      },
    ],
    trash: [],
    openIds: ['welcome'],
    activeId: 'welcome',
    preferences: {
      tabsVisible: true,
      theme: 'system',
      fontSize: FONT_SIZE.default,
      language: DEFAULT_LANGUAGE,
    },
  }
}

function validateNote(note, ids) {
  if (
    !note ||
    typeof note.id !== 'string' ||
    !note.id ||
    ids.has(note.id) ||
    typeof note.name !== 'string' ||
    !note.name ||
    typeof note.body !== 'string' ||
    !Number.isSafeInteger(note.revision) ||
    note.revision < 0
  )
    throw new Error('Invalid saved note')
  ids.add(note.id)
}

export function validateDocument(value) {
  if (
    !value ||
    value.version !== 3 ||
    !Array.isArray(value.notes) ||
    !Array.isArray(value.trash) ||
    !Array.isArray(value.openIds)
  )
    throw new Error('Invalid saved notes')
  const ids = new Set()
  for (const note of value.notes) validateNote(note, ids)
  for (const entry of value.trash) {
    if (
      !entry ||
      !Number.isSafeInteger(entry.index) ||
      entry.index < 0 ||
      !Number.isSafeInteger(entry.deletedAt) ||
      entry.deletedAt < 0
    )
      throw new Error('Invalid deleted note')
    validateNote(entry.note, ids)
  }
  const activeIds = new Set(value.notes.map((note) => note.id))
  if (
    new Set(value.openIds).size !== value.openIds.length ||
    value.openIds.some((id) => !activeIds.has(id))
  )
    throw new Error('Invalid open tabs')
  if (
    value.pinnedIds !== undefined &&
    (!Array.isArray(value.pinnedIds) ||
      new Set(value.pinnedIds).size !== value.pinnedIds.length ||
      value.pinnedIds.some((id) => !value.openIds.includes(id)))
  )
    throw new Error('Invalid pinned tabs')
  if (
    value.activeId !== null &&
    (!activeIds.has(value.activeId) || !value.openIds.includes(value.activeId))
  )
    throw new Error('Invalid active note')
  if ((value.openIds.length === 0) !== (value.activeId === null))
    throw new Error('Invalid active note')
  if (value.assets !== undefined) {
    if (
      !Array.isArray(value.assets) ||
      new Set(value.assets.map((image) => image.src)).size !== value.assets.length ||
      value.assets.some(
        (image) =>
          !image || typeof image.name !== 'string' || typeof image.src !== 'string' || !image.src,
      )
    )
      throw new Error('Invalid image library')
  }
  const prefs = value.preferences
  if (
    !prefs ||
    typeof prefs.tabsVisible !== 'boolean' ||
    !['system', 'light', 'dark'].includes(prefs.theme) ||
    !Number.isInteger(prefs.fontSize) ||
    prefs.fontSize < FONT_SIZE.min ||
    prefs.fontSize > FONT_SIZE.max ||
    (prefs.language !== undefined && !isLanguage(prefs.language))
  )
    throw new Error('Invalid preferences')
  return value
}

function migrateV1(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || value.notes.length === 0)
    throw new Error('Invalid legacy notes')
  const migrated = {
    version: 3,
    notes: value.notes,
    trash: [],
    openIds: value.notes.map((note) => note.id),
    activeId: value.activeId,
    preferences: {
      tabsVisible: true,
      theme: 'system',
      fontSize: FONT_SIZE.default,
      language: DEFAULT_LANGUAGE,
    },
  }
  return validateDocument(migrated)
}

function migrateV2(value) {
  if (!value || value.version !== 2) throw new Error('Invalid legacy notes')
  return validateDocument({ ...value, version: 3, trash: [] })
}

function message(error) {
  return error instanceof Error ? error.message : 'Storage is unavailable'
}

/**
 * Reads a document from raw payloads, without touching any storage API.
 *
 * `current` is the payload of the schema in use and `legacy` describes an older
 * record found by the adapter. The result keeps the caller's raw payload when
 * the data cannot be parsed, so nothing is replaced silently.
 */
export function readStoredDocument({ current, legacy }) {
  let document
  try {
    document =
      current !== null
        ? validateDocument(JSON.parse(current))
        : legacy === null
          ? newDocument()
          : legacy.source === 'v2'
            ? migrateV2(JSON.parse(legacy.raw))
            : migrateV1(JSON.parse(legacy.raw))
  } catch (error) {
    return {
      document: newDocument(),
      error: message(error),
      blocked: true,
      raw: current,
      needsWrite: false,
    }
  }
  return { document, error: null, blocked: false, raw: null, needsWrite: current === null }
}

export function serializeDocument(document) {
  validateDocument(document)
  return JSON.stringify(document)
}

export function loadDocument(storage) {
  let current = null
  let legacy = null
  try {
    current = storage.getItem(STORAGE_KEY)
    if (current === null) {
      const version2 = storage.getItem(V2_KEY)
      if (version2 !== null) legacy = { source: 'v2', raw: version2 }
      else {
        const version1 = storage.getItem(LEGACY_KEY)
        if (version1 !== null) legacy = { source: 'v1', raw: version1 }
      }
    }
  } catch (error) {
    return { document: newDocument(), error: message(error), blocked: true, raw: null }
  }
  const read = readStoredDocument({ current, legacy })
  if (!read.needsWrite)
    return { document: read.document, error: read.error, blocked: read.blocked, raw: read.raw }
  return {
    document: read.document,
    error: saveDocument(storage, read.document),
    blocked: false,
    raw: null,
  }
}

export function saveDocument(storage, document) {
  try {
    storage.setItem(STORAGE_KEY, serializeDocument(document))
    return null
  } catch (error) {
    return message(error)
  }
}
