import { noteCover } from './note-cover.js'
import { remarkCallouts } from './callout.js'
import { remarkDocumentColors } from './document-colors.js'
import { applyChanges } from './list-indent.js'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from './i18n.js'
import { remarkAccordions } from './accordion.js'
import { remarkColumns } from './columns.js'
import { codeTokens, codeLanguageName } from './syntax-highlight.js'
import { ChevronDown, Copy, WrapText } from 'lucide-react'
import { remarkTags, remarkWikiLinks, findNote } from './markdown-model.js'
import { remarkSections, remarkSourceLayout } from './sections.js'
import { resolveImage } from './images.js'
import {
  sectionProgress,
  resolvedTasks,
  remarkPartialTasks,
  remarkTaskCompletionDates,
  toggleTask,
  applyStatus,
  sectionChecklists,
  sectionTaskChanges,
} from './tasks.js'
import { openTaskMenu } from './editor/task-menu.js'
import { unarchiveTask } from './task-archive.js'
import { progressLabel, progressShares } from './progress-badge.js'

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
function Image({ src, alt, title, node }) {
  const { coverOffset } = useContext(MarkdownContext)
  const cover = coverOffset !== undefined && coverOffset === node?.position?.start.offset
  const [failed, setFailed] = useState(false)
  const [resolved, setResolved] = useState(null)
  useEffect(() => {
    let cancelled = false
    setResolved(null)
    setFailed(false)
    resolveImage(src)
      .then((url) => {
        if (!cancelled) {
          setResolved(url)
          setFailed(!url)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [src])
  const image = (
    <img
      src={resolved}
      alt={alt ?? ''}
      title={cover ? undefined : title}
      loading="lazy"
      onError={() => {
        setResolved(null)
        setFailed(true)
      }}
    />
  )
  if (cover)
    return (
      <span className="note-cover">
        {resolved
          ? image
          : failed && <span className="image-missing">{t('cover.unavailable')}</span>}
      </span>
    )
  return resolved ? (
    title ? (
      <span className="image-figure">
        {image}
        <span className="image-caption">{title}</span>
      </span>
    ) : (
      image
    )
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
      data-status={task?.status}
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
          onContextMenu={(event) => {
            if (!onChange || task.progress) return
            event.preventDefault()
            const box = event.currentTarget.getBoundingClientRect()
            openTaskMenu({
              x: event.clientX || box.left,
              y: event.clientY || box.bottom,
              current: task.status,
              restoreFocus: () => event.currentTarget.focus(),
              onUnarchive: task.archived
                ? () => onChange(unarchiveTask(text, task.mark))
                : undefined,
              onSelect: (status) => onChange(applyStatus(text, task.mark, status)),
            })
          }}
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
  const { onCopy, wrapLines = true } = useContext(MarkdownContext)
  const [wrap, setWrap] = useState(wrapLines)
  useEffect(() => setWrap(wrapLines), [wrapLines])
  const [folded, setFolded] = useState(false)
  const child = React.Children.toArray(children)[0]
  const source = String(child?.props?.children ?? '').replace(/\n$/, '')
  const language = child?.props?.className?.replace('language-', '') ?? ''
  const label = codeLanguageName(language)
  return (
    <div
      className="code-block"
      data-colored={child?.props?.style?.color ? 'true' : undefined}
      data-scroll={!wrap || undefined}
      style={child?.props?.style}
      data-source-line={node.position.start.line}
    >
      <div className="code-block-tools">
        <button
          type="button"
          className="copy-code code-wrap-toggle"
          aria-label={t(folded ? 'code.expand' : 'code.collapse')}
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="copy-code code-wrap-toggle"
          aria-label={t('code.wrap')}
          title={t('code.wrap')}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          <WrapText size={14} aria-hidden="true" />
        </button>
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
        <code>
          {highlightedCode(codeTokens(folded ? `${source.split('\n')[0]}…` : source, language))}
        </code>
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
function ProgressBadge({ done, total, doing = 0, waiting = 0 }) {
  const share = progressShares(done, total, doing, waiting)
  return (
    <span
      className="section-progress"
      data-complete={done === total ? '' : undefined}
      role="img"
      aria-label={progressLabel(done, total, doing, waiting)}
    >
      <span className="section-progress-bar" aria-hidden="true">
        <span className="section-progress-done" style={{ width: `${share.done}%` }} />
        <span className="section-progress-doing" style={{ width: `${share.doing}%` }} />
        <span className="section-progress-waiting" style={{ width: `${share.waiting}%` }} />
      </span>
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
  const section = useContext(SectionContext)
  const { onToggleFold, progress, checklists, onChange } = useContext(MarkdownContext)
  const tasks = section && progress.get(section.line)
  return (
    <Tag {...props} data-source-line={node.position?.start.line}>
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
      {onChange && checklists.get(section?.line) && (
        <SectionChecklist line={section.line} checklist={checklists.get(section.line)} />
      )}
      {children}
      {tasks && <ProgressBadge {...tasks} />}
    </Tag>
  )
}
function hastText(node) {
  if (!node) return ''
  if (node.type === 'text') return node.value || ''
  if (Array.isArray(node.children)) return node.children.map(hastText).join('')
  return ''
}

function TableCards({ headers, rows }) {
  return (
    <div className="mobile-table-cards">
      {rows.map((cells, rowIndex) => (
        <article className="mobile-table-card" key={rowIndex}>
          <h4 className="mobile-table-card-title">{cells[0] || '—'}</h4>
          {cells.length > 1 && (
            <dl className="mobile-table-card-fields">
              {cells.slice(1).map((value, colIndex) => (
                <div className="mobile-table-card-field" key={colIndex}>
                  <dt>{headers[colIndex + 1] || ''}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </article>
      ))}
    </div>
  )
}

// A table that scrolls inside its own box must be reachable by keyboard and assistive tech.
function Table({ node, children, ...props }) {
  const { focusableTables } = useContext(MarkdownContext)
  const [view, setView] = useState('table')
  const [fullscreen, setFullscreen] = useState(false)
  if (!focusableTables) return <table {...props}>{children}</table>
  const thead = node.children.find((part) => part.tagName === 'thead')
  const tbody = node.children.find((part) => part.tagName === 'tbody')
  const headRow = (thead?.children ?? []).find((el) => el.tagName === 'tr')
  const headerCells = (headRow?.children ?? [])
    .filter((el) => el.tagName === 'th' || el.tagName === 'td')
    .map(hastText)
  const bodyRows = (tbody?.children ?? [])
    .filter((el) => el.tagName === 'tr')
    .map((tr) =>
      (tr.children ?? [])
        .filter((el) => el.tagName === 'td' || el.tagName === 'th')
        .map(hastText),
    )
  const totalRows = (headRow ? 1 : 0) + bodyRows.length
  const cols = headerCells.length || (bodyRows[0]?.length ?? 0)
  const meta = t('mobile.tableMeta', { rows: bodyRows.length, cols })
  const tableEl = (
    <div className="mobile-table-wrap">
      <table {...props} tabIndex={0} aria-label={t('mobile.tableLabel', { rows: totalRows })}>
        {children}
      </table>
    </div>
  )
  const content = view === 'cards' ? <TableCards headers={headerCells} rows={bodyRows} /> : tableEl
  return (
    <div className="mobile-table-block">
      <div className="mobile-table-bar">
        <span className="mobile-table-meta">{meta}</span>
        <div className="mobile-table-actions">
          <button
            type="button"
            className="mobile-table-btn"
            onClick={() => setView((current) => (current === 'cards' ? 'table' : 'cards'))}
          >
            {t(view === 'cards' ? 'mobile.viewTable' : 'mobile.viewCards')}
          </button>
          <button
            type="button"
            className="mobile-table-btn"
            onClick={() => setFullscreen(true)}
          >
            {t('mobile.fullscreen')}
          </button>
        </div>
      </div>
      {content}
      {fullscreen && (
        <div
          className="mobile-table-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label={meta}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setFullscreen(false)
            }
          }}
        >
          <div className="mobile-table-fullscreen-bar">
            <button
              type="button"
              className="mobile-table-btn"
              onClick={() => setFullscreen(false)}
              autoFocus
            >
              {t('mobile.back')}
            </button>
            <span className="mobile-table-meta">{meta}</span>
            <button
              type="button"
              className="mobile-table-btn"
              onClick={() => setView((current) => (current === 'cards' ? 'table' : 'cards'))}
            >
              {t(view === 'cards' ? 'mobile.viewTable' : 'mobile.viewCards')}
            </button>
          </div>
          <div className="mobile-table-fullscreen-body">{content}</div>
        </div>
      )}
    </div>
  )
}
const components = {
  table: Table,
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
export function Markdown({
  text,
  onCopy,
  onChange,
  onOpenWiki,
  notes,
  folds,
  onToggleFold,
  focusableTables,
  wrapLines = true,
  wrapPage = wrapLines,
}) {
  const coverOffset = useMemo(() => noteCover(text)?.position.start.offset, [text])
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
        coverOffset,
        focusableTables,
        wrapLines,
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
      <article className="markdown" data-no-wrap={!wrapPage || undefined}>
        <ReactMarkdown
          remarkPlugins={[
            remarkColumns,
            remarkAccordions,
            remarkGfm,
            remarkCallouts,
            remarkDocumentColors,
            remarkWikiLinks,
            remarkPartialTasks,
            remarkTaskCompletionDates,
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
