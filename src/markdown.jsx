import React from 'react'
import { t } from './i18n.js'
import { codeTokens } from './syntax-highlight.js'
import { tableGroup } from './markdown-table.js'
import { inlineSyntax } from './live-markdown.js'

function highlightedCode(tokens) {
  return tokens.map((token, index) =>
    typeof token === 'string' ? (
      token
    ) : (
      <span key={index} className={`token ${token.type}`}>
        {highlightedCode(Array.isArray(token.content) ? token.content : [token.content])}
      </span>
    ),
  )
}

export function safeHref(value) {
  const href = value.trim()
  if (/^(https?:|mailto:)/i.test(href) || /^(#|\/|\.\/|\.\.\/)/.test(href)) return href
  return null
}

export function Inline({ text }) {
  const tokens = inlineSyntax(text)
  function render(from, to) {
    const pieces = []
    let cursor = from
    for (const token of tokens) {
      if (token.start < cursor || token.end > to || token.start < from) continue
      if (token.start > cursor) pieces.push(text.slice(cursor, token.start))
      const content =
        token.kind === 'code' || token.kind === 'tag'
          ? text.slice(token.contentStart, token.contentEnd)
          : render(token.contentStart, token.contentEnd)
      if (token.kind === 'strong') pieces.push(<strong key={token.start}>{content}</strong>)
      else if (token.kind === 'em') pieces.push(<em key={token.start}>{content}</em>)
      else if (token.kind === 'code') pieces.push(<code key={token.start}>{content}</code>)
      else if (token.kind === 'tag')
        pieces.push(
          <span key={token.start} className="markdown-tag">
            {content}
          </span>,
        )
      else if (token.kind === 'link') {
        const href = safeHref(text.slice(token.contentEnd + 2, token.end - 1))
        pieces.push(
          href ? (
            <a key={token.start} href={href} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          ) : (
            text.slice(token.start, token.end)
          ),
        )
      }
      cursor = token.end
    }
    if (cursor < to) pieces.push(text.slice(cursor, to))
    return pieces
  }
  return render(0, text.length)
}

export function Markdown({ text, onCopy }) {
  const lines = text.split('\n')
  const blocks = []
  let index = 0
  const add = (element) => blocks.push(React.cloneElement(element, { key: blocks.length }))
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      index++
      const code = []
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++])
      if (index < lines.length) index++
      const source = code.join('\n')
      add(
        <pre>
          <code>{highlightedCode(codeTokens(source, fence[1].trim()))}</code>
          <button className="copy-code" onClick={() => onCopy(source)}>
            {t('code.copy')}
          </button>
        </pre>,
      )
      continue
    }
    const heading = line.match(/^(#{1,4}) (.*)$/)
    if (heading) {
      const content = <Inline text={heading[2]} />
      add(
        heading[1].length === 1 ? (
          <h1>{content}</h1>
        ) : heading[1].length === 2 ? (
          <h2>{content}</h2>
        ) : heading[1].length === 3 ? (
          <h3>{content}</h3>
        ) : (
          <h4>{content}</h4>
        ),
      )
      index++
      continue
    }
    const table = tableGroup(lines, index)
    if (table) {
      add(
        <table>
          <thead>
            <tr>
              {table.headers.map((cell, i) => (
                <th key={i}>
                  <Inline text={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.headers.map((_, j) => (
                  <td key={j}>
                    <Inline text={row[j] ?? ''} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      index = table.end
      continue
    }
    const list = line.match(/^([-*+] |\d+\. )/)
    if (list) {
      const ordered = /^\d/.test(list[1])
      const items = []
      while (index < lines.length && (ordered ? /^\d+\. / : /^[-*+] /).test(lines[index])) {
        items.push(
          <li key={items.length}>
            <Inline text={lines[index].replace(ordered ? /^\d+\. / : /^[-*+] /, '')} />
          </li>,
        )
        index++
      }
      add(ordered ? <ol>{items}</ol> : <ul>{items}</ul>)
      continue
    }
    if (line.startsWith('> ')) {
      const quote = []
      while (index < lines.length && lines[index].startsWith('> '))
        quote.push(lines[index++].slice(2))
      add(
        <blockquote>
          {quote.map((part, i) => (
            <p key={i}>
              <Inline text={part} />
            </p>
          ))}
        </blockquote>,
      )
      continue
    }
    const paragraph = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4} |```|[-*+] |\d+\. |> )/.test(lines[index])
    )
      paragraph.push(lines[index++])
    if (!paragraph.length) paragraph.push(lines[index++])
    add(
      <p>
        {paragraph.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            <Inline text={part} />
          </React.Fragment>
        ))}
      </p>,
    )
  }
  return <article className="markdown">{blocks}</article>
}
