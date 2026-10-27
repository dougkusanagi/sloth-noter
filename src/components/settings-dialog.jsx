import { useState } from 'react'
import {
  Monitor,
  Sun,
  Moon,
  Palette,
  Type,
  Database,
  Keyboard,
  History,
  NotebookPen,
  X,
} from 'lucide-react'
import { HistoryPanel } from './history-panel.jsx'
import { Modal, ShortcutList } from './dialogs.jsx'
import { FontSlider, RangeSlider, Segmented, Switch } from './controls.jsx'
import { CONTENT_WIDTH, FONT_SIZE, contentWidth } from '../storage.js'
import { LANGUAGES, t } from '../i18n.js'

const THEMES = [
  ['system', Monitor],
  ['light', Sun],
  ['dark', Moon],
]

const SECTIONS = [
  ['appearance', Palette],
  ['editor', Type],
  ['data', Database],
  ['history', History],
  ['shortcuts', Keyboard],
  ['changelog', NotebookPen],
]

function Row({ id, title, hint, children }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <label htmlFor={id}>{title}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Action({ title, hint, label, onClick }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span>{title}</span>
        <p>{hint}</p>
      </div>
      <button className="button" onClick={onClick}>
        {label}
      </button>
    </div>
  )
}

const focusable = (dialog) =>
  [...dialog.querySelectorAll('button, input, summary, a[href]')].filter(
    (element) =>
      !element.disabled &&
      element.getClientRects().length > 0 &&
      (element.type !== 'radio' || element.checked),
  )

export function SettingsDialog({
  prefs,
  sidebarVisible,
  desktop,
  folder,
  note,
  history,
  initialSection = 'appearance',
  onRestore,
  onChange,
  onRun,
  onClose,
}) {
  const [section, setSection] = useState(initialSection)
  return (
    <Modal
      label={t('menu.settings')}
      className="settings-dialog"
      backdropClose={onClose}
      onEscape={onClose}
      focusables={focusable}
    >
      <header className="settings-head">
        <h2>{t('menu.settings')}</h2>
        <button className="icon-button" aria-label={t('dialog.close')} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label={t('menu.settings')}>
          {SECTIONS.map(([id, Icon]) => (
            <button
              key={id}
              autoFocus={id === section}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => (id === 'changelog' ? onRun('changelog') : setSection(id))}
            >
              <Icon size={15} aria-hidden="true" />
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          <h3>{t(`settings.${section}`)}</h3>
          {section === 'appearance' && (
            <>
              <Row title={t('settings.theme')} hint={t('settings.themeHint')}>
                <Segmented
                  name="theme"
                  label={t('settings.theme')}
                  options={THEMES.map(([id, Icon]) => ({ id, Icon, text: t(`theme.${id}`) }))}
                  value={prefs.theme}
                  onChange={(theme) => onChange({ theme })}
                />
              </Row>
              <Row title={t('settings.language')} hint={t('settings.languageHint')}>
                <Segmented
                  name="language"
                  label={t('settings.language')}
                  options={Object.entries(LANGUAGES).map(([id, text]) => ({ id, text }))}
                  value={prefs.language}
                  onChange={(language) => onChange({ language })}
                />
              </Row>
              <Row id="settings-tabs" title={t('settings.tabs')} hint={t('settings.tabsHint')}>
                <Switch
                  id="settings-tabs"
                  checked={prefs.tabsVisible}
                  onChange={(tabsVisible) => onChange({ tabsVisible })}
                />
              </Row>
              <Row
                id="settings-status"
                title={t('settings.status')}
                hint={t('settings.statusHint')}
              >
                <Switch
                  id="settings-status"
                  checked={prefs.statusVisible !== false}
                  onChange={(statusVisible) => onChange({ statusVisible })}
                />
              </Row>
              <Row
                id="settings-sidebar"
                title={t('settings.sidebar')}
                hint={t('settings.sidebarHint')}
              >
                <Switch
                  id="settings-sidebar"
                  checked={sidebarVisible}
                  onChange={(visible) => onChange({ sidebarVisible: visible })}
                />
              </Row>
            </>
          )}
          {section === 'editor' && (
            <>
              <Row id="settings-font" title={t('settings.fontSize')} hint={t('settings.fontHint')}>
                <FontSlider
                  id="settings-font"
                  value={prefs.fontSize}
                  onChange={(fontSize) => onChange({ fontSize })}
                />
                <output htmlFor="settings-font">{prefs.fontSize}px</output>
                <button
                  className="button quiet"
                  disabled={prefs.fontSize === FONT_SIZE.default}
                  onClick={() => onChange({ fontSize: FONT_SIZE.default })}
                >
                  {t('settings.fontReset')}
                </button>
              </Row>
              <Row
                id="settings-width"
                title={t('settings.contentWidth')}
                hint={t('settings.contentWidthHint')}
              >
                <RangeSlider
                  id="settings-width"
                  value={contentWidth(prefs)}
                  min={CONTENT_WIDTH.min}
                  max={CONTENT_WIDTH.max}
                  step={CONTENT_WIDTH.step}
                  onChange={(width) => onChange({ contentWidth: width })}
                />
                <output htmlFor="settings-width">{contentWidth(prefs)}px</output>
                <button
                  className="button quiet"
                  disabled={contentWidth(prefs) === CONTENT_WIDTH.default}
                  onClick={() => onChange({ contentWidth: CONTENT_WIDTH.default })}
                >
                  {t('settings.fontReset')}
                </button>
              </Row>
              <div className="setting-sample" style={{ '--editor-size': `${prefs.fontSize}px` }}>
                <strong>{t('settings.sampleTitle')}</strong>
                <p>{t('settings.sample')}</p>
              </div>
            </>
          )}
          {section === 'data' && (
            <>
              {desktop && (
                <Action
                  title={t('menu.folder')}
                  hint={folder || t('settings.folderHint')}
                  label={t('settings.change')}
                  onClick={() => onRun('folder')}
                />
              )}
              <Action
                title={t('settings.backup')}
                hint={t('settings.backupHint')}
                label={t('menu.backupDownload')}
                onClick={() => onRun('backup')}
              />
              <Action
                title={t('menu.backupRestore')}
                hint={t('settings.restoreHint')}
                label={t('settings.choose')}
                onClick={() => onRun('restoreBackup')}
              />
            </>
          )}
          {section === 'history' &&
            (desktop ? (
              <HistoryPanel
                prefs={prefs}
                note={note}
                history={history}
                onChange={onChange}
                onRestore={onRestore}
              />
            ) : (
              <p className="setting-empty">{t('history.desktopOnly')}</p>
            ))}
          {section === 'shortcuts' && <ShortcutList />}
        </div>
      </div>
    </Modal>
  )
}
