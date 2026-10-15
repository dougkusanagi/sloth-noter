import { markdownTree } from './markdown-model.js'

/**
 * Document outline: every top-level heading with the lines of its section.
 *
 * `level` is how many sections enclose the heading, itself included (H2 = 1, an H3 under
 * it = 2, ...), so skipped heading levels do not leave gaps. H1 is the note title and
 * stays at 0.  `end` is the last line (1-based) of the section: everything up to the next
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

/** Gives each section the extent of its content, so blank-line gaps can be measured around it. */
export function fitSectionPositions(node) {
  if (node.type === 'section') {
    for (const child of node.children) fitSectionPositions(child)
    node.position = { start: node.position.start, end: node.children.at(-1).position.end }
  } else for (const child of node.children ?? []) fitSectionPositions(child)
}

/**
 * Keeps the source's own spacing in the reading view, so switching between the live editor
 * and reading does not move anything: every line break is a line break, and the space
 * before a block is the number of blank lines that precede it in the Markdown
 * (`--gap`, in lines). Run after `remarkSections`.
 */
export function remarkSourceLayout() {
  return (tree) => {
    fitSectionPositions(tree)
    const visit = (node) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value.includes('\n')) return [child]
        return child.value
          .split('\n')
          .flatMap((part, index) => [
            ...(index ? [{ type: 'break' }] : []),
            ...(part ? [{ type: 'text', value: part }] : []),
          ])
      })
      let before = node.position.start.line - 1
      for (const child of node.children) {
        if (!child.position || child.type === 'definition' || child.type === 'footnoteDefinition')
          continue
        const gap = child.position.start.line - before - 1
        if (gap > 0 && child.type !== 'text')
          child.data = {
            ...child.data,
            hProperties: { ...child.data?.hProperties, style: `--gap:${gap}` },
          }
        before = child.position.end.line
        visit(child)
      }
    }
    visit(tree)
  }
}
