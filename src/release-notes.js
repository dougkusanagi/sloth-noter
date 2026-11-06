// Hub and per-version documents for Novidades, built from the committed changelog files.
export const TYPES = [
  'Adicionado',
  'Alterado',
  'Descontinuado',
  'Removido',
  'Corrigido',
  'Segurança',
]
const PLURAL = {
  Adicionado: ['adição', 'adições'],
  Alterado: ['alteração', 'alterações'],
  Descontinuado: ['descontinuação', 'descontinuações'],
  Removido: ['remoção', 'remoções'],
  Corrigido: ['correção', 'correções'],
  Segurança: ['ajuste de segurança', 'ajustes de segurança'],
}
export const PENDING = 'pendente'

const versionOf = (path) => path.match(/(\d+\.\d+\.\d+)\.md$/)?.[1]
const compare = (a, b) => b.localeCompare(a, undefined, { numeric: true })

/** Counts entries per type in both formats: `Tipo: texto` lines and `## Tipo` + bullet lists. */
export function countEntries(text) {
  const counts = Object.fromEntries(TYPES.map((type) => [type, 0]))
  let section = null
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      section = TYPES.includes(heading[1]) ? heading[1] : null
      continue
    }
    const inline = TYPES.find((type) => line.startsWith(`${type}:`))
    if (inline) counts[inline] += 1
    else if (section && /^- /.test(line)) counts[section] += 1
  }
  return counts
}

export function countText(counts) {
  return TYPES.filter((type) => counts[type])
    .map((type) => `${counts[type]} ${PLURAL[type][counts[type] === 1 ? 0 : 1]}`)
    .join(' · ')
}

/** The first `> ` line after the title is the version's short summary. */
export function summaryOf(text) {
  return text.match(/^> (.+)$/m)?.[1].trim() ?? ''
}

const DATE = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function releaseList(files, archive, fragments = {}) {
  const dates = Object.fromEntries(
    [...archive.matchAll(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  )
  const releases = Object.entries(files)
    .map(([path, text]) => [versionOf(path), text])
    .filter(([version]) => version)
    .sort(([a], [b]) => compare(a, b))
    .map(([version, text]) => ({
      version,
      text,
      date: dates[version] ? DATE.format(new Date(`${dates[version]}T00:00:00Z`)) : '',
      summary: summaryOf(text),
      counts: countEntries(text),
    }))
  const pending = Object.values(fragments)
    .map((text) => text.trim())
    .filter(Boolean)
  if (!pending.length) return releases
  const text = TYPES.flatMap((type) => {
    const entries = pending.filter((entry) => entry.startsWith(`${type}:`))
    return entries.length
      ? [`## ${type}`, ...entries.map((entry) => entry.slice(type.length + 1).trim())]
      : []
  }).join('\n\n')
  return [
    { version: PENDING, text, date: '', summary: '', counts: countEntries(text) },
    ...releases,
  ]
}

export const releaseTitle = (version, pendingLabel) =>
  version === PENDING ? pendingLabel : `Sloth Note ${version}`

/** Markdown of the hub: one card-like section per version with summary, counts and a link. */
export function hubMarkdown(releases, { title, intro, pendingLabel, readLabel, link }) {
  return (
    [
      `# ${title}`,
      intro,
      ...releases.map((release) => {
        const name = releaseTitle(release.version, pendingLabel)
        const meta = [release.date, countText(release.counts)].filter(Boolean).join(' · ')
        const details = [meta && `*${meta}*`, link(name, readLabel)].filter(Boolean).join(' · ')
        return [
          `## ${release.version === PENDING ? pendingLabel : `Versão ${release.version}`}`,
          release.summary,
          details,
        ]
          .filter(Boolean)
          .join('\n\n')
      }),
    ].join('\n\n') + '\n'
  )
}

export function releaseMarkdown(release, { pendingLabel, hubTitle, backLabel, link }) {
  const text =
    release.version === PENDING ? `# ${pendingLabel}\n\n${release.text}` : release.text.trim()
  const [title, ...body] = text.split('\n')
  return [title, link(hubTitle, backLabel), body.join('\n').trim()].join('\n\n') + '\n'
}
