import { markdownTree } from './markdown-model.js'

const COVER_TITLE = 'sloth:cover'

export function noteCover(text, tree) {
  if (!text.includes(COVER_TITLE)) return null
  const [title, paragraph] = (tree ?? markdownTree(text)).children
  if (title?.type !== 'heading' || title.depth !== 1 || paragraph?.type !== 'paragraph') return null
  const [image] = paragraph.children
  return paragraph.children.length === 1 &&
    image?.type === 'image' &&
    image.title === COVER_TITLE &&
    image.position.start.line === image.position.end.line
    ? image
    : null
}

export function setNoteCover(text, asset) {
  const tree = markdownTree(text)
  const [heading] = tree.children
  if (heading?.type !== 'heading' || heading.depth !== 1) return text
  const cover = noteCover(text, tree)
  if (!asset && !cover) return text

  const titleEnd = heading.position.end.offset
  const afterTitle = text.slice(titleEnd)
  const newline = afterTitle.startsWith('\r\n') ? '\r\n' : '\n'
  // The source is a normal Markdown image, including for sync, backup and export.
  const src = asset?.src.replace(/[<>\s]/g, (character) => encodeURIComponent(character))
  const alt = asset?.name.replace(/[[\]\\\r\n]/g, '')
  const destination = src?.replace(/[()]/g, (character) => '\\' + character)
  const image = asset ? `![${alt}](${destination} "${COVER_TITLE}")` : ''
  if (cover) {
    if (asset)
      return (
        text.slice(0, cover.position.start.offset) + image + text.slice(cover.position.end.offset)
      )
    const rest = text.slice(cover.position.end.offset)
    return text.slice(0, titleEnd) + rest
  }
  const separator = /^\r?\n(?:[\t ]*\r?\n|$)/.test(afterTitle) || !afterTitle ? '' : newline
  return text.slice(0, titleEnd) + newline + newline + image + separator + afterTitle
}
