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

export function ChangelogPanel() {
  return (
    <article className="changelog-page">
      <p className="changelog-intro">{t('changelog.intro')}</p>
      <h4>{t('changelog.pending')}</h4>
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
      <details>
        <summary>{t('changelog.archive')}</summary>
        {Object.entries(releases)
          .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
          .map(([path, text]) => (
            <ReactMarkdown key={path}>{text}</ReactMarkdown>
          ))}
        <ReactMarkdown>{archive}</ReactMarkdown>
      </details>
    </article>
  )
}
