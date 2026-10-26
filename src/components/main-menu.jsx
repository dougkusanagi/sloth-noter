import { t } from '../i18n.js'
import { buildCommands } from '../commands.js'
import { ShortcutButton } from './shortcut-button.jsx'
import { Shortcut } from './shortcut.jsx'
export { Shortcut, shortcutText } from './shortcut.jsx'

export function MainMenu({
  firstRef,
  active,
  activePinned,
  prefs,
  sidebarVisible,
  trashCount,
  desktop,
  actions,
  onClose,
}) {
  const groups = buildCommands({ active, activePinned, prefs, trashCount, desktop }).map(
    ([group, entries]) => [group, entries.filter((entry) => entry[5])],
  )
  return (
    <div
      id="main-menu"
      className="main-menu"
      role="region"
      aria-label={t('menu.main')}
      onKeyDown={(event) => {
        const items = [...event.currentTarget.querySelectorAll('[role^="menuitem"]:not(:disabled)')]
        const index = items.indexOf(document.activeElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          items[
            (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
          ]?.focus()
        }
        if (event.key === 'Home' && event.target.tagName !== 'INPUT') {
          event.preventDefault()
          items[0]?.focus()
        }
        if (event.key === 'End' && event.target.tagName !== 'INPUT') {
          event.preventDefault()
          items.at(-1)?.focus()
        }
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
        if (event.key === 'Tab') onClose(false)
      }}
    >
      <div role="menu" aria-label={t('menu.main')}>
        {groups.map(([group, entries]) => (
          <div className="menu-group" key={group} role="group" aria-label={t(group)}>
            <div className="menu-heading" role="presentation">
              {t(group)}
            </div>
            {entries.map(([id, label, Icon, keys, disabled]) => (
              <ShortcutButton
                key={id}
                label={t(label)}
                keys={keys}
                ref={id === 'newNote' ? firstRef : null}
                role="menuitem"
                disabled={disabled}
                className={id === 'sidebar' && sidebarVisible ? 'menu-active' : undefined}
                onClick={actions[id]}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="menu-item-label">{t(label)}</span>
                {keys && <Shortcut keys={keys} />}
              </ShortcutButton>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
