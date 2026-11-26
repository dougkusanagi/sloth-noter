import {
  FilePlus,
  FileText,
  Braces,
  Copy,
  Focus,
  Search,
  ScanSearch,
  Replace,
  Pencil,
  X,
  Trash2,
  Undo2,
  History,
  PanelBottom,
  Image,
  FileInput,
  FileOutput,
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
  Columns3,
  Keyboard,
  Settings,
  Command,
  LifeBuoy,
  NotebookPen,
  MoveHorizontal,
  ChevronsDownUp,
  ChevronsUpDown,
  WrapText,
  ListTree,
  QrCode,
} from 'lucide-react'
import { t, LANGUAGES } from './i18n.js'
import { shortcutKeys } from './shortcut-registry.js'

/**
 * Every action the app can run. The main menu shows only the `inMenu` ones: frequent actions
 * without another visible place in the interface. The command palette (Ctrl+Shift+P) lists them
 * all, so the rest stays one search away.
 * Entries: [id, label key or text, icon, shortcut, disabled, inMenu].
 */
export function buildCommands(options) {
  // Shortcuts come from the registry, so the ones changed in Settings show here too.
  return commandGroups(options).map(([group, entries]) => [
    group,
    entries.map((entry) =>
      entry[3]
        ? [entry[0], entry[1], entry[2], shortcutKeys(entry[0]) ?? entry[3], ...entry.slice(4)]
        : entry,
    ),
  ])
}

function commandGroups({ active, activePinned, prefs, trashCount, desktop, mode }) {
  const noFold = !active || mode === 'source'
  const language = LANGUAGES[prefs.language] ?? LANGUAGES['pt-BR']
  return [
    [
      'menu.notes',
      [
        ['newNote', 'menu.newNote', FilePlus, 'T', false, true],
        ['findNote', 'menu.findNote', Search, 'P', false, true],
        ['searchAllNotes', 'menu.searchAllNotes', Search, 'Shift+F', false, true],
        ['findInNote', 'menu.findInNote', ScanSearch, 'F', !active],
        ['replaceInNote', 'find.replace', Replace, 'H', !active],
        ...(desktop ? [['history', 'history.title', History, undefined, !active, true]] : []),
        ['rename', 'menu.rename', Pencil, 'F2', !active || Boolean(active.external)],
        ['noteCover', 'cover.title', Image, undefined, !active || Boolean(active.external)],
        [
          'copyToNotes',
          'external.copy',
          Copy,
          undefined,
          !active?.external,
          Boolean(active?.external),
        ],
        [
          'toggleTemplate',
          prefs.templateNotes?.[active?.id] ? 'menu.removeTemplate' : 'menu.useAsTemplate',
          FileText,
          undefined,
          !active || Boolean(active.external),
        ],
        [
          'insertProperties',
          'menu.insertProperties',
          Braces,
          undefined,
          !active || Boolean(active.external),
        ],
        ['archiveTasks', 'tasks.archive', Archive, undefined, !active, true],
        ['reopenTab', 'tabs.reopen', Undo2, 'Shift+T'],
        ['previousTab', 'tabs.previous', PanelsTopLeft, 'PageUp', !active],
        ['nextTab', 'tabs.next', PanelsTopLeft, 'PageDown', !active],
        ['closeTab', 'tabs.close', X, 'W', !active || activePinned],
        ['trashMove', 'menu.trashMove', Trash2, 'Shift+Delete', !active, true],
        ['undoDelete', 'menu.undoDelete', Undo2, undefined, !trashCount],
      ],
    ],
    [
      'menu.files',
      [
        ['images', 'images.title', Image, 'Shift+L', false, true],
        ['addImage', 'images.import', Plus],
        ['import', 'menu.import', FileInput, 'O', false, true],
        ['export', 'menu.export', FileOutput, 'E', !active, true],
        ['shareQr', 'qr.send', QrCode, undefined, !active, true],
        [
          'trash',
          trashCount ? t('menu.trash', { count: trashCount }) : t('menu.trashEmpty'),
          Trash2,
          undefined,
          false,
          true,
        ],
        ['backup', 'menu.backupDownload', Archive, 'Shift+S'],
        ['restoreBackup', 'menu.backupRestore', FileInput],
        ...(desktop ? [['folder', 'menu.folder', FolderOpen, 'Shift+O']] : []),
      ],
    ],
    [
      'menu.view',
      [
        ['focus', 'focus.toggle', Focus, 'Alt+F', !active],
        ['outline', 'outline.label', ListTree, 'Alt+T', !active || mode === 'source'],
        ['sidebar', 'sidebar.toggle', PanelLeft, 'Alt+B'],
        ['visual', 'mode.visual', Eye, 'Alt+1'],
        ['source', 'mode.source', Code, 'Alt+2'],
        ['reading', 'mode.reading', BookOpen, 'Alt+3'],
        ['board', 'mode.board', Columns3, 'Alt+4', !active],
        ['foldAll', 'menu.foldAll', ChevronsDownUp, undefined, noFold],
        ['unfoldAll', 'menu.unfoldAll', ChevronsUpDown, undefined, noFold],
        ['wrapLines', 'menu.wrapAll', WrapText],
        ['wrapPage', 'menu.wrapPage', WrapText, undefined, !active],
        ['tabs', prefs.tabsVisible ? 'menu.tabsHide' : 'menu.tabsShow', PanelsTopLeft],
        [
          'status',
          prefs.statusVisible === false ? 'menu.statusShow' : 'menu.statusHide',
          PanelBottom,
        ],
        ['theme', t('menu.theme', { theme: t(`theme.${prefs.theme}`) }), SunMoon],
        ['smaller', 'menu.smaller', Minus, '-'],
        ['larger', 'menu.larger', Plus, '+'],
        ['resetText', 'menu.resetText', Undo2, '0'],
        ['resetWidth', 'menu.resetWidth', Undo2, 'Alt+0'],
        ['narrower', 'menu.narrower', MoveHorizontal, 'Alt+-'],
        ['wider', 'menu.wider', MoveHorizontal, 'Alt++'],
        ['language', t('menu.language', { language }), Globe],
      ],
    ],
    [
      'menu.app',
      [
        ['commands', 'menu.commands', Command, 'Shift+P', false, true],
        ['settings', 'menu.settings', Settings, ',', false, true],
        ['shortcuts', 'menu.shortcuts', Keyboard, 'Shift+/'],
        ['welcome', 'menu.welcome', LifeBuoy, undefined, false, true],
        ['changelog', 'settings.changelog', NotebookPen, undefined, false, true],
        ...(desktop ? [['updates', 'updates.check', Download, undefined, false, true]] : []),
      ],
    ],
  ]
}
