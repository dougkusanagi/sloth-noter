import { FONT_SIZE } from '../storage.js'

/** Radio group drawn as a segmented control. The native inputs stay for keyboard and AT. */
export function Segmented({ name, label, options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(({ id, text, Icon }) => (
        <label key={id}>
          <input type="radio" name={name} checked={value === id} onChange={() => onChange(id)} />
          {Icon && <Icon size={14} aria-hidden="true" />}
          <span>{text}</span>
        </label>
      ))}
    </div>
  )
}

export function Switch({ id, checked, onChange }) {
  return (
    <input
      id={id}
      className="switch"
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}

export function FontSlider({ id, value, onChange }) {
  const fill = ((value - FONT_SIZE.min) / (FONT_SIZE.max - FONT_SIZE.min)) * 100
  return (
    <input
      id={id}
      className="slider"
      type="range"
      min={FONT_SIZE.min}
      max={FONT_SIZE.max}
      value={value}
      style={{ '--fill': `${fill}%` }}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}
