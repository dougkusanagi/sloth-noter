import { markdownTree, walk } from './markdown-model.js'
import { COLOR_VALUES, INLINE_BACKGROUNDS, colorStyle } from './document-palette.js'

export function inlineColorRanges(source) {
  const excluded = []
  walk(markdownTree(source), (node) => {
    if (node.type === 'code' || node.type === 'inlineCode')
      excluded.push([node.position.start.offset, node.position.end.offset])
  })
  const tokens = [],
    stack = [],
    ranges = []
  const pattern = /<span style="((?:(?:color|background-color):#[0-9a-f]{6};?){1,2})">|<\/span>/g
  for (const match of source.matchAll(pattern)) {
    if (excluded.some(([from, to]) => match.index >= from && match.index < to)) continue
    if (match[1]) {
      const style = Object.fromEntries(
        match[1]
          .split(';')
          .filter(Boolean)
          .map((value) => value.split(':')),
      )
      stack.push({ from: match.index, start: match.index + match[0].length, style })
    } else if (stack.length) {
      const open = stack.pop()
      ranges.push({ ...open, end: match.index, to: match.index + match[0].length })
      tokens.push([open.from, open.start], [match.index, match.index + match[0].length])
    }
  }
  return { ranges, tokens }
}

export function inlineColorChange(source, from, to, property, name) {
  const { ranges, tokens } = inlineColorRanges(source)
  // Rebuild the touched span boundaries, preserving styles outside the selected text.
  let left = from,
    right = to
  for (let again = true; again;) {
    again = false
    for (const range of ranges)
      if (range.from <= right && range.to >= left && (range.from < left || range.to > right)) {
        left = Math.min(left, range.from)
        right = Math.max(right, range.to)
        again = true
      }
  }
  const value =
    name === 'default' || name === 'none'
      ? null
      : property === 'background'
        ? INLINE_BACKGROUNDS[name]
        : COLOR_VALUES[name]
  const protectedRanges = []
  let lineOffset = 0
  for (const line of source.split('\n')) {
    const prefix = /^(?:\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX-]\]\s+)?|\d+[.)]\s+))/.exec(
      line,
    )?.[0]
    if (prefix) protectedRanges.push([lineOffset, lineOffset + prefix.length])
    lineOffset += line.length + 1
  }
  const sorted = [...ranges].sort((a, b) => a.from - b.from)
  const units = []
  for (let pos = left; pos < right; pos++) {
    if (tokens.some(([a, b]) => pos >= a && pos < b)) continue
    const style = {}
    for (const range of sorted)
      if (pos >= range.start && pos < range.end) Object.assign(style, range.style)
    if (
      pos >= from &&
      pos < to &&
      source[pos] !== '\n' &&
      !protectedRanges.some(([a, b]) => pos >= a && pos < b)
    ) {
      if (property === 'reset') {
        delete style.color
        delete style['background-color']
      } else if (value) style[property === 'background' ? 'background-color' : 'color'] = value
      else delete style[property === 'background' ? 'background-color' : 'color']
    }
    if (source[pos] === '\n') {
      delete style.color
      delete style['background-color']
    }
    units.push({ char: source[pos], style, selected: pos >= from && pos < to })
  }
  let insert = '',
    anchor = null,
    head = null
  for (let index = 0; index < units.length;) {
    const unit = units[index],
      style = Object.entries(unit.style)
        .sort()
        .map(([key, val]) => `${key}:${val}`)
        .join(';')
    const open = style ? `<span style="${style}">` : ''
    insert += open
    let end = index + 1
    while (
      end < units.length &&
      JSON.stringify(units[end].style) === JSON.stringify(unit.style) &&
      units[end].selected === unit.selected &&
      units[end - 1].char !== '\n'
    )
      end++
    if (unit.selected && anchor === null) anchor = left + insert.length
    insert += units
      .slice(index, end)
      .map((item) => item.char)
      .join('')
    if (unit.selected) head = left + insert.length
    if (style) insert += '</span>'
    index = end
  }
  return {
    changes: { from: left, to: right, insert },
    selection: { anchor: anchor ?? left, head: head ?? left },
  }
}

export const BLOCK_COLOR = /^<!-- sloth:block(?: color=(\w+))?(?: background=([\w-]+))? -->$/
export function blockColorMetadata(line) {
  const match = BLOCK_COLOR.exec(line)
  return match ? { color: match[1], background: match[2] } : null
}
export function blockColorStyle(value) {
  return [
    value.color && `color:${colorStyle(value.color)}`,
    value.background && `background-color:${colorStyle(value.background, true)}`,
  ]
    .filter(Boolean)
    .join(';')
}

export function selectedColors(source, from, to) {
  const result = {}
  const { ranges } = inlineColorRanges(source)
  for (const range of ranges.sort((a, b) => a.from - b.from))
    if (range.start <= from && range.end >= to) {
      if (range.style.color)
        result.color = Object.keys(COLOR_VALUES).find(
          (key) => COLOR_VALUES[key] === range.style.color,
        )
      if (range.style['background-color'])
        result.background = Object.keys(INLINE_BACKGROUNDS).find(
          (key) => INLINE_BACKGROUNDS[key] === range.style['background-color'],
        )
    }
  return result
}

// Only the color markup generated by the editor is interpreted; arbitrary HTML stays untouched.
export function applyDocumentColors(tree) {
  const visit = (node) => {
    if (!node.children) return
    const output = [],
      stack = [{ children: output }]
    for (let index = 0; index < node.children.length; index++) {
      const child = node.children[index]
      if (
        child.type === 'html' &&
        /^<!--\s*sloth:table\b/.test(child.value) &&
        node.children[index + 1]?.type === 'table'
      ) {
        const table = node.children[index + 1]
        const colors = /\bcolors=([^\s>]+)/.exec(child.value)?.[1]?.split(',') || []
        for (const entry of colors) {
          const [row, column, color] = entry.split(':')
          const cell = table.children[Number(row)]?.children[Number(column)]
          const background = colorStyle(color, true)
          if (cell && background)
            cell.data = {
              ...cell.data,
              hProperties: { ...cell.data?.hProperties, style: `background-color:${background}` },
            }
        }
        continue
      }
      const metadata = child.type === 'html' && blockColorMetadata(child.value)
      if (metadata && node.children[index + 1]) {
        const sibling = node.children[index + 1]
        const next = sibling.type === 'list' ? sibling.children[0] : sibling
        next.data = {
          ...next.data,
          hProperties: { ...next.data?.hProperties, style: blockColorStyle(metadata) },
        }
        continue
      }
      const open =
        child.type === 'html' &&
        /^<span style="((?:(?:color|background-color):#[0-9a-f]{6};?){1,2})">$/.exec(child.value)
      if (open) {
        const wrapper = {
          type: 'slothColor',
          children: [],
          data: {
            hName: 'span',
            hProperties: {
              style:
                open[1] +
                (open[1].includes('background-color:') && !/(?:^|;)color:/.test(open[1])
                  ? ';color:#23221e'
                  : ''),
            },
          },
        }
        stack.at(-1).children.push(wrapper)
        stack.push(wrapper)
      } else if (child.type === 'html' && child.value === '</span>' && stack.length > 1) stack.pop()
      else {
        visit(child)
        stack.at(-1).children.push(child)
      }
    }
    node.children = output
  }
  visit(tree)
  return tree
}
export function remarkDocumentColors() {
  return applyDocumentColors
}
