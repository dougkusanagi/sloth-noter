import {
  FilePlus,
  Copy,
  Focus,
  Search,
  ScanSearch,
  Replace,
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
  Settings,
  Command,
  LifeBuoy,
  MoveHorizontal,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { t, LANGUAGES } from './i18n.js'

/**
 * Every action the app can run. The main menu shows the `menu` ones; the command
 * palette (Ctrl+K) lists them all, so rarely used actions stay one search away.
 * Entries: [id, label key or text, icon, shortcut, disabled, inMenu].
 */
export function buildCommands({ active, activePinned, prefs, trashCount, desktop, mode }) {
  const noFold = !active || mode === 'source'
  const language = LANGUAGES[prefs.language] ?? LANGUAGES['pt-BR']
  return [
    [
      'menu.notes',
      [
        ['newNote', 'menu.newNote', FilePlus, 'T', false, true],
        ['findNote', 'menu.findNote', Search, 'P', false, true],
        ['searchAllNotes', 'menu.searchAllNotes', Search, 'Alt+F', false, true],
        ['findInNote', 'menu.findInNote', ScanSearch, 'F', !active, true],
        ['replaceInNote', 'find.replace', Replace, 'H', !active, true],
        ...(desktop ? [['history', 'Histórico da nota', Undo2, undefined, !active, true]] : []),
        ['rename', 'menu.rename', Pencil, 'F2', !active || Boolean(active.external), true],
        ['copyToNotes', 'external.copy', Copy, undefined, !active?.external, true],
        ['closeTab', 'tabs.close', X, 'W', !active || activePinned, true],
        ['trashMove', 'menu.trashMove', Trash2, 'Shift+Delete', !active, true],
        ['undoDelete', 'menu.undoDelete', Undo2, undefined, !trashCount, true],
      ],
    ],
    [
      'menu.files',
      [
        ['images', 'images.title', Image, 'Shift+L', false, true],
        ['addImage', 'images.import', Plus, undefined, false, true],
        ['import', 'menu.import', Upload, 'I', false, true],
        ['export', 'menu.export', Download, 'E', !active, true],
        [
          'trash',
          trashCount ? t('menu.trash', { count: trashCount }) : t('menu.trashEmpty'),
          Trash2,
          undefined,
          false,
          true,
        ],
        ['backup', 'menu.backupDownload', Archive, 'Shift+S'],
        ['restoreBackup', 'menu.backupRestore', Upload],
        ...(desktop ? [['folder', 'menu.folder', FolderOpen, 'Shift+O']] : []),
      ],
    ],
    [
      'menu.view',
      [
        ['focus', 'focus.toggle', Focus, 'Shift+F', !active, true],
        ['sidebar', 'sidebar.toggle', PanelLeft, 'B', false, true],
        ['visual', 'mode.visual', Eye, 'Alt+1'],
        ['source', 'mode.source', Code, 'Alt+2'],
        ['reading', 'mode.reading', BookOpen, 'Alt+3'],
        ['foldAll', 'menu.foldAll', ChevronsDownUp, undefined, noFold],
        ['unfoldAll', 'menu.unfoldAll', ChevronsUpDown, undefined, noFold],
        ['tabs', prefs.tabsVisible ? 'menu.tabsHide' : 'menu.tabsShow', PanelsTopLeft],
        ['theme', t('menu.theme', { theme: t(`theme.${prefs.theme}`) }), SunMoon],
        ['smaller', 'menu.smaller', Minus, '-'],
        ['larger', 'menu.larger', Plus, '+'],
        ['narrower', 'menu.narrower', MoveHorizontal],
        ['wider', 'menu.wider', MoveHorizontal],
        ['language', t('menu.language', { language }), Globe],
      ],
    ],
    [
      'menu.app',
      [
        ['commands', 'menu.commands', Command, 'K', false, true],
        ['settings', 'menu.settings', Settings, ',', false, true],
        ['shortcuts', 'menu.shortcuts', Keyboard, 'Shift+/', false, true],
        ['welcome', 'menu.welcome', LifeBuoy, undefined, false, true],
      ],
    ],
  ]
}
