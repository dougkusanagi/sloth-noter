import React from 'react'

export function safeHref(value) {
  const href = value.trim()
  if (/^(https?:|mailto:)/i.test(href) || /^(#|\/|\.\/|\.\.\/)/.test(href)) return href
  return null
}

export function Inline({ text }) {
  const pieces = text.split(/(`[^`]+`|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|\[[^\]]+\]\([^)]+\)|(?<![\p{L}\p{N}_])#[\p{L}\p{N}_/-]+)/gu)
  return pieces.map((piece, index) => {
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={index}>{piece.slice(1, -1)}</code>
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={index}>{piece.slice(2, -2)}</strong>
    if (piece.startsWith('*') && piece.endsWith('*')) return <em key={index}>{piece.slice(1, -1)}</em>
    if (/^#[\p{L}\p{N}_/-]+$/u.test(piece)) return <span className="markdown-tag" key={index}>{piece}</span>
    const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeHref(link[2])
      return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a> : piece
    }
    return piece
  })
}

export function Markdown({ text, onCopy }) {
  const lines = text.split('\n')
  const blocks = []
  let index = 0
  const add = element => blocks.push(React.cloneElement(element, { key: blocks.length }))
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      index++
      const code = []
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++])
      if (index < lines.length) index++
      const source = code.join('\n')
      add(<pre><code>{source}</code><button className="copy-code" onClick={() => onCopy(source)}>Copy</button></pre>)
      continue
    }
    const heading = line.match(/^(#{1,4}) (.*)$/)
    if (heading) {
      const content = <Inline text={heading[2]} />
      add(heading[1].length === 1 ? <h1>{content}</h1> : heading[1].length === 2 ? <h2>{content}</h2> : heading[1].length === 3 ? <h3>{content}</h3> : <h4>{content}</h4>)
      index++
      continue
    }
    const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
    if (/^\|.*\|$/.test(line) && index + 1 < lines.length && /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(lines[index + 1])) {
      const headings = cells(line)
      index += 2
      const rows = []
      while (index < lines.length && /^\|.*\|$/.test(lines[index])) rows.push(cells(lines[index++]))
      add(<table><thead><tr>{headings.map((cell, i) => <th key={i}><Inline text={cell} /></th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{headings.map((_, j) => <td key={j}><Inline text={row[j] ?? ''} /></td>)}</tr>)}</tbody></table>)
      continue
    }
    const list = line.match(/^([-*] |\d+\. )/)
    if (list) {
      const ordered = /^\d/.test(list[1])
      const items = []
      while (index < lines.length && (ordered ? /^\d+\. / : /^[-*] /).test(lines[index])) {
        items.push(<li key={items.length}><Inline text={lines[index].replace(ordered ? /^\d+\. / : /^[-*] /, '')} /></li>)
        index++
      }
      add(ordered ? <ol>{items}</ol> : <ul>{items}</ul>)
      continue
    }
    if (line.startsWith('> ')) {
      const quote = []
      while (index < lines.length && lines[index].startsWith('> ')) quote.push(lines[index++].slice(2))
      add(<blockquote>{quote.map((part, i) => <p key={i}><Inline text={part} /></p>)}</blockquote>)
      continue
    }
    const paragraph = []
    while (index < lines.length && lines[index].trim() && !/^(#{1,4} |```|[-*] |\d+\. |> )/.test(lines[index])) paragraph.push(lines[index++])
    if (!paragraph.length) paragraph.push(lines[index++])
    add(<p>{paragraph.map((part, i) => <React.Fragment key={i}>{i > 0 && <br />}<Inline text={part} /></React.Fragment>)}</p>)
  }
  return <article className="markdown">{blocks}</article>
}
