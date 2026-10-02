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
        <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
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
}) {
  const [filter, setFilter] = useState('all')
  const visible = images
    .filter(
      (image) =>
        image.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
        (filter !== 'unused' || !image.noteIds.length),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const image = images.find((item) => item.src === selected)
  if (image)
    return (
      <div className="image-details">
        <button className="image-back" onClick={() => onSelect(null)}>
          <ArrowLeft size={14} />
          {t('images.back')}
        </button>
        <ImageThumbnail src={image.src} alt={image.name} />
        <h3>{image.name}</h3>
        <div className="image-detail-actions">
          <button disabled={!active || busy} onClick={() => onInsert(image)}>
            <Plus size={14} />
            {t('images.insert')}
          </button>
          <button disabled={busy} onClick={() => onRename(image)}>
            <Pencil size={14} />
            {t('images.rename')}
          </button>
          <button disabled={busy} onClick={() => onDownload(image)}>
            <Download size={14} />
            {t('images.download')}
          </button>
          <button
            className="danger-action"
            disabled={
              busy ||
              image.noteIds.length > 0 ||
              /^https?:/i.test(image.src) ||
              (!image.src.startsWith('assets/') && !image.src.startsWith('data:'))
            }
            title={image.noteIds.length ? t('images.protected') : t('images.delete')}
            onClick={() => onDelete(image)}
          >
            <Trash2 size={14} />
            {t('images.delete')}
          </button>
        </div>
        <p>
          {image.noteIds.length
            ? t('images.used', { count: image.noteIds.length })
            : t('images.unused')}
        </p>
        {image.noteIds.map((id) => {
          const note = notes.find((note) => note.id === id)
          return note ? (
            <button className="image-reference" key={id} onClick={() => onOpenNote(id)}>
              {note.name}
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
        <button disabled={busy} onClick={onImport}>
          <Plus size={14} />
          {busy ? t('images.importing') : t('images.import')}
        </button>
        <button
          title={t('images.refresh')}
          aria-label={t('images.refresh')}
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="image-filter">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {t('images.all')}
        </button>
        <button aria-pressed={filter === 'unused'} onClick={() => setFilter('unused')}>
          {t('images.unused')}
        </button>
      </div>
      {loading && <p role="status">{t('images.loading')}</p>}
      {visible.map((image) => (
        <button
          className="image-item"
          key={image.src}
          title={image.name}
          onClick={() => onSelect(image.src)}
        >
          <ImageThumbnail src={image.src} />
          <span>{image.name}</span>
          <small>
            {image.noteIds.length
              ? t('images.used', { count: image.noteIds.length })
              : t('images.unused')}
          </small>
        </button>
      ))}
      {!loading && !visible.length && (
        <p className="sidebar-empty">
          {query || filter !== 'all' ? t('library.noResults') : t('images.empty')}
        </p>
      )}
    </>
  )
}
