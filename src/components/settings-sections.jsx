import { Switch } from './controls.jsx'
import { t } from '../i18n.js'

/**
 * Shared editor toggles (wrap lines & task dates) used by both desktop SettingsDialog
 * and the mobile settings screen.
 */
export function EditorToggleSettings({ prefs, onChange, variant = 'desktop' }) {
  const prefix = variant === 'mobile' ? 'mobile' : 'settings'
  const items = [
    {
      id: `${prefix}-wrap-lines`,
      title: t('settings.wrapLines'),
      hint: t('settings.wrapLinesHint'),
      checked: prefs.wrapLines !== false,
      onChange: (wrapLines) => onChange({ wrapLines }),
    },
    {
      id: `${prefix}-task-dates`,
      title: t('settings.taskDates'),
      hint: t('settings.taskDatesHint'),
      checked: prefs.taskDates !== false,
      onChange: (taskDates) => onChange({ taskDates }),
    },
  ]

  if (variant === 'mobile') {
    return (
      <>
        {items.map((item) => (
          <div key={item.id} className="settings-row">
            <label htmlFor={item.id}>
              {item.title}
              <small>{item.hint}</small>
            </label>
            <input
              id={item.id}
              type="checkbox"
              role="switch"
              className="switch"
              checked={item.checked}
              onChange={(event) => item.onChange(event.target.checked)}
            />
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="setting">
          <div className="setting-text">
            <label htmlFor={item.id}>{item.title}</label>
            {item.hint && <p>{item.hint}</p>}
          </div>
          <div className="setting-control">
            <Switch id={item.id} checked={item.checked} onChange={item.onChange} />
          </div>
        </div>
      ))}
    </>
  )
}
