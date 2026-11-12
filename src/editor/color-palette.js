import { TEXT_COLORS, BACKGROUND_COLORS, colorStyle } from '../document-palette.js'
import { t } from '../i18n.js'

// The text and background swatches, with a reset button.
export function colorPalettePanel({ value = {}, text = true, onChange, onReset }) {
  const panel = document.createElement('div')
  panel.className = 'color-palette'
  for (const [property, colors] of text
    ? [
        ['color', TEXT_COLORS],
        ['background', BACKGROUND_COLORS],
      ]
    : [['background', BACKGROUND_COLORS]]) {
    const label = document.createElement('div')
    label.className = 'color-palette-label'
    label.textContent = t(property === 'color' ? 'colors.text' : 'colors.background')
    const grid = document.createElement('div')
    grid.className = 'color-palette-grid'
    grid.setAttribute('role', 'group')
    grid.setAttribute('aria-label', label.textContent)
    for (const color of colors) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `color-choice${color === 'none' ? ' color-choice-none' : ''}`
      button.setAttribute('aria-label', t(`colors.name.${color}`))
      button.title = t(`colors.name.${color}`)
      button.setAttribute(
        'aria-pressed',
        String((value[property] || (property === 'color' ? 'default' : 'none')) === color),
      )
      if (property === 'color') {
        button.textContent = 'A'
        button.style.color = colorStyle(color) || ''
      } else button.style.background = colorStyle(color, true) || ''
      button.onmousedown = (event) => event.preventDefault()
      button.onclick = () => onChange(property, color)
      grid.append(button)
    }
    panel.append(label, grid)
  }
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'color-reset'
  reset.textContent = t('colors.reset')
  reset.onmousedown = (event) => event.preventDefault()
  reset.onclick = onReset
  panel.append(reset)
  return panel
}
