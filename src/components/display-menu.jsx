import { useEffect, useRef, useState } from 'react'
import {
  Minus,
  Plus,
  RotateCcw,
  Type,
  MoveHorizontal,
  Monitor,
  Sun,
  Moon,
  Focus,
} from 'lucide-react'
import { FONT_SIZE, CONTENT_WIDTH, contentWidth } from '../storage.js'
import { t } from '../i18n.js'
import { Shortcut } from './main-menu.jsx'

/**
 * The "Aa" popover in the header: theme, text size and text width. Appearance lives here
 * so the main menu only holds actions.
 */
export function DisplayMenu({ prefs, onChange, focusMode, onToggleFocus }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  function close(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) setTimeout(() => trigger.current?.focus(), 0)
  }
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() =>
      panel.current?.querySelector('[aria-checked="true"], button:not(:disabled)')?.focus(),
    )
    const onPointer = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])
  return (
    <div className="display-menu-wrap" ref={wrap}>
      <button
        ref={trigger}
        className="icon-button display-trigger"
        aria-label={t('display.title')}
        title={t('display.title')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="display-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">Aa</span>
      </button>
      {open && (
        <div
          id="display-menu"
          ref={panel}
          className="display-menu"
          role="region"
          aria-label={t('display.title')}
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll('[role^="menuitem"]:not(:disabled)'),
            ]
            const index = items.indexOf(document.activeElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              items[
                (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
              ]?.focus()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
            if (event.key === 'Tab') close(false)
          }}
        >
          <div role="menu" aria-label={t('display.title')}>
            <button
              className="display-focus-toggle"
              role="menuitemcheckbox"
              aria-checked={focusMode}
              disabled={!onToggleFocus}
              onClick={() => {
                close(false)
                onToggleFocus?.()
              }}
            >
              <Focus size={16} aria-hidden="true" />
              <span>{t('focus.toggle')}</span>
              <Shortcut keys="Alt+F" />
            </button>
            <div className="menu-heading" role="presentation">
              {t('settings.theme')}
            </div>
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
                  <Icon size={14} aria-hidden="true" />
                  {label}
                  <output role="presentation">{value}px</output>
                </span>
                <div className="adjustment-meter" aria-hidden="true">
                  <span
                    style={{
                      '--fill': `${((value - range.min) / (range.max - range.min)) * 100}%`,
                    }}
                  />
                </div>
                <div className="adjustment-buttons" role="presentation">
                  <button
                    role="menuitem"
                    aria-label={`${label}: ${t('adjust.decrease')}`}
                    disabled={value <= range.min}
                    onClick={() => onChange({ [key]: Math.max(range.min, value - step) })}
                  >
                    <Minus size={13} />
                    <Shortcut keys={`${modifier}-`} />
                  </button>
                  <button
                    role="menuitem"
                    aria-label={`${label}: ${t('settings.fontReset')}`}
                    title={t('settings.fontReset')}
                    disabled={value === range.default}
                    onClick={() => onChange({ [key]: range.default })}
                  >
                    <RotateCcw size={13} />
                    <Shortcut keys={`${modifier}0`} />
                  </button>
                  <button
                    role="menuitem"
                    aria-label={`${label}: ${t('adjust.increase')}`}
                    disabled={value >= range.max}
                    onClick={() => onChange({ [key]: Math.min(range.max, value + step) })}
                  >
                    <Plus size={13} />
                    <Shortcut keys={`${modifier}+`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
