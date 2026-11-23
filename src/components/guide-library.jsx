import { ChevronRight, FileText, Folder } from 'lucide-react'
import { currentLanguage, t } from '../i18n.js'
import { headingSections } from '../sections.js'
import { WELCOME_IMAGE, welcomeBody } from '../welcome.js'

const guides = {
  start: { label: 'guide.start', sections: [0, 12] },
  markdown: { label: 'guide.markdown', sections: [1, 2, 3, 4, 5, 7, 8, 9, 10] },
  tasks: { label: 'guide.tasks', sections: [6, 11] },
}

export function guideDocument(id) {
  const guide = guides[id] ?? guides.start
  const body = welcomeBody(currentLanguage())
  const lines = body.split('\n')
  const headings = headingSections(body).filter((heading) => heading.depth === 2)
  return [
    `# ${t(guide.label)}${id === 'start' ? `\n${t('guide.intro')}` : ''}`,
    ...(id === 'start' ? [`![${t('guide.image')}](${WELCOME_IMAGE})`] : []),
    ...guide.sections
      .map((index) => headings[index])
      .map(({ line, end }) =>
        lines
          .slice(line - 1, end)
          .join('\n')
          .trimEnd(),
      ),
  ]
    .join('\n\n')
    .replaceAll('[[Welcome', `[[${t('guide.start')}`)
}

export function guideTarget(target) {
  if (target.split('|')[0].split('#')[0].trim() === t('guide.start')) return 'start'
  return null
}

function GuideFolder({ label, children }) {
  return (
    <details className="note-group guide-folder">
      <summary>
        <ChevronRight className="folder-chevron" size={13} aria-hidden="true" />
        <Folder className="folder-icon" size={14} aria-hidden="true" />
        <span className="folder-name">{t(label)}</span>
      </summary>
      {children}
    </details>
  )
}

export function GuideLibrary({ onOpen }) {
  function page(id) {
    return (
      <button className="button quiet guide-entry" type="button" onClick={() => onOpen(id)}>
        <FileText size={15} aria-hidden="true" />
        {t(guides[id].label)}
      </button>
    )
  }
  return (
    <GuideFolder label="guide.folder">
      {page('start')}
      <GuideFolder label="guide.examples">
        {page('markdown')}
        {page('tasks')}
      </GuideFolder>
    </GuideFolder>
  )
}
