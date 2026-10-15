import { Minus, Plus, RotateCcw, Type, MoveHorizontal, Monitor, Sun, Moon } from 'lucide-react'
import { FONT_SIZE, CONTENT_WIDTH, contentWidth } from '../storage.js'
import { t } from '../i18n.js'
import { buildCommands } from '../commands.js'

const KEY_LABELS = { Shift: '⇧', Delete: 'Del' }

const modifierKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl')
const isBare = (keys) => /^F\d+$/.test(keys) // function keys need no modifier

/** Plain text of a shortcut as the user reads it, for searching: "ctrl+shift+l". */
export function shortcutText(keys) {
  return (isBare(keys) ? keys : `${modifierKey()}+${keys}`).toLowerCase()
}

export function Shortcut({ keys }) {
  const parts = keys.endsWith('+')
    ? [...keys.slice(0, -1).split('+').filter(Boolean), '+']
    : keys.split('+')
  const bare = isBare(keys)
  return (
    <span className="menu-shortcut" aria-label={shortcutText(keys)}>
      {(bare ? parts : [modifierKey(), ...parts]).map((key, index) => (
        <kbd key={index}>{KEY_LABELS[key] ?? key}</kbd>
      ))}
    </span>
  )
}

export function MainMenu({
  firstRef,
  active,
  activePinned,
  prefs,
  mode,
  sidebarVisible,
  trashCount,
  desktop,
  actions,
  onClose,
  onChange,
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
            {group === 'menu.view' && (
              <div className="menu-adjustments" role="presentation">
                <div className="menu-theme" role="group" aria-label={t('settings.theme')}>
                  {[
                    ['system', Monitor],
                    ['light', Sun],
                    ['dark', Moon],
                  ].map(([theme, Icon]) => (
                    <button
                      key={theme}
                      role="menuitemradio"
                      aria-checked={prefs.theme === theme}
                      onClick={() => onChange({ theme })}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {t(`theme.${theme}`)}
                    </button>
                  ))}
                </div>

                {[
                  ['fontSize', t('settings.fontSize'), Type, prefs.fontSize, FONT_SIZE, 1, ''],
                  [
                    'contentWidth',
                    t('settings.contentWidth'),
                    MoveHorizontal,
                    contentWidth(prefs),
                    CONTENT_WIDTH,
                    CONTENT_WIDTH.step,
                    'Alt+',
                  ],
                ].map(([key, label, Icon, value, range, step, modifier]) => (
                  <div className="menu-adjustment" key={key} role="group" aria-label={label}>
                    <span className="adjustment-label">
                      <Icon size={15} aria-hidden="true" />
                      {label}
                      <output role="presentation">{value}px</output>
                    </span>
                    <div className="adjustment-buttons" role="presentation">
                      <button
                        role="menuitem"
                        aria-label={`${label}: ${t('adjust.decrease')}`}
                        disabled={value <= range.min}
                        onClick={() => onChange({ [key]: Math.max(range.min, value - step) })}
                      >
                        <Minus size={14} />
                        <Shortcut keys={`${modifier}-`} />
                      </button>
                      <button
                        role="menuitem"
                        aria-label={`${label}: ${t('settings.fontReset')}`}
                        title={t('settings.fontReset')}
                        disabled={value === range.default}
                        onClick={() => onChange({ [key]: range.default })}
                      >
                        <RotateCcw size={14} />
                        <Shortcut keys={`${modifier}0`} />
                      </button>
                      <button
                        role="menuitem"
                        aria-label={`${label}: ${t('adjust.increase')}`}
                        disabled={value >= range.max}
                        onClick={() => onChange({ [key]: Math.min(range.max, value + step) })}
                      >
                        <Plus size={14} />
                        <Shortcut keys={`${modifier}+`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {entries.map(([id, label, Icon, keys, disabled]) => (
              <button
                key={id}
                ref={id === 'newNote' ? firstRef : null}
                role="menuitem"
                disabled={disabled}
                className={
                  id === mode || (id === 'sidebar' && sidebarVisible) ? 'menu-active' : undefined
                }
                onClick={actions[id]}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="menu-item-label">{t(label)}</span>
                {keys && <Shortcut keys={keys} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
