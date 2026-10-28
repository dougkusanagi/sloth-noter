import { applyChanges } from './list-indent.js'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from './i18n.js'
import { codeTokens, codeLanguageName } from './syntax-highlight.js'
import { ChevronDown, Copy } from 'lucide-react'
import { remarkTags, remarkWikiLinks, findNote } from './markdown-model.js'
import { remarkSections, remarkSourceLayout } from './sections.js'
import { resolveImage } from './images.js'
import {
  sectionProgress,
  resolvedTasks,
  remarkPartialTasks,
  toggleTask,
  sectionChecklists,
  sectionTaskChanges,
} from './tasks.js'
import { CIRCUMFERENCE, RADIUS } from './progress-badge.js'

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
/** The whitespace between tags in the HTML would add a space after the task checkbox. */
function dropLeadingSpace(children) {
  const parts = React.Children.toArray(children)
  const text = parts.findIndex((part) => typeof part === 'string' && part.trim())
  if (text < 0) return parts
  parts[text] = parts[text].trimStart()
  return parts.filter((part, index) => index >= text || typeof part !== 'string')
}
function ListItem({ children, className, node, style }) {
  const { text, onChange, tasks } = useContext(MarkdownContext)
  const task = tasks.get(node.position.start.line)
  const checked = task?.done ?? false
  const toggle = () => {
    if (task && onChange && !task.progress) onChange(toggleTask(text, task.mark))
  }
  return (
    <li
      className={task ? 'task-list-item' : className}
      style={style}
      data-source-line={node.position.start.line}
    >
      {task && (
        <input
          type="checkbox"
          className="task-checkbox"
          checked={checked}
          ref={(input) => {
            if (input) input.indeterminate = task.partial
          }}
          aria-checked={task.partial ? 'mixed' : checked}
          disabled={!onChange || Boolean(task.progress)}
          aria-label={t(checked ? 'task.complete' : 'task.open')}
          onChange={toggle}
        />
      )}
      {task ? dropLeadingSpace(children) : children}
      {task?.progress && <ProgressBadge {...task.progress} />}
    </li>
  )
}
function InlineCode({ children, className }) {
  const { onCopy } = useContext(MarkdownContext)
  // Fenced code is rendered by CodeBlock from the original child props.
  if (className) return <code className={className}>{children}</code>
  return (
    <span className="inline-code-wrap">
      <code>{children}</code>
      <button
        type="button"
        className="copy-inline-code"
        aria-label={t('code.copy')}
        title={t('code.copy')}
        onClick={() => onCopy?.(String(children))}
      >
        <Copy size={12} aria-hidden="true" />
      </button>
    </span>
  )
}
function CodeBlock({ children, node }) {
  const { onCopy } = useContext(MarkdownContext)
  const child = React.Children.toArray(children)[0]
  const source = String(child?.props?.children ?? '').replace(/\n$/, '')
  const language = child?.props?.className?.replace('language-', '') ?? ''
  const label = codeLanguageName(language)
  return (
    <div
      className="code-block"
      style={child?.props?.style}
      data-source-line={node.position.start.line}
    >
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
    <section className={className} data-collapsed={collapsed ? '' : undefined} {...props}>
      <SectionContext.Provider value={{ line, collapsed, hasContent: parts.length > 1 }}>
        {children}
      </SectionContext.Provider>
    </section>
  )
}
function ProgressBadge({ done, total }) {
  return (
    <span
      className="section-progress"
      data-complete={done === total ? '' : undefined}
      role="img"
      aria-label={t('progress.label', { done, total })}
    >
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <circle className="section-progress-track" cx="7" cy="7" r={RADIUS} />
        <circle
          className="section-progress-fill"
          cx="7"
          cy="7"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - done / total)}
        />
      </svg>
      <span className="section-progress-count" data-count={`${done}/${total}`} />
    </span>
  )
}
function SectionChecklist({ line, checklist }) {
  const { text, notes, onChange } = useContext(MarkdownContext)
  const { done, total, partial, title } = checklist
  return (
    <span className="section-checklist">
      <input
        type="checkbox"
        className="task-checkbox section-checkbox"
        checked={done === total}
        ref={(input) => {
          if (input) input.indeterminate = partial
        }}
        aria-checked={partial ? 'mixed' : done === total}
        aria-label={t('task.sectionToggle', { title })}
        title={t(done === total ? 'task.sectionClear' : 'task.sectionComplete', { title })}
        onChange={(event) =>
          onChange(applyChanges(text, sectionTaskChanges(text, line, event.target.checked, notes)))
        }
      />
    </span>
  )
}
function Heading({ node, children, ...props }) {
  const Tag = node.tagName
  const level = Number(Tag.slice(1))
  const section = useContext(SectionContext)
  const { onToggleFold, progress, checklists, onChange } = useContext(MarkdownContext)
  const tasks = section && progress.get(section.line)
  return (
    <Tag {...props}>
      {(section?.hasContent && onToggleFold) || level > 1 ? (
        section?.hasContent && onToggleFold ? (
          <button
            type="button"
            className="fold-toggle"
            data-level={level}
            aria-expanded={!section.collapsed}
            aria-label={t(section.collapsed ? 'fold.expand' : 'fold.collapse')}
            onClick={() => onToggleFold(section.line)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        ) : (
          <span className="fold-toggle level-badge" data-level={level} aria-hidden="true" />
        )
      ) : null}
      {onChange && checklists.get(section?.line) && (
        <SectionChecklist line={section.line} checklist={checklists.get(section.line)} />
      )}
      {children}
      {tasks && <ProgressBadge {...tasks} />}
    </Tag>
  )
}
const components = {
  img: Image,
  a: Link,
  li: ListItem,
  input: () => null,
  pre: CodeBlock,
  code: InlineCode,
  section: Section,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
}
export function Markdown({ text, onCopy, onChange, onOpenWiki, notes, folds, onToggleFold }) {
  const tasks = useMemo(
    () => new Map(resolvedTasks(text, notes).map((task) => [task.line, task])),
    [text, notes],
  )
  const checklists = useMemo(() => sectionChecklists(text, [...tasks.values()]), [text, tasks])
  const progress = useMemo(
    () => sectionProgress(text, [...tasks.values()], folds, notes),
    [text, tasks, folds, notes],
  )
  return (
    <MarkdownContext.Provider
      value={{
        text,
        onCopy,
        onChange,
        onOpenWiki,
        notes,
        folds,
        onToggleFold,
        progress,
        tasks,
        checklists,
      }}
    >
      <article className="markdown">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkWikiLinks,
            remarkPartialTasks,
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
