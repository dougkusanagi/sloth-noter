const KEY_LABELS = { Shift: '⇧', Delete: 'Del' }

const modifierKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl')
const isBare = (keys) => /^(F\d+|Esc|Enter|Shift\+Enter)$/.test(keys)

/** Plain text of a shortcut as the user reads it, for searching. */
export function shortcutText(keys) {
  return (isBare(keys) ? keys : `${modifierKey()}+${keys}`).toLowerCase()
}

export function Shortcut({ keys }) {
  const parts = keys.endsWith('+')
    ? [...keys.slice(0, -1).split('+').filter(Boolean), '+']
    : keys.split('+')
  return (
    <span className="menu-shortcut" aria-label={shortcutText(keys)}>
      {(isBare(keys) ? parts : [modifierKey(), ...parts]).map((key, index) => (
        <kbd key={index}>{KEY_LABELS[key] ?? key}</kbd>
      ))}
    </span>
  )
}
