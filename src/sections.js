import { markdownTree } from './markdown-model.js'

/**
 * Document outline: every top-level heading with the lines of its section.
 *
 * `level` is how many sections enclose the heading, itself included (H2 = 1, an H3 under
 * it = 2, ...), so skipped heading levels do not leave gaps. H1 is the note title and
 * stays at 0. `end` is the last line (1-based) of the section: everything up to the next
 * heading of the same or a higher rank.
 */
export function headingSections(text, tree = markdownTree(text)) {
  const headings = tree.children
    .filter((node) => node.type === 'heading')
    .map((node) => ({
      depth: node.depth,
      line: node.position.start.line,
      titleEnd: node.position.end.line,
      level: 0,
      end: 0,
    }))
  const lineCount = text.split('\n').length
  const open = []
  for (const heading of headings) {
    while (open.length && open.at(-1).depth >= heading.depth) open.pop().end = heading.line - 1
    if (heading.depth === 1) {
      heading.level = 0
    } else {
      open.push(heading)
      heading.level = open.length
    }
  }
  for (const heading of open) heading.end = lineCount
  for (const heading of headings) if (heading.depth === 1) heading.end = heading.titleEnd
  return headings
}

/** First line of every section that has something to hide (H2–H6 with non-blank content). */
export function foldableLines(text, tree) {
  const lines = text.split('\n')
  return headingSections(text, tree)
    .filter(
      (heading) =>
        heading.level > 0 && lines.slice(heading.titleEnd, heading.end).some((line) => line.trim()),
    )
    .map((heading) => heading.line)
}

/** Section level of every line (index 0 is line 1). */
export function lineLevels(text, tree) {
  const levels = new Array(text.split('\n').length).fill(0)
  for (const heading of headingSections(text, tree)) {
    if (heading.level === 0) continue
    for (let line = heading.line; line <= heading.end; line++) levels[line - 1] = heading.level
  }
  return levels
}

/**
 * Wraps each H2–H6 and the content under it in a `<section class="md-section">`, nested
 * by heading rank, so the reading view can indent and collapse whole sections. Reference
 * and footnote definitions stay at the top level for remark-rehype.
 */
export function remarkSections() {
  return (tree) => {
    const root = []
    const open = []
    const hoisted = []
    for (const node of tree.children) {
      if (node.type === 'definition' || node.type === 'footnoteDefinition') {
        hoisted.push(node)
        continue
      }
      if (node.type === 'heading' && node.depth === 1) {
        open.length = 0
        root.push(node)
        continue
      }
      if (node.type === 'heading') {
        while (open.length && open.at(-1).depth >= node.depth) open.pop()
        const section = {
          type: 'section',
          depth: node.depth,
          position: node.position,
          data: {
            hName: 'section',
            hProperties: { className: ['md-section'], dataDepth: node.depth },
          },
          children: [node],
        }
        ;(open.at(-1) ?? { children: root }).children.push(section)
        open.push(section)
        continue
      }
      ;(open.at(-1) ?? { children: root }).children.push(node)
    }
    tree.children = [...root, ...hoisted]
  }
}
