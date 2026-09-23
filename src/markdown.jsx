import React from 'react'

export function safeHref(value) {
  const href = value.trim()
  if (/^(https?:|mailto:)/i.test(href) || /^(#|\/|\.\/|\.\.\/)/.test(href)) return href
  return null
}

export function Inline({ text }) {
  const pieces = text.split(/(`[^`]+`|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|\[[^\]]+\]\([^)]+\))/g)
  return pieces.map((piece, index) => {
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={index}>{piece.slice(1, -1)}</code>
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={index}>{piece.slice(2, -2)}</strong>
    if (piece.startsWith('*') && piece.endsWith('*')) return <em key={index}>{piece.slice(1, -1)}</em>
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
    const heading = line.match(/^(#{1,3}) (.*)$/)
    if (heading) {
      const content = <Inline text={heading[2]} />
      add(heading[1].length === 1 ? <h1>{content}</h1> : heading[1].length === 2 ? <h2>{content}</h2> : <h3>{content}</h3>)
      index++
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
    while (index < lines.length && lines[index].trim() && !/^(#{1,3} |```|[-*] |\d+\. |> )/.test(lines[index])) paragraph.push(lines[index++])
    if (!paragraph.length) paragraph.push(lines[index++])
    add(<p>{paragraph.map((part, i) => <React.Fragment key={i}>{i > 0 && <br />}<Inline text={part} /></React.Fragment>)}</p>)
  }
  return <article className="markdown">{blocks}</article>
}
