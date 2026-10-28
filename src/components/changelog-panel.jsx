import ReactMarkdown from 'react-markdown'
import archive from '../../CHANGELOG.md?raw'
import { t } from '../i18n.js'

// The same committed fragments feed the app and the release process; no second log to maintain.
const fragments = import.meta.glob('../../changelog/unreleased/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const releases = import.meta.glob('../../changelog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const types = ['Adicionado', 'Alterado', 'Descontinuado', 'Removido', 'Corrigido', 'Segurança']
const groups = types.map((type) => [
  type,
  Object.entries(fragments)
    .filter(([, text]) => text.trimStart().startsWith(`${type}:`))
    .map(([path, text]) => [
      path,
      text
        .trim()
        .slice(type.length + 1)
        .trim(),
    ]),
])

/** Build an ordinary Markdown document from the same sources used for releases. */
export function changelogMarkdown() {
  const sections = groups
    .filter(([, entries]) => entries.length)
    .map(([type, entries]) => `### ${type}\n\n${entries.map(([, text]) => text).join('\n\n')}`)
  return (
    [
      `# ${t('settings.changelog')}`,
      t('changelog.intro'),
      ...(sections.length ? [`## ${t('changelog.pending')}`, ...sections] : []),
      ...Object.entries(releases)
        .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
        .map(([, text]) => text.replace(/^(#{1,5}) /gm, '#$1 ')),
      `## ${t('changelog.archive')}`,
      archive.replace(/^# /gm, '### '),
    ].join('\n\n') + '\n'
  )
}

export function ChangelogPanel() {
  return (
    <article className="changelog-page">
      <p className="changelog-intro">{t('changelog.intro')}</p>
      {groups.some(([, entries]) => entries.length) && <h4>{t('changelog.pending')}</h4>}
      {groups
        .filter(([, entries]) => entries.length)
        .map(([type, entries]) => (
          <section key={type} aria-label={type}>
            <h5>{type}</h5>
            <ul>
              {entries.map(([path, text]) => (
                <li key={path}>
                  <ReactMarkdown>{text}</ReactMarkdown>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {Object.entries(releases)
        .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
        .map(([path, text]) => (
          <ReactMarkdown key={path}>{text}</ReactMarkdown>
        ))}
      <details>
        <summary>{t('changelog.archive')}</summary>
        <ReactMarkdown>{archive}</ReactMarkdown>
      </details>
    </article>
  )
}
