import { t } from '../i18n.js'
import { useState } from 'react'
import { ListTree, ChevronsLeft, ChevronRight } from 'lucide-react'
import { markdownTree } from '../markdown-model.js'

const label = (node) =>
  node.type === 'html' ? '' : (node.value ?? (node.children ?? []).map(label).join(''))

export function DocumentOutline({
  body,
  onNavigate,
  className = '',
  closeOnNavigate = false,
  iconSize = 18,
}) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set())
  const headings = markdownTree(body).children.filter((node) => node.type === 'heading')
  const hiddenDepths = []
  return (
    <nav
      className={`document-outline${className ? ` ${className}` : ''}${open ? ' is-open' : ''}`}
      aria-label={t('outline.label')}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          event.currentTarget.querySelector('button')?.focus()
        }
      }}
    >
      <button
        type="button"
        aria-label={t(open ? 'outline.close' : 'outline.open')}
        title={t(open ? 'outline.close' : 'outline.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronsLeft size={iconSize} /> : <ListTree size={iconSize} />}
      </button>
      {open && (
        <div className="document-outline-list">
          {!headings.length && <p>{t('outline.empty')}</p>}
          {headings.map((heading, index) => {
            while (hiddenDepths.length && hiddenDepths.at(-1) >= heading.depth) hiddenDepths.pop()
            const hidden = hiddenDepths.length > 0
            const closed = collapsed.has(index)
            if (closed) hiddenDepths.push(heading.depth)
            if (hidden) return null
            const children = headings[index + 1]?.depth > heading.depth
            return (
              <div
                className="document-outline-row"
                key={heading.position.start.offset}
                style={{ paddingLeft: `${(heading.depth - 1) * 12}px` }}
              >
                {children && (
                  <button
                    type="button"
                    className="outline-branch"
                    aria-label={t(closed ? 'outline.expandChildren' : 'outline.collapseChildren', {
                      title: label(heading),
                    })}
                    aria-expanded={!closed}
                    onClick={() =>
                      setCollapsed((previous) => {
                        const next = new Set(previous)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }
                  >
                    <ChevronRight
                      size={12}
                      style={{ transform: closed ? undefined : 'rotate(90deg)' }}
                    />
                  </button>
                )}
                <button
                  type="button"
                  className="outline-link"
                  title={label(heading)}
                  onClick={() => {
                    if (closeOnNavigate) setOpen(false)
                    onNavigate(heading.position.start.offset, heading.position.start.line)
                  }}
                >
                  {label(heading)}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </nav>
  )
}
