import { useState } from 'react'
import {
  FilePlus,
  Search,
  ScanSearch,
  Pencil,
  X,
  Trash2,
  Undo2,
  Image,
  Upload,
  Download,
  FolderOpen,
  Archive,
  PanelLeft,
  PanelsTopLeft,
  SunMoon,
  Globe,
  Minus,
  Plus,
  Eye,
  Code,
  BookOpen,
  Keyboard,
} from 'lucide-react'
import { t, LANGUAGES } from '../i18n.js'

export function Shortcut({ keys }) {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  return (
    <span className="menu-shortcut" aria-label={`${modifier}+${keys}`}>
      <kbd>{modifier}</kbd>
      {(keys === '+' ? ['+'] : keys.split('+')).map((key, index) => (
        <span key={index}>
          + <kbd>{key}</kbd>
        </span>
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
}) {
  const [query, setQuery] = useState('')
  const groups = [
    [
      'menu.notes',
      [
        ['newNote', 'menu.newNote', FilePlus, 'T'],
        ['findNote', 'menu.findNote', Search, 'P'],
        ['findInNote', 'menu.findInNote', ScanSearch, 'F', !active],
        ['rename', 'menu.rename', Pencil, 'Shift+R', !active],
        ['closeTab', 'tabs.close', X, 'W', !active || activePinned],
        ['trashMove', 'menu.trashMove', Trash2, 'Shift+Delete', !active],
        ['undoDelete', 'menu.undoDelete', Undo2, undefined, !trashCount],
      ],
    ],
    [
      'menu.files',
      [
        ['images', 'images.title', Image, 'Shift+I'],
        ['addImage', 'images.import', Plus, 'Alt+I'],
        ['import', 'menu.import', Upload, 'I'],
        ['export', 'menu.export', Download, 'E', !active],
        ['backup', 'menu.backupDownload', Archive, 'Shift+S'],
        ['restoreBackup', 'menu.backupRestore', Upload],
        ...(desktop ? [['folder', 'menu.folder', FolderOpen, 'Shift+O']] : []),
        ['trash', t('menu.trash', { count: trashCount }), Trash2],
      ],
    ],
    [
      'menu.view',
      [
        ['sidebar', 'sidebar.toggle', PanelLeft, '\\'],
        ['tabs', prefs.tabsVisible ? 'menu.tabsHide' : 'menu.tabsShow', PanelsTopLeft],
        ['visual', 'mode.visual', Eye, 'Alt+1'],
        ['source', 'mode.source', Code, 'Alt+2'],
        ['reading', 'mode.reading', BookOpen, 'Alt+3'],
        ['theme', t('menu.theme', { theme: t(`theme.${prefs.theme}`) }), SunMoon],
        ['smaller', 'menu.smaller', Minus, '-'],
        ['larger', 'menu.larger', Plus, '+'],
        [
          'language',
          t('menu.language', { language: LANGUAGES[prefs.language] ?? LANGUAGES['pt-BR'] }),
          Globe,
        ],
        ['shortcuts', 'menu.shortcuts', Keyboard, 'Shift+/'],
      ],
    ],
  ]
  return (
    <div
      id="main-menu"
      className="main-menu"
      role="region"
      aria-label={t('menu.main')}
      onKeyDown={(event) => {
        const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')]
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
      <div className="menu-search">
        <Search size={14} aria-hidden="true" />
        <input
          aria-label={t('menu.search')}
          placeholder={t('menu.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div role="menu" aria-label={t('menu.main')}>
        {groups.map(([group, entries]) => {
          const matching = entries.filter(([, label]) =>
            t(label).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          if (!matching.length) return null
          return (
            <div className="menu-group" key={group} role="group" aria-label={t(group)}>
              <div className="menu-heading" role="presentation">
                {t(group)}
              </div>
              {matching.map(([id, label, Icon, keys, disabled]) => (
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
          )
        })}
      </div>
      {!groups.some(([, entries]) =>
        entries.some(([, label]) =>
          t(label).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ),
      ) && <p className="sidebar-empty">{t('library.noResults')}</p>}
    </div>
  )
}
