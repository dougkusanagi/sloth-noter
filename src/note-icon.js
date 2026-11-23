import { frontmatterLineCount } from './frontmatter.js'

// The icon is the emoji at the start of the H1 title (`# 🌱 Título`), so other apps show it too.
const PART = '\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?'
const EMOJI = `(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|${PART}(?:\\u200D${PART})*)`
const ICON = new RegExp(`^(#[ \\t]+)(${EMOJI})(?:[ \\t]+|$)`, 'u')

function titleIndex(lines) {
  const start = frontmatterLineCount(lines)
  for (let index = start; index < lines.length; index++) {
    if (/^#[ \t]/.test(lines[index]) || lines[index] === '#') return index
    if (lines[index].trim()) return -1
  }
  return -1
}

/** The emoji at the start of the note's title, or null. */
export function noteIcon(body) {
  const lines = body.split('\n')
  const index = titleIndex(lines)
  return index < 0 ? null : (lines[index].match(ICON)?.[2] ?? null)
}

/** Sets (or, with no emoji, removes) the icon at the start of the title. */
export function setNoteIcon(body, emoji) {
  const lines = body.split('\n')
  const index = titleIndex(lines)
  if (index < 0) return body
  const line = lines[index]
  const rest = line.replace(ICON, '$1').replace(/^#[ \t]*/, '')
  const carriage = rest.endsWith('\r') ? '\r' : ''
  const title = rest.replace(/\r$/, '')
  lines[index] = emoji
    ? `# ${emoji}${title ? ` ${title}` : ' '}${carriage}`
    : `# ${title}${carriage}`
  return lines.join('\n')
}
