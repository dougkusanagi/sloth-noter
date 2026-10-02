import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const parser = unified().use(remarkParse).use(remarkGfm)
const cache = new Map()
export function markdownTree(text) {
  if (cache.has(text)) return cache.get(text)
  const tree = parser.parse(text)
  if (text.length < 500000) {
    cache.set(text, tree)
    if (cache.size > 128) cache.delete(cache.keys().next().value)
  }
  return tree
}
export function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
export function wikiParts(value) {
  const [target, ...label] = value.split('|')
  const [name, ...heading] = target.trim().split('#')
  return {
    name: name.trim(),
    heading: heading.join('#').trim(),
    label: label.join('|').trim() || target.trim(),
  }
}
export function findNote(notes, value) {
  const name = wikiParts(value).name.replace(/\.md$/i, '').normalize('NFC').toLocaleLowerCase()
  return (
    notes.find(
      (note) => note.name.replace(/\.md$/i, '').normalize('NFC').toLocaleLowerCase() === name,
    ) ?? null
  )
}
export function wikiReferences(text) {
  const result = []
  function visit(node) {
    if (
      ['link', 'linkReference', 'code', 'inlineCode', 'image', 'imageReference'].includes(node.type)
    )
      return
    if (node.type === 'text') {
      const start = node.position.start.offset
      const raw = text.slice(start, node.position.end.offset)
      for (const match of raw.matchAll(/(?<!\\)\[\[([^\]\n]+)\]\]/g)) {
        const parts = wikiParts(match[1])
        if (parts.name || parts.heading)
          result.push({
            start: start + match.index,
            end: start + match.index + match[0].length,
            target: match[1],
            ...parts,
          })
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(markdownTree(text))
  return result
}
export function renameWikiReferences(text, oldName, newName) {
  const matching = wikiReferences(text).filter((link) => findNote([{ name: oldName }], link.target))
  for (const link of matching.reverse()) {
    const extension = /\.md$/i.test(link.name) ? '.md' : ''
    const target =
      newName.replace(/\.md$/i, '') + extension + (link.heading ? '#' + link.heading : '')
    const label = link.target.includes('|') ? '|' + link.target.split('|').slice(1).join('|') : ''
    text = text.slice(0, link.start) + '[[' + target + label + ']]' + text.slice(link.end)
  }
  return text
}
export function remarkWikiLinks() {
  return (tree, file) => {
    const links = wikiReferences(String(file))
    function visit(parent) {
      if (!parent.children || ['link', 'linkReference', 'code', 'inlineCode'].includes(parent.type))
        return
      parent.children = parent.children.flatMap((node) => {
        if (node.type !== 'text') {
          visit(node)
          return [node]
        }
        const matches = links.filter(
          (link) =>
            link.start >= node.position.start.offset && link.end <= node.position.end.offset,
        )
        if (!matches.length) return [node]
        const raw = String(file).slice(node.position.start.offset, node.position.end.offset)
        const pieces = []
        let from = 0
        for (const link of matches) {
          const start = link.start - node.position.start.offset
          if (start > from) pieces.push({ type: 'text', value: raw.slice(from, start) })
          pieces.push({
            type: 'link',
            url: '#sloth-note/' + encodeURIComponent(link.target),
            children: [{ type: 'text', value: link.label }],
          })
          from = link.end - node.position.start.offset
        }
        if (from < raw.length) pieces.push({ type: 'text', value: raw.slice(from) })
        return pieces
      })
    }
    visit(tree)
  }
}
export function normalizeImageSource(src) {
  if (/^(https?:|data:)/i.test(src)) return src
  try {
    return decodeURIComponent(src.replace(/^\.\//, ''))
  } catch {
    return src
  }
}
export function imageReferences(text) {
  const tree = markdownTree(text)
  const definitions = new Map()
  walk(tree, (node) => {
    if (node.type === 'definition') definitions.set(node.identifier, node)
  })
  const result = []
  walk(tree, (node) => {
    if (node.type === 'image') result.push({ src: node.url, name: node.alt ?? '', node })
    if (node.type === 'imageReference') {
      const definition = definitions.get(node.identifier)
      if (definition)
        result.push({
          src: definition.url,
          name: node.alt ?? '',
          node: definition,
          occurrence: node,
        })
    }
  })
  return result
}
export function replaceImageSource(text, source, target) {
  const replacements = new Map()
  for (const entry of imageReferences(text)) {
    if (normalizeImageSource(entry.src) !== normalizeImageSource(source)) continue
    const from = entry.node.position.start.offset,
      to = entry.node.position.end.offset
    const raw = text.slice(from, to)
    const replaced =
      entry.node.type === 'definition'
        ? raw.replace(
            /(:\s*)(?:<[^>]*>|\S+)/,
            (_, prefix) => prefix + (target.includes(' ') ? '<' + target + '>' : target),
          )
        : raw.replace(
            /(\]\(\s*)(?:<[^>]*>|[^\s)]+)/,
            (_, prefix) => prefix + (target.includes(' ') ? '<' + target + '>' : target),
          )
    replacements.set(from, { from, to, insert: replaced })
  }
  for (const change of [...replacements.values()].sort((a, b) => b.from - a.from))
    text = text.slice(0, change.from) + change.insert + text.slice(change.to)
  return text
}
