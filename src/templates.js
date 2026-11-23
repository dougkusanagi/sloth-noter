/** Built-in note templates and the insertion variables replaced when a note is created. */

const CURSOR = '{{cursor}}'

/**
 * Built-in templates. Each one is short: a title, a one-line subtitle and a few sections that
 * start with an empty item to type in. No sample content and no instruction blocks.
 */
const templates = {
  board: {
    // A task note (ADR 0033), opened in Board mode once applied: each section is a column.
    mode: 'board',
    'pt-BR': {
      label: 'Tarefas',
      description: 'Nota de tarefas com quadro: Fazer, Fazendo, Esperando e Feito.',
      body: [
        '# {{title}}',
        '',
        '## Fazer',
        '- [ ] {{cursor}}',
        '',
        '## Fazendo',
        '',
        '## Esperando',
        '',
        '## Feito',
        '',
      ],
    },
    en: {
      label: 'Tasks',
      description: 'Task note with a board: To do, Doing, Waiting and Done.',
      body: [
        '# {{title}}',
        '',
        '## To do',
        '- [ ] {{cursor}}',
        '',
        '## Doing',
        '',
        '## Waiting',
        '',
        '## Done',
        '',
      ],
    },
  },
  meeting: {
    'pt-BR': {
      label: 'Reunião',
      description: 'Participantes, pauta, anotações e próximos passos.',
      body: [
        '# Reunião {{date:YYYY-MM-DD}}',
        '{{weekday}}, {{date}}, {{time}}',
        '',
        '## Participantes',
        '- {{cursor}}',
        '## Pauta',
        '- ',
        '## Anotações',
        '- ',
        '## Próximos passos',
        '- [ ] ',
        '',
      ],
    },
    en: {
      label: 'Meeting',
      description: 'Attendees, agenda, notes and next steps.',
      body: [
        '# Meeting {{date:YYYY-MM-DD}}',
        '{{weekday}}, {{date}}, {{time}}',
        '',
        '## Attendees',
        '- {{cursor}}',
        '## Agenda',
        '- ',
        '## Notes',
        '- ',
        '## Next steps',
        '- [ ] ',
        '',
      ],
    },
  },
  daily: {
    'pt-BR': {
      label: 'Diário',
      description: 'Prioridades do dia, anotações e pendências.',
      body: [
        '# Diário {{date:YYYY-MM-DD}}',
        '{{weekday}}, {{date}}',
        '',
        '## Prioridades',
        '- [ ] {{cursor}}',
        '## Anotações',
        '- ',
        '## Para amanhã',
        '- [ ] ',
        '',
      ],
    },
    en: {
      label: 'Daily note',
      description: "The day's priorities, notes and open items.",
      body: [
        '# Daily {{date:YYYY-MM-DD}}',
        '{{weekday}}, {{date}}',
        '',
        '## Priorities',
        '- [ ] {{cursor}}',
        '## Notes',
        '- ',
        '## For tomorrow',
        '- [ ] ',
        '',
      ],
    },
  },
}

const WEEKDAY = { 'pt-BR': 'pt-BR', en: 'en-US' }
let profileName = ''

/** The active profile's name, for `{{profile}}`; empty when there is none. */
export function setTemplateProfile(name) {
  profileName = name ?? ''
}

const DEFAULT_TITLE = { 'pt-BR': 'Nova nota', en: 'New note' }
const LOCALES = { 'pt-BR': 'pt-BR', en: 'en-US' }

let ownTemplates = []

/** Notes the person marked as templates, from `preferences.templateNotes` (ADR 0026). */
export function setOwnTemplates(notes, marked, description = '') {
  ownTemplates = (notes ?? [])
    .filter((note) => marked?.[note.id] && !note.external)
    .map((note) => ({
      id: `note:${note.id}`,
      label: note.name.replace(/\.md$/i, ''),
      description,
      body: note.body,
      own: true,
    }))
}

/** The person's templates first, then the built-in ones: `{ id, label, description, body }`. */
export function templateList(language = 'pt-BR') {
  const builtIn = Object.entries(templates).map(([id, byLanguage]) => {
    const item = byLanguage[language] ?? byLanguage['pt-BR']
    return {
      id,
      label: item.label,
      description: item.description,
      body: item.body.join('\n'),
      ...(byLanguage.mode && { mode: byLanguage.mode }),
    }
  })
  return [...ownTemplates, ...builtIn]
}

const pad = (value) => String(value).padStart(2, '0')

function formatDate(now, pattern) {
  const tokens = {
    YYYY: now.getFullYear(),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
  }
  return pattern.replace(/YYYY|MM|DD|HH|mm/g, (token) => tokens[token])
}

/**
 * Replaces `{{title}}`, `{{date}}`, `{{time}}`, `{{date:FORMAT}}` and `{{cursor}}`.
 * Unknown variables stay as written. Returns the text and the cursor offset (end of text when
 * the template has no `{{cursor}}`).
 */
export function renderTemplate(body, { title, now = new Date(), language = 'pt-BR' } = {}) {
  const locale = LOCALES[language] ?? LOCALES['pt-BR']
  const values = {
    title: title ?? DEFAULT_TITLE[language] ?? DEFAULT_TITLE['pt-BR'],
    date: new Intl.DateTimeFormat(locale).format(now),
    time: formatDate(now, 'HH:mm'),
    profile: profileName,
  }
  const text = body.replace(
    /\{\{\s*([a-z]+)(?:([+-]\d+)d|:([^}]*))?\s*\}\}/g,
    (match, name, offset, format) => {
      if (name === 'cursor') return match
      if (name === 'date' && offset !== undefined) {
        const moved = new Date(now)
        moved.setDate(moved.getDate() + Number(offset))
        return new Intl.DateTimeFormat(locale).format(moved)
      }
      if (name === 'date' && format !== undefined) return formatDate(now, format.trim())
      if (offset !== undefined || format !== undefined) return match
      if (name === 'weekday')
        return new Intl.DateTimeFormat(WEEKDAY[language] ?? 'pt-BR', { weekday: 'long' }).format(
          now,
        )
      return name in values ? values[name] : match
    },
  )
  const at = text.indexOf(CURSOR)
  if (at < 0) return { text, cursor: text.length }
  return { text: text.replace(CURSOR, ''), cursor: at }
}

/**
 * Editor change that inserts a template into an existing note at the selection. The template's
 * own title and description lines are dropped (the note already has them); `{{title}}` is the current title.
 */
export function templateInsertEdit(text, from, to, id, language = 'pt-BR', now = new Date()) {
  const template = templateList(language).find((item) => item.id === id)
  if (!template) return null
  const title = /^# (.*)$/m.exec(text)?.[1]?.trim() || undefined
  // The line under the title is the note's description: the open note keeps its own.
  const withoutTitle = template.body.replace(/^# .*\n(?:(?![#\s-]).*\n)?\n*/, '')
  const { text: insert, cursor } = renderTemplate(withoutTitle, { title, now, language })
  const before = text.slice(0, from)
  const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
  return {
    from,
    to,
    insert: lead + insert,
    selectionFrom: from + lead.length + cursor,
    selectionTo: from + lead.length + cursor,
  }
}
