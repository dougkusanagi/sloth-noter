import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { ImageThumbnail } from './image-library.jsx'
import { normalizeImageSource } from '../markdown-model.js'
import { IMAGE_DATA, IMAGE_TYPES, importImage } from '../images.js'
import { friendlyError } from '../errors.js'
import { t } from '../i18n.js'

export function CoverPicker({ images, selected, invoke, onApply, onClose }) {
  const file = useRef(null)
  const upload = useRef(null)
  const mounted = useRef(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    mounted.current = true
    upload.current?.focus()
    return () => {
      mounted.current = false
    }
  }, [])

  const local = images.filter(
    ({ src }) => IMAGE_DATA.test(src) || (src.startsWith('assets/') && IMAGE_TYPES.test(src)),
  )
  const results = local.filter((image) =>
    image.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  async function loadImage(image) {
    if (!image || busy) return
    setBusy(true)
    setError('')
    try {
      const src = await importImage(image, invoke)
      if (mounted.current) onApply({ src, name: image.name }, true)
    } catch (cause) {
      if (mounted.current) setError(t('images.importFailed', { error: friendlyError(cause) }))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <div className="cover-picker-content">
      <div className="cover-picker-actions">
        <button type="button" ref={upload} disabled={busy} onClick={() => file.current.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          {t('cover.upload')}
        </button>
        {selected && (
          <button type="button" disabled={busy} onClick={() => onApply(null)}>
            {t('cover.remove')}
          </button>
        )}
        {onClose && (
          <button type="button" disabled={busy} onClick={onClose}>
            {t('dialog.close')}
          </button>
        )}
      </div>
      <input
        ref={file}
        className="cover-file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
        hidden
        onChange={(event) => {
          const image = event.target.files?.[0]
          event.target.value = ''
          void loadImage(image)
        }}
      />
      {busy && <p role="status">{t('cover.importing')}</p>}
      {error && <p role="alert">{error}</p>}
      {local.length > 0 && (
        <input
          type="search"
          aria-label={t('cover.search')}
          placeholder={t('cover.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {results.length ? (
        <div className="cover-picker-images">
          {results.map((image) => (
            <button
              type="button"
              key={image.src}
              disabled={busy}
              aria-pressed={Boolean(selected && normalizeImageSource(selected) === image.src)}
              onClick={() => onApply(image)}
            >
              <ImageThumbnail src={image.src} />
              <span>{image.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p>{t(local.length ? 'cover.noResults' : 'cover.noImages')}</p>
      )}
    </div>
  )
}
