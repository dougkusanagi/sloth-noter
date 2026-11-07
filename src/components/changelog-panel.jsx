import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import archive from '../../CHANGELOG.md?raw'
import { t } from '../i18n.js'
import { hubMarkdown, releaseList, releaseMarkdown, releaseTitle } from '../release-notes.js'

// The same committed files feed the app and the release process; no second log to maintain.
const fragments = import.meta.glob('../../changelog/unreleased/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const files = import.meta.glob('../../changelog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const releases = releaseList(files, archive, fragments)
const wiki = (name, label) => `[[${name}|${label}]]`
const labels = () => ({
  title: t('settings.changelog'),
  hubTitle: t('settings.changelog'),
  intro: t('changelog.intro'),
  pendingLabel: t('changelog.pending'),
  readLabel: t('changelog.read'),
  backLabel: t('changelog.back'),
})

/** Read-only Markdown for the hub (`null`) or for one version, with wiki links between them. */
export function changelogDocument(version = null) {
  const release = version && releases.find((item) => item.version === version)
  return release
    ? releaseMarkdown(release, { ...labels(), link: wiki })
    : hubMarkdown(releases, { ...labels(), link: wiki })
}

/** Resolves a wiki link inside Novidades: `'hub'`, a version, or `null` for ordinary notes. */
export function changelogTarget(target) {
  const name = target.split('|')[0].split('#')[0].trim()
  if (name === t('settings.changelog')) return 'hub'
  return (
    releases.find((release) => releaseTitle(release.version, t('changelog.pending')) === name)
      ?.version ?? null
  )
}

/** Mobile: the same documents, rendered as Markdown with in-page links. */
export function ChangelogPanel() {
  const [version, setVersion] = useState(null)
  const link = (name, label) => `[${label}](#${encodeURIComponent(name)})`
  const markdown = version
    ? releaseMarkdown(
        releases.find((release) => release.version === version),
        { ...labels(), link },
      )
    : hubMarkdown(releases, { ...labels(), link })
  return (
    <article className={`changelog-page${version ? '' : ' changelog-hub'}`}>
      <ReactMarkdown
        components={{
          a: ({ href = '', children }) => {
            if (!href.startsWith('#')) return <a href={href}>{children}</a>
            const target = changelogTarget(decodeURIComponent(href.slice(1)))
            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  setVersion(target === 'hub' ? null : target)
                  event.currentTarget.closest('.mobile-content, .changelog-page')?.scrollTo?.(0, 0)
                }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
