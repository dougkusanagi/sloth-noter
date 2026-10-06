import { useEffect, useRef, useState } from 'react'
import {
  Image as ImageIcon,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Download,
  ArrowLeft,
} from 'lucide-react'
import { resolveImage } from '../images.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

export function ImageThumbnail({ src, alt = '' }) {
  const host = useRef(null)
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let stopped = false
    setUrl(null)
    setFailed(false)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        resolveImage(src)
          .then((result) => {
            if (!stopped) {
              setUrl(result)
              if (!result) setFailed(true)
            }
          })
          .catch(() => {
            if (!stopped) setFailed(true)
          })
      },
      { rootMargin: '100px' },
    )
    observer.observe(host.current)
    return () => {
      stopped = true
      observer.disconnect()
    }
  }, [src])
  return (
    <div ref={host} className="image-thumbnail">
      {url && !failed ? (
        <img draggable={false} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumbnail-placeholder">
          <ImageIcon size={24} />
          {failed && <span>{t('images.unavailable')}</span>}
        </span>
      )}
    </div>
  )
}
export function ImageLibrary({
  images,
  query,
  busy,
  loading,
  active,
  notes,
  selected,
  onSelect,
  onImport,
  onRefresh,
  onInsert,
  onRename,
  onDelete,
  onDownload,
  onOpenNote,
  onDropImage,
}) {
  const [filter, setFilter] = useState('all')
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [dragPreview, setDragPreview] = useState(null)
  const [menu, setMenu] = useState(null)
  const menuRef = useRef(null)
  const menuTrigger = useRef(null)
  function closeMenu() {
    setMenu(null)
    menuTrigger.current?.focus()
  }
  function openMenu(event, image, keyboard = false) {
    event.preventDefault()
    event.stopPropagation()
    const box = event.currentTarget.getBoundingClientRect()
    menuTrigger.current = event.currentTarget
    setMenu({
      src: image.src,
      x: Math.max(8, Math.min(keyboard ? box.left : event.clientX, window.innerWidth - 240)),
      y: Math.max(8, Math.min(keyboard ? box.bottom : event.clientY, window.innerHeight - 250)),
    })
  }
  useEffect(() => {
    if (!menu) return
    const frame = requestAnimationFrame(() =>
      menuRef.current?.querySelector('button:not(:disabled)')?.focus(),
    )
    const onPointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenu(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(null)
        menuTrigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menu])
  const canDelete = (image) => !busy && !image.noteIds.length
  function startDrag(event, image) {
    if (event.button !== 0 || busy || !active) return
    setMenu(null)
    suppressClick.current = false
    drag.current = { image, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event) {
    const current = drag.current
    if (!current) return
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6)
      return
    event.preventDefault()
    current.moved = true
    setDragPreview({ image: current.image, x: event.clientX, y: event.clientY })
  }
  function endDrag(event, cancelled = false) {
    const current = drag.current
    drag.current = null
    setDragPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (!current?.moved) return
    suppressClick.current = true
    if (!cancelled) onDropImage?.(current.image, { x: event.clientX, y: event.clientY })
  }
  const visible = images
    .filter(
      (image) =>
        image.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
        (filter !== 'unused' || !image.noteIds.length),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const menuImage = images.find((item) => item.src === menu?.src)
  const image = images.find((item) => item.src === selected)
  if (image)
    return (
      <div className="image-details">
        <button className="image-back" onClick={() => onSelect(null)}>
          <ArrowLeft size={14} aria-hidden="true" />
          {t('images.back')}
        </button>
        <ImageThumbnail src={image.src} alt={image.name} />
        <h3>{image.name}</h3>
        <p className="image-usage" data-used={image.noteIds.length > 0 || undefined}>
          {image.noteIds.length
            ? t('images.used', { count: image.noteIds.length })
            : t('images.unused')}
        </p>
        <div className="image-detail-actions">
          <button
            className="button primary"
            disabled={!active || busy}
            onClick={() => onInsert(image)}
          >
            <Plus size={14} aria-hidden="true" />
            {t('images.insert')}
          </button>
          <button className="button" disabled={busy} onClick={() => onRename(image)}>
            <Pencil size={14} aria-hidden="true" />
            {t('images.rename')}
          </button>
          <button className="button" disabled={busy} onClick={() => onDownload(image)}>
            <Download size={14} aria-hidden="true" />
            {t('images.download')}
          </button>
          <button
            className="button danger"
            disabled={!canDelete(image)}
            title={image.noteIds.length ? t('images.protected') : t('images.delete')}
            onClick={() => onDelete(image)}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('images.delete')}
          </button>
        </div>
        {image.noteIds.map((id) => {
          const note = notes.find((note) => note.id === id)
          return note ? (
            <button className="image-reference" key={id} onClick={() => onOpenNote(id)}>
              {displayName(note.name)}
            </button>
          ) : (
            <p key={id} className="dialog-hint">
              {t('images.inTrash')}
            </p>
          )
        })}
        {image.noteIds.length > 0 && <p className="dialog-hint">{t('images.protected')}</p>}
      </div>
    )
  return (
    <>
      <div className="image-library-actions">
        <button className="button primary" disabled={busy} onClick={onImport}>
          <Plus size={14} aria-hidden="true" />
          {busy ? t('images.importing') : t('images.import')}
        </button>
        <button
          className="icon-button"
          title={t('images.refresh')}
          aria-label={t('images.refresh')}
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="segmented small">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {t('images.all')}
        </button>
        <button aria-pressed={filter === 'unused'} onClick={() => setFilter('unused')}>
          {t('images.unused')}
        </button>
      </div>
      <p className="dialog-hint image-library-hint">{t('images.libraryHint')}</p>
      {dragPreview && (
        <div
          className="image-drag-preview"
          style={{ left: dragPreview.x + 12, top: dragPreview.y + 12 }}
          aria-hidden="true"
        >
          <ImageIcon size={16} />
          <span>{dragPreview.image.name}</span>
        </div>
      )}
      {loading && <p role="status">{t('images.loading')}</p>}
      <div className="image-grid">
        {visible.map((image) => (
          <div className="image-card" key={image.src}>
            <button
              className="image-item"
              title={image.name}
              aria-haspopup="menu"
              aria-expanded={menu?.src === image.src}
              onContextMenu={(event) => openMenu(event, image)}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                  openMenu(event, image, true)
              }}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => startDrag(event, image)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={(event) => endDrag(event, true)}
              onLostPointerCapture={(event) => {
                if (drag.current) endDrag(event, true)
              }}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                onSelect(image.src)
              }}
            >
              <ImageThumbnail src={image.src} />
              <span className="image-name">{image.name}</span>
              <small data-used={image.noteIds.length > 0 || undefined}>
                {image.noteIds.length
                  ? t('images.usedShort', { count: image.noteIds.length })
                  : t('images.unused')}
              </small>
            </button>
          </div>
        ))}
      </div>
      {menuImage && (
        <div
          ref={menuRef}
          className="tab-context-menu image-context-menu"
          role="menu"
          aria-label={t('images.manageName', { name: menuImage.name })}
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus()
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              const target = event.key === 'Home' ? buttons[0] : buttons.at(-1)
              target?.focus()
            } else if (event.key === 'Tab') closeMenu()
          }}
        >
          {[
            ['images.insert', Plus, () => onInsert(menuImage), !active || busy],
            ['images.manage', ImageIcon, () => onSelect(menuImage.src), busy],
            ['images.rename', Pencil, () => onRename(menuImage), busy],
            ['images.download', Download, () => onDownload(menuImage), busy],
            ['images.delete', Trash2, () => onDelete(menuImage), !canDelete(menuImage)],
          ].map(([label, Icon, action, disabled]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              aria-describedby={
                label === 'images.delete' && menuImage.noteIds.length
                  ? 'image-delete-reason'
                  : undefined
              }
              onClick={() => {
                setMenu(null)
                action()
              }}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
          {menuImage.noteIds.length > 0 && (
            <p id="image-delete-reason" className="dialog-hint">
              {t('images.protected')}
            </p>
          )}
        </div>
      )}
      {!loading && !visible.length && (
        <div className="empty-state">
          <ImageIcon size={22} aria-hidden="true" />
          <p>{query || filter !== 'all' ? t('library.noResults') : t('images.empty')}</p>
        </div>
      )}
    </>
  )
}
