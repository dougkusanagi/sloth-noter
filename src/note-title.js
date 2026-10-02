import { t } from './i18n.js'

const LEADING = [
  /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s*)?/, // list and task markers
  /^#{1,6}\s+/,
  /^>\s*/,
  /^!?\[\[/,
  /^`+/,
]

function stripLeading(text) {
  for (let again = true; again;) {
    again = false
    for (const pattern of LEADING) {
      const next = text.replace(pattern, '')
      if (next !== text) {
        text = next
        again = true
      }
    }
  }
  return text
}

/**
 * Notes named after their first line can start with Markdown syntax (`- [ ] task`,
 * `![[image]]`, a code fence). The library and tabs show the text without it, and
 * fall back to a placeholder when nothing readable is left. The file name is untouched.
 */
export function displayName(name, keepExtension = false) {
  const extension = /\.md$/i.exec(name)?.[0] ?? ''
  let text = stripLeading(extension ? name.slice(0, -extension.length) : name)
  text = text.replace(/(?:\]\]|`+)\s*$/, '').trim()
  if (!/[\p{L}\p{N}]/u.test(text)) return t('sidebar.untitled')
  return keepExtension ? text + extension : text
}

/** First readable line after the title, without inline Markdown, for the library list. */
export function notePreview(body, limit = 96) {
  const lines = body.slice(0, 1200).split('\n')
  for (const line of lines.slice(/^#\s/.test(lines[0]) ? 1 : 0)) {
    const text = stripLeading(line)
      .replace(/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target)
      .replace(/[*_~`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (/[\p{L}\p{N}]/u.test(text)) return text.length > limit ? `${text.slice(0, limit)}…` : text
  }
  return ''
}
