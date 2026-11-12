import { CONTENT_WIDTH, contentWidth } from '../storage.js'
import { t } from '../i18n.js'
export function DocumentWidthPresets({ prefs, onChange, inMenu = false }) {
  return (
    <div
      className="document-width-presets menu-theme"
      role="group"
      aria-label={t('settings.widthPresets')}
    >
      {[
        ['default', CONTENT_WIDTH.default],
        ['wide', 1100],
        ['full', CONTENT_WIDTH.max],
      ].map(([name, width], index) => {
        const checked =
          name === 'full'
            ? prefs.documentWidth === 'full'
            : prefs.documentWidth !== 'full' && contentWidth(prefs) === width
        return (
          <button
            key={name}
            type="button"
            role={inMenu ? 'menuitemradio' : undefined}
            aria-checked={inMenu ? checked : undefined}
            aria-pressed={inMenu ? undefined : checked}
            onClick={() =>
              onChange({ contentWidth: width, documentWidth: name === 'full' ? 'full' : 'custom' })
            }
          >
            <svg
              viewBox="0 0 48 30"
              width="24"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {[6, 12, 18, 24].map((y) => (
                <path key={y} d={`M${14 - index * 5} ${y}H${34 + index * 5}`} />
              ))}
            </svg>
            <span>{t(`width.${name}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
