import React, { createContext, useContext, useEffect, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from './i18n.js'
import { codeTokens, codeLanguageName } from './syntax-highlight.js'
import { ChevronDown, Copy } from 'lucide-react'
import { remarkTags, remarkWikiLinks, findNote } from './markdown-model.js'
import { remarkSections, remarkSourceLayout } from './sections.js'
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
/** The whitespace between tags in the HTML would add a space after the task checkbox. */
function dropLeadingSpace(children) {
  const parts = React.Children.toArray(children)
  const text = parts.findIndex((part) => typeof part === 'string' && part.trim())
  if (text < 0) return parts
  parts[text] = parts[text].trimStart()
  return parts.filter((part, index) => index >= text || typeof part !== 'string')
}
function ListItem({ children, className, node, style }) {
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
    <li className={className} style={style}>
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
      {dropLeadingSpace(children)}
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
    <div className="code-block" style={child?.props?.style}>
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
const SectionContext = createContext(null)
const isSection = (child) =>
  child.type === 'element' && child.properties?.className?.includes('md-section')
/** Rows of nested sections inside and including this one: outer rails sit outside inner ones. */
const sectionHeight = (node) =>
  1 + Math.max(0, ...node.children.filter(isSection).map(sectionHeight))
function Section({ node, children, className, ...props }) {
  const { folds } = useContext(MarkdownContext)
  if (!className?.includes('md-section'))
    return (
      <section className={className} {...props}>
        {children}
      </section>
    )
  const parts = node.children.filter((child) => child.type === 'element')
  const line = parts[0]?.position?.start.line
  const collapsed = Boolean(folds?.has(line))
  return (
    <section
      className={className}
      data-collapsed={collapsed ? '' : undefined}
      {...props}
      style={{ ...props.style, '--rails': sectionHeight(node) }}
    >
      <SectionContext.Provider value={{ line, collapsed, hasContent: parts.length > 1 }}>
        {children}
      </SectionContext.Provider>
    </section>
  )
}
function Heading({ node, children, ...props }) {
  const Tag = node.tagName
  const section = useContext(SectionContext)
  const { onToggleFold } = useContext(MarkdownContext)
  return (
    <Tag {...props}>
      {section?.hasContent && onToggleFold && (
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={!section.collapsed}
          aria-label={t(section.collapsed ? 'fold.expand' : 'fold.collapse')}
          onClick={() => onToggleFold(section.line)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      )}
      {children}
    </Tag>
  )
}
const components = {
  img: Image,
  a: Link,
  li: ListItem,
  input: () => null,
  pre: CodeBlock,
  section: Section,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
}
export function Markdown({ text, onCopy, onChange, onOpenWiki, notes, folds, onToggleFold }) {
  return (
    <MarkdownContext.Provider
      value={{ text, onCopy, onChange, onOpenWiki, notes, folds, onToggleFold }}
    >
      <article className="markdown">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkWikiLinks,
            remarkTags,
            remarkSections,
            remarkSourceLayout,
          ]}
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
