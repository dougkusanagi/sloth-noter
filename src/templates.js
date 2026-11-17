/** Built-in note templates and the insertion variables replaced when a note is created. */

const CURSOR = '{{cursor}}'

const howTo = {
  'pt-BR': [
    '<details>',
    '<summary>Como usar este modelo</summary>',
    '',
    '- Cada tarefa começa com um verbo e descreve um resultado que dá para conferir.',
    '- Marque o andamento no círculo: `[ ]` a fazer, `[/]` fazendo, `[>]` esperando, `[x]` feita, `[-]` cancelada.',
    '- Escreva o prazo e quem cuida da tarefa na própria linha.',
    '- Apague este bloco quando não precisar mais dele.',
    '',
    '</details>',
  ],
  en: [
    '<details>',
    '<summary>How to use this template</summary>',
    '',
    '- Start each task with a verb and describe a result you can check.',
    '- Mark progress on the circle: `[ ]` to do, `[/]` doing, `[>]` waiting, `[x]` done, `[-]` cancelled.',
    '- Write the due date and the owner on the task line.',
    '- Delete this block when you no longer need it.',
    '',
    '</details>',
  ],
}

const templates = {
  tasks: {
    'pt-BR': {
      label: 'Tarefas e projeto',
      description: 'Objetivo, critério de pronto e tarefas com status.',
      body: [
        '# {{title}}',
        '',
        'Criado em {{date}}',
        '',
        ...howTo['pt-BR'],
        '',
        '## Objetivo',
        '',
        '{{cursor}}',
        '',
        '## Critério de pronto',
        '',
        '- Como saber que o projeto terminou?',
        '',
        '## Tarefas',
        '',
        '- [ ] Escrever a primeira tarefa',
        '- [/] Tarefa em andamento',
        '- [>] Tarefa esperando alguém',
        '- [x] Tarefa feita',
        '- [-] Tarefa cancelada',
        '',
        '## Esperando',
        '',
        '## Decisões',
        '',
        '## Registro',
        '',
        '- {{date}}: nota criada.',
        '',
        '## Links',
        '',
      ],
    },
    en: {
      label: 'Tasks and project',
      description: 'Goal, definition of done and tasks with status.',
      body: [
        '# {{title}}',
        '',
        'Created on {{date}}',
        '',
        ...howTo.en,
        '',
        '## Goal',
        '',
        '{{cursor}}',
        '',
        '## Definition of done',
        '',
        '- How will you know the project is finished?',
        '',
        '## Tasks',
        '',
        '- [ ] Write the first task',
        '- [/] Task in progress',
        '- [>] Task waiting for someone',
        '- [x] Task done',
        '- [-] Task cancelled',
        '',
        '## Waiting',
        '',
        '## Decisions',
        '',
        '## Log',
        '',
        '- {{date}}: note created.',
        '',
        '## Links',
        '',
      ],
    },
  },
  meeting: {
    'pt-BR': {
      label: 'Reunião',
      description: 'Pauta, anotações, decisões e próximos passos.',
      body: [
        '# Reunião {{date:YYYY-MM-DD}}',
        '',
        'Data: {{date}} às {{time}}',
        '',
        'Participantes: {{cursor}}',
        '',
        '## Pauta',
        '',
        '- ',
        '',
        '## Anotações',
        '',
        '## Decisões',
        '',
        '## Próximos passos',
        '',
        '- [ ] Ação — responsável — prazo',
        '',
      ],
    },
    en: {
      label: 'Meeting',
      description: 'Agenda, notes, decisions and next steps.',
      body: [
        '# Meeting {{date:YYYY-MM-DD}}',
        '',
        'Date: {{date}} at {{time}}',
        '',
        'Attendees: {{cursor}}',
        '',
        '## Agenda',
        '',
        '- ',
        '',
        '## Notes',
        '',
        '## Decisions',
        '',
        '## Next steps',
        '',
        '- [ ] Action — owner — due date',
        '',
      ],
    },
  },
  daily: {
    'pt-BR': {
      label: 'Diário',
      description: 'Três prioridades, anotações e pendências para amanhã.',
      body: [
        '# Diário {{date:YYYY-MM-DD}}',
        '',
        '## Três prioridades',
        '',
        '- [ ] {{cursor}}',
        '- [ ] ',
        '- [ ] ',
        '',
        '## Anotações',
        '',
        '## Pendências para amanhã',
        '',
      ],
    },
    en: {
      label: 'Daily note',
      description: 'Three priorities, notes and tasks for tomorrow.',
      body: [
        '# Daily {{date:YYYY-MM-DD}}',
        '',
        '## Three priorities',
        '',
        '- [ ] {{cursor}}',
        '- [ ] ',
        '- [ ] ',
        '',
        '## Notes',
        '',
        '## For tomorrow',
        '',
      ],
    },
  },
  decision: {
    'pt-BR': {
      label: 'Decisão',
      description: 'Contexto, opções, decisão e consequências.',
      body: [
        '# {{title}}',
        '',
        'Data: {{date}}',
        '',
        '## Contexto',
        '',
        '{{cursor}}',
        '',
        '## Opções',
        '',
        '- ',
        '',
        '## Decisão',
        '',
        '## Consequências',
        '',
      ],
    },
    en: {
      label: 'Decision',
      description: 'Context, options, decision and consequences.',
      body: [
        '# {{title}}',
        '',
        'Date: {{date}}',
        '',
        '## Context',
        '',
        '{{cursor}}',
        '',
        '## Options',
        '',
        '- ',
        '',
        '## Decision',
        '',
        '## Consequences',
        '',
      ],
    },
  },
  study: {
    'pt-BR': {
      label: 'Estudo e resumo',
      description: 'Perguntas, anotações e resumo final.',
      body: [
        '# {{title}}',
        '',
        '## Perguntas',
        '',
        '- {{cursor}}',
        '',
        '## Anotações',
        '',
        '## Resumo',
        '',
      ],
    },
    en: {
      label: 'Study and summary',
      description: 'Questions, notes and final summary.',
      body: [
        '# {{title}}',
        '',
        '## Questions',
        '',
        '- {{cursor}}',
        '',
        '## Notes',
        '',
        '## Summary',
        '',
      ],
    },
  },
}

const DEFAULT_TITLE = { 'pt-BR': 'Nova nota', en: 'New note' }
const LOCALES = { 'pt-BR': 'pt-BR', en: 'en-US' }

/** Every built-in template for the language, as `{ id, label, description, body }`. */
export function templateList(language = 'pt-BR') {
  return Object.entries(templates).map(([id, byLanguage]) => {
    const item = byLanguage[language] ?? byLanguage['pt-BR']
    return { id, label: item.label, description: item.description, body: item.body.join('\n') }
  })
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
  }
  const text = body.replace(/\{\{\s*([a-z]+)(?::([^}]*))?\s*\}\}/g, (match, name, format) => {
    if (name === 'cursor') return match
    if (name === 'date' && format !== undefined) return formatDate(now, format.trim())
    return format === undefined && name in values ? values[name] : match
  })
  const at = text.indexOf(CURSOR)
  if (at < 0) return { text, cursor: text.length }
  return { text: text.replace(CURSOR, ''), cursor: at }
}
