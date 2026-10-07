import React, { createContext, useContext, useEffect, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from './i18n.js'
import { codeTokens, codeLanguageName } from './syntax-highlight.js'
import { Copy } from 'lucide-react'
import { remarkWikiLinks, findNote } from './markdown-model.js'
import { resolveImage } from './images.js'

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
function Image({ src, alt, title }) {
  const [resolved, setResolved] = useState(null)
  useEffect(() => {
    let cancelled = false
    setResolved(null)
    resolveImage(src)
      .then((url) => {
        if (!cancelled) setResolved(url)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })
    return () => {
      cancelled = true
    }
  }, [src])
  return resolved ? (
    <img
      src={resolved}
      alt={alt ?? ''}
      title={title}
      loading="lazy"
      onError={() => setResolved(null)}
    />
  ) : (
    <span className="image-missing">{alt || t('images.unavailable')}</span>
  )
}

const MarkdownContext = createContext({})
function Link({ children, href, title }) {
  const { onOpenWiki, notes } = useContext(MarkdownContext)
  if (href?.startsWith('#sloth-note/')) {
    const target = decodeURIComponent(href.slice(12))
    const exists = findNote(notes ?? [], target)
    return (
      <a
        href={href}
        className={`wiki-link${exists ? '' : ' missing'}`}
        title={target}
        onClick={(event) => {
          event.preventDefault()
          onOpenWiki?.(target)
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a
      href={href}
      title={title}
      target={href?.startsWith('#') ? undefined : '_blank'}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}
function taskInput(node) {
  if (node.tagName === 'input') return node
  for (const child of node.children ?? []) {
    const input = taskInput(child)
    if (input) return input
  }
  return null
}
function ListItem({ children, className, node }) {
  const { text, onChange } = useContext(MarkdownContext)
  const task = className?.includes('task-list-item')
  const checked = task ? Boolean(taskInput(node)?.properties.checked) : false
  const toggle = () => {
    const offset = node.position.start.offset
    const match = text.slice(offset).match(/^([-*+]\s+|\d+[.)]\s+)\[([ xX])\]/)
    if (match && onChange) {
      const at = offset + match[1].length + 1
      onChange(text.slice(0, at) + (checked ? ' ' : 'x') + text.slice(at + 1))
    }
  }
  return (
    <li className={className}>
      {task && (
        <input
          type="checkbox"
          className="task-checkbox"
          checked={checked}
          disabled={!onChange}
          aria-label={t(checked ? 'task.complete' : 'task.open')}
          onChange={toggle}
        />
      )}
      {children}
    </li>
  )
}
function CodeBlock({ children }) {
  const { onCopy } = useContext(MarkdownContext)
  const child = React.Children.toArray(children)[0]
  const source = String(child?.props?.children ?? '').replace(/\n$/, '')
  const language = child?.props?.className?.replace('language-', '') ?? ''
  const label = codeLanguageName(language)
  return (
    <div className="code-block">
      <div className="code-block-tools">
        <button
          type="button"
          className="copy-code"
          aria-label={`${t('code.copy')}${label ? ` ${label}` : ''}`}
          onClick={() => onCopy?.(source)}
        >
          <Copy size={14} aria-hidden="true" />
          <span>{label || t('code.copy')}</span>
        </button>
      </div>
      <pre>
        <code>{highlightedCode(codeTokens(source, language))}</code>
      </pre>
    </div>
  )
}
const components = { img: Image, a: Link, li: ListItem, input: () => null, pre: CodeBlock }
export function Markdown({ text, onCopy, onChange, onOpenWiki, notes }) {
  return (
    <MarkdownContext.Provider value={{ text, onCopy, onChange, onOpenWiki, notes }}>
      <article className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkWikiLinks]}
          urlTransform={(url, key) =>
            key === 'src' && /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/i.test(url)
              ? url
              : defaultUrlTransform(url)
          }
          components={components}
        >
          {text}
        </ReactMarkdown>
      </article>
    </MarkdownContext.Provider>
  )
}
