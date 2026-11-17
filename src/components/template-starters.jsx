import { Bookmark, CalendarDays, Columns3, Users } from 'lucide-react'
import { t } from '../i18n.js'

const ICONS = {
  board: Columns3,
  meeting: Users,
  daily: CalendarDays,
}

/** The icon of a template: its own drawing for the built-in ones, a bookmark for the person's. */
export function TemplateIcon({ id, size = 18 }) {
  const Icon = ICONS[id] ?? Bookmark
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}

/** "Start with" buttons shown on an empty new note, one per template, each with its icon. */
export function TemplateStarters({ templates, position, onPick }) {
  return (
    <div
      className="template-starters"
      role="group"
      aria-label={t('templates.startLabel')}
      style={{ left: position.x, top: position.y, width: position.width }}
    >
      <p className="template-starters-title">{t('templates.startWith')}</p>
      <div className="template-starters-list">
        {templates.map((item) => (
          <button
            key={item.id}
            type="button"
            className="template-starter"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item.id)}
          >
            <span className="template-starter-icon">
              <TemplateIcon id={item.id} />
            </span>
            <span className="template-starter-text">
              <strong>{item.label}</strong>
              {item.description && <small>{item.description}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
