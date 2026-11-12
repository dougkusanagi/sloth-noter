import { TEXT_COLORS, BACKGROUND_COLORS, colorStyle } from '../document-palette.js'
import { t } from '../i18n.js'

export function ColorPalette({ text = true, value = {}, onChange, onReset }) {
  return (
    <div className="color-palette">
      {(text
        ? [
            ['color', TEXT_COLORS],
            ['background', BACKGROUND_COLORS],
          ]
        : [['background', BACKGROUND_COLORS]]
      ).map(([property, colors]) => (
        <div key={property}>
          <div className="color-palette-label">
            {t(property === 'color' ? 'colors.text' : 'colors.background')}
          </div>
          <div
            className="color-palette-grid"
            role="group"
            aria-label={t(property === 'color' ? 'colors.text' : 'colors.background')}
          >
            {colors.map((color) => (
              <button
                type="button"
                key={color}
                className={`color-choice${color === 'none' ? ' color-choice-none' : ''}`}
                aria-label={t(`colors.name.${color}`)}
                title={t(`colors.name.${color}`)}
                aria-pressed={
                  (value[property] || (property === 'color' ? 'default' : 'none')) === color
                }
                style={
                  property === 'color'
                    ? { color: colorStyle(color) }
                    : { background: colorStyle(color, true) }
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange(property, color)}
              >
                {property === 'color' ? 'A' : ''}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="color-reset"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onReset}
      >
        {t('colors.reset')}
      </button>
    </div>
  )
}
